import { DefaultServiceNames, Inject, LifeTime } from '../di/annotations';
import { IContainer } from "../di/resolvers";
import { Domain } from '../schemas/schema';
import { ServiceDescriptors, ServiceDescription } from '../pipeline/serviceDescriptions';
import { Query } from '../pipeline/annotations';
import { QueryHandler } from '../pipeline/annotations.handlers';
import { ForbiddenRequestError } from '../errors/applicationRequestError';
import { RequestContext } from '../servers/requestContext';
import { SwaggerServiceDescriptor } from '../pipeline/swaggerServiceDescriptions';
import { SwaggerApiDefinition } from '../pipeline/swaggerApiDefinition';
import { HttpResponse } from '../pipeline/response';
import { Model, Property } from '../schemas/annotations';



@Model()
export class ServiceExplorerParameter {
    @Property({ description: "Format the description service. Only 'swagger' are available", type: "string" })
    format: string;
}



@QueryHandler({ scope: "?", serviceLifeTime: LifeTime.Singleton })
export class ServiceExplorer {


    constructor( @Inject(DefaultServiceNames.Domain) private domain: Domain,
        @Inject(DefaultServiceNames.Container) private container: IContainer) {
    }

    @Query({ outputSchema: "ServiceDescription", description: "Get all service handler description. You can get the response on swagger format.", action: "_serviceDescription" })
    async getServiceDescriptions(model: ServiceExplorerParameter) {
        let ctx: RequestContext = (<any>this).requestContext;
        if (ctx.publicPath)
            throw new ForbiddenRequestError();

        let descriptors = this.container.get<ServiceDescriptors>(DefaultServiceNames.ServiceDescriptors);
        let result: ServiceDescription = await descriptors.getDescriptions();
        result.alternateAddress = (<any>this).requestContext.hostName;

        if (model.format === 'swagger') {
            let descriptors = this.container.get<SwaggerServiceDescriptor>(DefaultServiceNames.SwaggerServiceDescriptor);
            let swaggerResult: SwaggerApiDefinition = await descriptors.getDescriptionsAsync(result);
            let response = new HttpResponse();
            response.content = swaggerResult;
            return response;

        } else {
            return result;
        }


    }

}