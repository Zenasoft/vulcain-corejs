import { Domain, SchemaDescription } from './schema';
import { IContainer } from '../di/resolvers';
import { RequestContext } from "../pipeline/requestContext";

export class Validator {

    constructor(private domain: Domain, private container: IContainer) {
    }

    async validate(ctx: RequestContext, schemaDesc: SchemaDescription, val:any): Promise<{ [propertyName: string]: string }> {
        let errors: { [propertyName: string]: string } = {};
        if (!schemaDesc || !val) return errors;

        if (schemaDesc.extends) {
            let base = this.domain.resolveSchemaDescription(schemaDesc.extends);
            if (base) {
                let errorList = (await this.validate(ctx, base, val));
                errors = Object.assign(errors, errorList);
            }
        }

        let id = val && val[this.domain.getIdProperty(schemaDesc)];
        let formatContext: FormatContext = { element: val, schemaElement: schemaDesc, id: id };

        // Properties checks
        for (const ps in schemaDesc.properties) {
            if (!schemaDesc.properties.hasOwnProperty(ps)) continue;
            formatContext.propertyName = ps;
            formatContext.propertySchema = schemaDesc.properties[ps];
            formatContext.propertyValue = val[ps];

            try {
                let err = await this.validateProperty(ctx, formatContext, schemaDesc.properties[ps], val[ps], val);
                if (err) {
                    errors[ps] = err;
                }
            }
            catch (e) {
                errors[ps] = this.__formatMessage("Validation error for property {$propertyName} : " + e, formatContext);
            }
        }

        // References checks
        for (const rs in schemaDesc.references) {
            if (!schemaDesc.references.hasOwnProperty(rs)) continue;
            formatContext.propertyName = rs;
            formatContext.propertySchema = schemaDesc.references[rs];
            formatContext.propertyValue = val[rs];

            try {
                let ref = schemaDesc.references[rs];
                if (ref.item === "any" && formatContext.propertyValue && formatContext.propertyValue.__schema) {
                    if (ref && ref.dependsOn && !ref.dependsOn(val)) continue;
                    let schema = this.domain.getSchema(formatContext.propertyValue.__schema);
                    if (!schema) continue;
                    let errors2 = await this.validate(ctx, schema.description, formatContext.propertyValue);
                    if (errors2)
                        errors = Object.assign(errors, errors2);
                }
                else {
                    let errors2 = await this.validateReference(ctx, formatContext, ref, val[rs], val);
                    if (errors2)
                        errors = Object.assign(errors, errors2);
                }
            }
            catch (e) {
                errors[rs] = this.__formatMessage("Validation error for reference {$propertyName} : " + e, formatContext);
            }
        }

        // Entity check
        if (schemaDesc.validate) {
            formatContext.propertyName = formatContext.propertySchema = formatContext.propertyValue = null;
            try {
                let err = await schemaDesc.validate(val, ctx);
                if (err)
                    errors[schemaDesc.name] = this.__formatMessage(err, formatContext, schemaDesc);
            }
            catch (e) {
                errors[schemaDesc.name] = this.__formatMessage("Validation error for element {__schema} : " + e, formatContext);
            }
        }
        return errors;
    }

    private async validateReference(ctx: RequestContext, formatContext: FormatContext, schema, val, entity): Promise<{ [propertyName: string]: string }> {
        let errors = {};

        if (!schema)
            return errors;

        if (schema.dependsOn && !schema.dependsOn(entity))
            return errors;

        if (!val) {
            if (schema.required) {
                errors[formatContext.propertyName] = this.__formatMessage(`Reference '{$propertyName}' is required.`, formatContext, schema);
                return errors;
            }
            return null;
        }

        if (schema.validators) {
            for (let validator of schema.validators) {
                let msg = validator.validate && await validator.validate(val, ctx);
                if (msg) {
                    errors[formatContext.propertyName] = this.__formatMessage(msg, formatContext, schema);
                    return errors;
                }
            }
        }

        let err = schema.validate && await schema.validate(val, ctx);
        if (err) {
            errors[formatContext.propertyName] = err;
            return errors;
        }

        let values = schema.cardinality === "one" ? [val] : <Array<any>>val;

        let baseItemSchema = schema.item && schema.item !== "any" && this.domain.getSchema(schema.item, true);

        for (let val of values) {
            if (val) {
                let currentItemSchema = baseItemSchema;
                if (val.__schema && (!currentItemSchema || val.__schema !== currentItemSchema.name)) {
                    currentItemSchema = this.domain.getSchema(val.__schema, true);
                    if (!baseItemSchema)
                        baseItemSchema = currentItemSchema;
                }
                if (currentItemSchema) {
                    errors = Object.assign(errors, await this.validate(ctx, currentItemSchema.description, val));
                }
            }
        }
        return errors;
    }

    private async validateProperty(ctx: RequestContext, formatContext: FormatContext, schema: string | any, val, entity): Promise<string> {
        if (typeof schema === "string") {
            let type = this.domain._findType(<string>schema);
            if (!type) {
                return null;
            }
            schema = type;
        }

        if (schema.dependsOn && !schema.dependsOn(entity)) return;

        if (val === undefined || val === null) {
            if (schema.required) {
                return this.__formatMessage(`Property '{$propertyName}' is required`, formatContext, schema);
            }
            return null;
        }
        if (schema.validators) {
            for (let validator of schema.validators) {
                let err = validator.validate && await validator.validate(val, ctx);
                if (err) return this.__formatMessage(err, formatContext, validator);
            }
        }

        if (schema.validate) {
            let err = await schema.validate(val, ctx);
            if (err) return this.__formatMessage(err, formatContext, schema);
        }
    }

    /**
     * Format an error message
     * @param message
     * @param ctx
     * @returns {string}
     * @private
     */
    private __formatMessage(message: string, ctx: FormatContext, validator?): string {
        const regex = /{\s*([^}\s]*)\s*}/g;
        return message.replace(regex, function (match, name) {
            switch (name) {
                case "$value":
                    return ctx.propertyValue;
                case "__schema":
                    return ctx.propertyName ? ctx.propertySchema : ctx.schemaElement;
                case "$id":
                    return ctx.id;
                case "$propertyName":
                    return ctx.propertyName;
                default:
                    if (!name) return null;
                    // Name beginning with $ belongs to schema
                    if (name[0] === "$" && validator) {
                        let p = validator[name] || validator[name.substring(1)];
                        return (typeof p === "function" && p(validator)) || p;
                    }
                    // Else it's an element's property
                    if (ctx.element) {
                        let p = ctx.element[name];
                        return (typeof p === "function" && p(ctx.element)) || p;
                    }
                    return null;
            }
        });
    }
}

interface FormatContext {
    id: string;
    element;
    schemaElement;
    propertyName?: string;
    propertySchema?;
    propertyValue?;
}
