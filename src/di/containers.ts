import 'reflect-metadata';
import {Preloader} from '../preloader';
import {Scope} from './scope';
import {IResolver, InstanceResolver, SingletonResolver, Resolver, ScopedResolver} from './resolvers';
import {IContainer, BusUsage} from '../di/resolvers';
import {DefaultServiceNames} from '../di/annotations';
import {RabbitAdapter} from '../bus/rabbitAdapter'
import {LocalAdapter} from '../bus/localAdapter'
import {MemoryProvider} from "../providers/memory/provider";
import {MongoProvider} from "../providers/mongo/provider";
import {ProviderFactory} from '../providers/providerFactory';
import {System, VulcainLogger} from 'vulcain-configurationsjs'
import {Domain} from '../schemas/schema';
import {Application} from '../application';
import {LifeTime} from './annotations';
import {Files} from '../utils/files';
import {Conventions} from '../utils/conventions';
import { RequestContext } from './../servers/requestContext';
import { ServiceDescriptors } from './../pipeline/serviceDescriptions';

/**
 *
 *
 * @export
 * @class Container
 * @implements {IContainer}
 */
export class Container implements IContainer {

    private resolvers: Map<string,IResolver> = new Map<string,IResolver>();
    public scope: Scope;

    constructor(private parent?: IContainer, private requestContext?: RequestContext) {
        this.scope = new Scope(parent && (<any>parent).scope, requestContext);
        this.injectInstance(this, DefaultServiceNames.Container);

        if (!parent) {
            this.injectInstance(new VulcainLogger(), DefaultServiceNames.Logger);
            this.injectSingleton(ServiceDescriptors, DefaultServiceNames.ServiceDescriptors);
            this.injectSingleton(ProviderFactory, DefaultServiceNames.ProviderFactory);
        }
    }

    dispose() {
        this.scope.dispose();
        this.resolvers.clear();
    }

    /**
     * Inject all components from files containing in the specified folder.
     * Files are loaded recursively
     *
     * @param {string} folder path relative to the current directory
     * @returns the current container
     */
    injectFrom(path: string) {
        Files.traverse(path);
        return this;
    }

    /**
     *
     *
     * @param {string} address
     * @param {any} [usage=BusUsage.all]
     */
    useRabbitBusAdapter(address?:string, usage = BusUsage.all) {
        let bus = new RabbitAdapter(address || "amqp://" + (process.env[Conventions.instance.ENV_RABBIT_SERVER] || Conventions.instance.defaultRabbitAddress));
        if( usage === BusUsage.all || usage === BusUsage.eventOnly)
            this.injectInstance(bus, DefaultServiceNames.EventBusAdapter);
        if( usage === BusUsage.all || usage === BusUsage.commandOnly)
            this.injectInstance(bus, DefaultServiceNames.ActionBusAdapter);
    }

    /**
     *
     *
     * @param {string} mongo server address
     * @param {any} [mongoOptions]
     */
    useMongoProvider(address?: string, mongoOptions?) {
        let uri = System.resolveAlias(address || Conventions.instance.defaultMongoAddress);
        uri = "mongodb://" + (uri || Conventions.instance.defaultMongoAddress);
        this.injectTransient(MongoProvider, DefaultServiceNames.Provider, uri, mongoOptions);
    }

    /**
     *
     *
     * @param {string} [folder]
     */
    useMemoryProvider(folder?:string) {
        this.injectTransient(MemoryProvider, DefaultServiceNames.Provider, folder);
    }

    /**
     *
     * @param name
     * @param fn
     * @returns {Container}
     */
    injectInstance(fn, name:string) {
        if(!name) throw new Error("Name is required.");
        this.resolvers.set(name, new InstanceResolver(fn));
        if(name !== "Container" && fn.name)
            System.log.info(null, "INFO: Register instance component " + name + " as " + fn.name );
        return this;
    }

    /**
     *
     * @param fn
     * @param args
     */
    injectSingleton(fn, ...args);
    injectSingleton(fn, name?:string, ...args);
    injectSingleton(fn, nameOrArray:string|Array<any>, ...args) {
        let name:string;
        if(Array.isArray(nameOrArray)) {
            args = <Array<any>>nameOrArray;
            name = null;
        } else {
            name = nameOrArray;
        }
        let attr = Reflect.getOwnMetadata(Symbol.for("di:export"), fn);
        name = name || attr && attr.name || fn.name;
        if (!name) throw new Error("Can not find a name when injecting component. Use @Export.");
        this.resolvers.set(name, new SingletonResolver(fn, Array.from(args)));
        if( fn.name)
            System.log.info(null, "INFO: Register instance component " + name + " as " + fn.name);
        return this;
    }

