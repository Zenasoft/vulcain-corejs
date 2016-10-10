import { System } from 'vulcain-configurationsjs';
import { Application } from '../application';
import * as express from 'express';
import { AbstractAdapter } from './abstractAdapter';
import { RequestContext, Pipeline } from './requestContext';
import { IContainer } from '../di/resolvers';
import { DefaultServiceNames } from '../di/annotations';
import { Conventions } from '../utils/conventions';
import { QueryData } from '../pipeline/query';
const bodyParser = require('body-parser');
const cors = require('cors');
const guid = require('node-uuid');

export class ExpressAdapter extends AbstractAdapter {
    public express: express.Express;

    constructor(domainName: string, container: IContainer, private app: Application) {
        super(domainName, container);

        this.express = express();
        this.express.use(cors());
        this.express.use(bodyParser.urlencoded({ extended: true }));
        this.express.use(bodyParser.json());

        let auth = (this.container.get<any>(DefaultServiceNames.Authentication, true)).init();
        let self = this;

        this.express.get('/health', (req: express.Request, res: express.Response) => {
            res.status(200).end();
        });

        this.express.get(Conventions.instance.defaultUrlprefix + '/_schemas/:name?', (req: express.Request, res: express.Response) => {
            let domain: any = this.container.get("Domain");
            let name = req.params.name;
            if (name) {
                let schema = domain.getSchema(name, true);
                res.send(schema);
            }
            else
                res.send(domain.schemas)
        });

        // Query can have only two options:
        //  - single query with an id (and optional schema)
        //  - search query with a query expression in data
        /*        this.express.get(Conventions.instance.defaultUrlprefix + '/:schema?/get/:id', auth, async (req: express.Request, res: express.Response) => {
                    let query: QueryData = <any>{ domain: this.domainName };
                    query.action = "get";
                    query.schema = req.params.schema ||  req.query.$schema;;
                    let requestArgs = this.populateFromQuery(req);
                    if (requestArgs.count === 0)
                        query.data = req.params.id;
                    else {
                        query.data = requestArgs.data;
                        query.data.id = req.params.id;
                    }
                    this.executeRequest(this.executeQueryRequest, query, req, res);
                });
        */
        this.express.get(Conventions.instance.defaultUrlprefix + '/:schemaAction?/:id?', auth, async (req: express.Request, res: express.Response) => {

            try {
                let query: QueryData = <any>{ domain: this.domainName };
                this.getActionSchema(query, req, "all");
                if (query.action === "get") {
                    if (!req.params.id) {
                        res.status(400).send({ error: "Id is required", status: "Error" });
                        return;
                    }

                    let requestArgs = this.populateFromQuery(req);
                    if (requestArgs.count === 0)
                        query.data = req.params.id;
                    else {
                        query.data = requestArgs.data;
                        query.data.id = req.params.id;
                    }
                }
                else {
                    query.maxByPage = (req.query.$maxByPage && parseInt(req.query.$maxByPage)) || 100;
                    query.page = (req.query.$page && parseInt(req.query.$page)) || 0;
                    query.data = this.populateFromQuery(req).data;
                }
                this.executeRequest(this.executeQueryRequest, query, req, res);
            }
            catch (e) {
                res.status(400).send({ error: e.message || e, status: "Error" });
            }
        });

        // All actions by post
        this.express.post(Conventions.instance.defaultUrlprefix + '/:schemaAction?', auth, async (req: express.Request, res: express.Response) => {
            const cmd = this.normalizeCommand(req);
            this.executeRequest(this.executeCommandRequest, cmd, req, res);
        });
    }

    private populateFromQuery(req) {
        let data = {};
        let count = 0;;
        Object.keys(req.query).forEach(name => {
            switch (name) {
                case "$action":
                case "$schema":
                case "$page":
                case "$maxByPage":
                    break;
                case "$query":
                    data = JSON.parse(req.query[name]);
                    break;
                default:
                    count++;
                    data[name] = req.query[name];
            }
        });
        return { data, count };
    }

    private getActionSchema(query, req: express.Request, defaultAction?) {
        let a: string;
        let s: string;

        if (req.params.schemaAction) {
            if (req.params.schemaAction.indexOf('.') >= 0) {
                let parts = req.params.schemaAction.split('.');
                s = parts[0];
                a = parts[1];
            }
            else
                a = req.params.schemaAction;
        }
        else {
            a = req.query.$action;
            s = req.query.$schema;
        }
        query.action = query.action || a || defaultAction;
        query.schema = query.schema || s;
    }

    private normalizeCommand(req: express.Request) {
        let command = req.body;

        // Body contains only data -> create a new command object
        if (!command.action && !command.data && !command.schema) {
            command = { data: command };
        }
        command.domain = this.domainName;
        this.getActionSchema(command, req);
        command.data = command.data || {};
        return command;
    }

    private async executeRequest(handler: Function, command, req: express.Request, res: express.Response) {
        const begin = super.startRequest(command);

        let ctx: RequestContext = new RequestContext(this.container, Pipeline.HttpRequest);
        try {
            if (req.user)
                ctx.user = req.user;
            ctx.correlationId = req.headers["X-VULCAIN-CORRELATION-ID"] || guid.v4();
            ctx.correlationPath = req.headers["X-VULCAIN-CORRELATION-PATH"] || "-";
            ctx.tenant = (ctx.user && ctx.user.tenant) || req.headers["X-VULCAIN-TENANT"] || process.env[Conventions.instance.ENV_TENANT] || RequestContext.TestTenant;
            ctx.requestHeaders = req.headers;
            ctx.hostName = req.hostname;

            let result = await handler.apply(this, [command, ctx]);
            if (ctx.getResponseHeaders()) {
                for (const [k, v] of ctx.getResponseHeaders()) {
                    res.setHeader(k, v);
                }
            }
            res.statusCode = result.code || ctx.responseCode || 200;

            if (ctx.responseCustom) {
                res.send(ctx.responseCustom);
            } else {
                res.send(result.value);
            }

            this.endRequest(begin, result, ctx);
        }
        catch (e) {
            let result = command;
            result.error = { message: e.message || e };
            res.status(e.statusCode || 500);
            res.send({ error: { message: e.message || e, errors: e.errors } });
            this.endRequest(begin, result, ctx, e);
        }
        finally {
            ctx && ctx.dispose();
        }
    }

    setStaticRoot(basePath: string) {
        System.log.info(null, "Set wwwroot to " + basePath);
        if (!basePath) throw new Error("BasePath is required.");
        this.express.use(express.static(basePath));
    }

    start(port: number) {
        let listener = this.express.listen(port, (err) => {
            System.log.info(null, 'Listening on port ' + port);
        });

        this.app.onServerStarted(listener);
    }

    useMiddleware(verb: string, path: string, handler: Function) {
        this.express[verb](path, handler);
    }
}
