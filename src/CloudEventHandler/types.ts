import * as zod from 'zod';
import { SpanContext } from '../Telemetry/types';
import { CloudEvent } from 'cloudevents';

export type LogType = 'START' | 'END' | 'ERROR' | 'WARNING' | 'LOG' | 'DEBUG';

export interface ILogger {
  type: LogType;
  source: string;
  message?: string;
  spanContext?: SpanContext;
  input?: { type: string; data: Record<string, any>; [key: string]: any };
  output?: { type: string; data: Record<string, any>; [key: string]: any };
  params?: Record<string, any>;
  error?: Error;
  startTime?: number;
  endTime?: number;
  duration?: number;
  attributes?: Record<string, any>;
}

export type Logger = (params: ILogger) => Promise<void>;

/**
 * Defines the output of a Cloud Event Handler function.
 * This type encapsulates the information about the event that a handler function emits after processing an incoming event.
 *
 * @template TEmitType - A string literal type that specifies the type of the emitted event. This helps in ensuring type safety and consistency across event handling.
 *
 * @property {TEmitType} type - Specifies the type of the event being emitted. This is used to categorize the event and determine how it should be processed by consumers.
 * @property {Record<string, any>} data - Contains the payload of the event. This is the data that will be processed by the event's consumers. The structure of this object is flexible and defined by the event's type.
 * @property {string} [subject] - An optional override for the event's subject. This can be used to provide more specific contextual information about the event, helping consumers to filter and handle events more effectively.
 * @property {string} [source] - An optional override for the event's source. This denotes the origin of the event, typically the service or component that generated it. By default, it is derived from the handler's topic, but it can be overridden to provide more precise control over the event's metadata.
 * @property {string} [orchestrator] - An optional field to specify the orchestrator name. This can be useful in distributed systems where multiple orchestrators manage events, providing clarity about the event's workflow management.
 * @property {string} [redirectto] - An optional metadata field indicating that the consumer should redirect the event to a different service than its producer. This allows for flexible event routing beyond the initial event source and target.
 * @property {string} [to] - An optional override for the metadata denoting the target topic or service for the event. By default, it matches the redirectto or the source of the incoming event, but it can be overridden to direct the event to a different destination.
 * @property {number} [executionunits] - An optional override to the metadata denoting the number of unit consumed to execute the handler
 */
export type CloudEventHandlerFunctionOutput<TEmitType extends string> = {
  type: TEmitType;
  data: Record<string, any>;
  subject?: string;
  source?: string;
  orchestrator?: string;
  redirectto?: string;
  to?: string;
  executionunits?: number;
};

/**
 * Defines the input structure for a Cloud Event Handler function.
 * This type encapsulates all necessary information for processing an incoming cloud event, including event metadata, payload, and system-provided utilities like logging and telemetry.
 *
 * @template TAcceptType - A string literal type that specifies the accepted event type. This ensures type safety by restricting the handler to process only specific events it is designed for.
 * @template TEventData - The shape of the event data payload. This generic type allows for specifying the structure of the data field for type-safe access to event properties.
 *
 * @property {TAcceptType} type - The type or topic of the event. This categorizes the event and is crucial for handlers to determine how to process the event.
 * @property {TEventData} data - The payload of the event, containing the data that the event carries. The structure is defined by the handler's expectations for the type of event it processes.
 * @property {Record<string, string>} [params] - Optional parameters extracted from the event topic, providing contextual information that can influence event handling logic.
 * @property {SpanContext} spanContext - Provides the telemetry span context for tracing the handling of this event through the system. Essential for observability and troubleshooting.
 * @property {Logger} logger - A logging utility passed through to the handler, allowing for standardized logging practices, including structured logs and tracing support.
 * @property {CloudEvent<Record<string, any>>} event - The original CloudEvent object. This includes the entire event structure as defined by the CloudEvents specification, providing access to standard event metadata and any custom extensions.
 * @property {string} source - The source of the incoming event, identifying where the event originated. This information is critical for understanding the event's context and for routing decisions.
 * @property {string} [to] - The intended target of the incoming event. Ideally, this should match the handler's topic, indicating that the event is being processed by the correct handler.
 * @property {string} [redirectto] - An optional field indicating that the event should be redirected to a different service or handler. This allows for dynamic routing of events based on processing logic or system state.
 */
export type CloudEventHandlerFunctionInput<
  TAcceptType extends string,
  TEventData extends Record<string, any> = Record<string, any>,
> = {
  type: TAcceptType;
  data: TEventData;
  params?: Record<string, string>;
  spanContext: SpanContext;
  logger: Logger;
  event: CloudEvent<Record<string, any>>;
  source: string;
  to?: string;
  redirectto?: string;
};