    /**
     *
     * @param fn
     * @param args
     */
    injectTransient(fn, ...args);
    injectTransient(fn, name?:string, ...args);
    injectTransient(fn, nameOrArray:string|Array<any>, ...args) {
        let name:string;
        if(Array.isArray(nameOrArray)) {
            args = <Array<any>>nameOrArray;
            name = null;
        }
        else {
            name = nameOrArray;
        }

        let attr = Reflect.getOwnMetadata(Symbol.for("di:export"), fn);
        name = name || attr && attr.name || fn.name;
        if(!name)
            return;
        this.resolvers.set(name, new Resolver(fn, LifeTime.Transient, Array.from(args)));
        if( fn.name)
            System.log.info(null, "INFO: Register instance component " + name + " as " + fn.name);
        return this;
    }

    /**
     *
     * @param fn
     * @param args
     */
    injectScoped(fn, ...args);
    injectScoped(fn, name?:string, ...args);
    injectScoped(fn, nameOrArray:string|Array<any>, ...args) {
        let name:string;
        if(Array.isArray(nameOrArray)) {
            args = <Array<any>>nameOrArray;
            name = null;
        }
        else {
            name = nameOrArray;
        }

        let attr = Reflect.getOwnMetadata(Symbol.for("di:export"), fn);
        name = name || attr && attr.name || fn.name;
        if (!name) throw new Error("Cannot find a name when injecting component. Use @Export.");
        this.resolvers.set(name, new ScopedResolver(fn, Array.from(args)));
        if( fn.name)
            System.log.info(null, "INFO: Register instance component " + name + " as " + fn.name);
        return this;
    }

    inject(name: string, fn, lifeTime: LifeTime) {
        if (lifeTime) {
            switch (lifeTime) {
                case LifeTime.Singleton:
                    this.injectSingleton(fn, name);
                    break;
                case LifeTime.Scoped:
                    this.injectScoped(fn, name);
                    break;
                case LifeTime.Transient:
                    this.injectTransient(fn, name);
                    break;
            }
        }
        else
            this.injectTransient(fn, name);
    }

    /**
     *
     * @param fn
     * @param args
     * @returns {null}
     */
    resolve(fn, ...args) {
        if(typeof fn !== "function") throw new Error("fn must be a ctor");
        let resolver = new Resolver(fn, LifeTime.Transient, Array.from(args));
        return this._resolve(this, resolver);
    }

    private _resolve(parentContainer: Container, resolver:IResolver, name?:string, optional?:boolean) {

        let instance = resolver && resolver.resolve(this, name, parentContainer);

        if(!instance && !optional)
            throw new Error("Unable to resolve component " + name);

        return instance;
    }

    private findResolver(name: string) {
        let self:Container = this;
        while (self) {
            let resolver = self.resolvers.get(name);
            if (resolver)
                return { resolver, container:self };
            self = <Container>self.parent;
        }
        return null;
    }

    /**
     * Get a component by name.
     * Throw an exception if the component doesn't exist
     * @template T
     * @param {string} component name
     * @param {boolean} [optional] if true no exception are raised if the component doesn't exist
     * @param {LifeTime} [assertLifeTime] If provide check if the registered component has the expected {LifeTime}
     * @returns A component
     */
    get<T>(name:string, optional?:boolean, assertLifeTime?:LifeTime) {
        let res = this.findResolver(name);
        let resolver = res && res.resolver;
        if (assertLifeTime && resolver) {
            if (!(assertLifeTime & resolver.lifeTime))
                throw new Error("Component " + name + " must be declared with a life time = " + assertLifeTime);
        }
        let component = this._resolve(res && res.container, resolver, name, optional);
        return <T>component;
    }
}

/**
 * Default container for test
 *
 * @export
 * @class TestContainer
 * @extends {Container}
 */
export class TestContainer extends Container {
    /**
     * Creates an instance of TestContainer.
     *
     * @param {string} domainName
     * @param {(Container: IContainer) => void} [addServices] Additional services to register
     */
    constructor(public domainName: string, addServices?: (Container: IContainer) => void) {
        super();
        this.injectTransient(MemoryProvider, DefaultServiceNames.Provider);
        let domain = new Domain(domainName, this);
        this.injectInstance(domain, DefaultServiceNames.Domain);

        addServices && addServices(this);
        Preloader.runPreloads(this, domain);
    }
}
