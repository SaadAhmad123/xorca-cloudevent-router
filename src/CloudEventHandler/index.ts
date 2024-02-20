import * as zod from 'zod';
import { CloudEvent } from 'cloudevents';
import {
  CloudEventHandlerFunctionInput,
  CloudEventHandlerFunctionOutput,
  ICloudEventHandler,
  ILogger,
  Logger,
} from './types';
import { CloudEventHandlerError } from './errors';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { cleanString, matchStringTemplate } from '../utils';
import TraceParent from '../openTelemetry/traceparent';
import { SpanContext } from '../openTelemetry/Span/types';

/**
 * A class for creating and managing CloudEvent handlers, facilitating type validation,
 * distributed tracing, and error handling. It supports defining input and output event schemas,
 * logging, and generating AsyncAPI documentation.
 *
 * @template TAcceptType - Specifies the type of CloudEvent the handler is designed to accept.
 * @template TEmitType - Specifies the possible types of CloudEvents the handler might emit after processing.
 *
 * @param {ICloudEventHandler} params - Configuration parameters for the event handler including the name, accepted and emitted event types, and the handler function.
 * @throws {CloudEventHandlerError} - If the 'name' parameter contains spaces or special characters, indicating an invalid handler name.
 *
 * @example
 * // Creating a CloudEventHandler for user update events
 * const myEventHandler = new CloudEventHandler<'UserCreated', 'UserUpdated' | 'UserUpdatedError'>({
 *   name: 'user.update',
 *   description: 'Handles user-related events',
 *   accepts: {
 *     type: 'cmd.user.update',
 *     data: zod.object({ id: zod.string(), name: zod.string() }),
 *   },
 *   emits: [
 *     { type: 'evt.user.update.success', data: zod.object({ id: zod.string(), name: zod.string() }) },
 *     { type: 'evt.user.update.error', data: zod.object({ error: zod.string() }) },
 *   ],
 *   handler: async (event) => {
 *     // Logic to process the 'UserCreated' event and emit an 'UserUpdated' event
 *     return [{ type: 'evt.user.update.success', data: { id: event.data.id, name: event.data.name } }];
 *   },
 * });
 */
export default class CloudEventHandler<
  TAcceptType extends string,
  TEmitType extends string,
