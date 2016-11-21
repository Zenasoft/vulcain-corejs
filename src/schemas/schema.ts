import { SchemaBuilder } from './schemaBuilder';
import { standards } from './standards';
import { Validator } from './validator';
import { IContainer } from '../di/resolvers';
import { SchemaVisitor } from './visitor';
import { PropertyOptions } from './annotations';
import { ReferenceOptions } from './annotations';
import { System } from './../configurations/globals/system';
import { RequestContext } from '../servers/requestContext';

export interface ErrorMessage {
    message: string;
    id: string;
    property?: string;
}

export interface SchemaDescription {
    name: string;
    properties: { [index: string]: PropertyOptions };
    references: { [index: string]: ReferenceOptions };
    extends?: SchemaDescription | string;
    hasSensibleData?: boolean;
    bind?: (obj) => any;
    validate?: (val, ctx: RequestContext) => string;
    storageName?: string;
    idProperty?: string;
}

/**
 * Schema definition
 */
export class Schema {
    public description: SchemaDescription;
    private _domain: Domain;

    /**
     * Current domain model
     * @returns {Domain}
     */
    public get domain(): Domain {
        return this._domain;
    }

    get extends(): SchemaDescription {
        if (!this.description.extends) {
            return null;
        }
        if (typeof this.description.extends === "string") {
            return this._domain.findSchemaDescription(<string>this.description.extends);
        }
        else {
            return <SchemaDescription>this.description.extends;
        }
    }
    /**
     * Create a new schema
     * @param domain : current domain model
     * @param name : schema name or schema
     */
    constructor(domain: Domain, public name: string) {
        this._domain = domain;

        this.description = domain.findSchemaDescription(name);
        if (!this.description) {
            throw new Error(`Schema ${name} not found.`);
        }
        name = this.description.name;
    }

    /**
     *
     * @param origin
     * @returns {null|any|{}}
     */
    bind(origin, old?) {
        return this.domain.bind(origin, this.description, old);
    }

    validateAsync(ctx: RequestContext, obj) {
        return this.domain.validateAsync(ctx, obj, this.description);
    }

    getIdProperty() {
        return this.domain.getIdProperty(this.description);
    }

    getId(obj) {
        return obj[this.getIdProperty()];
    }

    encrypt(entity) {
        if (!entity || !this.description.hasSensibleData) {
            return entity;
        }
        let visitor = {
            visitEntity(entity, schema) { this.current = entity; return schema.hasSensibleData; },
            visitProperty(val, prop) {
                if (val && prop.sensible) {
                    this.current[prop.name] = System.encrypt(val);
                }
            }
        };
        let v = new SchemaVisitor(this.domain, visitor);
        v.visit(this.description, entity);
        return entity;
    }

    decrypt(entity) {
        if (!entity || !this.description.hasSensibleData) {
            return entity;
        }

        let visitor = {
            visitEntity(entity, schema) { this.current = entity; return schema.hasSensibleData; },
            visitProperty(val, prop) {
                if (val && prop.sensible) {
                    this.current[prop.name] = System.decrypt(val);
                }
            }
        };
        let v = new SchemaVisitor(this.domain, visitor);
        v.visit(this.description, entity);
        return entity;
    }

    /**
     * Copy an entity to another taking into account references defined in schema
     *
     * @param {any} target
     * @param {any} source
     * @param {SchemaDescription} [schema]
     * @returns
     *
     * @memberOf Schema
     */
    deepAssign( target, source, schema?: SchemaDescription) {
        if (!source) {
            return target;
        }
        schema = schema || this.description;
        for (let key of Object.keys(source)) {
            let val = source[key];
            if (typeof val === "object") {
                let ref = schema.references[key];
                if (ref) {
                    let item = ref.item;
                    if (item === "any" && val && val.__schema) {
                        item = val.__schema;
                    }
                    let elemSchema = this.domain.findSchemaDescription(item);
                    if (elemSchema) {
                        if (Array.isArray(val)) {
                            target[key] = [];
                            val.forEach(v => target[key].push(this.deepAssign( {}, v, elemSchema)));
                        }
                        else {
                            target[key] = this.deepAssign(target[key] || {}, val, elemSchema);
                        }
                        continue;
                    }
                }
            }
            if (val !== undefined) {
                target[key] = val;
            }
        }
        return target;
    }
}

