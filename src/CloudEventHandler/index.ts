import {
  CloudEventHandlerFunctionInput,
  CloudEventHandlerFunctionOutput,
  ICloudEventHandler,
  SafeCloudEventResponse,
} from './types';
import { HandlerOpenTelemetryContext } from '../Telemetry/types';
import { CloudEventHandlerError } from './errors';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { cleanString, matchStringTemplate } from '../utils';
import { trace, context, SpanStatusCode } from '@opentelemetry/api';
import { getActiveContext, logToSpan, parseContext } from '../Telemetry';
import { TelemetryContext } from '../Telemetry/types';
import { v4 as uuidv4 } from 'uuid';
import {
  XOrcaCloudEvent,
  XOrcaCloudEventSchemaGenerator,
} from 'xorca-cloudevent';
import { XOrcaBaseContract } from 'xorca-contract';

/**
 * Manages CloudEvent handlers with type validation, distributed tracing, and error handling.
 */
export default class CloudEventHandler<
  TContract extends XOrcaBaseContract<any, any, any>,
> {
  /**
   * Creates a new CloudEventHandler.
   * @param {ICloudEventHandler} params - Configuration for the event handler.
   */
  constructor(protected params: ICloudEventHandler<TContract>) {
    this.params.name = params.name || this.topic;
    this.params.name = this.params.name?.trim();
    const regex: RegExp =
      /^(?:[a-zA-Z0-9_]+|\{\{[a-zA-Z0-9_]+\}\})(?:\.(?:[a-zA-Z0-9_]+|\{\{[a-zA-Z0-9_]+\}\}))*$/;
    if (
      !this.params.name ||
      !regex.test(this.params.name) ||
      this.params.name[0] === '.'
    ) {
      throw new CloudEventHandlerError(
        cleanString(`
        Invalid 'name' provided (=${this.params.name}). It must follow the regex ${regex.toString?.()}
      `),
      );
    }
  }

  /**
   * Gets the event type this handler is configured to accept, effectively defining the handler's topic.
   *
   * @returns The accept event type string, acting as the topic for this handler.
   */
  public get topic() {
    return this.params.contract.accepts.type;
  }

  protected validateCloudEvent(event: XOrcaCloudEvent) {
    const fieldsToValidate = ['subject', 'type', 'data', 'datacontenttype'];
    for (const field of fieldsToValidate) {
      // @ts-ignore
      if (!event.toJSON()[field]) {
        throw new CloudEventHandlerError(
          `[CloudEventHandler][cloudevent] The ${field} MUST be provided.`,
          event,
        );
      }
    }
    const { type, data } = event;
    const matchResp = matchStringTemplate(
      type,
      this.params.contract.accepts.type,
    );
    if (!matchResp.matched) {
      throw new CloudEventHandlerError(
        `[CloudEventHandler][cloudevent] The handler only accepts type=${this.params.contract.accepts.type} but the provided is ${type}.`,
        event,
      );
    }

    const inputParse = this.params.contract.accepts.schema.safeParse(data);
    if (!inputParse.success) {
      throw new CloudEventHandlerError(
        cleanString(`
          [CloudEventHandler][cloudevent] Invalid handler input data. 
          The response data does not match type=${this.params.contract.accepts.type} 
          expected data shape
        `),
        event,
        {
          error: inputParse.error.message,
          issues: inputParse.error.issues,
        },
      );
    }
  }

  protected async errorHandledHandler(
    event: CloudEventHandlerFunctionInput<TContract>,
  ): Promise<CloudEventHandlerFunctionOutput<TContract>[]> {
    try {
      return (await this.params.handler({
        ...event,
      })) as any;
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
        message: `${error.message}\n\nError stack - ${error.stack}`,
      });
      throw error;
    }
  }

  protected convertHandlerResponseToCloudEvent(
    incomingEvent: XOrcaCloudEvent,
    contentForOutgoingEvent: CloudEventHandlerFunctionOutput<TContract>,
    elapsedTime: number,
    telemetryContext: TelemetryContext,
  ) {
    // Checking if the response type matching as one of the emits
    const respEvent = this.params.contract.emitables.filter(
      (item) =>
        matchStringTemplate(
          contentForOutgoingEvent.type.toString(),
          item.type.toString(),
        ).matched,
    );
    if (!respEvent.length) {
      throw new CloudEventHandlerError(
        `[CloudEventHandler][cloudevent] Invalid handler repsonse. The response type=${contentForOutgoingEvent.type.toString()} does not match any of the provided in 'emits'`,
        incomingEvent,
        { handlerResponse: contentForOutgoingEvent },
      );
    }
    // Check if the response output data shape is the same as the the emit type expects
    const parseResp = respEvent[0].schema.safeParse(
      contentForOutgoingEvent.data,
    );
    if (!parseResp.success) {
      throw new CloudEventHandlerError(
        `[CloudEventHandler][cloudevent] Invalid handler repsonse. The response data does not match type=${contentForOutgoingEvent.type.toString()} expected data shape`,
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
      specversion: '1.0',
      to: !this.params.disableRoutingMetadata && toField ? toField : undefined,
      redirectto:
        !this.params.disableRoutingMetadata &&
        contentForOutgoingEvent.redirectto
          ? contentForOutgoingEvent.redirectto
          : undefined,
      type: contentForOutgoingEvent.type.toString(),
      data: {
        ...(contentForOutgoingEvent.data || {}),
      },
      source: contentForOutgoingEvent.source || this.topic,
      subject: contentForOutgoingEvent.subject || incomingEvent.subject || '',
      traceparent: telemetryContext.traceparent,
      tracestate: telemetryContext.tracestate,
      executionunits: executionUnits.toString(),
      elapsedtime: elapsedTime.toString(),
    });
  }

  protected async processCloudevent(
    event: XOrcaCloudEvent,
    openTelemetry: HandlerOpenTelemetryContext,
  ): Promise<XOrcaCloudEvent[]> {
    this.validateCloudEvent(event);
    const matchResp = matchStringTemplate(
      event.type,
      this.params.contract.accepts.type,
    );
    let responses: CloudEventHandlerFunctionOutput<TContract>[] = [];

    const start = performance.now();
    responses = await this.errorHandledHandler({
      type: event.type,
      data: this.params.contract.accepts.schema.parse(event.data || {}),
      params: matchResp.result,
      event,
      source: event.source,
      to: (event.to || undefined) as string | undefined,
      redirectto: (event.redirectto || undefined) as string | undefined,
      openTelemetry: openTelemetry,
    });
    const elapsedTime = performance.now() - start;
    const telemetryContext = parseContext(openTelemetry.span);
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
   * Handles the CloudEvent.
   * @param {XOrcaCloudEvent} event - The CloudEvent to handle.
   * @param {HandlerOpenTelemetryContext} [openTelemetry] - Optional OpenTelemetry context.
   * @returns {Promise<SafeCloudEventResponse[]>} The handling results.
   */
  public async cloudevent(
    event: XOrcaCloudEvent,
    openTelemetry?: HandlerOpenTelemetryContext,
  ): Promise<SafeCloudEventResponse[]> {
    const activeContext = getActiveContext(
      openTelemetry?.context?.traceparent || event.traceparent || null,
    );
    const activeTracer = openTelemetry?.tracer || trace.getTracer(this.topic);
    const activeSpan = activeTracer.startSpan(
      `CloudEventHandler.cloudevent<${this.params.name}>`,
      {
        attributes: {
          ...Object.assign(
            {},
            ...Object.entries(event.openTelemetryAttributes()).map(
              ([key, value]) => ({ [`to_process.${key}`]: value }),
            ),
          ),
          'xorca.span.kind': 'CLOUD_EVENT_HANDLER',
          'openinference.span.kind': "CHAIN",
        },
      },
      activeContext,
    );

    const result = await context.with(
      trace.setSpan(activeContext, activeSpan),
      async () => {
        const telemetryContext = parseContext(activeSpan, activeContext);
        const start = performance.now();
        return await this.processCloudevent(event, {
          tracer: activeTracer,
          span: activeSpan,
          context: parseContext(activeSpan),
        })
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
              message: `${e.message}`,
            });
            activeSpan.setAttributes({
              'exception.type': `[CRITICAL] ${e.name}`,
              'exception.message': e.message,
              'exception.stacktrace': e.stack
            })
            return [
              {
                success: false,
                eventToEmit: new XOrcaCloudEvent({
                  id: uuidv4(),
                  specversion: '1.0',
                  to: !this.params.disableRoutingMetadata ? event.source : null,
                  redirectto: null,
                  source: this.params.name || this.topic,
                  type: `sys.${this.params.name}.error`,
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

    
    result.forEach(({ eventToEmit }, index) => {
      Object.entries(eventToEmit.openTelemetryAttributes()).forEach(([key, value]) =>
        activeSpan.setAttribute(`to_emit.[${index}].${key}`, value),
      );
    });

    const totalExecutionUnits = result.reduce((acc, cur) => {
      try {
        const unit = parseFloat(cur.eventToEmit.executionunits || "0")
        if (isNaN(unit)) {
          return acc
        }
        return acc + unit
      }
      catch {
        return acc
      }
    }, 0)

    activeSpan.setAttribute('xorca.executionunits.total', totalExecutionUnits)
    activeSpan.end();
    return result;
  }

  /**
   * Retrieves the detailed interface of this CloudEventHandler.
   * @returns Detailed configuration of the handler.
   * @public
   */
  public interface() {
    return {
      name: this.topic,
      description: this.params.description,
      accepts: zodToJsonSchema(
        XOrcaCloudEventSchemaGenerator({
          type: this.params.contract.accepts.type,
          source: this.topic,
          data: this.params.contract.accepts.schema,
        }),
      ),
      emits: this.params.contract.emitables.map((item) =>
        zodToJsonSchema(
          XOrcaCloudEventSchemaGenerator({
            type: item.type,
            source: this.topic,
            data: item.schema,
          }),
        ),
      ),
    };
  }

  /**
   * Converts the CloudEventHandler configuration to a dictionary format, facilitating cloning or serialization.
   *
   * @returns An object containing the configuration parameters of this CloudEventHandler instance.
   * @public
   */
  toDict(): ICloudEventHandler<TContract> {
    return { ...this.params };
  }
}