/**
 * Defines a schema for validating the structure and data of a CloudEvent.
 * This schema is used to ensure that events processed by the system conform to expected formats, enhancing the robustness and reliability of event-driven interactions.
 *
 * @template TType - A string literal type parameter that specifies the type of the CloudEvent, such as 'cmd.books.fetch' or 'evt.books.fetch.success', providing a clear indication of the event's purpose and expected handling.
 *
 * @property {TType} type - Specifies the unique type of the CloudEvent. This acts as an identifier for the event and is used for routing and processing logic.
 * @property {string} [description] - An optional property providing a human-readable description of the CloudEvent's purpose or the data it carries, aiding in documentation and understanding.
 * @property {zod.ZodObject<any>} zodSchema - Utilizes Zod to define a validation schema for the `data` field of the CloudEvent. This ensures that the event data adheres to a specified structure, facilitating safe and predictable event handling.
 */
export type CloudEventValidationSchema<TType extends string> = {
  type: TType;
  description?: string;
  zodSchema: zod.ZodObject<any>;
};

/**
 * Represents an interface for handling CloudEvents within an event-driven system. Handlers are responsible for processing incoming events and can emit one or more new events as a result.
 *
 * @template TAcceptType - Specifies the type of CloudEvent this handler is designed to accept. This ensures that the handler processes only relevant events, contributing to a well-organized event flow.
 * @template TEmitType - Specifies the possible types of CloudEvents that the handler might emit after processing an incoming event. This helps in understanding the handler's role within the larger event ecosystem.
 *
 * @property {string} [name] - The name of the CloudEvent handler, which should be unique and descriptive. By convention, this is often aligned with the event's topic name, facilitating easy identification.
 * @property {string} [description] - An optional description of the handler, providing insights into its functionality, the types of events it processes, and its role in the system.
 * @property {CloudEventValidationSchema<TAcceptType>} accepts - A validation schema for the CloudEvent type that the handler accepts. This ensures that only events of a specific format and type are processed.
 * @property {CloudEventValidationSchema<TEmitType>[]} emits - An array of validation schemas for the types of CloudEvents the handler may emit. This array allows a single handler to produce multiple types of events, depending on the processing logic.
 * @property {(event: CloudEventHandlerFunctionInput<TAcceptType, TEventData>) => Promise<CloudEventHandlerFunctionOutput<TEmitType>[]>} handler - A function that processes an incoming CloudEvent and returns a Promise resolving to an array of CloudEvent outputs. This function is where the core logic of event processing and transformation is implemented.
 * @property {Logger} [logger] - An optional logging utility passed to the handler, enabling standardized logging practices. This is particularly useful for debugging, monitoring, and tracing event handling.
 * @property {number} [executionUnits] - An optional parameter which quantifies one execution of the function. e.g if it is 1.5 then it took 1.5 units to execute the handler. This number will appear in the CloudEvent extensions under field 'executionunits'
 * @property {boolean} [disableRoutingMetadata] - If set, the output cloudevent `to` and `redirectto` field will be forced to `null`.
 *
 * @example
 * // Example of a CloudEvent handler for user creation events.
 * const userCreationHandler: ICloudEventHandler<'UserCreated', 'UserUpdated'> = {
 *   name: 'userEventHandler',
 *   accepts: {
 *     type: 'UserCreated',
 *     description: 'Handles user creation events.',
 *     zodSchema: zod.object({ name: zod.string() }),
 *   },
 *   emits: [{
 *     type: 'UserUpdated',
 *     description: 'Emits when a user's details are updated post-creation.',
 *     zodSchema: zod.object({ id: zod.string(), name: zod.string() }),
 *   }],
 *   handler: async (event) => {
 *     // Example processing logic here.
 *     return [{ type: 'UserUpdated', data: { id: '123', name: 'John Doe' } }];
 *   },
 * };
 */
export interface ICloudEventHandler<
  TAcceptType extends string,
  TEmitType extends string,
> {
  name?: string;
  description?: string;
  accepts: CloudEventValidationSchema<TAcceptType>;
  emits: CloudEventValidationSchema<TEmitType>[];
  handler: <TEventData extends Record<string, any> = Record<string, any>>(
    event: CloudEventHandlerFunctionInput<TAcceptType, TEventData>,
  ) => Promise<CloudEventHandlerFunctionOutput<TEmitType>[]>;
  logger?: Logger;
  executionUnits?: number;
  disableRoutingMetadata?: boolean;
}

