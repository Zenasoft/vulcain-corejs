import {CommandMetricsFactory, CommandMetrics} from "../metrics/commandMetrics";
import {CommandProperties} from './commandProperties'
import {CircuitBreakerFactory} from "./circuitBreaker";
import ActualTime from "../../utils/actualTime"
import {AbstractCommand} from './abstractCommand'
import {SemaphoreFactory, Semaphore} from './semaphore'
import {EventType, FailureType, ExecutionResult} from './executionResult'
import {BadRequestError, System} from 'vulcain-configurationsjs'
import * as util from 'util';
const moment = require("moment");

export class TimeoutError extends Error {
    constructor(ms:number) {
        super("Timeout error - Command take more than " + ms + "ms");
    }
}

export class CommandRuntimeError extends Error {
    constructor(public failureType: FailureType, public commandName: string, message: string, public error?) {
        super(message);
    }
}

export interface CommandInfo {
    commandKey: string,
    commandGroup: string,
    timeout: number,
    isErrorHandler: (error: any) => any,
    metricsConfig: any,
    circuitConfig: any,
    requestVolumeRejectionThreshold: number
}


export class HystrixCommand {

    public status: ExecutionResult = new ExecutionResult();
    private running: boolean;
    private _arguments;
    private metrics: CommandMetrics;

    constructor(private properties: CommandProperties, private command: AbstractCommand<any>, private context) {
        command.requestContext = context;
        this.metrics =  CommandMetricsFactory.getOrCreate(properties);
    }

    get circuitBreaker() {
        return CircuitBreakerFactory.getOrCreate(this.properties);
    }

    get semaphore(): Semaphore {
        return SemaphoreFactory.getOrCreate(this.properties);
    }

    setSchemaOnCommand(schema: string) {
        if (schema && this.command.setSchema)
            this.command.setSchema(schema);
    }

    async executeAsync<T>(...args): Promise<T> {
        if (this.running) {
            throw new Error("This instance can only be executed once. Please instantiate a new instance.");
        }
        this.running = true;
        this._arguments = arguments;
        let result;

        // Get form Cache

        // Execution
        this.metrics.incrementExecutionCount();
        let start = ActualTime.getCurrentTime();

        try {
            if (this.circuitBreaker.allowRequest()) {
                if (this.semaphore.canExecuteCommand()) {
                    try {
                        try {
                            // Execution
                            let executing = true;

                            let promises = [];
                            promises.push((<any>this.command).runAsync.apply(this.command, this._arguments));
                            if (this.properties.executionTimeoutInMilliseconds.value > 0) {
                                promises.push(
                                    new Promise((resolve, reject) =>
                                        setTimeout(() => { if (executing) reject(new TimeoutError(this.properties.executionTimeoutInMilliseconds.value)); },
                                            this.properties.executionTimeoutInMilliseconds.value)
                                    )
                                );
                            }

                            result = await Promise.race(promises);
                            executing = false; // avoid timeout rejection
                        }
                        catch (e) {
                            let end = ActualTime.getCurrentTime();
                            // timeout
                            if (e instanceof TimeoutError) {
                                this.metrics.markTimeout();
                                return await this.getFallbackOrThrowException(EventType.TIMEOUT, FailureType.TIMEOUT, "timed-out", e);
                            }
                            else // application error
                            {
                                return await this.onExecutionError(end - start, e)
                            }
                        }

                        // Execution complete correctly
                        let end = ActualTime.getCurrentTime();
                        this.metrics.addExecutionTime(end - start);
                        this.metrics.markSuccess();
                        this.circuitBreaker.markSuccess();
                        this.status.addEvent(EventType.SUCCESS);
                        // Update cache
                        // TODO
                        start = -1;
                        return result;
                    }
                    finally {
                        this.semaphore.releaseExecutionCommand();
                    }
                }
                else {
                    this.metrics.markRejected();
                    return await this.getFallbackOrThrowException(
                        EventType.SEMAPHORE_REJECTED,
                        FailureType.REJECTED_SEMAPHORE_EXECUTION,
                        "could not acquire a semaphore for execution",
                        new Error("could not acquire a semaphore for execution"));
                }
            }
            else // circuit breaker open
            {
                start = -1;
                this.metrics.markShortCircuited();
                return await this.getFallbackOrThrowException(
                    EventType.SHORT_CIRCUITED,
                    FailureType.SHORTCIRCUIT,
                    "short-circuited",
                    new Error(" circuit short-circuited and is OPEN"));
            }
        }
        finally {
            if (start >= 0)
                this.recordTotalExecutionTime(start);
            this.metrics.decrementExecutionCount();
            this.status.isExecutionComplete = true;
        }
    }

