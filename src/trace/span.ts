import { RequestContext, VulcainHeaderNames } from "../pipeline/requestContext";
import { System } from "../globals/system";
import { IContainer } from '../di/resolvers';
import { DefaultServiceNames } from '../di/annotations';
import { Logger } from "../log/logger";
import { MetricsConstant, IMetrics, MetricsFactory } from "./../metrics/metrics";
import { Pipeline } from './../pipeline/common';
import { IRequestTracker, IRequestTrackerFactory } from '../metrics/trackers/index';
import { EntryKind } from "../log/vulcainLogger";

export enum SpanKind {
    Request,
    Command,
    Task,
    Event
}

export class SpanId {
    public traceId: string;
    public parentId: string;
    public spanId?: string;
}

export class Span {
    private _logger: Logger;
    public tags: { [name: string]: string } = {};
    private startTick: [number, number];
    private startTime: number;
    private error: Error;
    private metrics: IMetrics;
    private id: SpanId;
    private tracker: IRequestTracker;

    private constructor(private context: RequestContext, private kind: SpanKind, private name: string, id: SpanId ) {
        this._logger = context.container.get<Logger>(DefaultServiceNames.Logger);

        this.startTime = Date.now() * 1000;
        this.startTick = process.hrtime();
        this.id = id;
        this.id.spanId = this.randomTraceId();

        this.metrics = context.container.get<IMetrics>(DefaultServiceNames.Metrics);

        this.convertKind();

        if (this.kind == SpanKind.Command) {
            this.logAction("BC", `Command: ${this.name}`);
        }
        else if (this.kind == SpanKind.Request) {
            this.logAction("RR", `Request: ${this.name}`);
        }
        else if (this.kind == SpanKind.Task) {
            this.logAction("RT", `Async task: ${this.name}`);
        }
        else if (this.kind == SpanKind.Event) {
            this.logAction("RE", `Event: ${this.name}`);
        }
    }

    private convertKind() {
        if (this.kind == SpanKind.Command)
            return;

        if (this.context.pipeline == Pipeline.AsyncTask) {
            this.kind = SpanKind.Task;
        }
        else if (this.context.pipeline == Pipeline.Event) {
            this.kind = SpanKind.Event;
        }
    }

    static createRootSpan(ctx: RequestContext) {
        let id: SpanId = {
            traceId: ctx.correlationId,
            parentId: ctx.request && <string>ctx.request.headers[VulcainHeaderNames.X_VULCAIN_PARENT_ID]
        }
        return new Span(ctx, SpanKind.Request, System.fullServiceName, id);
    }

    createCommandSpan(commandName: string) {
        let id: SpanId = {
            parentId: this.id.spanId,
            traceId: this.id.traceId
        };
        return new Span(this.context, SpanKind.Command, commandName, this.id);
    }

    injectHeaders(headers: (name: string | any, value?: string)=>any) {
        headers(VulcainHeaderNames.X_VULCAIN_PARENT_ID, this.id.spanId);
       // headers(Header.SpanId, tracer.spanId);
    }

    dispose() {
        if (this.kind === SpanKind.Request)
            this.endRequest();
        else
            this.endCommand();
        this.context = null;
        this._logger = null;
    }

    endCommand()
    {
        this.metrics.timing(this.name + MetricsConstant.duration, this.durationInMicroseconds, this.tags);
        if (this.error)
            this.metrics.increment(this.name + MetricsConstant.failure, this.tags);

        // End Command trace
        this._logger && this._logger.logAction(this.context, "EC", `Command: ${this.name} completed with ${this.error ? this.error.message : 'success'}`);
    }

    private endRequest() {
        let hasError = false;
        let prefix: string = "";

        let value = this.context.response && this.context.response.content;
        hasError = !!this.error || !this.context.response || this.context.response.statusCode && this.context.response.statusCode >= 400;// || !value;

        if (this.context.requestData.schema) {
            prefix = this.context.requestData.schema.toLowerCase() + "_" + this.context.requestData.action.toLowerCase();
        }
        else if (this.context.requestData.action) {
            prefix = this.context.requestData.action.toLowerCase();
        }

        const duration = this.durationInMicroseconds;

        // Duration
        this.metrics.timing(prefix + MetricsConstant.duration, duration);
        this.metrics.timing(MetricsConstant.allRequestsDuration, duration);

        // Failure
        if (hasError) {
            this.metrics.increment(prefix + MetricsConstant.failure);
            this.metrics.increment(MetricsConstant.allRequestsFailure);
        }

        // Always remove userContext
        if (typeof (value) === "object") {
            value.userContext = undefined;
        }
        if (this.kind == SpanKind.Request) {
            this.logAction("ER", `End request status: ${this.context.response.statusCode || 200}`);
        }
        else if (this.kind == SpanKind.Task) {
            this.logAction("ET", `Async task: ${this.name} completed with ${this.error ? this.error.message : 'success'}`);
        }
        else if (this.kind == SpanKind.Event) {
            this.logAction("EE", `Event ${this.name} completed with ${this.error ? this.error.message : 'success'}`);
        }

        //        metricsInfo.tracer && metricsInfo.tracer.finish(this.context.response);
    }

    setAction(name: string, tags?: any) {
        this.name = this.name + "." + name;
        if (tags) {
            this.addTags(tags);
        }

        let trackerFactory = this.context.container.get<IRequestTrackerFactory>(DefaultServiceNames.RequestTracker);
        this.tracker = trackerFactory.startSpan(this.id, this.name, this.tags);

    }

    addTag(name: string, value: string) {
        if(name && value)
            this.tags[name] = value.replace(/[:|,\.?&]/g, '-');
    }

    addTags(tags) {
        if (!tags)
            return;
        Object.keys(tags)
            .forEach(key => this.addTag(key, tags[key]));
    }

    private logAction(action: EntryKind, message: string) {
        this._logger.logAction(this.context, action, message);
    }

    /**
     * Log an error
     *
     * @param {Error} error Error instance
     * @param {string} [msg] Additional message
     *
     */
    logError(error: Error, msg?: () => string) {
        if (!this.error) this.error = error; // Catch first error
        this.tracker.trackError(error, this.tags);
        this._logger.error(this.context, error, msg);
    }

    /**
     * Log a message info
     *
     * @param {string} msg Message format (can include %s, %j ...)
     * @param {...Array<string>} params Message parameters
     *
     */
    logInfo(msg: () => string) {
        this._logger.info(this.context, msg);
    }

    /**
     * Log a verbose message. Verbose message are enable by service configuration property : enableVerboseLog
     *
     * @param {any} requestContext Current requestContext
     * @param {string} msg Message format (can include %s, %j ...)
     * @param {...Array<string>} params Message parameters
     *
     */
    logVerbose(msg: () => string) {
        this._logger.verbose(this.context, msg);
    }

    get now() {
        return this.startTime + this.durationInMicroseconds;
    }

    get durationInMs() {
        return this.durationInMicroseconds / 1000;
    }

    private get durationInMicroseconds() {
        const hrtime = process.hrtime(this.startTick);
        const elapsedMicros = Math.floor(hrtime[0] * 1000 + hrtime[1] / 1000000);
        return elapsedMicros;
    }

    private randomTraceId() {
        const digits = '0123456789abcdef';
        let n = '';
        for (let i = 0; i < 16; i++) {
            const rand = Math.floor(Math.random() * 16);
            n += digits[rand];
        }
        return n;
    }
}