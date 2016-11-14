import './preloader';

// Configurations

export { VulcainManifest, ServiceDependency, HttpDependency, ConfigurationProperty } from './configurations/dependencies/annotations';
export { DynamicConfiguration } from './configurations/dynamicConfiguration';
export { IDynamicProperty } from './configurations/dynamicProperty';
export { MemoryConfigurationSource } from './configurations/configurationSources/memoryConfigurationSource';
export { FileConfigurationSource } from './configurations/configurationSources/fileConfigurationSource';
export { ConfigurationDataType } from './configurations/configurationSources/configurationSource';
export { VulcainLogger } from './configurations/log/vulcainLogger';
export { System } from './configurations/globals/system';

import { HttpRedirectResponse } from './pipeline/common';

// Schemas
export * from './schemas/schema'
export * from './schemas/annotations'

// Auth
export { AuthenticationStrategies } from './auth/authenticationStrategies';
export { ApiKeyStrategy } from './auth/apiKeyStrategy';
export { VerifyTokenParameter } from './defaults/services';

// Core
export * from './application'
export { Conventions } from './utils/conventions';
export { IMetrics } from './metrics/metrics';

// Pipeline
export * from './pipeline/annotations'
export { EventNotificationMode, ActionMetadata, ActionData, ActionHandlerMetadata, ActionResponse, ConsumeEventMetadata, EventMetadata, EventData } from './pipeline/actions';
export { QueryData, QueryActionMetadata, QueryMetadata, QueryResponse } from './pipeline/query';
export { AbstractActionHandler, AbstractEventHandler, AbstractQueryHandler } from './pipeline/abstractHandlers';
export { ValidationError, HttpResponse, HttpRedirectResponse } from './pipeline/common';
export { ScopesDescriptor , ScopeDescription } from './pipeline/scopeDescriptors'

export { AbstractAdapter } from './servers/abstractAdapter';
export { RequestContext, Pipeline, UserContext } from './servers/requestContext'

export { DefaultActionHandler, DefaultQueryHandler, DefaultRepositoryCommand } from './defaults/crudHandlers';

// Bus adapter
export * from './bus/busAdapter'
export * from './bus/rabbitAdapter'

// Providers
export { IProvider, ListOptions } from './providers/provider'
export * from './providers/memory/provider'
export * from './providers/mongo/provider'

// Containers
export { IContainer } from './di/resolvers';
export { TestContainer } from './di/containers';
export { Inject, Injectable, LifeTime, DefaultServiceNames } from './di/annotations';

// Errors
export { ApplicationRequestError } from './errors/applicationRequestError';
export { BadRequestError } from './errors/badRequestError';
export { CommandRuntimeError } from './errors/commandRuntimeError';
export { RuntimeError } from './errors/runtimeError';

// Commands
export { Command, CommandFactory as __commandFactory } from './commands/command/commandFactory';
export { EventType, FailureType, ExecutionResult } from './commands/command/executionResult';
export { AbstractCommand, ICommand } from './commands/command/abstractCommand';
export { HystrixSSEStream } from './commands/http/hystrixSSEStream';
export { IHttpRequest, IHttpResponse } from './commands/command/types';
export { AbstractServiceCommand } from './commands/command/abstractServiceCommand';
export { AbstractHttpCommand } from './commands/command/abstractHttpCommand';
export { AbstractProviderCommand } from './commands/command/abstractProviderCommand';
