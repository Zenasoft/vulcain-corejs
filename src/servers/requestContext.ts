import { VulcainLogger } from 'vulcain-configurationsjs';
import { Container } from '../di/containers';
import { IContainer } from '../di/resolvers';
import { CommandFactory } from '../commands/command/commandFactory';
import { ICommand } from '../commands/command/abstractCommand'
import { DefaultServiceNames } from '../di/annotations';

export enum Pipeline {
    EventNotification,
    InProcess,
    HttpRequest,
    Test
}

/**
 * User context
 *
 * @export
 * @interface UserContext
 */
export interface UserContext {
    id: string;
    displayName?: string;
    email?: string;
    name: string;
    scopes: Array<string>;
    tenant: string;
}

export interface Logger {
    /**
     * Log an error
     *
     * @param {Error} error Error instance
     * @param {string} [msg] Additional message
     *
     */
    error(ctx: RequestContext, error: Error, msg?: string);

    /**
     * Log a message info
     *
     * @param {string} msg Message format (can include %s, %j ...)
     * @param {...Array<string>} params Message parameters
     *
     */
    info(ctx: RequestContext, msg: string, ...params: Array<any>);

    /**
     * Log a verbose message. Verbose message are enable by service configuration property : enableVerboseLog
     *
     * @param {any} requestContext Current requestContext
     * @param {string} msg Message format (can include %s, %j ...)
     * @param {...Array<string>} params Message parameters
     *
     */
    verbose(ctx: RequestContext, msg: string, ...params: Array<any>);
}

/**
 * Request context
 *
 * @export
 * @class RequestContext
 */
export class RequestContext {
    static TestTenant = "_test_";
    static TestUser = { id: "test", scopes: ["*"], name: "test", displayName: "test", email: "test", tenant: RequestContext.TestTenant };

    /**
     * Request correlation id
     *
     * @type {string}
     */
    correlationId: string;

    /**
     * Request correlation path
     *
     * @type {string}
     * @memberOf ICommandContext
     */
    correlationPath: string;

    /**
     * Current user or null
     *
     * @type {UserContext}
     */
    public user: UserContext;
    private _cache: Map<string, any>;
    private _logger: Logger;
    public container: IContainer;
    /**
     * Headers for the current request
     *
     * @type {{ [name: string]: string }}
     */
    public requestHeaders: { [name: string]: string };
    private _responseHeaders: Map<string, string>;
    /**
     * Used to override default response code (200)
     *
     * @type {number}
     */
    public responseCode: number;


    /**
     * Use to override default response.
     *
     * @type {any}
     */
    public responseCustom: any;



    /**
     * Current tenant
     *
     * @type {string}
     */
    public tenant: string;

    /**
     * Request host name
     *
     * @type {string}
     * @memberOf RequestContext
     */
    public hostName: string;

    /**
     * Do not use
     *
     * @returns
     */
    getResponseHeaders() {
        return this._responseHeaders;
    }

    /**
     * Add a custom header value to the response
     *
     * @param {string} name
     * @param {string} value
     */
    addHeader(name: string, value: string) {
        if (!this._responseHeaders)
            this._responseHeaders = new Map<string, string>();
        this._responseHeaders.set(name, value);
    }

    /**
     * Get request cache (Cache is only valid during the request lifetime)
     *
     * @readonly
     */
    get cache() {
        if (!this._cache) {
            this._cache = new Map<string, any>();
        }
        return this._cache;
    }

    /**
     * Do not use directly
     * Creates an instance of RequestContext.
     *
     * @param {IContainer} container
     * @param {Pipeline} pipeline
     */
    constructor(container: IContainer, public pipeline: Pipeline) {
        this._logger = container.get<Logger>(DefaultServiceNames.Logger);
        this.container = new Container(container, this);
        this.container.injectInstance(this, DefaultServiceNames.RequestContext);
    }

    dispose() {
        this.container.dispose();
    }

    /**
     * Create a request context for testing
     *
     * @static
     * @param {IContainer} [container]
     * @param {UserContext} [user]
     * @returns
     */
    static createMock(container?: IContainer, user?: UserContext) {
        let ctx = new RequestContext(container || new Container(), Pipeline.Test);
        ctx.user = user || RequestContext.TestUser;
        ctx.user.tenant = ctx.tenant = RequestContext.TestTenant;
        return ctx;
    }

    /**
     * Get user scopes
     *
     * @readonly
     * @type {Array<string>}
     */
    get scopes(): Array<string> {
        return (this.user && this.user.scopes) || [];
    }

    /**
     * Check if the current user has a specific scope
     *
     * Rules:
     *   scope      userScope   Result
     *   null/?/*                 true
     *                  null      false
     *                   *        true
     *     x             x        true
     *     x-yz         x-*       true
     *
     * @param {string} scope
     * @returns {number}
     */
    hasScope(scope: string): boolean {
        if (this.user && this.user.tenant && this.user.tenant !== this.tenant) return false;

        if (!scope || scope === "?") return true;
        if (!this.user) return false;
        if (scope === "*") return true;

        const scopes = this.scopes;

        if (!scopes || scopes.length == 0) return false;
        if (scopes[0] === "*") return true;

        for (let userScope of this.user.scopes) {
            for (let sc of scopes) {
                if (userScope === sc) return true;
                // admin-* means all scope beginning by admin-
                if (userScope.endsWith("*") && sc.startsWith(userScope.substr(0, userScope.length - 1)))
                    return true;
            }
        }

        return false;
    }

    /**
     * Check if the current user is an admin
     *
     * @returns {boolean}
     */
    isAdmin(): boolean {
        return this.scopes && this.scopes.length > 0 && this.scopes[0] === "*";
    }

    /**
     * Create a new command
     * Throws an exception if the command is unknown
     *
     * @param {string} name Command name
     * @param {string} [schema] Optional schema used to initialize the provider
     * @returns {ICommand} A command
     */
    getCommand(name: string, schema?: string) {
        return CommandFactory.get(name, this, schema);
    }

    /**
     * Log an error
     *
     * @param {Error} error Error instance
     * @param {string} [msg] Additional message
     *
     */
    error(error: Error, msg?: string) {
        this._logger.error(this, error, msg);
    }

    /**
     * Log a message info
     *
     * @param {string} msg Message format (can include %s, %j ...)
     * @param {...Array<string>} params Message parameters
     *
     */
    info(msg: string, ...params: Array<any>) {
        this._logger.info(this, msg, ...params);
    }

    /**
     * Log a verbose message. Verbose message are enable by service configuration property : enableVerboseLog
     *
     * @param {any} requestContext Current requestContext
     * @param {string} msg Message format (can include %s, %j ...)
     * @param {...Array<string>} params Message parameters
     *
     */
    verbose(msg: string, ...params: Array<any>) {
        this._logger.verbose(this, msg, ...params);
    }
}
