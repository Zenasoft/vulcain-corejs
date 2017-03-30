import { Inject, DefaultServiceNames } from '../di/annotations';
import { IContainer } from '../di/resolvers';
import { Domain } from '../schemas/schema';
import { Model } from '../schemas/annotations';

export interface IContactInfoSwagger {

}

export interface ILicenseInfoSwagger {

}
export interface IExternalDocsTagSwagger {

}
export class InfoSwagger {
    description: string;
    version: string;
    title: string;
    termsOfService: string;
    contact: IContactInfoSwagger;
    license: ILicenseInfoSwagger;
}

export class TagSwagger {
    name: string;
    description: string;
    externalDocs?: IExternalDocsTagSwagger;
}


@Model()
export class SwaggerServiceDescription {
    swagger: string;
    info: InfoSwagger;
    host: string;
    basePath: string;
    tags: Array<TagSwagger>;
    schemes: Array<string>;
    paths: Object;
    securityDefinitions: Object;
    definitions: Object;
    externalDocs?: IExternalDocsTagSwagger;
}

export class SwaggerServiceDescriptor {


    constructor( @Inject(DefaultServiceNames.Container) private container: IContainer, @Inject(DefaultServiceNames.Domain) private domain: Domain) {
    }


}