    private async getFallbackOrThrowException(eventType: EventType, failureType: FailureType, message: string, error: Error): Promise<any> {
        this.logInfo(error.message || error.toString());
        try {
            if (this.isUnrecoverable(error)) {
                this.logInfo("Unrecoverable error for command so will throw CommandRuntimeError and not apply fallback " + error);
                this.status.addEvent(eventType);
                throw new CommandRuntimeError(failureType, this.properties.commandName, this.getLogMessagePrefix() + " " + message + " and encountered unrecoverable error", error);
            }
            let fallback = (<any>this.command).fallbackAsync;
            if (!fallback) {
                //this.logInfo("No fallback for command");
                throw new CommandRuntimeError(failureType, this.properties.commandName, this.getLogMessagePrefix() + " " + message + " and no fallback provided.", error);
            }
            if (this.semaphore.canExecuteFallback()) {
                try {
                    this.logInfo("Use fallback for command");
                    let result = await fallback.apply(this.command, this._arguments);
                    this.metrics.markFallbackSuccess();
                    this.status.addEvent(EventType.FALLBACK_SUCCESS);
                    return result;
                }
                catch (e) {
                    this.logInfo("Fallback failed " + e);
                    this.metrics.markFallbackFailure();
                    this.status.addEvent(EventType.FALLBACK_FAILURE);
                    throw new CommandRuntimeError(failureType, this.properties.commandName, this.getLogMessagePrefix() + " and fallback failed.", e);
                }
                finally {
                    this.semaphore.releaseFallback();
                }
            }
            else {
                this.logInfo("Command fallback rejection.");
                this.metrics.markFallbackRejection();
                this.status.addEvent(EventType.FALLBACK_REJECTION);
                throw new CommandRuntimeError(FailureType.REJECTED_SEMAPHORE_FALLBACK, this.properties.commandName, this.getLogMessagePrefix() + " fallback execution rejected.");
            }
        }
        catch (e) {
            this.metrics.markExceptionThrown();
            throw e;
        }
    }

    private onExecutionError(ms: number, e: Error): Promise<any> {
        if (e instanceof BadRequestError) {
            this.metrics.markBadRequest(ms);
            throw e;
        }

        this.logInfo("Error executing command {" + e + "} Proceeding to fallback logic...");
        this.metrics.markFailure();
        this.status.failedExecutionException = e;
        return this.getFallbackOrThrowException(EventType.FAILURE, FailureType.COMMAND_EXCEPTION, "failed", e);
    }

    private logInfo(msg: string) {
        System.log.info(this.context, this.properties.commandName + ": " + msg);
    }

    private isUnrecoverable(e) {
        return false;
    }

    private getLogMessagePrefix() {
        return this.properties.commandName;
    }

    ///
    /// Record the duration of execution as response or exception is being returned to the caller.
    ///
    protected recordTotalExecutionTime(startTime) {
        let duration = ActualTime.getCurrentTime() - startTime;
        // the total execution time for the user thread including queuing, thread scheduling, run() execution
        this.metrics.addExecutionTime(duration);

        /*
         * We record the executionTime for command execution.
         *
         * If the command is never executed (rejected, short-circuited, etc) then it will be left unset.
         *
         * For this metric we include failures and successes as we use it for per-request profiling and debugging
         * whereas 'metrics.addCommandExecutionTime(duration)' is used by stats across many requests.
         */
        this.status.executionTime = duration;
    }
}
