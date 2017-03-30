import 'reflect-metadata';
import { Preloader } from '../preloader';
import { System } from '../configurations/globals/system';
import { RequestContext } from '../servers/requestContext';

/**
 * List of default service names
 *
 * @export
 * @class DefaultServiceNames
 */
export class DefaultServiceNames {
    static TokenService = "TokenService";
    static AuthorizationPolicy = "AuthorizationPolicy";
    static TenantPolicy = "TenantPolicy";

    static ScopesDescriptor = "ScopesDescriptor";
    static ServiceDescriptors = "ServiceDescriptors";
    static SwaggerServiceDescriptor = "SwaggerServiceDescriptor";
    static "Authentication" = "Authentication";
    static "Logger" = "Logger";
    static "Provider" = "Provider";
    static "EventBusAdapter" = "EventBusAdapter";
    static "ActionBusAdapter" = "ActionBusAdapter";
    static "Domain" = "Domain";
    static "Application" = "ApplicationFactory";
    static "ServerAdapter" = "ServerAdapter";
    static Container = "Container";
    static ProviderFactory = "ProviderFactory";
    static RequestContext = "RequestContext";
    static Metrics = "Metrics";
    static ApiKeyService = "ApiKeyService";
    static MockManager = "MockManager";
    static RequestTracer = "RequestTracer";
    static ServiceResolver = "ServiceResolver";
}

/**
 * Component life time
 *
 * @export
 * @enum {number}
 */
export enum LifeTime {
    /**
     * Only one instance
     */
    Singleton = 1,
    /**
     * Create a new instance every time
     */
    Transient = 2,
    /**
     * Create one instance per request
     */
    Scoped = 4
}

/**
 * Interface implemented by every scoped component
 *
 * @export
 * @interface IScopedComponent
 */
export interface IScopedComponent {
    /**
     * Current request context (scope)
     *
     * @type {RequestContext}
     */
    requestContext: RequestContext;
}

/**
 * Used to initialize a constructor parameter with a component
 *
 * @export
 * @param {string} component name
 * @param {boolean} [optional] True to not raise an exception if component doesn't exist
 */
export function Inject(optional?: boolean);
export function Inject(name: string, optional?: boolean);
export function Inject(nameOrBool?: string | boolean, optional?: boolean) {
    let name: string;
    if (typeof nameOrBool === "string") {
        name = nameOrBool;
    }
    else {
        optional = nameOrBool;
    }
    return function (target, key, i?) {
        if (i !== undefined) {
            // Constructor injection
            let injects = Reflect.getOwnMetadata(Symbol.for("di:ctor_injects"), target) || [];
            injects[i] = { name: name, optional: !!optional };
            Reflect.defineMetadata(Symbol.for("di:ctor_injects"), injects, target);
        }
        else {
            // Property constructor
            let injects = Reflect.getOwnMetadata(Symbol.for("di:props_injects"), target) || [];
            injects.push({ name: name || Reflect.getOwnMetadata("design:type", target, key).name, optional: !!optional, property: key });
            Reflect.defineMetadata(Symbol.for("di:props_injects"), injects, target);
        }
    };
}

/**
 * Used to declare a component.
 *
 * @export
 * @param {LifeTime} lifeTime of the component
 * @param {string} [name] - By default this is the class name
 * @param {enableOnTestOnly} Active this component only in an test environment
 */
export function Injectable(lifeTime: LifeTime, name?: string, enableOnTestOnly?: boolean) {
    return function (target) {
        if (enableOnTestOnly && !System.isTestEnvironnment)
            return;
        name = name || target.name;
        Preloader.instance.registerService(target, (container, domain) => {
            container.inject(name, target, lifeTime);
        }
        );
    };
}