/**
 * Domain model
 */
export class Domain {
    private _schemaDescriptions: Map<string, SchemaDescription>;
    private types: Map<string, any>;
    private builder: SchemaBuilder;

    constructor(public name: string, private container: IContainer, defaultTypes?) {
        this.builder = new SchemaBuilder(this);
        this._schemaDescriptions = new Map<string, SchemaDescription>();
        this.types = new Map<string, any>();
        this.types.set("", defaultTypes || standards);
    }

    addSchemaDescription(schema, name?: string): string {
        let schemaName = null;
        if (Array.isArray(schema)) {
            schema.forEach(s => {
                let tmp = this.addSchemaDescription(s);
                if (!schemaName) { schemaName = tmp; }
            }
            );
            return schemaName;
        }
        if (!schema) {
            throw new Error("Invalid schema argument (null or empty) ");
        }
        if (typeof schema === "function") {
            let tmp = this._schemaDescriptions.get(schema.name);
            if (tmp) {
                return schema.name;
            }
            schema = this.builder.build(schema);
        }

        schemaName = name || schema.name;
        if (!schemaName) { return; }
        // Existing Model extension
        if (schema.extends === schema.name) {
            throw new Error("Invalid schema extension. Can not be the same schema.");
        }
        this._schemaDescriptions.set(schemaName, schema);
        return schemaName;
    }

    /**
     * Get a registered schema by name
     * Throws an exception if not exists
     * @param {string} schema name
     * @returns a schema
     */
    getSchema(name: string | Function) {
        if (typeof name === "string") {
            return new Schema(this, name);
        }
        return new Schema(this, this.addSchemaDescription(name));
    }

    /**
     * Get all schemas
     *
     * @readonly
     */
    get schemas() {
        return Array.from(this._schemaDescriptions.values());
    }

    /**
     * Do not use directly
     *
     * @param {string} name
     * @returns
     */
    findSchemaDescription(name: string) {
        return this._schemaDescriptions.get(name);
    }

    /**
     * Do not use directly
     *
     * @readonly
     */
    get schemaDescriptions() {
        return Array.from(this._schemaDescriptions.values());
    }

    addTypes(types, ns: string = "") {
        if (!types) { throw new Error("Invalid type argument"); }
        let old = this.types.get(ns);
        Object.assign(old || {}, types);
        this.types.set(ns, old);
    }

    addType(name: string, type: string, info: any, ns: string = "") {
        if (!name || !type) { throw new Error("Invalid type argument"); }
        let subType = this._findType(type);
        if (!subType) { throw new Error("Unknow type " + type); }

        let types = this.types.get(ns);
        if (!types) {
            types = {};
            this.types.set(ns, types);
        }
        types[name] = SchemaBuilder.clone(subType, info);
    }

    _findType(name: string) {
        if (!name) { return null; }
        let parts = name.split('.');
        if (parts.length === 1) {
            return this.types.get("")[name];
        }
        if (parts.length !== 2) {
            throw new Error("Incorrect type name " + name);
        }
        return this.types.get(parts[0])[parts[1]];
    }

    /**
     * Remove all sensible data
     *
     * @param {any} entity
     * @param {any} schemaName
     * @returns
     */
    obfuscate(entity, schema: Schema) {
        let visitor = {
            visitEntity(entity, schema) { this.current = entity; return schema.hasSensibleData; },
            visitProperty(val, prop) { if (prop.sensible) { delete this.current[prop.name]; } }
        };
        let v = new SchemaVisitor(this, visitor);
        v.visit(schema.description, entity);
    }

