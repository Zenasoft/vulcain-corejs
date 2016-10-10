var rest = require('unirest');
import * as types from './types';
import * as os from 'os';
import {DynamicConfiguration, System} from 'vulcain-configurationsjs'
import {ExecutionResult} from './executionResult'
import {Schema} from '../../schemas/schema';
import {IProvider} from '../../providers/provider';
import {DefaultServiceNames} from '../../di/annotations';
import {IContainer} from '../../di/resolvers';
import {Domain} from '../../schemas/schema';
import {Inject} from '../../di/annotations';
import {Pipeline} from '../../servers/requestContext';
import {ActionResponse} from '../../pipeline/actions';
import {QueryResponse} from '../../pipeline/query';
import {ValidationError, ErrorResponse} from '../../pipeline/common';
import { ProviderFactory } from './../../providers/providerFactory';

/**
 *
 *
 * @export
 * @class ApplicationRequestError
 * @extends {Error}
 */
export class ApplicationRequestError extends Error {
    /**
     *
     *
     * @private
     * @type {Array<ValidationError>}
     */
    private errors: Array<ValidationError>;

    /**
     * Creates an instance of ApplicationRequestError.
     *
     * @param {ErrorResponse} error
     */
    constructor(error: ErrorResponse, public statusCode=500) {
        super((error && error.message) || "Unknow error");
        this.errors = error && error.errors;
    }
}

/**
 * command
 *
 * @export
 * @interface ICommand
 */
export interface ICommand {
    /**
     * execute the command
     * @param args
     */
    executeAsync<T>(...args): Promise<T>;
    /**
     * execution result
     */
    status: ExecutionResult;
}

/**
 * command context initialized for every command
 *
 * @export
 * @interface ICommandContext
 */
export interface ICommandContext {
    /**
     * current user
     */
    user;
    /**
     * is user scope belongs to provided scope
     *
     * @param {string} scope
     * @returns {boolean}
     */
    hasScope(scope: string): boolean;
    /**
     * Is user administrator
     *
     * @returns {boolean} true if user is administrator
     */
    isAdmin(): boolean;
    /**
     * Create and return a new command
     *
     * @param {string} name
     * @returns {ICommand}
     */
    getCommand(name: string): ICommand;
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
     * Request cache (Only valid for this request)
     *
     * @type {Map<string, any>}
     */
    cache: Map<string, any>;
    /**
     *
     *
     * @type {Pipeline}
     */
    pipeline: Pipeline;
    /**
     *
     *
     * @type {string}
     */
    tenant: string;
}

/**
 *
 *
 * @export
 * @abstract
 * @class AbstractCommand
 * @template T
 */
export abstract class AbstractCommand<T> {
    /**
     *
     *
     * @type {ICommandContext}
     */
    public requestContext:ICommandContext;
    /**
     *
     *
     * @type {IProvider<T>}
     */
    provider: IProvider<T>;
    /**
     *
     *
     * @type {Schema}
     */
    schema: Schema;

    /**
     * Creates an instance of AbstractCommand.
     *
     * @param {IContainer} container
     * @param {any} providerFactory
     */
    constructor( @Inject(DefaultServiceNames.Container) protected container: IContainer, @Inject(DefaultServiceNames.ProviderFactory) private providerFactory: ProviderFactory) { }

    /**
     *
     *
     * @param {string} schema
     */
    setSchema(schema: string) {
        if (schema && !this.provider) {
            this.schema = this.container.get<Domain>(DefaultServiceNames.Domain).getSchema(schema);
            this.provider = this.providerFactory.getProvider(this.container, this.requestContext.tenant, this.schema);
        }
    }

    /**
     * execute command
     * @protected
     * @abstract
     * @param {any} args
     * @returns {Promise<T>}
     */
    abstract runAsync(...args): Promise<T>;

    // Must be defined in command
   // protected fallbackAsync(err, ...args)
}
