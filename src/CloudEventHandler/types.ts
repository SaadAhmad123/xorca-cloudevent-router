import * as zod from 'zod';
import { SpanContext } from '../openTelemetry/Span/types';

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
 * Represents the validation schema for the CloudEvent.
 *
 * @template TType - The type of the CloudEvent.
 */
export type CloudEventValidationSchema<TType extends string> = {
  /**
   * The topic/type of the CloudEvent, e.g., 'cmd.books.fetch', 'evt.books.fetch.success'.
   */
  type: TType;

  /**
   * The description of the event.
   */
  description?: string;

  /**
   * The schema which validates the cloudevent.data field.
   */
  zodSchema: zod.ZodObject<any>;
};

/**
 * Represents an interface for CloudEvent handlers.
 * @template TAcceptType - The type of CloudEvent that the handler accepts.
 * @template TEmitType - The type of CloudEvent that the handler emits.
 */
export interface ICloudEventHandler<
  TAcceptType extends string,
  TEmitType extends string,
> {
  /**
   * The name of the CloudEvent handler.
   * No spaces or special characters allowed.
   * By default its is the topic name
   */
  name?: string;

  /**
   * Optional description for the CloudEvent handler.
   */
  description?: string;

  /**
   * The validation schema for the CloudEvent that the handler accepts.
   * This event is the input to the handler
   */
  accepts: CloudEventValidationSchema<TAcceptType>;

  /**
   * An array of validation schemas for the CloudEvents that the handler emits.
   * The handler can emit any one of these events.
   */
  emits: CloudEventValidationSchema<TEmitType>[];

  /**
   * The handler function that processes the CloudEvent and returns a new CloudEvent.
   * @template TEventData - The type of data in the CloudEvent.
   * @param event - The event data to handle
   * @param event.type - The type of the event.
   * @param event.data - The data of the event.
   * @param event.params - A dictionary object containing the type parameter. e.g. if the
   *                       handler accepts type `cmd.{{resource}}.fetch` then params will be
   *                       {resource: 'book'} for the input type 'cmd.books.fetch'
   * @returns A Promise resolving to the emitted CloudEvent.
   * @example
   * const handler: ICloudEventHandler<'UserCreated', 'UserUpdated'> = {
   *   name: 'userEventHandler',
   *   accepts: { type: 'UserCreated', data: zod.object({ name: zod.string() }) },
   *   emits: [{ type: 'UserUpdated', data: zod.object({ id: zod.string(), name: zod.string() }) }],
   *   handler: async (event) => {
   *     // Process the 'UserCreated' event and return an 'UserUpdated' event.
   *     const {type, data, params} = event
   *     return { type: 'UserUpdated', data: { id: event.data.id, name: event.data.name } };
   *   },
   * };
   */
  handler: <
    TEventData extends Record<string, any> = Record<string, any>,
  >(event: {
    // The event type/ topic
    type: TAcceptType;
    // The event data
    data: TEventData;
    // The event topic parameters
    params?: Record<string, string>;
    // Handler telemetry span context
    spanContext: SpanContext;
    // Passed thorough logger;
    logger: Logger;
  }) => Promise<
    {
      type: TEmitType;
      data: Record<string, any>;
      subject?: string;
      source?: string;
    }[]
  >;

  /**
   * A logging function
   */
  logger?: Logger;
}

/**
 * Interface for creating a simple CloudEventHandler for asynchronous commands and their corresponding events.
 * @template TName - The name type for the CloudEventHandler.
 */
export interface ICreateSimpleCloudEventHandler<TName extends string> {
  name: TName;
  description?: string;
  accepts: zod.ZodObject<any>;
  emits: zod.ZodObject<any>;

  handler: (
    // Event data
    data: Record<string, any>,
    // Handler telemetry span context
    spanContext: SpanContext,
    // Passed thorough logger;
    logger: Logger,
  ) => Promise<Record<string, any>>;
  /**
   * Timeout duration in milliseconds. Default is 10000ms.
   */
  timeoutMs?: number;

  /**
   * A logging function
   */
  logger?: Logger;
}

/**
 * Type representing a variable with a value and an optional secret flag.
 */
export type VariableType = {
  value: string;
  secret?: boolean;
};

/**
 * Interface for creating an HTTP-specific CloudEventHandler.
 * @template TName - The name type for the CloudEventHandler.
 */
export interface ICreateHttpCloudEventHandler<TName extends string> {
  name: TName;
  description?: string;
  variables?: Record<string, VariableType>;
  /**
   * Restrict the handler to consider the whitelistedUrls only
   * for better protection
   */
  whitelistedUrls?: string[];
  /**
   * Timeout duration in milliseconds. Default is 10000ms.
   */
  timeoutMs?: number;

  /**
   * A logging function
   */
  logger?: Logger;
}
