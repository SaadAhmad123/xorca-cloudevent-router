import * as zod from 'zod';
import XOrcaCloudEvent from '../XOrcaCloudEvent';
import {
  CloudEventHandlerFunctionInput,
  CloudEventHandlerFunctionOutput,
  ICloudEventHandler,
  ISafeCloudEventResponse,
} from './types';
import { CloudEventHandlerError } from './errors';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { matchStringTemplate } from '../utils';
import {
  trace,
  context,
  Span,
  Tracer,
  SpanStatusCode,
} from '@opentelemetry/api';
import { getActiveContext, logToSpan, parseContext } from '../Telemetry';
import { TelemetryContext } from '../Telemetry/types';
import XOrcaCloudEventSchemaGenerator from '../XOrcaCloudEvent/schema';
import { v4 as uuidv4 } from 'uuid'

/**
 * Manages CloudEvent handlers with type validation, distributed tracing, and error handling.
 * Supports input/output event schemas, logging, and AsyncAPI documentation generation.
 *
 * @template TAcceptType - The CloudEvent type this handler accepts.
 * @template TEmitType - The CloudEvent types this handler may emit.
 */
export default class CloudEventHandler<
  TAcceptType extends string,
  TEmitType extends string,
> {
  private otelTracer: Tracer;

  /**
   * Creates a new CloudEventHandler.
   * @param {ICloudEventHandler} params - Configuration for the event handler.
   * @throws {CloudEventHandlerError} If the 'name' parameter is invalid.
   */
  constructor(protected params: ICloudEventHandler<TAcceptType, TEmitType>) {
    this.params.name = this.params.name || this.topic;
    this.params.timeoutMs = this.params.timeoutMs || 4 * 60 * 1000;
    this.otelTracer = trace.getTracer(this.topic);

    if (this.params.name.includes(' ')) {
      throw new CloudEventHandlerError(
        `[CloudEventHandler][constructor] The 'name' must not contain any spaces or special characters but the provided is ${this.params.name}`,
      );
    }
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
   * Validates a CloudEvent against the expected schema.
   * @param {XOrcaCloudEvent} event - The CloudEvent to validate.
   * @throws {CloudEventHandlerError} If validation fails.
   * @protected
   */
  protected validateCloudEvent(event: XOrcaCloudEvent) {
    const fieldsToValidate = ['subject', 'type', 'data', 'datacontenttype']
    for (const field of fieldsToValidate) {
      // @ts-ignore
      if (!event.toJSON()[field]) {
        throw new CloudEventHandlerError(
          `[CloudEventHandler][cloudevent] The ${field} MUST be provided.`,
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
   * Wraps the event handler function with error handling.
   * @param {CloudEventHandlerFunctionInput<TAcceptType, TEventData>} event - The input event.
   * @returns {Promise<CloudEventHandlerFunctionOutput<TEmitType>[]>} Processed event(s).
   * @throws {CloudEventHandlerError} If the handler function throws an error.
   * @protected
   */
  protected async errorHandledHandler<
    TEventData extends Record<string, any> = Record<string, any>,
  >(
    event: CloudEventHandlerFunctionInput<TAcceptType, TEventData>,
  ): Promise<CloudEventHandlerFunctionOutput<TEmitType>[]> {
    try {
      return await this.params.handler({
        ...event,
      });
    } catch (e) {
      const error = new CloudEventHandlerError(
        `[CloudEventHandler][cloudevent][handler] Handler errored (message=${(e as Error).message})`,
        event.event,
        {
          error: (e as Error).toString(),
        },
      );
      logToSpan(event.openTelemetry.span, {
        level: 'ERROR',
        message: error.message,
      });
      throw error;
    }
  }

  /**
   * Converts handler response to a CloudEvent.
   * @param {XOrcaCloudEvent} incomingEvent - The original CloudEvent.
   * @param {CloudEventHandlerFunctionOutput<TEmitType>} contentForOutgoingEvent - Handler's response.
   * @param {number} elapsedTime - Processing time.
   * @param {TelemetryContext} telemetryContext - Telemetry context.
   * @returns {XOrcaCloudEvent} Constructed CloudEvent.
   * @throws {CloudEventHandlerError} If response type or data is invalid.
   * @protected
   */
  protected convertHandlerResponseToCloudEvent(
    incomingEvent: XOrcaCloudEvent,
    contentForOutgoingEvent: CloudEventHandlerFunctionOutput<TEmitType>,
    elapsedTime: number,
    telemetryContext: TelemetryContext,
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

    const executionUnits =
      contentForOutgoingEvent.executionunits || this.params.executionUnits || 0;
    return new XOrcaCloudEvent({
      id: uuidv4(),
      specversion: "1.0",
      to: !this.params.disableRoutingMetadata && toField ? toField : undefined,
      redirectto:
        !this.params.disableRoutingMetadata &&
        contentForOutgoingEvent.redirectto
          ? contentForOutgoingEvent.redirectto
          : undefined,
      type: contentForOutgoingEvent.type,
      data: {
        ...(contentForOutgoingEvent.data || {}),
      },
      source: contentForOutgoingEvent.source || this.params.name || this.topic,
      subject: contentForOutgoingEvent.subject || incomingEvent.subject || '',
      traceparent: telemetryContext.traceparent,
      tracestate: telemetryContext.tracestate,
      executionunits: executionUnits.toString(),
      elapsedtime: elapsedTime.toString(),
    });
  }

  /**
   * Processes an incoming CloudEvent.
   * @param {XOrcaCloudEvent} event - The CloudEvent to process.
   * @param {Span} span - OpenTelemetry span for tracing.
   * @returns {Promise<XOrcaCloudEvent[]>} Processed CloudEvents.
   * @throws {CloudEventHandlerError} If processing fails.
   * @protected
   */
  protected async processCloudevent(
    event: XOrcaCloudEvent,
    span: Span,
  ): Promise<XOrcaCloudEvent[]> {
    this.validateCloudEvent(event);
    const matchResp = matchStringTemplate(event.type, this.params.accepts.type);
    let responses: CloudEventHandlerFunctionOutput<TEmitType>[] = [];

    let handlerTimedOut = false;
    let timeoutHandler: NodeJS.Timeout | undefined = this.params.timeoutMs
      ? setTimeout(() => {
          handlerTimedOut = true;
        }, this.params.timeoutMs)
      : undefined;

    const start = performance.now();
    responses = await this.errorHandledHandler({
      type: event.type as TAcceptType,
      data: this.params.accepts.zodSchema.parse(event.data || {}),
      params: matchResp.result,
      event,
      source: event.source,
      to: (event.to || undefined) as string | undefined,
      redirectto: (event.redirectto || undefined) as string | undefined,
      isTimedOut: () => handlerTimedOut,
      timeoutMs: this.params.timeoutMs as number,
      openTelemetry: {
        span: span,
        tracer: this.otelTracer,
      },
    });
    const elapsedTime = performance.now() - start;

    clearTimeout(timeoutHandler);
    const telemetryContext = parseContext(span);
    return responses.map((resp) =>
      this.convertHandlerResponseToCloudEvent(
        event,
        resp,
        elapsedTime,
        telemetryContext,
      ),
    );
  }

  /**
   * Safely processes a CloudEvent, handling errors.
   * @param {XOrcaCloudEvent} event - The CloudEvent to process.
   * @param {TelemetryContext} [telemetryContext] - Optional telemetry context.
   * @returns {Promise<ISafeCloudEventResponse[]>} Processed or error CloudEvents.
   * @public
   */
  public async cloudevent(
    event: XOrcaCloudEvent,
    telemetryContext?: TelemetryContext,
  ): Promise<ISafeCloudEventResponse[]> {
    const activeContext = getActiveContext(
      telemetryContext?.traceparent || event.traceparent || null,
    );
    const activeSpan = this.otelTracer.startSpan(
      `CloudEventHandler.cloudevent<${event.type}>`,
      {
        attributes: {
          'xorca.to_process.event_id': event.id || '',
          'xorca.to_process.event_source': event.source || '',
          'xorca.to_process.event_spec_version': event.specversion || '',
          'xorca.to_process.event_subject': event.subject || '',
          'xorca.to_process.event_type': event.type || '',
          'xorca.to_process.event_redirectto': event.redirectto || '',
          'xorca.to_process.event_to': event.to || '',
        },
      },
      activeContext,
    );

    const result = await context.with(
      trace.setSpan(activeContext, activeSpan),
      async () => {
        const telemetryContext = parseContext(activeSpan, activeContext);
        activeSpan.setAttribute(
          'xorca.to_process.event_to',
          event.to || '',
        );
        activeSpan.setAttribute(
          'xorca.to_process.event_redirectto',
          event.redirectto || '',
        );
        const start = performance.now();
        return await this.processCloudevent(event, activeSpan)
          .then((events) => {
            activeSpan.setStatus({
              code: SpanStatusCode.OK,
            });
            return events.map((item) => ({
              success: true,
              eventToEmit: item,
            }));
          })
          .catch((e: Error) => {
            activeSpan.setStatus({
              code: SpanStatusCode.ERROR,
              message: e.message,
            });
            logToSpan(activeSpan, {
              level: 'CRITICAL',
              message: e.message,
            });
            return [
              {
                success: false,
                eventToEmit: new XOrcaCloudEvent({
                  id: uuidv4(),
                  specversion: "1.0",
                  to: !this.params.disableRoutingMetadata ? event.source : null,
                  redirectto: null,
                  source: this.params.name || this.topic,
                  type: `sys.${this.params.name || this.topic}.error`,
                  subject:
                    event.subject || `no-subject:cloudevent-id=${event.id}`,
                  data: {
                    errorName: (e as CloudEventHandlerError).name,
                    errorStack: (e as CloudEventHandlerError).stack,
                    errorMessage: (e as CloudEventHandlerError).message,
                    additional: (e as CloudEventHandlerError).additional,
                    event: (e as CloudEventHandlerError).event,
                  },
                  traceparent: telemetryContext.traceparent,
                  tracestate: telemetryContext.tracestate,
                  executionunits: (this.params.executionUnits || 0).toString(),
                  elapsedtime: (performance.now() - start).toString(),
                }),
                error: e as Error,
              },
            ];
          });
      },
    );

    result.forEach(({ eventToEmit: item }, index) => {
      activeSpan.setAttribute(
        `xorca.to_emit.[${index}].event_type`,
        item.type || '',
      );
      activeSpan.setAttribute(
        `xorca.to_emit.[${index}].event_executionunits`,
        item.executionunits || '',
      );
      activeSpan.setAttribute(
        `xorca.to_emit.[${index}].event_to`,
        item.to || '',
      );
      activeSpan.setAttribute(
        `xorca.to_emit.[${index}].event_redirectto`,
        item.redirectto || '',
      );
      activeSpan.setAttribute(
        `xorca.to_emit.[${index}].event_elapsedtime`,
        item.elapsedtime || '',
      );
    });

    activeSpan.end();
    return result;
  }

  /**
   * Compiles a list of all event types the handler can emit.
   * @returns {Array} Emit configurations.
   * @protected
   */
  protected getAllEmits() {
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
          "Event raised when error happens while using 'safeCloudevent' method. Can happen on invalid events types or some other errors",
      },
    ];
  }

  /**
   * Retrieves the detailed interface of this CloudEventHandler.
   * @returns {Record<string, any>} Detailed configuration of the handler.
   * @public
   */
  public getInterface(): Record<string, any> {
    return {
      name: this.params.name,
      description: this.params.description,
      accepts: zodToJsonSchema(XOrcaCloudEventSchemaGenerator({
        type: this.params.accepts.type,
        source: this.topic,
        data: this.params.accepts.zodSchema,
      })),
      emits: this.getAllEmits().map((item) =>
        zodToJsonSchema(XOrcaCloudEventSchemaGenerator({
          type: item.type,
          source: this.topic,
          data: item.zodSchema,
        })),
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
