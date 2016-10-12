import { Domain, SchemaDescription } from './schema';

import 'reflect-metadata'
import { PropertyOptions, ReferenceOptions } from './annotations';
import { ModelOptions } from './annotations';

export class SchemaBuilder {

    constructor(private domain: Domain) { }

    build(model) {
        if(!model) return null;
        let schema:SchemaDescription = {name: model.name,properties:{}, references:{}};

        const symModel = Symbol.for("design:model");
        let modelAttr:ModelOptions = Reflect.getMetadata(symModel, model);
        if (modelAttr) {
            for(let n of Object.keys( modelAttr)) {
                let p = modelAttr[n];
                if (typeof p === "function")
                    schema[n] = p.bind(schema);
                else {
                    schema[n] = p;
                }
            }
        }

        schema.storageName = schema.storageName || schema.name;

        const symProperties = Symbol.for("design:properties");

        let properties = Reflect.getOwnMetadata(symProperties, model.prototype);
        for(let propertyName in properties) {
            let propAttr: PropertyOptions = properties[propertyName];
            if (propAttr) {
                if (propAttr.type !== "any" && !this.domain._findType(propAttr.type))
                    throw new Error(`Unknown type ${propAttr.type} for property ${propertyName} of schema ${schema.name}`);

                if (propAttr.isKey) {
                    if (schema.idProperty)
                        throw new Error("Multiple property id is not valid for schema " + schema.name);
                    schema.idProperty = propertyName;
                }

                if (schema.hasSensibleData === undefined) {
                    if (propAttr.sensible)
                        schema.hasSensibleData = true;
                }

                schema.properties[propertyName] = propAttr;
                propAttr.validators = this.createValidatorsChain(propAttr.type, propAttr, propertyName, model);
            }
        }

        if (!schema.idProperty) {
            if (schema.properties["id"])
                schema.idProperty = "id";
            else if (schema.properties["name"])
                schema.idProperty = "name"
        }

        const symReferences = Symbol.for("design:references");
        let references = Reflect.getOwnMetadata(symReferences, model.prototype);
        for(let referenceName in references) {
            let refAttr: ReferenceOptions = references[referenceName];
            if (refAttr) {
                let itemSchema;
                if (refAttr.item !== "any") {
                    itemSchema = this.domain.findSchemaDescription(refAttr.item);
                    if (!itemSchema)
                        throw new Error(`Unknown referenced schema ${refAttr.item} for reference ${referenceName} of schema ${schema.name}`);
                }

                schema.references[referenceName] = refAttr;
                refAttr.validators = this.createValidatorsChain(refAttr.type || "$ref", refAttr, referenceName, model);

                if (schema.hasSensibleData === undefined && itemSchema) {
                    if ( itemSchema.hasSensibleData)
                        schema.hasSensibleData = true;
                }
            }
        }

        return schema;
    }

    private createValidatorsChain(typeName: string, attributeInfo, propertyName:string, obj) {
        let chain = [];
        const symValidators = Symbol.for("design:validators");

        let type = this.domain._findType(typeName);
        if (type) {
            let clonedType = this.clone(type, attributeInfo);
            // Type inheritence (in reverse order)
            let stypeName = type.type;
            while (stypeName) {
                let stype = this.domain._findType(stypeName);
                if (!stype)
                    break;
                chain.unshift(this.clone(stype, attributeInfo));
                stypeName = stype.type;
            }
            // Then type
            chain.push(clonedType);
        }

        // And validator
        let validators = Reflect.getOwnMetadata(symValidators, obj.prototype, propertyName);
        if (validators) {
            for (let {name, info} of validators) {
                let validator = this.domain._findType(name);
                if (validator)
                    chain.push(this.clone(validator, info));
            }
        }
        return chain;
    }

    // Copy all schema property names from 'from'
    // TODO use extends
    private clone(schema, from): any {
        let clone = {};
        for (let key of Object.keys(schema)) {
            if (key && key[0] === "$") {
                let pname = key.substr(1);
                clone[key] = from[pname] || schema[key];
            }
            else if (key !== "validators") {
                clone[key] = schema[key];
            }
        }
        return clone;
    }
}