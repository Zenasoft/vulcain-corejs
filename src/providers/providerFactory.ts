import {Injectable, LifeTime, Inject} from '../di/annotations';
import {DefaultServiceNames} from '../di/annotations';
import {Schema} from '../schemas/schema';
import {IProvider} from './provider';
import {IContainer} from '../di/resolvers';

interface PoolItem {
    provider: IProvider<any>;
    count: number;
}

@Injectable(LifeTime.Singleton, DefaultServiceNames.ProviderFactory)
export class ProviderFactory
{
    private pool = new Map<string, PoolItem>();
    private states = new Map<string, any>();

    constructor( public maxPoolSize = 20, public maxStatesSize=1000) {
    }

    private addToPool(key: string, provider: IProvider<any>) {
        if (this.states.size >= this.maxPoolSize) {
            // remove the least used
            let keyToRemove;
            let min = 0;
            for (const [key,value] of this.pool.entries()) {
                if (!keyToRemove || value.count < min) {
                    keyToRemove = key;
                    min = value.count;
                }
            }
            let state = this.states.get(keyToRemove);
            state.dispose && state.dispose();
            this.states.delete(keyToRemove);
        }
        this.pool.set(key, { count: 1, provider: provider });
    }

    private getFromPool(key: string) {
        let item = this.pool.get(key);
        if (item) {
            item.count++;
            return item.provider;
        }
    }

    private addState(key: string, state) {
        if (this.states.size > this.maxStatesSize) {
            this.states.clear(); // TO DO
        }
        this.states.set(key, state);
    }

    getProvider(container: IContainer, tenant: string, schema: Schema) {
        let key = tenant + "!" + schema.name;
        let provider = this.getFromPool(key);
        if (!provider) {
            provider = container.get<IProvider<any>>(DefaultServiceNames.Provider, false, LifeTime.Transient|LifeTime.Scoped);
            let state = this.states.get(key);
            if (state)
                (<any>provider).state = state;
            else {
                state = provider.initializeWithSchema(tenant, schema);
                if (state) {
                    this.addState(key, state);
                }
            }
            this.addToPool(key, provider);
        }

        return provider;
    }
}