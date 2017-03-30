import { Inject, DefaultServiceNames } from '../di/annotations';
import { IContainer } from '../di/resolvers';
import { Domain } from '../schemas/schema';
import { Model } from '../schemas/annotations';
import { ServiceDescriptors, ServiceDescription, SchemaDescription, PropertyDescription } from './serviceDescriptions';
import { DefinitionsObject, SwaggerApiDefinition } from './swaggerApiDefinition';


export class SwaggerServiceDescriptor {

    private static defaultDefinitionType: string = "object";
    private descriptions: SwaggerApiDefinition;

    constructor( @Inject(DefaultServiceNames.Container) private container: IContainer, @Inject(DefaultServiceNames.Domain) private domain: Domain) {
    }

    async getDescriptionsAsync(serviceDescription: ServiceDescription) {
        this.descriptions = this.initialize();

        let definitions = {};
        let currentDef: DefinitionsObject = {};
        serviceDescription.schemas.forEach((schema: SchemaDescription) => {

            let jsonSchema = {
                properties : {}
            };

            schema.properties.forEach((property: PropertyDescription) => {
                jsonSchema.properties[property.name] = {
                    type: property.type
                };

                if (property.reference === 'one') {
                    jsonSchema.properties[property.name].$ref = this.getReferenceDefinition(property.type);
                }

                if (property.description) {
                    jsonSchema.properties[property.name].description = property.description;
                }

                if (property.required) {
                    jsonSchema.properties[property.name].required = property.required;
                }

            });

            currentDef[schema.name] = {
                type: SwaggerServiceDescriptor.defaultDefinitionType,
                properties : jsonSchema.properties
            };


        });
        this.descriptions.definitions = currentDef;

        return this.descriptions;
    }

    private initialize(): SwaggerApiDefinition {
        return {
            swagger: '2.0',
            info: {
                'version': '1.0.0',
                'title': this.domain.name
            },
            paths: { },
            definitions: {}
        };
    }

    private getReferenceDefinition(definitionName) {
        return `#/definitions/${definitionName}`;
    }

}
