import { System } from 'vulcain-configurationsjs';
import { HandlerItem } from './serviceDescriptions';
import { EventMetadata, ConsumeEventMetadata } from './../pipeline/actions';
import { IContainer } from './../di/resolvers';
import {Domain} from './../schemas/schema';

export class EventHandlerFactory {
    private handlers = new Map<string, Map<string, Array<HandlerItem>>>();

    *allHandlers(): Iterable<HandlerItem> {
        for (let [vk, v] of this.handlers) {
            for (let [sk, s] of v)
            {
                for (let i of s)
                    yield i;
            }
        }
    }

    register(container: IContainer, domain: Domain, target: Function, actions: any, handlerMetadata: EventMetadata) {
        let domainName = domain.name;
        handlerMetadata = handlerMetadata || {};

        if (handlerMetadata.schema) {
            // test if exists
            let tmp = domain.getSchema(handlerMetadata.schema);
            handlerMetadata.schema = tmp.name;
        }

        for (const action in actions) {
            let actionMetadata: ConsumeEventMetadata = actions[action];
            actionMetadata = actionMetadata || <ConsumeEventMetadata>{};

            if (actionMetadata.subscribeToSchema) {
                // test if exists
                let tmp                          = domain.getSchema(actionMetadata.subscribeToSchema);
                actionMetadata.subscribeToSchema = tmp.name;
            }

            let keys                         = [domainName];
            let schema                       = <string>actionMetadata.subscribeToSchema || <string>handlerMetadata.schema || "*";
            actionMetadata.subscribeToSchema = schema;
            actionMetadata.subscribeToAction = actionMetadata.subscribeToAction || "*";

            keys.push(actionMetadata.subscribeToAction);
            let handlerKey = keys.join('.').toLowerCase();

            let byActions = this.handlers.get(handlerKey);
            if (!byActions) {
                byActions = new Map<string, Array<HandlerItem>>();
                this.handlers.set(handlerKey, byActions);
            }

            let bySchemas = byActions.get(schema);
            if (!bySchemas) {
                bySchemas = [];
                byActions.set(schema, bySchemas);
            }

            // Merge metadata
            let item: HandlerItem = {
                kind: "event",
                methodName: action,
                metadata: Object.assign({}, handlerMetadata, actionMetadata),
                handler: target
            }

            bySchemas.push(item);
            System.log.info(null, "Event handler registered for domain %s action %s schema %s", domainName, actionMetadata.subscribeToAction, schema);
        }
    }

    getFilteredHandlers(domain: string, schema: string, action: string)
    {
        let d = domain && domain.toLowerCase() + ".";
        let a = (action && action.toLowerCase()) || "*";
        let s = (schema && schema.toLowerCase()) || "*";

        let items = [];

        let key = d + a;
        let infos = this.handlers.get(key);
        if (infos) {
            let tmp = infos.get(s);
            if (tmp)
                items = items.concat(tmp);
            if (s !== "*") {
                tmp = infos.get("*");
                if (tmp)
                    items = items.concat(tmp);
            }
        }

        if (a !== "*") {
            key = d + "*";
            infos = this.handlers.get(key);
            if (infos) {
                let tmp = infos.get(s);
                if (tmp)
                    items = items.concat(tmp);
                if (s !== "*") {
                    tmp = infos.get("*");
                    if (tmp)
                        items = items.concat(tmp);
                }
            }
        }
        return items;
    }
}
