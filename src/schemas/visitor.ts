import { Domain, SchemaDescription } from './schema';

export interface IVisitor {
    visitEntity(obj, schema): boolean;
    visitProperty(val, schema);
}

export class SchemaVisitor {

    constructor(private domain:Domain, private visitor: IVisitor) {
    }

    visit(schemaName:string|SchemaDescription, entity) {

        let schema = this.domain.resolveSchemaDescription(schemaName);
        if (this.visitor.visitEntity && !this.visitor.visitEntity(entity, schema))
            return;

        let sch = schema;
        while (sch) {
            for (const ps in sch.properties) {
                if (!sch.properties.hasOwnProperty(ps)) continue;
                let prop = sch.properties[ps];
                if (prop) {
                    (<any>prop).name = ps;
                    let val = entity[ps];
                    this.visitor.visitProperty && this.visitor.visitProperty(val, prop);
                }
            }
            sch = sch.extends && this.domain.resolveSchemaDescription( sch.extends );
        }

        sch = schema;
        while (sch) {
            for (const ref in schema.references) {
                if (!schema.references.hasOwnProperty(ref)) continue;
                let relationshipSchema = schema.references[ref];
                let refValue = entity[ref];
                if (relationshipSchema && refValue) {
                    let item = relationshipSchema.item;
                    if (item === "any" && refValue && refValue.__schema) {
                        item = refValue.__schema;
                    }
                    let elemSchema = this.domain.findSchemaDescription(item);
                    if (!elemSchema && item !== "any") {
                        continue;
                    }

                    elemSchema.name = ref;
                    if (Array.isArray(refValue)) {
                        for (let elem of refValue) {
                            this.visit(elemSchema, elem);
                        }
                    }
                    else {
                        this.visit(elemSchema, refValue);
                    }
                }
            }
            sch = sch.extends && this.domain.resolveSchemaDescription(sch.extends);
        }
    }
}