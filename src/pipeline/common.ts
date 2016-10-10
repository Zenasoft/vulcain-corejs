import { System } from 'vulcain-configurationsjs';

import {Application} from '../application';
import {IContainer} from '../di/resolvers';
import {LifeTime} from '../di/annotations';
import {Domain} from '../schemas/schema';
import {UserContext} from '../servers/requestContext';

export class RuntimeError extends Error { }

export interface ValidationError {
    id?: string;
    field?: string;
    message: string;
}

export interface ErrorResponse {
    message:string;
    errors?: Array<ValidationError>;
}

export interface CommonRequestData {
    correlationId: string;
    correlationPath: string;
    action: string;
    domain: string;
    schema: string;
    inputSchema?: string;
    userContext?: UserContext
}

export interface CommonRequestResponse<T> {
    tenant: string;
    userContext: UserContext,
    source: string;
    domain: string;
    action: string;
    schema: string;
    error?: ErrorResponse;
    value?: T;
    inputSchema?: string;
}

export interface CommonActionMetadata {
    description: string;
    action?: string;
    scope?: string;
    schema?: string|Function;
    inputSchema?: string | Function;
    outputSchema?: string | Function;
}

export interface CommonMetadata {
    description?: string;
    schema?: string|Function;
}

export interface CommonHandlerMetadata extends CommonMetadata {
    scope: string;
}

export interface ServiceHandlerMetadata extends CommonHandlerMetadata {
    serviceName?: string;
    serviceLifeTime?: LifeTime;
}

export interface IManager {
    container: IContainer;
    getInfoHandler(command: CommonRequestData, container?: IContainer);
    runAsync(command: CommonRequestData, ctx): Promise<CommonRequestResponse<any>>;
}

export class HandlerFactory {

    static obfuscateSensibleData(domain: Domain, container: IContainer, result) {
        if (result) {
            if (Array.isArray(result)) {
                let outputSchema;
                result.forEach(v => {
                    if (v.__schema) {
                        if (!outputSchema || outputSchema.name !== v.__schema)
                            outputSchema = domain.getSchema(v.__schema);
                        if (outputSchema && outputSchema.description.hasSensibleData)
                            domain.obfuscate(v, outputSchema);
                    }
                });
            }
            else if (result.__schema) {
                let outputSchema = domain.getSchema(result.__schema);
                if (outputSchema && outputSchema.description.hasSensibleData)
                    domain.obfuscate(result, outputSchema);
            }
        }

        return result;
    }
}
