import * as zod from 'zod';
import { CloudEvent } from 'cloudevents';
import { ICloudEventHandler, ILogger, Logger } from './types';
import { CloudEventHandlerError } from './errors';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { matchStringTemplate } from '../utils';
import TraceParent from '../openTelemetry/traceparent';
import { SpanContext } from '../openTelemetry/Span/types';

/**
 * Represents a CloudEventHandler that processes CloudEvents. This class
 * allows to not only create CloudEvent handlers but also do so while allowing
 * for type validation and documentation. Moreover, since this package is
 * built with xOrca in mind it also preserve subject continuation for keeping
 * track of orchestration references.
 * @template TAcceptType - The type of CloudEvent that the handler accepts.
 * @template TEmitType - The type of CloudEvent that the handler emits.
 * @example
 * // Example usage of CloudEventHandler
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
 *     // Process the 'UserCreated' event and return an 'UserUpdated' event.
 *     return { type: 'evt.user.update.success', data: { id: event.data.id, name: event.data.name } };
 *   },
 * });
 */
export default class CloudEventHandler<
  TAcceptType extends string,
  TEmitType extends string,
> {
  /**
   * Creates an instance of CloudEventHandler.
   * @param params - Parameters for configuring the CloudEventHandler.
   * @throws {CloudEventHandlerError} - Throws an error if the 'name' contains spaces or special characters.
   */
  constructor(private params: ICloudEventHandler<TAcceptType, TEmitType>) {
    this.params.name = this.params.name || this.topic;
    if (this.params.name.includes(' ')) {
      throw new CloudEventHandlerError(
        `[CloudEventHandler][constructor] The 'name' must not contain any spaces or special characters but the provided is ${this.params.name}`,
      );
    }
  }

  /**
   * Retrieves an array containing all the CloudEvent emissions, including a special error event.
   * This error event is associated with handling errors while using the 'safeCloudevent' method.
   * @returns An array of objects representing the CloudEvent emissions, including the error event.
   */
  private getAllEmits() {
    return [
      ...this.params.emits,
      {
        type: `sys.${this.params.name}.error`,
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
          "Event raised when error happens while using 'safeCloudevent' method",
      },
    ];
  }

  /**
   * The type of CloudEvent to which this handler listens to and handles.
   */
  public get topic() {
    return this.params.accepts.type;
  }

  public getLogger() {
    return this.params.logger;
  }

  public setLogger(logger: Logger) {
    this.params.logger = logger;
    return this;
  }

  private async logger(logParams: ILogger) {
    try {
      await this.getLogger()?.(logParams);
    } catch (e) {
      console.error(e);
    }
  }

  /**
   * Processes the given CloudEvent and returns a new CloudEvent.
   * This function also takes care of distributed tracing as described [here](https://github.com/cloudevents/spec/blob/main/cloudevents/extensions/distributed-tracing.md),
   * based on `traceparent` and `tracestate` in the CloudEvent.
   *
   * @param event - The CloudEvent to be processed.
   * @returns A Promise resolving to the emitted CloudEvent.
   * @throws {CloudEventHandlerError} - Throws an error if required properties are missing or validation fails.
   */
  async cloudevent(
    event: CloudEvent<Record<string, any>>,
    spanContext: SpanContext = TraceParent.parse(),
  ): Promise<CloudEvent<Record<string, any>>[]> {
    for (const prop of ['subject', 'type', 'data', 'datacontenttype']) {
      if (!event[prop]) {
        throw new CloudEventHandlerError(
          `[CloudEventHandler][cloudevent] The ${prop} MUST be provided.`,
          event,
        );
      }
    }
    const { subject, type, data, datacontenttype } = event;
    if (![datacontenttype].includes('application/json')) {
      throw new CloudEventHandlerError(
        `[CloudEventHandler][cloudevent] The event 'datacontenttype' MUST be 'application/json' but the provided is ${datacontenttype}`,
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

    let responses: {
      type: string;
      data: Record<string, any>;
      subject?: string;
      source?: string;
    }[] = [
      {
        type: '',
        data: {},
      },
    ];
    try {
      responses = await this.params.handler({
        type: type as TAcceptType,
        data: data || {},
        params: matchResp.result,
        spanContext,
        logger: async (logParams: ILogger) => {
          await this.logger(logParams);
        },
      });
    } catch (e) {
      throw new CloudEventHandlerError(
        `[CloudEventHandler][cloudevent][handler] Handler errored (message=${(e as Error).message})`,
        event,
        {
          error: (e as Error).toString(),
        },
      );
    }

    return responses.map((resp) => {
      const respEvent = this.params.emits.filter(
        (item) => matchStringTemplate(resp.type, item.type).matched,
      );

      if (!respEvent.length) {
        throw new CloudEventHandlerError(
          `[CloudEventHandler][cloudevent] Invalid handler repsonse. The response type=${resp.type} does not match any of the provided in 'emits'`,
          event,
          { handlerResponse: resp },
        );
      }

      const parseResp = respEvent[0].zodSchema.safeParse(resp.data);
      if (!parseResp.success) {
        throw new CloudEventHandlerError(
          `[CloudEventHandler][cloudevent] Invalid handler repsonse. The response data does not match type=${resp.type} expected data shape`,
          event,
          {
            handlerResponse: resp,
            error: parseResp.error.message,
            issues: parseResp.error.issues,
          },
        );
      }

      return new CloudEvent<Record<string, any>>({
        type: resp.type,
        data: resp.data,
        subject: resp.subject || subject,
        source: encodeURIComponent(
          resp.source || this.params.name || this.topic,
        ),
        datacontenttype,
        traceparent: TraceParent.create.traceparent(spanContext),
        tracestate: spanContext.traceState || '',
      });
    });
  }

  /**
   * Processes the given CloudEvent safely and returns a new CloudEvent.
   * If an error occurs during processing, a new CloudEvent representing the error is returned.
   * @param event - The CloudEvent to be processed.
   * @returns A Promise resolving to the emitted CloudEvent or an error CloudEvent.
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
          source: encodeURIComponent(this.params.name || this.topic),
          type: `sys.${this.params.name}.error`,
          subject: event.subject || `no-subject:cloudevent-id=${event.id}`,
          data: {
            errorName: (e as CloudEventHandlerError).name,
            errorStack: (e as CloudEventHandlerError).stack,
            errorMessage: (e as CloudEventHandlerError).message,
            additional: (e as CloudEventHandlerError).additional,
            event: (e as CloudEventHandlerError).event,
          },
          datacontenttype: 'application/json',
          traceparent: TraceParent.create.traceparent(spanContext),
          tracestate: spanContext.traceState || '',
        }),
        error: e as Error,
      });
    }
    const endTime = performance.now();
    await Promise.all(
      responses.map(
        async ({ eventToEmit }) =>
          await this.logger({
            type: 'END',
            source: `CloudEventHandler<${this.topic}>.safeCloudevent`,
            spanContext,
            output: {
              ...eventToEmit.toJSON(),
              type: eventToEmit.type,
              data: eventToEmit.data as Record<string, any>,
            },
            startTime: start,
            endTime,
            duration: endTime - start,
          }),
      ),
    );
    return responses;
  }

  private makeEventSchema(
    type: string,
    data: zod.ZodObject<any>,
    description?: string,
  ) {
    return zodToJsonSchema(
      zod
        .object({
          subject: zod.string().describe('The subject of the event'),
          type: zod.literal(type).describe('The topic of the event'),
          source: zod
            .literal(encodeURIComponent(this.params.name || this.topic))
            .describe('The source of the event'),
          data: data,
          datacontenttype: zod
            .literal('application/json')
            .describe(
              "Must be either 'application/json' or 'application/json; charset=utf-8'",
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
        })
        .describe(
          description || 'The event which can be accepted by this handler',
        ),
    );
  }

  /**
   * Create the Async API spec 3.0.0 channels and operations
   * for this handler
   * @param bindings - The bindings object as per https://www.asyncapi.com/docs/reference/specification/v3.0.0#messageBindingsObject
   * @returns
   */
  getAsyncApiChannel(
    bindings: object = {
      statusCode: 200,
      headers: zodToJsonSchema(
        zod.object({
          'content-type': zod.literal('application/json'),
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
              contentType: 'application/json',
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
                  contentType: 'application/json',
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
   * Gets an interface representing the CloudEventHandler configuration.
   * @returns An object representing the CloudEventHandler interface.
   * @example
   * // Example usage to get the interface
   * const interfaceInfo = myEventHandler.getInterface();
   * console.log(interfaceInfo);
   * // Output: { name: 'user.update', description: 'Handles user-related events', accepts: {...}, emits: [...] }
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
   * Get the params of the handler. Can be used for cloning
   * @returns a object with parameters of this object
   */
  toDict(): ICloudEventHandler<TAcceptType, TEmitType> {
    return this.params;
  }
}
