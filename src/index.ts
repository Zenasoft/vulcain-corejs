import './preloader'; // First
import { IRequestTracer } from './metrics/zipkinInstrumentation';
import { IServiceResolver } from './configurations/globals/serviceResolver';

// Configurations
export { VulcainManifest, ServiceDependency, HttpDependency, ConfigurationProperty } from './configurations/dependencies/annotations';
export { DynamicConfiguration } from './configurations/dynamicConfiguration';
export { IDynamicProperty } from './configurations/dynamicProperty';
export { MemoryConfigurationSource } from './configurations/configurationSources/memoryConfigurationSource';
export { FileConfigurationSource } from './configurations/configurationSources/fileConfigurationSource';
export { ConfigurationDataType } from './configurations/configurationSources/configurationSource';
export { VulcainLogger } from './configurations/log/vulcainLogger';
export { System } from './configurations/globals/system';
export { IServiceResolver } from './configurations/globals/serviceResolver';
export { HttpConfigurationSource } from './configurations/configurationSources/httpConfigurationSource';

// Schemas
export * from './schemas/schema'
export { ModelOptions, Model, Property, Reference, PropertyOptions, ReferenceOptions, Validator } from './schemas/annotations'
export { SchemaStandardTypes, SchemaStandardValidators } from './schemas/standards';

// Auth
export { ExpressAuthentication } from './servers/express/expressAuthentication';
export { VerifyTokenParameter, ITokenService } from './defaults/services';
export { AbstractExpressAuthentication } from './servers/express/abstractExpressAuthentication';
export { StsTokenService } from './defaults/services/stsTokenService';
export { TokenService } from './defaults/services/tokenService';
export { ApiKeyService } from './defaults/services/apiKeyService';
export { ExpressStsAuthentication } from './servers/express/expressStsAuthentication';

// Core
export * from './application'
export { Conventions } from './utils/conventions';
export { IMetrics } from './metrics/metrics';
export { IMockManager } from './mocks/imockManager';
export { MockManager } from './mocks/mockManager';
export { IRequestTracer } from './metrics/zipkinInstrumentation';

// Pipeline
export * from './pipeline/annotations';
export { QueryHandler, ActionHandler, EventHandler } from './pipeline/annotations.handlers';
export { EventNotificationMode, ActionMetadata, ActionData, ActionHandlerMetadata, ActionResponse, ConsumeEventMetadata, EventMetadata, EventData } from './pipeline/actions';
export { QueryData, QueryActionMetadata, QueryMetadata, QueryResponse } from './pipeline/query';
export { AbstractActionHandler, AbstractEventHandler, AbstractQueryHandler } from './pipeline/abstractHandlers';
export { ValidationError } from './pipeline/common';
export { HttpResponse, HttpRedirectResponse } from './pipeline/response';
export { ScopesDescriptor, ScopeDescription } from './pipeline/scopeDescriptors';

export { AbstractAdapter, IHttpAdapterRequest } from './servers/abstractAdapter';
export { RequestContext, Pipeline, UserContext, Logger } from './servers/requestContext'
export { ExpressAdapter } from './servers/express/expressAdapter';
export { DefaultActionHandler, DefaultQueryHandler, DefaultRepositoryCommand } from './defaults/crudHandlers';

// Bus adapter
export * from './bus/busAdapter'
export * from './bus/rabbitAdapter'

// Providers
export { IProvider, ListOptions } from './providers/provider'
export * from './providers/memory/provider'
export * from './providers/mongo/provider'
export { ProviderFactory } from './providers/providerFactory';

// Containers
export { IContainer, IInjectionNotification } from './di/resolvers';
//export { TestContainer } from './di/containers';
export { Inject, Injectable, LifeTime, DefaultServiceNames, IScopedComponent } from './di/annotations';
export { TestContext } from './di/testContext';

// Errors
export { ApplicationRequestError, ForbiddenRequestError, UnauthorizedRequestError } from './errors/applicationRequestError';
export { BadRequestError } from './errors/badRequestError';
export { CommandRuntimeError } from './errors/commandRuntimeError';
export { RuntimeError } from './errors/runtimeError';
export { HttpCommandError } from './errors/httpCommandError';

// Commands
export { Command, CommandFactory } from './commands/command/commandFactory';
export { EventType, FailureType, ExecutionResult } from './commands/command/executionResult';
export { AbstractCommand, ICommand } from './commands/command/abstractCommand';
export { HystrixSSEStream } from './commands/http/hystrixSSEStream';
export { IHttpCommandRequest, IHttpCommandResponse } from './commands/command/types';
export { AbstractServiceCommand } from './commands/command/abstractServiceCommand';
export { AbstractHttpCommand } from './commands/command/abstractHttpCommand';
export { AbstractProviderCommand } from './commands/command/abstractProviderCommand';
export { IHasFallbackCommand } from './commands/command/command';
