const rest = require('unirest');
import * as types from './types';
import { DefaultServiceNames, Inject } from './../../di/annotations';
import { IContainer } from './../../di/resolvers';
import { IMetrics, MetricsConstant } from '../../metrics/metrics';
import { RequestContext } from '../../servers/requestContext';
import { HttpCommandError } from '../../errors/httpCommandError';
import { System } from '../../configurations/globals/system';
import { VulcainLogger } from '../../configurations/log/vulcainLogger';


export abstract class AbstractHttpCommand {
    protected customTags: any;
    protected metrics: IMetrics;
    public requestContext: RequestContext;
    private static METRICS_NAME = "external_call";


    constructor( @Inject(DefaultServiceNames.Container) public container: IContainer) {
        this.metrics = container.get<IMetrics>(DefaultServiceNames.Metrics);
        this.initializeMetricsInfo();
    }

    protected initializeMetricsInfo() {
        let dep = this.constructor["$dependency:external"];
        if (dep) {
            this.setMetricsTags(dep.uri, false);
        }
    }

    /**
     * Set metric tags for this command
     *
     * @protected
     * @param {any} tags
     *
     * @memberOf AbstractHttpCommand
     */

    protected setMetricsTags(uri: string, emitLog = true) {
        if (!uri)
            throw new Error("Metrics tags must have an uri property.");
        let exists = System.manifest.dependencies.externals.find(ex => ex.uri === uri);
        if (!exists) {
            System.manifest.dependencies.externals.push({ uri });
        }
        this.customTags = { uri: uri };

        if (emitLog) {
            let logger = this.container.get<VulcainLogger>(DefaultServiceNames.Logger);
            logger.logAction(this.requestContext, "BC", "Http", `Command: ${Object.getPrototypeOf(this).constructor.name} - Request ${System.removePasswordFromUrl(uri)}`);
            this.requestContext.setCommand(`Call external api: ${uri}`);
        }
    }

    onCommandCompleted(duration: number, success: boolean) {
        this.metrics.timing(AbstractHttpCommand.METRICS_NAME + MetricsConstant.duration, duration, this.customTags);
        if (!success)
            this.metrics.increment(AbstractHttpCommand.METRICS_NAME + MetricsConstant.failure, this.customTags);
        let logger = this.container.get<VulcainLogger>(DefaultServiceNames.Logger);
        logger.logAction(this.requestContext, "EC", "Http", `Command: ${Object.getPrototypeOf(this).constructor.name} completed with ${success ? 'success' : 'error'}`);
    }

    runAsync(...args): Promise<any> {
        return (<any>this).execAsync(...args);
    }

    private async execAsync(verb: string, url: string, data?): Promise<any> {
        let method: Function = this[verb + "Async"];
        if (!method)
            throw new Error(`${verb} is not implemented in AbstractHttpCommand. Use a custom command for this verb or use sendRequestAsync directly.`);
        return await method.apply(this, [url, data]);
    }

    protected postAsync(url: string, data) {
        return this.sendRequestAsync('post', url, req => req.json(data));
    }

    protected getAsync(url: string) {
        return this.sendRequestAsync('get', url);
    }

    protected deleteAsync(url: string) {
        return this.sendRequestAsync('delete', url);
    }

    protected putAsync(url: string, data) {
        return this.sendRequestAsync('put', url, req => req.json(data));
    }

    /**
     * Send a http request
     *
     * @protected
     * @param {string} http verb to use
     * @param {string} url
     * @param {(req:types.IHttpCommandRequest) => void} [prepareRequest] Callback to configure request before sending
     * @returns request response
     */
    protected async sendRequestAsync(verb: string, url: string, prepareRequest?: (req: types.IHttpCommandRequest) => void) {

        this.setMetricsTags(url);

        const mocks = System.getMocks(this.container);
        let result = System.isDevelopment && mocks.enabled && await mocks.applyMockHttpAsync(url, verb);
        if (result) {
            System.log.info(this.requestContext, ()=>`Using mock output for (${verb}) ${System.removePasswordFromUrl(url)}`);
            return result;
        }

        let request: types.IHttpCommandRequest = rest[verb](url);

        prepareRequest && prepareRequest(request);
        System.log.info(this.requestContext, ()=>`Calling (${verb}) ${System.removePasswordFromUrl(url)}`);

        return new Promise<types.IHttpCommandResponse>((resolve, reject) => {
            request.end((response) => {
                if (response.status >= 400) {
                    let msg = ()=> `Http request ${verb} ${url} failed with status code ${response.status}`;
                    System.log.info(this.requestContext, msg);
                    reject(new HttpCommandError(msg(), response));
                    return;
                }

                if (response.error) {
                    let msg = ()=>`Error on http request ${verb} ${url} - ${response.error}`;
                    reject(this.handleError(msg, response.error));
                    return;
                }

                System.log.info(this.requestContext, ()=>`Http request ${verb} ${url} completed succesfully (code:${response.status}).`);
                resolve(response);
            });
        });
    }

    private handleError(msg: ()=>string, err?) {
        System.log.error(this.requestContext, err, msg);
        if (err && !(err instanceof Error)) {
            let tmp = err;
            err = new Error(msg());
            err.error = tmp;
        }
        return new HttpCommandError(msg(), err, 500);
    }
}