> {
  constructor(protected params: ICloudEventHandler<TAcceptType, TEmitType>) {
    this.params.name = this.params.name || this.topic;
    if (this.params.name.includes(' ')) {
      throw new CloudEventHandlerError(
        `[CloudEventHandler][constructor] The 'name' must not contain any spaces or special characters but the provided is ${this.params.name}`,
      );
    }
  }

  /**
   * A protected method to compile a comprehensive list of all event types the handler can emit,
   * including a special error event type for capturing exceptions in a standardized format.
   *
   * @returns An array of emit configurations, each describing an event type the handler can emit.
   */
  protected getAllEmits() {
    return [
      ...this.params.emits,
      {
        type: `sys.${this.topic}.error`,
        zodSchema: zod.object({
          errorName: zod.string().optional().describe('The name of the error'),
          errorMessage: zod
            .string()
            .optional()
            .describe('The message of the error'),
          errorStack: zod
            .string()
            .optional()
            .describe('The stack of the error'),
          event: zod.string().describe('The event which caused the error'),
          additional: zod.any().describe('The error additional error data'),
        }),
        description:
          "Event raised when error happens while using 'safeCloudevent' method. Can happen on invalid events types or some other errors",
      },
    ];
  }

  /**
   * Gets the event type this handler is configured to accept, effectively defining the handler's topic.
   *
   * @returns The accept event type string, acting as the topic for this handler.
   */
  public get topic() {
    return this.params.accepts.type;
  }

  /**
   * Retrieves the current logger function assigned to this handler.
   *
   * @returns The logger function used by this handler for logging operations.
   */
  public getLogger() {
    return this.params.logger;
  }

  /**
   * Assigns a new logger function to this handler, allowing for custom logging implementations.
   *
   * @param logger - A Logger function to be used by this handler.
   * @returns The instance of this CloudEventHandler, enabling method chaining.
   */
  public setLogger(logger: Logger) {
    this.params.logger = logger;
    return this;
  }

  /**
   * A wrapper method around the logger function to handle logging operations safely, catching and logging any errors encountered during logging.
   *
   * @param logParams - Parameters to be logged, adhering to the ILogger interface.
   */
  protected async logger(logParams: ILogger) {
    try {
      await this.getLogger()?.(logParams);
    } catch (e) {
      console.error(e);
    }
  }

  /**
   * Validates the structure and content of a CloudEvent against the expected schema.
   * This includes checking for the presence of mandatory properties such as 'subject', 'type', 'data',
   * and 'datacontenttype', and ensuring the 'datacontenttype' is compatible with CloudEvents standards.
   *
   * @param event - The CloudEvent to validate.
   * @throws {CloudEventHandlerError} If any validations fail, including missing properties or incorrect 'datacontenttype'.
   * @protected
   */
  protected validateCloudEvent(event: CloudEvent<Record<string, any>>) {
    for (const prop of ['subject', 'type', 'data', 'datacontenttype']) {
      if (!event[prop]) {
        throw new CloudEventHandlerError(
          `[CloudEventHandler][cloudevent] The ${prop} MUST be provided.`,
          event,
        );
      }
    }
    const { type, data, datacontenttype } = event;
    if (!(datacontenttype || '').includes('application/cloudevents+json')) {
      throw new CloudEventHandlerError(
        `[CloudEventHandler][cloudevent] The event 'datacontenttype' MUST be 'application/cloudevents+json; charset=UTF-8' but the provided is ${datacontenttype}`,
        event,
      );
    }
    const matchResp = matchStringTemplate(type, this.params.accepts.type);
    if (!matchResp.matched) {
      throw new CloudEventHandlerError(
        `[CloudEventHandler][cloudevent] The handler only accepts type=${this.params.accepts.type} but the provided is ${type}.`,
        event,
      );
    }

    const inputParse = this.params.accepts.zodSchema.safeParse(data);
    if (!inputParse.success) {
      throw new CloudEventHandlerError(
        `[CloudEventHandler][cloudevent] Invalid handler input data. The response data does not match type=${this.params.accepts.type} expected data shape`,
        event,
        {
          error: inputParse.error.message,
          issues: inputParse.error.issues,
        },
      );
    }
  }

  /**
   * Wraps the event handler function with error handling. Attempts to process the CloudEvent and catches any
   * errors thrown during execution. Errors are rethrown as `CloudEventHandlerError` with additional context.
   *
   * @template TEventData - The expected structure of the event data.
   * @param event - An object representing the CloudEvent input, including type, data, and additional parameters.
   * @returns A Promise resolving to an array of `CloudEventHandlerFunctionOutput`, representing the processed event(s).
   * @throws {CloudEventHandlerError} If the handler function throws an error, encapsulating the original error with additional context.
   * @protected
   */
  protected async errorHandledHandler<
    TEventData extends Record<string, any> = Record<string, any>,
  >(
    event: CloudEventHandlerFunctionInput<TAcceptType, TEventData>,
  ): Promise<CloudEventHandlerFunctionOutput<TEmitType>[]> {
    try {
      return await this.params.handler(event);
    } catch (e) {
      throw new CloudEventHandlerError(
        `[CloudEventHandler][cloudevent][handler] Handler errored (message=${(e as Error).message})`,
        event.event,
        {
          error: (e as Error).toString(),
        },
      );
    }
  }

  /**
   * Converts the response from the event handler function into a `CloudEvent`. This method ensures that the response is
   * validated against expected emissions and that the response data conforms to the defined schema. It outlines the logic
   * behind constructing the final `CloudEvent`, focusing on how and why certain fields are overwritten based on the handler's
   * response and the original incoming event.
   *
   * - **type**: Directly taken from `contentForOutgoingEvent.type`, indicating the specific type of event being emitted as a result of the processing.
   * - **data**: Uses `contentForOutgoingEvent.data` as the payload for the outgoing event, ensuring the data is relevant to the event type.
   * - **source**: Prefers `contentForOutgoingEvent.source` if provided; otherwise, defaults to the handler's topic. This field denotes the originator of the event, ensuring traceability.
   * - **subject**: Falls back to `incomingEvent.subject` if not specified in `contentForOutgoingEvent`, maintaining context across event processing flows.
   * - **datacontenttype**: Inherits from `incomingEvent`, typically `'application/cloudevents+json; charset=UTF-8'`, ensuring consistency in event data formatting.
   * - **traceparent** and **tracestate**: Generated based on `spanContext`, facilitating distributed tracing by carrying over trace information from the incoming event or initiating a new trace context.
   * - **to**: Chooses `contentForOutgoingEvent.to` if available, followed by `incomingEvent.redirectto`, then `incomingEvent.source`, and finally defaults to `null` if none are provided. This prioritization allows explicit routing of the event, with `to` specifying the intended recipient(s) or topic(s).
   * - **redirectto**: Directly from `contentForOutgoingEvent.redirectto`, allowing for dynamic redirection of the event post-processing, overriding any redirection implied by the incoming event.
   *
   * This construction logic ensures that the outgoing `CloudEvent` accurately reflects the results of the event processing, with appropriate metadata for routing, identification, and tracing.
   *
   * @param spanContext - The distributed tracing context for the operation, supporting traceability across services.
   * @param incomingEvent - The original CloudEvent that was processed, providing a basis for deriving metadata for the response event.
   * @param contentForOutgoingEvent - The handler's response object, containing the specifics for the type, data, and optionally, source, subject, to, and redirectto for the response event.
   * @returns A new `CloudEvent` constructed from the handler response, ready for emission.
   * @throws {CloudEventHandlerError} If the response type is not recognized or the data does not conform to the expected schema, indicating issues with the handler's output.
   * @protected
   */
  protected convertHandlerResponseToCloudEvent(
    spanContext: SpanContext,
    incomingEvent: CloudEvent<Record<string, any>>,
    contentForOutgoingEvent: CloudEventHandlerFunctionOutput<TEmitType>,
  ) {
    // Checking if the response type matching as one of the emits
    const respEvent = this.params.emits.filter(
      (item) =>
        matchStringTemplate(contentForOutgoingEvent.type, item.type).matched,
    );
    if (!respEvent.length) {
      throw new CloudEventHandlerError(
        `[CloudEventHandler][cloudevent] Invalid handler repsonse. The response type=${contentForOutgoingEvent.type} does not match any of the provided in 'emits'`,
        incomingEvent,
        { handlerResponse: contentForOutgoingEvent },
      );
    }
    // Check if the response output data shape is the same as the the emit type expects
    const parseResp = respEvent[0].zodSchema.safeParse(
      contentForOutgoingEvent.data,
    );
    if (!parseResp.success) {
      throw new CloudEventHandlerError(
        `[CloudEventHandler][cloudevent] Invalid handler repsonse. The response data does not match type=${contentForOutgoingEvent.type} expected data shape`,
        incomingEvent,
        {
          handlerResponse: contentForOutgoingEvent,
          error: parseResp.error.message,
          issues: parseResp.error.issues,
        },
      );
    }
    const toField = (contentForOutgoingEvent.to ||
      incomingEvent.redirectto ||
      incomingEvent.source ||
      null) as string | null;
    return new CloudEvent<Record<string, any>>({
      to: toField ? encodeURI(toField) : null,
      redirectto: contentForOutgoingEvent.redirectto
        ? encodeURI(contentForOutgoingEvent.redirectto)
        : null,
      type: contentForOutgoingEvent.type,
      data: contentForOutgoingEvent.data,
      source: encodeURI(contentForOutgoingEvent.source || this.topic),
      subject: contentForOutgoingEvent.subject || incomingEvent.subject,
      datacontenttype:
        incomingEvent.datacontenttype ||
        'application/cloudevents+json; charset=UTF-8',
      traceparent: TraceParent.create.traceparent(spanContext),
      tracestate: spanContext.traceState || null,
    });
  }

  /**
   * Core method for processing an incoming CloudEvent. Validates the event, matches it against the accepted type,
   * and invokes the handler function. Supports distributed tracing by incorporating `traceparent` and `tracestate`.
   *
   * The output events have the fields which follow the logic mentioned below
   * - **type**: Directly taken from `Return<handler>.type`, indicating the specific type of event being emitted as a result of the processing.
   * - **data**: Uses `Return<handler>.data` as the payload for the outgoing event, ensuring the data is relevant to the event type.
   * - **source**: Prefers `Return<handler>.source` if provided; otherwise, defaults to the handler's topic. This field denotes the originator of the event, ensuring traceability.
   * - **subject**: Falls back to `incomingEvent.subject` if not specified in `Return<handler>.subject`, maintaining context across event processing flows.
   * - **datacontenttype**: Inherits from `incomingEvent`, typically `'application/cloudevents+json; charset=UTF-8'`, ensuring consistency in event data formatting.
   * - **traceparent** and **tracestate**: Generated based on `spanContext`, facilitating distributed tracing by carrying over trace information from the incoming event or initiating a new trace context.
   * - **to**: Chooses `Return<handler>.to` if available, followed by `incomingEvent.redirectto`, then `incomingEvent.source`, and finally defaults to `null` if none are provided. This prioritization allows explicit routing of the event, with `to` specifying the intended recipient(s) or topic(s).
   * - **redirectto**: Directly from `Return<handler>.redirectto`, allowing for dynamic redirection of the event post-processing, overriding any redirection implied by the incoming event.
   *
   * @param event - The CloudEvent to be processed.
   * @param spanContext - Optional. A SpanContext for distributed tracing, defaulting to a new trace if not provided.
   * @returns A Promise that resolves to an array of emitted CloudEvents as a result of processing.
   * @throws {CloudEventHandlerError} If event validation fails or the handler function encounters an error.
   * @public
   */
  async cloudevent(
    event: CloudEvent<Record<string, any>>,
    spanContext: SpanContext = TraceParent.parse(),
  ): Promise<CloudEvent<Record<string, any>>[]> {
    this.validateCloudEvent(event);
    const matchResp = matchStringTemplate(event.type, this.params.accepts.type);
    let responses: CloudEventHandlerFunctionOutput<TEmitType>[] = [];
    responses = await this.errorHandledHandler({
      type: event.type as TAcceptType,
      data: event.data || {},
      params: matchResp.result,
      spanContext,
      logger: async (logParams: ILogger) => {
        await this.logger(logParams);
      },
      event,
      source: event.source,
      to: (event.to || undefined) as string | undefined,
      redirectto: (event.redirectto || undefined) as string | undefined,
    });
    return responses.map((resp) =>
      this.convertHandlerResponseToCloudEvent(spanContext, event, resp),
    );
  }

  /**
   * Safely processes the given CloudEvent by wrapping the main `cloudevent` method with error handling.
   * This ensures that any errors encountered during the processing of the CloudEvent, including system
   * errors or uncaught handler errors, are captured and returned as specially formatted error CloudEvents.
   * This approach maintains system resilience and provides meaningful feedback on failures.
   *
   * The logic for constructing the output `CloudEvent`, including the error event, follows specific rules:
   * - **type**: Taken directly from the handler's return value (`Return<handler>.type`), indicating the specific type of event being emitted. For error events, it is formatted as `sys.${this.topic}.error`.
   * - **data**: The payload is sourced from `Return<handler>.data` for successful events. For error events, it includes error details such as name, message, stack, and additional info.
   * - **source**: Prefers `Return<handler>.source` if provided; defaults to the handler's topic. For error events, the source is set to the handler's topic, ensuring traceability of the error origin.
   * - **subject**: Defaults to `incomingEvent.subject` if `Return<handler>.subject` is not specified, maintaining context. For error events, it uses the original event's subject or a default indicating the CloudEvent ID.
   * - **datacontenttype**: Inherits from the incoming event, typically `'application/cloudevents+json; charset=UTF-8'`. This ensures consistency in event data formatting across the workflow.
   * - **traceparent** and **tracestate**: Generated from `spanContext`, facilitating distributed tracing. This includes carrying over trace information from the incoming event or starting a new trace context, crucial for error events to trace the error source.
   * - **to**: For successful events, it follows the order of preference: `Return<handler>.to`, `incomingEvent.redirectto`, `incomingEvent.source`, defaulting to `null` if none are provided. For error events, it directs back to the event's source to notify the producer of the error.
   * - **redirectto**: Specified by `Return<handler>.redirectto` for redirecting the event post-processing. For error events, this field is nullified to prevent further redirection of error notifications.
   *
   * This method ensures that any operational or processing errors are communicated back to the event source or designated error handling service, enabling robust error management and recovery strategies.
   *
   * @param event - The CloudEvent to be processed.
   * @returns A Promise resolving to an array containing either successfully processed CloudEvents or error CloudEvents, encapsulating any encountered processing errors.
   * @public
   */
  async safeCloudevent(event: CloudEvent<Record<string, any>>): Promise<
    {
      success: boolean;
      eventToEmit: CloudEvent<Record<string, any>>;
      error?: CloudEventHandlerError;
    }[]
  > {
    const start = performance.now();
    const spanContext: SpanContext = TraceParent.parse(
      (event.traceparent || '') as string,
      (event.tracestate || '') as string,
    );
    let responses: {
      success: boolean;
      eventToEmit: CloudEvent<Record<string, any>>;
      error?: CloudEventHandlerError;
    }[] = [];
    try {
      await this.logger({
        type: 'START',
        source: `CloudEventHandler<${this.topic}>.safeCloudevent`,
        spanContext,
        input: {
          ...event.toJSON(),
          type: event.type,
          data: event.data as Record<string, any>,
        },
        startTime: start,
      });
      responses = (await this.cloudevent(event, spanContext)).map((item) => ({
        success: true,
        eventToEmit: item,
      }));
    } catch (e) {
      await this.logger({
        type: 'ERROR',
        source: `CloudEventHandler<${this.topic}>.safeCloudevent`,
        spanContext,
        error: e as Error,
        input: {
          ...event.toJSON(),
          type: event.type,
          data: event.data as Record<string, any>,
        },
      });
      responses.push({
        success: false,
        eventToEmit: new CloudEvent({
          // Must go back to the producer incase of error
          to: encodeURI(event.source),
          redirectto: null,
          source: encodeURI(this.topic),
          type: `sys.${this.topic}.error`,
          subject: event.subject || `no-subject:cloudevent-id=${event.id}`,
          data: {
            errorName: (e as CloudEventHandlerError).name,
            errorStack: (e as CloudEventHandlerError).stack,
            errorMessage: (e as CloudEventHandlerError).message,
            additional: (e as CloudEventHandlerError).additional,
            event: (e as CloudEventHandlerError).event,
          },
          datacontenttype: 'application/cloudevents+json; charset=UTF-8',
          traceparent: TraceParent.create.traceparent(spanContext),
          tracestate: spanContext.traceState || '',
          time: new Date().toISOString(),
        }),
        error: e as Error,
      });
    }
    await Promise.all(
      responses.map(
        async ({ eventToEmit }) =>
          await this.logger({
            type: 'LOG',
            source: `CloudEventHandler<${this.topic}>.safeCloudevent`,
            spanContext,
            output: {
              ...eventToEmit.toJSON(),
              type: eventToEmit.type,
              data: eventToEmit.data as Record<string, any>,
            },
          }),
      ),
    );
    const endTime = performance.now();
    await this.logger({
      type: 'END',
      source: `CloudEventHandler<${this.topic}>.safeCloudevent`,
      spanContext,
      startTime: start,
      endTime,
      duration: endTime - start,
    });
    return responses;
  }

  /**
   * Generates a JSON schema for an event based on its type, data schema, and an optional description.
   * Used to create schemas for both accepted and emitted events, facilitating event documentation and validation.
   *
   * @param type - The CloudEvent type.
   * @param data - The zod schema for the event's data.
   * @param description - Optional. A human-readable description of the event.
   * @returns A JSON schema representation of the event.
   * @protected
   */
  protected makeEventSchema(
    type: string,
    data: zod.ZodObject<any>,
    description?: string,
  ) {
    return zodToJsonSchema(
      zod
        .object({
          id: zod.string().optional().describe('A UUID of this event'),
          subject: zod.string().describe('The subject of the event'),
          type: zod.literal(type).describe('The topic of the event'),
          source: zod
            .literal(encodeURI(this.topic))
            .describe(
              'The source of the event. It may be in rare cases overriden to due to the handler function behavior. This is not recommended in most cases.',
            ),
          data: data,
          datacontenttype: zod
            .literal('application/cloudevents+json; charset=UTF-8')
            .describe(
              "Must be either 'application/cloudevents+json; charset=UTF-8'",
            ),
          traceparent: zod
            .string()
            .regex(TraceParent.validationRegex)
            .optional()
            .describe(
              [
                'The traceparent header represents the incoming request in a tracing system in a common format.',
                'See the W3C spec for the definition as per [CloudEvents Distributed Tracing ',
                'Specification](https://github.com/cloudevents/spec/blob/main/cloudevents/extensions/distributed-tracing.md).',
              ].join(''),
            ),
          tracestate: zod
            .string()
            .optional()
            .describe(
              'Additional tracing info as per the [spec](https://www.w3.org/TR/trace-context/#tracestate-header)',
            ),
          to: zod
            .string()
            .optional()
            .describe(
              cleanString(`
                **URI reference so encoded via encodeURI**
                Specifies the intended initial recipient(s) or destination topic(s) for the event.
                This field acts as metadata to assist in the event routing process, indicating where 
                the event should be initially directed. While optional, specifying this field can 
                significantly enhance routing precision and efficiency within event brokers or middleware, 
                guiding the event toward the appropriate service or component for initial processing. It is 
                especially useful in complex distributed systems where events may be handled by multiple 
                services or in multi-step workflows.

                The logic for determining its value here is as follows:
                - For successful events, the system first looks for a value specified in the handler's return (Return<handler>.to). If not provided, it then considers the incomingEvent.redirectTo field, which indicates where the event should be directed after initial processing. If this is also absent, it falls back to the incomingEvent.source, essentially directing the event back to its originator. If none of these fields provide a directive, the to field is set to null, indicating no specific routing is required.
                - For error events, the to field is explicitly set to the event's source (incomingEvent.source). This ensures that error notifications are directed back to the event producer or the system component responsible for the event, allowing for the acknowledgment of the error and potential corrective actions.
              `),
            ),
          redirectTo: zod
            .string()
            .optional()
            .describe(
              cleanString(`
                **URI reference so encoded via encodeURI**
                Indicates an alternative or subsequent recipient(s) or destination topic(s) for the event, 
                suggesting where the event should be forwarded after initial processing. Like the "to" field, 
                "redirectTo" is metadata that can be leveraged to dynamically alter the event's routing path, 
                facilitating complex workflows or multi-stage processing scenarios. It allows for the decoupling 
                of event production from consumption, enabling flexible, dynamic routing without requiring the 
                event producer to be aware of the full processing pipeline.

                The logic for determining its value here is as follows:
                - For successful events, the redirectTo value is taken directly from Return<handler>.redirectTo. This allows event handlers to dynamically alter the event's routing path based on processing outcomes, facilitating complex workflows or conditional processing scenarios.
                - For error events, the redirectTo field is set to null. This decision is made to halt further automatic redirection of error notifications, ensuring that error events are not inadvertently routed through the system but are instead directed to a specific handler or service for error handling and logging.
              `),
            ),
        })
        .describe(
          description || 'The event which can be accepted by this handler',
        ),
    );
  }

  /**
   * Constructs the AsyncAPI channels and operations for this CloudEventHandler, enabling integration with AsyncAPI documentation tools.
   * This method auto-generates the configuration necessary to document the event-driven API exposed by this handler.
   *
   * @param bindings - Optional. Specifies the message bindings for the AsyncAPI spec, providing additional configuration.
   * The bindings must be object as per [Async API](https://www.asyncapi.com/docs/reference/specification/v3.0.0#messageBindingsObject)
   * @returns An object containing the AsyncAPI channels and operations configuration for this CloudEventHandler.
   * @public
   */
  getAsyncApiChannel(
    bindings: object = {
      statusCode: 200,
      headers: zodToJsonSchema(
        zod.object({
          'content-type': zod.literal(
            'application/cloudevents+json; charset=UTF-8',
          ),
        }),
      ),
      bindingVersion: '0.3.0',
    },
  ) {
    return {
      channels: {
        [this.params.accepts.type]: {
          address: this.params.accepts.type,
          title: this.params.accepts.type,
          description: this.params.accepts.description,
          messages: {
            [this.params.accepts.type]: {
              name: this.params.accepts.type,
              description: this.params.accepts.description,
              contentType: 'application/cloudevents+json; charset=UTF-8',
              payload: this.makeEventSchema(
                this.params.accepts.type,
                this.params.accepts.zodSchema,
                this.params.accepts.description,
              ),
              bindings,
            },
          },
        },
        ...Object.assign(
          {},
          ...this.getAllEmits().map((item) => ({
            [item.type]: {
              address: item.type,
              title: item.type,
              description: item.description,
              messages: {
                [item.type]: {
                  name: item.type,
                  description: item.description,
                  contentType: 'application/cloudevents+json; charset=UTF-8',
                  payload: this.makeEventSchema(
                    item.type,
                    item.zodSchema,
                    item.description,
                  ),
                  bindings,
                },
              },
            },
          })),
        ),
      },
      operations: Object.assign(
        {},
        ...this.getAllEmits().map((item) => ({
          [item.type]: {
            action: 'send',
            channel: {
              $ref: `#/channels/${this.params.accepts.type}`,
            },
            reply: {
              channel: {
                $ref: `#/channels/${item.type}`,
              },
            },
          },
        })),
      ),
    };
  }

  /**
   * Retrieves a detailed interface of this CloudEventHandler, including its name, description, accepted event types, and emitted event types.
   * Useful for debugging, documentation, and runtime inspection of handler configurations.
   *
   * @returns An object representing the detailed configuration of this CloudEventHandler.
   * @public
   */
  getInterface(): Record<string, any> {
    return {
      name: this.params.name,
      description: this.params.description,
      accepts: this.makeEventSchema(
        this.params.accepts.type,
        this.params.accepts.zodSchema,
        this.params.accepts.description,
      ),
      emits: this.getAllEmits().map((item) =>
        this.makeEventSchema(item.type, item.zodSchema, item.description),
      ),
    };
  }

  /**
   * Converts the CloudEventHandler configuration to a dictionary format, facilitating cloning or serialization.
   *
   * @returns An object containing the configuration parameters of this CloudEventHandler instance.
   * @public
   */
  toDict(): ICloudEventHandler<TAcceptType, TEmitType> {
    return { ...this.params };
  }
}
