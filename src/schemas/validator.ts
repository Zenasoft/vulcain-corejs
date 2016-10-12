
import { Domain, SchemaDescription, ErrorMessage } from './schema';
import {IContainer} from '../di/resolvers';
import { ReferenceOptions, PropertyOptions } from './annotations';
import { Property } from './annotations';

export class Validator
{

    constructor( private domain:Domain, private container:IContainer)
    {
    }

    validate( schemaDesc: SchemaDescription, val )
    {
        let errors: Array<ErrorMessage> = [];
        if( !schemaDesc || !val ) return errors;

        if( schemaDesc.extends)
        {
            let base = this.domain.resolveSchemaDescription(schemaDesc.extends);
            if(base)
            {
                this.validate( base, val ).forEach(e=> {errors.push( e );});
            }
        }

        let id =  val && val[this.domain.getIdProperty(schemaDesc)];
        let ctx:FormatContext = { element: val, schemaElement: schemaDesc, id: id };

        // Properties checks
        for( const ps in schemaDesc.properties )
        {
            if( !schemaDesc.properties.hasOwnProperty( ps ) ) continue;
            ctx.propertyName   = ps;
            ctx.propertySchema = schemaDesc.properties[ps];
            ctx.propertyValue  = val[ps];

            try
            {
                let err = this.validateProperty(ctx, schemaDesc.properties[ps], val[ps], val);
                if( err )
                {
                    errors.push( {message: err, property:ps, id:ctx.id} );
                }
            }
            catch( e )
            {
                errors.push( {message:this.__formatMessage( "Validation error for property {$propertyName} : " + e, ctx ), id:ctx.id, property:ps} );
            }
        }

        // References checks
        for( const rs in schemaDesc.references )
        {
            if( !schemaDesc.references.hasOwnProperty( rs ) ) continue;
            ctx.propertyName   = rs;
            ctx.propertySchema = schemaDesc.references[rs];
            ctx.propertyValue  = val[rs];

            try
            {
                let ref = schemaDesc.references[rs];
                if( ref.item === "any" && ctx.propertyValue && ctx.propertyValue.__schema)
                {
                    if( ref && ref.dependsOn && !ref.dependsOn(val)) continue;
                    let schema = this.domain.getSchema( ctx.propertyValue.__schema );
                    if( !schema ) continue;
                    errors = errors.concat(this.validate( schema.description, ctx.propertyValue ));
                }
                else
                {
                    let errors2 = this.validateReference( ref, val[rs], val );
                    errors2 && errors2.forEach( err=>errors.push( {message:this.__formatMessage( err, ctx, schemaDesc ), id:ctx.id, property:rs} ));
                }
            }
            catch( e )
            {
                errors.push( {message:this.__formatMessage( "Validation error for reference {$propertyName} : " + e, ctx ), id:ctx.id, property:rs} );
            }
        }

        // Entity check
        if( schemaDesc.validate )
        {
            ctx.propertyName = ctx.propertySchema = ctx.propertyValue = null;
            try
            {
                let err = schemaDesc.validate( val, this.container );
                if( err )
                    errors.push( {message:this.__formatMessage( err, ctx, schemaDesc ), id:ctx.id} );
            }
            catch( e )
            {
                errors.push( {message:this.__formatMessage( "Validation error for element {__schema} : " + e, ctx ), id:ctx.id} );
            }
        }
        return errors;
    }

    private validateReference( schema, val, entity ): Array<string>
    {
        if (!schema)
            return;

        if (schema.dependsOn && !schema.dependsOn(entity))
            return;

        if (!val) {
            if (schema.required) {
                return ["Reference '{$propertyName}' is required."];
            }
            return null;
        }

        if (schema.validators) {
            for (let validator of schema.validators) {
                let err = validator.validate && validator.validate(val);
                if (err) return [err];
            }
        }

        let err = schema.validate && schema.validate(val);
        if (err) return [err];

        let values = schema.cardinality === "one" ? [val] : <Array<any>>val;
        let itemType = schema.item && this.domain._findType(schema.item);
        let errors = [];
        for (let val of values) {
            if (val) {
                let t = itemType;
                if (val.__schema && val.__schema !== schema.item)
                    t = this.domain._findType(val.__schema);
                errors = this.validate(t, val);
            }
        }
        return errors;
    }

    private validateProperty(ctx: FormatContext, schema: string | any, val, entity): string {
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
                return "Property '{$propertyName}' is required.";
            }
            return null;
        }
        if (schema.validators) {
            for (let validator of schema.validators) {
                let err = validator.validate && validator.validate(val);
                if (err) return this.__formatMessage( err, ctx, validator );
            }
        }

        if( schema.validate )
        {
            return schema.validate( val );
        }
    }

    /**
     * Format an error message
     * @param message
     * @param ctx
     * @returns {string}
     * @private
     */
    private __formatMessage( message:string, ctx:FormatContext, validator? ):string
    {
        var regex = /{\s*([^}\s]*)\s*}/g;
        return message.replace( regex, function( match, name )
        {
            switch( name )
            {
                case "$value" :
                    return ctx.propertyValue;
                case "$schema":
                    return ctx.propertyName ? ctx.propertySchema : ctx.schemaElement;
                case "$id" :
                    return ctx.id;
                case "$propertyName" :
                    return ctx.propertyName;
                default :
                    if( !name ) return null;
                    // Name beginning with $ belongs to schema
                    if( name[0] === "$" && validator )
                    {
                        let p = validator[name] || validator[name.substring( 1 )];
                        return (typeof p === "function" && p( validator )) || p;
                    }
                    // Else it's an element's property
                    if( ctx.element )
                    {
                        let p = ctx.element[name];
                        return (typeof p === "function" && p( ctx.element )) || p;
                    }
                    return null;
            }
        } );
    }
}

interface FormatContext {
    id:string;
    element;
    schemaElement;
    propertyName?:string;
    propertySchema?;
    propertyValue?;
}
