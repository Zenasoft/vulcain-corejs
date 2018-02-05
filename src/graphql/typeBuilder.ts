import { IContainer } from "../di/resolvers";
import { ServiceDescriptors } from "../pipeline/handlers/descriptions/serviceDescriptions";
import { DefaultServiceNames } from "../di/annotations";
import { HandlerProcessor } from "../pipeline/handlerProcessor";
import { Domain } from '../schemas/domain';
import { Schema } from '../schemas/schema';
import { IRequestContext, RequestData } from '../pipeline/common';
import { OperationDescription } from "../pipeline/handlers/descriptions/operationDescription";
import { Service } from "..";
const graphql = require('graphql');

const resolverSymbol = Symbol.for("vulcain_resolver");

export class GraphQLTypeBuilder {
    private types = new Map<string, any>();
    private descriptors: ServiceDescriptors;
    private domain: Domain;

    constructor(private context: IRequestContext) {
        this.descriptors = context.container.get<ServiceDescriptors>(DefaultServiceNames.ServiceDescriptors);
        this.domain = context.container.get<Domain>(DefaultServiceNames.Domain);
    }
    
    private *getHandlers(kind: "action"|"query") {
        for (let handler of this.descriptors.getDescriptions(false).services) {
            if (!handler.async && handler.kind === kind)
                yield handler;    
        }    
    }

    build() {
        return new graphql.GraphQLSchema({
            query: this.createQueryOperations(),
            mutation: this.createMutationOperations(),
            types: Array.from(this.types.values())
        });
    }

    private createQueryOperations() {
        let fields = {};
        for (let queryHandler of this.getHandlers("query")) {
            if (queryHandler.name === "get")
                continue;

            let { operationName, outputType, args } = this.createHandlerType(queryHandler);
            if (!outputType)
                continue;
            
            // Define the Query type
            fields[operationName] =
                {
                type: queryHandler.outputCardinality === "many" ? new graphql.GraphQLList(outputType) : outputType,
                    args,
                    resolve: this.resolveQuery
                };
            this.context.logInfo(() => `GRAPHQL: Enabling query handler ${operationName}`);
        }
        return new graphql.GraphQLObjectType({
            name: 'Query',
            fields
        });
    }

    private createMutationOperations() {
        let fields = {};
        for (let actionHandler of this.getHandlers("action")) {
   
            let { operationName, outputType, args } = this.createHandlerType(actionHandler);
            if (!outputType)
                continue;    
            let type = actionHandler.outputCardinality === "many" ? new graphql.GraphQLList(outputType) : outputType;

            // Define the Query type
            fields[operationName] =
                {
                    type,
                    args,
                    resolve: this.resolveMutation
                };
            this.context.logInfo(() => `GRAPHQL: Enabling mutation handler ${operationName}`);
        }

        return new graphql.GraphQLObjectType({
            name: 'Mutation',
            fields
        });
    }

    private createHandlerType(handler: OperationDescription) {
        let outputSchema = handler.outputSchema && this.domain.getSchema(handler.outputSchema, true);
        let args: any;
        let operationName = handler.verb.replace(/\./g, "_");

        let outputType = this.createType(outputSchema);

        // Ignore handler if outputSchema is not a model
        if (!outputType) {
            this.context.logInfo(() => `GRAPHQL: Skipping handler ${handler.verb} with no outputSchema or with a scalar output schema.`);
            return {};
        }

        if (handler.inputSchema) {
            let inputSchema = this.domain.getSchema(handler.inputSchema, true);
            if (inputSchema)
                args = { ["input"]: { type: this.createType(inputSchema, true) } };
        }
        else if (handler.name === "all") {
            if(outputSchema)
                operationName = outputSchema.name;
            args = {
                _pagesize: { type: graphql.GraphQLInt },
                _page: { type: graphql.GraphQLInt }
            };

            if (outputSchema) {
                const idPropertyName = outputSchema.getIdProperty();
                if (idPropertyName) {
                    const idProperty = outputSchema.info.properties[idPropertyName];                    
                    args[outputSchema.getIdProperty()] =  {
                        type: this.createScalarType(idProperty.type)
                    };
                }
            }
        }
        
        return { operationName, outputType, args };
    }

