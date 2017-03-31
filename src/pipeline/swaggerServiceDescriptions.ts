import { Inject, DefaultServiceNames } from '../di/annotations';
import { IContainer } from '../di/resolvers';
import { Domain } from '../schemas/schema';
import { Model } from '../schemas/annotations';
import { ServiceDescriptors, ServiceDescription, SchemaDescription, PropertyDescription, ActionDescription } from './serviceDescriptions';
import { DefinitionsObject, SwaggerApiDefinition, TagObject } from './swaggerApiDefinition';


export class SwaggerServiceDescriptor {

    private static defaultDefinitionType: string = "object";
    private descriptions: SwaggerApiDefinition;

    constructor( @Inject(DefaultServiceNames.Container) private container: IContainer, @Inject(DefaultServiceNames.Domain) private domain: Domain) {
    }

    async getDescriptionsAsync(serviceDescription: ServiceDescription) {
        this.descriptions = this.initialize();
        this.descriptions.tags = this.computeTags(serviceDescription.services);
        this.descriptions.definitions = this.computeDefinitions(serviceDescription.schemas);

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

    /**
     * Getting all endpoint Handler (only the first word)
     * Example : {verb : "customer.myAction" } it's `customer` who is kept
     * @param services
     * @return string[]
     */
    private computeTags(services: Array<ActionDescription>): TagObject[] {
        let tags: TagObject[] = [];

        let tagsSet = new Set();


        services.forEach((service: ActionDescription) => {
            //service.verb = 'customer.myAction'
            // with split we kept only 'customer'
            //split for getting first word
            tagsSet.add(service.verb.split('.')[0]);
        });

        let allTags = [...tagsSet];

        tags = <TagObject[]>allTags.map((tag) => {
            return {
                name : tag,
                description: ''
            };
        });

        return tags;
    }

    /**
     *
     * @param schemas
     * @return DefinitionObject
     */
    private computeDefinitions(schemas: Array<SchemaDescription>): DefinitionsObject {
        let definitions = {};
        let currentDef: DefinitionsObject = {};
        schemas.forEach((schema: SchemaDescription) => {

            let jsonSchema = {
                properties : {}
            };

            schema.properties.forEach((property: PropertyDescription) => {
                jsonSchema.properties[property.name] = {
                    type: property.type
                };

                if (property.reference === 'one' || property.reference === 'many') {
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
        return currentDef;
    }

    private getReferenceDefinition(definitionName) {
        return `#/definitions/${definitionName}`;
    }

}