    /**
     * Convert a new object from an other based on a specific schema
     * @param origin : initial object to convert
     * @param schemaName : schema to used (default=current schema)
     * @param obj : existing object to use
     * @returns {any}
     */
    bind(origin, schemaName?: string | SchemaDescription, obj?) {
        if (!origin) { return null; }
        let schema: SchemaDescription = this.resolveSchemaDescription(schemaName, obj);
        if (typeof schema.bind === "function") {
            obj = schema.bind(origin);
        }

        obj = obj || origin;
        if (typeof obj !== "object") {
            return obj;
        }
        (<any>obj).__schema = (<any>obj).__schema || schema.name;

        // Convert properties
        for (const ps in schema.properties) {
            if (!schema.properties.hasOwnProperty(ps)) { continue; }
            let prop: PropertyOptions = schema.properties[ps];
            if (prop) {
                try {
                    let val = this.applyBinding(prop, origin, origin[ps]);

                    if (val !== undefined) {
                        obj[ps] = val;
                    }
                    else if (prop.defaultValue !== undefined) {
                        obj[ps] = prop.defaultValue;
                    }
                }
                catch (e) {
                    // ignore
                }
            }
        }

        for (const ref in schema.references) {
            if (!schema.references.hasOwnProperty(ref)) { continue; }
            let relationshipSchema = schema.references[ref];
            let refValue = origin[ref];
            if (relationshipSchema && refValue) {
                try {
                    let item = relationshipSchema.item;
                    if (item === "any" && refValue && refValue.__schema) {
                        item = refValue.__schema;
                    }
                    let elemSchema = this.findSchemaDescription(item);
                    if (!elemSchema && item !== "any") {
                        continue;
                    }

                    if (this.isMany(relationshipSchema)) {
                        obj[ref] = [];
                        for (let elem of refValue) {
                            let val = this.applyBinding(relationshipSchema, elemSchema, elem);
                            if (val !== undefined) {
                                obj[ref].push(!elemSchema && item === "any" ? val : this.bind(val, elemSchema));
                            }
                        }
                    }
                    else {
                        let val = this.applyBinding(relationshipSchema, elemSchema, refValue);
                        if (val !== undefined) {
                            obj[ref] = !elemSchema && item === "any" ? val : this.bind(val, elemSchema);
                        }
                    }
                }
                catch (e) {
                    // ignore
                }
            }
        }
        if (schema.extends) {
            this.bind(origin, schema.extends, obj);
        }
        return obj;
    }

    private applyBinding(prop, origin, val) {
        let mainTypeValidator = prop.validators[prop.validators.length - 1];
        if (mainTypeValidator["bind"] === false) { return undefined; }// skip value

        for (let validator of prop.validators) {
            let convert = validator["bind"];
            if (convert === false) { continue; }

            if (convert && typeof convert === "function") {
                val = convert.apply(prop, [val, origin]);
            }
        }
        return val;
    }

    private isMany(relSchema) {
        return relSchema.cardinality === "many";
    }

    /**
     * Validate an object
     * @param val : Object to validate
     * @param schemaName : schema to use (default=current schema)
     * @returns Array<string> : A list of errors
     */
    validateAsync(ctx: RequestContext, val, schemaName?: string | SchemaDescription) {
        if (!val) { return Promise.resolve([]); }
        let schema: SchemaDescription = this.resolveSchemaDescription(schemaName, val);
        var validator = new Validator(this, this.container);
        return validator.validateAsync(ctx, schema, val);
    }

    resolveSchemaDescription(schemaName: string | SchemaDescription, val?) {
        let schema: SchemaDescription;
        if (!schemaName || typeof schemaName === "string") {
            schemaName = schemaName || val && val.__schema;
            schema = this._schemaDescriptions.get(<string>schemaName);
            if (!schema) { throw new Error("Unknown schema " + schemaName); }
        }
        else {
            schema = <SchemaDescription>schemaName;
            if (!schema) { throw new Error("Invalid schema"); }
        }
        return schema;
    }

    getIdProperty(schemaName?: string | SchemaDescription) {
        let schema = this.resolveSchemaDescription(schemaName);
        return schema.idProperty;
    }
}