/**
 * Interface for creating a simple CloudEventHandler focused on handling asynchronous commands and events.
 * Designed to streamline the creation of event handlers with less boilerplate, it's ideal for simple, event-driven processes.
 *
 * The `name` field plays a critical role in defining the topic for the event handler, following the pattern `cmd.${name}`.
 * This naming convention facilitates organized event routing and processing, making it easier to manage event-driven architectures.
 *
 * @template TAcceptType - A string literal representing the unique name of the CloudEventHandler, descriptive of its function.
 *
 * @property {string} [name] - The unique name of the CloudEventHandler. Default is `cmd.${accepts.type}`
 * @property {string} [description] - An optional, human-readable description of the CloudEventHandler's role or the types of events it handles. Provides additional context for developers.
 * @property {CloudEventValidationSchema<TAcceptType>} accepts - A validation schema defining the structure of events this handler can process, ensuring type safety and data integrity.
 * @property {string} accepts.type - The unique topic of the CloudEventHandler, forming the basis of the handler's topic (`cmd.${accepts.type}`). This clear identification aids in the routing and processing of events, ensuring they are directed to the appropriate handlers.
 * @property {zod.ZodObject<any>} accepts.zodSchema - The zod schema
 * @property {zod.ZodObject<any>} emits - A Zod validation schema for the events that this handler may emit as a result of processing, ensuring consistency and reliability in event communication.
 * @property {Function} handler - The core function for processing incoming event data, encapsulating the logic for handling and transforming event data based on business requirements.
 * @property {number} [timeoutMs=10000] - Optional. Specifies the timeout duration in milliseconds, defaulting to 10000ms, for managing execution time and resources effectively.
 * @property {Logger} [logger] - Optional. A logging function for logging events, errors, or significant actions, aiding in monitoring and debugging the event handling process.
 * @property {number} [executionUnits] - An optional parameter which quantifies one execution of the function. e.g if it is 1.5 then it took 1.5 units to execute the handler. This number will appear in the CloudEvent in the field "executionunits"
 * @property {boolean} [disableRoutingMetadata] - If set, the output cloudevent `to` and `redirectto` field will be forced to `null`.
 */
export interface ICreateSimpleCloudEventHandler<TAcceptType extends string> {
  name?: string;
  description?: string;
  accepts: CloudEventValidationSchema<TAcceptType>;
  emits: zod.ZodObject<any>;
  handler: (
    data: Record<string, any>,
    spanContext: SpanContext,
    logger: Logger,
  ) => Promise<{
    [key: string]: any;
    __executionunits?: number;
  }>;
  timeoutMs?: number;
  logger?: Logger;
  executionUnits?: number;
  disableRoutingMetadata?: boolean;
}

/**
 * Represents a configuration variable for an HTTP-specific CloudEventHandler. This type is used to specify both
 * the value of a variable and whether it should be treated as a secret (e.g., for sensitive information like API keys).
 *
 * @property {string} value - The value of the variable. This could be anything from a simple string to a complex token or key.
 * @property {boolean} [secret=false] - Optional. Indicates if the variable is a secret. If true, the variable's value should
 * be handled with care, ensuring it is not logged or exposed unintentionally. Defaults to false if not specified.
 */
export type VariableType = {
  value: string;
  secret?: boolean;
};

/**
 * Interface for creating an HTTP-specific CloudEventHandler, tailored for handlers that interact with HTTP services.
 * It includes mechanisms for secure variable handling, request timeouts, and URL whitelisting for enhanced security.
 *
 * The `name` field is crucial as it defines the topic for the handler using the pattern `cmd.http.${name}`, specifically
 * designed for HTTP interactions. This convention helps in distinguishing HTTP-specific handlers from others, streamlining
 * event processing and routing in systems with diverse event handling needs.
 *
 * @template TAcceptType - A string literal representing the unique name of the CloudEventHandler, ideally reflecting its role or the HTTP services it interacts with.
 *
 * @property {string} [name] - The unique name of the CloudEventHandler. Default is `cmd.${acceptType}`
 * @property {string} acceptType - The unique topic of the CloudEventHandler, forming the basis of the handler's topic (`cmd.${acceptType}`). This clear identification aids in the routing and processing of events, ensuring they are directed to the appropriate handlers.
 * @property {string} [description] - An optional description providing context about the handler's functionality or the types of HTTP requests it manages, enhancing understanding of the handler's role.
 * @property {Record<string, VariableType>} [variables] - Optional. Maps variable names to values and secrecy flags, crucial for secure handling of sensitive configuration like API keys.
 * @property {string[]} [whitelistedUrls] - Optional. A list of URLs the handler is permitted to interact with, serving as a security measure to ensure communication only with trusted services. By default, all urls are permitted.
 * @property {number} [timeoutMs=10000] - Optional. Sets the maximum duration in milliseconds for HTTP request completion, defaulting to 10000ms, to prevent indefinite hangs and manage resources.
 * @property {Logger} [logger] - Optional. A logging function for use within the handler for logging purposes, essential for debugging, monitoring, and auditing interactions with external services.
 * @property {number} [executionUnits] - An optional parameter which quantifies one execution of the function. e.g if it is 1.5 then it took 1.5 units to execute the handler. This number will appear in the CloudEvent in the field executionunits
 * @property {boolean} [disableRoutingMetadata] - If set, the output cloudevent `to` and `redirectto` field will be forced to `null`.
 */
export interface ICreateHttpCloudEventHandler<TAcceptType extends string> {
  name?: string;
  acceptType: TAcceptType;
  description?: string;
  variables?: Record<string, VariableType>;
  whitelistedUrls?: string[];
  timeoutMs?: number;
  logger?: Logger;
  executionUnits?: number;
  disableRoutingMetadata?: boolean;
}
