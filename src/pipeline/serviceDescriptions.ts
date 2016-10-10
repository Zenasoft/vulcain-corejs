import { System } from 'vulcain-configurationsjs';
import { Domain, Schema } from './../schemas/schema';
import {EventNotificationMode} from './actions';
import {Injectable, LifeTime, Inject, DefaultServiceNames} from '../di/annotations';
import { Model } from './../schemas/annotations';
import { IContainer } from './../di/resolvers';
import { ServiceHandlerMetadata, CommonActionMetadata, CommonMetadata, RuntimeError } from './common';

export interface HandlerItem {
    methodName: string;
    handler;
    metadata: CommonActionMetadata;
    kind: string;
}

export class PropertyDescription {
    name: string;
    required: boolean;
    description: string;
    type: string;
    reference: "no" | "many" | "one";
}

export class SchemaDescription {
    name: string;
    properties: Array<PropertyDescription>;
}

export class ActionDescription {
    kind: "action" | "query" | "get";
    description: string;
    action: string;
    scope: string;
    inputSchema: string;
    outputSchema: string;
    verb: string;
}

@Model()
export class ServiceDescription {
    domain: string;
    serviceName: string;
    serviceVersion: string;
    alternateAddress: string;
    services: Array<ActionDescription>;
    schemas: Array<SchemaDescription>;
}

export class ServiceDescriptors {
    private static natives = ["string", "String", "boolean", "Boolean", "number", "Number", "any", "Object"];
    private descriptions: ServiceDescription;
    private handlers = new Array<HandlerItem>();
    private routes = new Map<string, HandlerItem>();
    private monoSchema: boolean = true;

    constructor(@Inject(DefaultServiceNames.Domain) private domain: Domain) { }

    getAll() {
        this.createHandlersTable();
        return this.descriptions;
    }

    getHandlerInfo<T extends CommonMetadata>(container: IContainer, schema: string, action: string, optional?: boolean) {
        this.createHandlersTable();

        let a = action && action.toLowerCase();
        let item;

        if (this.monoSchema || !schema) {
            item = this.routes.get(a);
        }
        else {
            let s = schema && schema.toLowerCase();
            item = this.routes.get(s + "." + a);
        }

        if (item == null) {
            if (optional)
                return null;
            else
                throw new RuntimeError(`no handler method founded for action ${action}, schema ${schema}`);
        }

        try {
            let handler = container && container.resolve(item.handler);
            return { handler: handler, metadata: <T>item.metadata, method: item.methodName };
        }
        catch (e) {
            System.log.error(null, e, `Unable to create handler action ${action}, schema ${schema}`);
            throw new Error(`Unable to create handler for action ${action}, schema ${schema}`);
        }
    }

    createHandlersTable() {
        if (!this.handlers)
            return;

        let schemas = new Map<string, SchemaDescription>();

        // Check if there is only one Schema
        let lastSchema: string;
        this.handlers.forEach(item => {
           if (!item.metadata.schema)
                return;
            if (!lastSchema)
                lastSchema = <string>item.metadata.schema;
            else if (item.metadata.schema !== lastSchema) {
                this.monoSchema = false;
            }
        });

        let uniques = new Set<string>();

        this.descriptions = {
            services: [],
            schemas: new Array<SchemaDescription>(),
            domain: this.domain.name,
            serviceName: System.serviceName,
            serviceVersion: System.serviceVersion,
            alternateAddress: null
        };

        for (let item of this.handlers.filter(h=>h.kind==="action")) {

            let verb = !item.metadata.schema || this.monoSchema
                ? item.metadata.action
                : this.getSchemaDescription(schemas, item.metadata.schema) + "." + item.metadata.action;

            verb = verb.toLowerCase();
            if( this.routes.has(verb))
                throw new Error(`*** Duplicate handler for action ${item.metadata.action} for handler ${item.handler.name}`);

            System.log.info(null, "Handler registered for action verb %s", verb);
            this.routes.set(verb, item);

            let desc: ActionDescription = {
                kind: "action",
                verb: verb,
                description: item.metadata.description,
                action: item.metadata.action,
                scope: item.metadata.scope,
                inputSchema: item.metadata.schema && this.getSchemaDescription(schemas, item.metadata.inputSchema),
                outputSchema: item.metadata.schema && this.getSchemaDescription(schemas, item.metadata.outputSchema)
                };

            this.descriptions.services.push(desc);
        }

        for (let item of this.handlers.filter(h=>h.kind==="query")) {
            let schema = item.metadata.schema && this.getSchemaDescription(schemas, item.metadata.schema);

            let verb = !item.metadata.schema || this.monoSchema
                ? item.metadata.action
                : this.getSchemaDescription(schemas, item.metadata.schema) + "." + item.metadata.action;

            verb = verb.toLowerCase();
            if( this.routes.has(verb))
                throw new Error(`*** Duplicate handler for query ${item.metadata.action} for handler ${item.handler.name}`);

            System.log.info(null, "Handler registered for query verb %s", verb);
            this.routes.set(verb, item);

            if (item.metadata.action === "_serviceDescription") continue;

            let desc: ActionDescription = {
                kind: item.metadata.action === "get" ? "get" : "query",
                verb: verb,
                description: item.metadata.description,
                action: item.metadata.action,
                scope: item.metadata.scope,
                inputSchema: item.metadata.inputSchema && this.getSchemaDescription(schemas, item.metadata.inputSchema),
                outputSchema: (item.metadata.outputSchema && this.getSchemaDescription(schemas, item.metadata.outputSchema)) || schema
            };

            if (desc.action === "get" && !desc.inputSchema)
                desc.inputSchema = "string";
            if (desc.action !== "get")
                desc.outputSchema = desc.outputSchema;
            this.descriptions.services.push(desc);
        }

        this.handlers = null;
    }

