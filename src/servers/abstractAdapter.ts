import { Domain } from './../schemas/schema';
import * as http from 'http';
import {IContainer} from '../di/resolvers';
import {CommandManager, ActionMetadata} from '../pipeline/actions';
import {CommonRequestResponse} from '../pipeline/common';
import {QueryManager} from '../pipeline/query';
import {IManager} from '../pipeline/common';
import {BadRequestError, System } from 'vulcain-configurationsjs';
import {RequestContext, UserContext} from './requestContext';
import {DefaultServiceNames} from '../di/annotations';
import * as util from 'util';
import {Conventions} from '../utils/conventions';
import {Metrics} from '../utils/metrics';

export abstract class AbstractAdapter {
    private commandManager;
    private queryManager;
    private testUser: UserContext;
    private domain: Domain;
    private metrics: Metrics;

    private calcDelayInMs(begin: number[]): number {
        // ts = [seconds, nanoseconds]
        const ts = process.hrtime(begin);
        // convert seconds to miliseconds and nanoseconds to miliseconds as well
        return (ts[0] * 1000) + (ts[1] / 1000000);
    }

    constructor(protected domainName: string, protected container: IContainer) {
        this.commandManager = new CommandManager(container);
        this.queryManager = new QueryManager(container);
        this.testUser = container.get<UserContext>(DefaultServiceNames.TestUser, true);
        this.domain = container.get<Domain>(DefaultServiceNames.Domain);
        this.metrics = container.get<Metrics>(DefaultServiceNames.Metrics);
    }

    public abstract start(port: number);
    public abstract setStaticRoot(basePath: string);
    public abstract useMiddleware(verb: string, path: string, handler: Function);

    protected startRequest(command) {
       // util.log("Request : " + JSON.stringify(command)); // TODO remove sensible data
        return process.hrtime();
    }

    protected endRequest(begin: number[], response, ctx: RequestContext, e?: Error) {
        if (!response.value)
            return;
        const ms = this.calcDelayInMs(begin);
        let prefix = "";
        if (response.value.schema)
            prefix = response.value.schema + '.';

        prefix += response.value.action + ".";

        this.metrics.timing(prefix + "responseTime", ms);
        this.metrics.increment(prefix + "total");

        this.metrics.timing("allRequests.responseTime", ms);
        this.metrics.increment("allRequests.total");

        if (!response.error) {
            this.metrics.increment(prefix + "success");
            this.metrics.increment("allRequests.success");
        }
        else {
            this.metrics.increment(prefix + "failure");
            this.metrics.increment("allRequests.failure");
        }

        let trace: any = {
            duration: ms,
            info: Object.assign({}, response.value)
        };

        delete trace.info.value;

        if (e) {
            trace.stackTrace = e.stack;
            trace.message = e.message;
        }
        System.log.write(ctx, trace);
    }

    protected executeQueryRequest(query, ctx) {
        return this.executeRequestInternal(this.queryManager, query, ctx);
    }

    protected executeCommandRequest(command, ctx) {
        return this.executeRequestInternal(this.commandManager, command, ctx);
    }

    private executeRequestInternal(manager: IManager, command, ctx: RequestContext): Promise<{ code: number, value: any, headers: Map<string, string> }> {
        let self = this;
        return new Promise((resolve, reject) => {
            let headers = new Map<string, string>();
            if (!command || !command.domain) {
                resolve({ value: "domain is required.", code: 400, headers: headers });
                return;
            }
            if (command.domain.toLowerCase() !== self.domainName.toLowerCase()) {
                resolve({ value: "this service doesn't belong to domain " + self.domainName, code: 400, headers: headers });
                return;
            }

            try {
                // Check if handler exists
                let metadata = <ActionMetadata>manager.getInfoHandler(command);
                if (!ctx.user && this.testUser) {
                    ctx.user = this.testUser;
                    ctx.user.tenant = ctx.tenant;
                }
                // Verify authorization
                if (metadata.scope && !ctx.hasScope(metadata.scope)) {
                    resolve({ code: 403, status: "Unauthorized", value: { error: { message: http.STATUS_CODES[403] } } });
                    return;
                }
            }
            catch (e) {
                reject(e);
                return;
            }

            // Execute handler
            manager.runAsync(command, ctx)
                .then(result => {
                    if (command.correlationId)
                        headers.set("X-VULCAIN-CORRELATION-ID", command.correlationId);
                    if (result)
                        delete result.userContext;

                    // TODO https://github.com/phretaddin/schemapack
                    resolve({ value: result, headers: headers });
                    ctx.dispose();
                })
                .catch(result => {
                    // Normalize error
                    if (result instanceof BadRequestError) {
                        resolve({ code: 400, value: { status: "Error", error: { message: result.message } }, headers: headers });
                        return
                    }
                    else if (result instanceof Error) {
                        result = { status: "Error", error: { message: result.message } };
                    }
                    resolve({ code: 500, value: result, headers: headers });
                    ctx.dispose();
                });
        });
    }
}
