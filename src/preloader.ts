import { DefaultServiceNames } from './di/annotations';
import { IContainer } from './di/resolvers';
import { ServiceDescriptors } from './pipeline/serviceDescriptions';

interface Item {
    name: string;
    callback: (container, domain) => void;
}

const Models = "models";
const Services = "services";
const Handlers = "handlers";


export class Preloader {
    private static _preloads: { [name: string]: Array<Item> } = {};

    static registerModel(fn: Function, callback: (container, domain) => void) {
        let key = fn.name;
        Preloader.register(Models, key, callback);
    }

    static registerService(fn: Function, callback: (container, domain) => void) {
        let key = fn.name;
        Preloader.register(Services, key, callback);
    }

    static registerHandler(fn: Function, callback: (container, domain) => void) {
        let key = fn.name;
        Preloader.register(Handlers, key, callback);
    }

    private static register(key: string, name: string, fn) {
        let list = Preloader._preloads[key];
        if (!list) {
            Preloader._preloads[key] = list = [];
        }
        list.push({ name, callback: fn });
    }

    private static run(key: string, container, domain) {
        let items = Preloader._preloads[key];
        if (!items) return;
        for (const item of items) {
            item.callback(container, domain);
        }
    }

    static runPreloads(container: IContainer, domain) {
        if (Preloader._preloads) {
            Preloader.run(Models, container, domain);
            Preloader.run(Services, container, domain);
            Preloader.run(Handlers, container, domain);

            let descriptors = container.get<ServiceDescriptors>(DefaultServiceNames.ServiceDescriptors);
            descriptors.createHandlersTable();

            Preloader._preloads = {};
        }
    }
}