    private getSchemaDescription(    schemas : Map<string, SchemaDescription>, schemaName: string | Function) {
        if (typeof schemaName === "string") {
            if( ServiceDescriptors.natives.indexOf(schemaName) >= 0) return schemaName;
            let type = this.getPropertyType(schemaName);
            if (type)
                return type.name;
        }

        let schema = this.domain.getSchema(schemaName);
        if (!schema)
            throw new Error("Unknow schema " + schemaName);

        let desc: SchemaDescription = schemas.get(schema.name);
        if (desc) return desc.name;

        desc = { name: schema.name, properties: [] };
        schemas.set(schema.name, desc);
        this.descriptions.schemas.push(desc);

        for (let k of Object.keys(schema.description.properties)) {
            const p = schema.description.properties[k];
            let type = this.getPropertyType(p.type);
            if (type) {
                let pdesc: PropertyDescription = <any>{ name: k, type: type.name, required: p.required, description: p.description };
                // Insert required at the beginning
                if (!pdesc.required)
                    desc.properties.push(pdesc);
                else
                    desc.properties.unshift(pdesc);
            }
        }
        for (let k of Object.keys(schema.description.references)) {
            const r = schema.description.references[k];
            if (schemas.has(r.name)) return r.name;
            this.getSchemaDescription(schemas, r.item);

            let pdesc: PropertyDescription = {
                name: k,
                reference: r.cardinality,
                type: r.item,
                required: r.required,
                description: r.description
            };
            // Insert required at the beginning
            if (!pdesc.required)
                desc.properties.push(pdesc);
            else
                desc.properties.unshift(pdesc);
        }
        return desc.name;
    }

    private getPropertyType(name: string) {
        while (true) {
            let type = this.domain._findType(name.toLowerCase());
            if (!type || !type.type) {
                if(type)
                    type.name = name.toLowerCase();
                return type;
            }
            name = type.type;
        }
    }

    register(container: IContainer, domain: Domain, target: Function, actions: any, handlerMetadata: ServiceHandlerMetadata, kind:string) {

        handlerMetadata = handlerMetadata || {scope:"*"};

        if (handlerMetadata.schema) {
            // test if exists
            let tmp = domain.getSchema(handlerMetadata.schema);
            handlerMetadata.schema = tmp.name;
        }

        container.inject(handlerMetadata.serviceName || target.name, target, handlerMetadata.serviceLifeTime || LifeTime.Scoped);

        for (const action in actions) {
            let actionMetadata: CommonActionMetadata = actions[action];
            actionMetadata = actionMetadata || <CommonActionMetadata>{};
            actionMetadata.action = actionMetadata.action || action;

            if(kind === "action") {
                if (!actionMetadata.inputSchema) {
                    actionMetadata.inputSchema = actionMetadata.schema || handlerMetadata.schema;
                }
                if (!actionMetadata.outputSchema) {
                    actionMetadata.outputSchema = actionMetadata.inputSchema;
                }
            }
            else {
                if (!actionMetadata.outputSchema) {
                    actionMetadata.outputSchema = actionMetadata.schema || handlerMetadata.schema;
                }
            }

            if (actionMetadata.schema) {
                // test if exists
                let tmp = domain.getSchema(actionMetadata.schema);
                actionMetadata.schema = tmp.name;
            }
            if (actionMetadata.inputSchema) {
                // test if exists
                let tmp = domain.getSchema(actionMetadata.inputSchema);
                actionMetadata.inputSchema = tmp.name;
            }

            // Merge metadata
            let item: HandlerItem = {
                kind: kind,
                methodName: action,
                metadata: Object.assign({}, handlerMetadata, actionMetadata),
                handler: target
            }

            this.handlers.push(item);
        }
    }
}