    private createScalarType(propType: string) {
        if (!propType)
            return null;    
        switch (this.domain.getScalarTypeOf(propType)) {
            case "id":
                return graphql["GraphQLID"];
            case "string":
                return graphql["GraphQLString"];
            case "number":
                return graphql["GraphQLFloat"];
            case "boolean":
                return graphql["GraphQLBoolean"];
        }
        return null;
    }

    private createType(schema: Schema, createInputType = false) {
        if (!schema)
            return null;
        
        let name = schema.name;
        if (createInputType)
            name = name + "_Input";
        
        let t = this.types.get(name);
        if (t)
            return t;

        let fields = {};
        for (let p in schema.info.properties) {
            let prop = schema.info.properties[p];

            let type = this.createScalarType(prop.type);

            if (!type) {
                let sch = this.domain.getSchema(prop.type, true);
                if (sch) {
                    let t = this.createType(sch, createInputType);
                    if (prop.cardinality === "many")
                        t = new graphql.GraphQLList(t);
                    fields[prop.name] = {
                        type: t,
                    };

                    if (!createInputType)
                        fields[prop.name].resolve = this.resolveQuery;
                }
            }
            else {
                fields[prop.name] = { type };
            }

            if (prop.description)
                fields[prop.name].description = prop.description;
            
            if (prop.required) {
                let t = fields[prop.name].type;
                fields[prop.name].type = graphql.GraphQLNonNull(t);
                fields[prop.name].type.name = t.name + "!";
            }
        }

        t = {
            name,
            fields: () => fields
        };

        if (schema.info.description)
            t.description = schema.info.description;

        let type;
        if (createInputType) {
            type = new graphql.GraphQLInputObjectType(t);
        }
        else {
            type = new graphql.GraphQLObjectType(t);
        }
        this.types.set(name, type);

        return type;
    }

    private async resolveMutation(entity, args, ctx: IRequestContext, info:any) {
        let processor = ctx.container.get<HandlerProcessor>(DefaultServiceNames.HandlerProcessor);
        let fieldName: string = info.fieldName;
        let pos = fieldName.lastIndexOf('_');
        if (pos < 0) {
            ctx.requestData.schema = null;
            ctx.requestData.action = fieldName;
        }
        else {
            ctx.requestData.schema = fieldName.substr(0, pos);
            ctx.requestData.action = fieldName.substr(pos + 1);
        }   
        ctx.requestData.params = args.input;
        ctx.requestData.vulcainVerb = fieldName;

        let handler = processor.getHandlerInfo(ctx.container, ctx.requestData.schema, ctx.requestData.action);
        let res = await processor.invokeHandler(ctx, handler);
        return res.content.value;
    }

    private async resolveQuery(entity, args, ctx: IRequestContext, info) {
        if (info.returnType[resolverSymbol]) {
            return info.returnType[resolverSymbol](entity, ctx);
        }
        // check root schema
        // else check remote root schema (=> au démarrage faire une requete à toutes les dependances sur _servicedescription pour connaitre les root schema)
        // else return entity[fieldName]
        let schema = info.returnType;
        let isList = false;
        while (schema.ofType) {
            schema = schema.ofType;
            isList = true;
        }

        let fieldName: string = info.fieldName;
        let pos = fieldName.lastIndexOf('_');
        if (pos < 0) {
            ctx.requestData.schema = fieldName;
            ctx.requestData.action = "all";
        }
        else {
            ctx.requestData.schema = fieldName.substr(0, pos);
            ctx.requestData.action = fieldName.substr(pos + 1);
        }    
        ctx.requestData.vulcainVerb = fieldName;

        let processor = ctx.container.get<HandlerProcessor>(DefaultServiceNames.HandlerProcessor);
        let handler = processor.getHandlerInfo(ctx.container, ctx.requestData.schema, ctx.requestData.action);
        if (!handler) {
            // args doit être null sinon faut faire une recherche ????
            let fn = info.fieldName;
            info.returnType[resolverSymbol] = (e) => e && e[fn];
            return info.returnType[resolverSymbol](entity, ctx);
        }

        let data: RequestData = { ...ctx.requestData, params: args };
        if (args._page) {
            data.page = args._page;
            delete args._page;
        }
        if (args._pagesize) {
            data.pageSize = args._pagesize;
            delete args._pagesize;
        }
        let res = await processor.invokeHandler(ctx, handler, data);
        return res.content.value;
    }

}