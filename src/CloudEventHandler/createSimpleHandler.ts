import CloudEventHandler from '.';
import {
  CloudEventHandlerFunctionOutput,
  ICreateSimpleCloudEventHandler,
} from './types';
import { formatTemplate } from '../utils';
import { getActiveContext, logToSpan, parseContext } from '../Telemetry';
import { SpanStatusCode } from '@opentelemetry/api';
import { context, trace } from '@opentelemetry/api';
import { XOrcaSimpleContract } from 'xorca-contract';

/**
 * Creates a simple CloudEventHandler for handling cloud events.
 *
 * @template TContract - The type of the XOrcaSimpleContract.
 * @param {ICreateSimpleCloudEventHandler<TContract>} params - The parameters for creating the handler.
 * @returns {CloudEventHandler} A new CloudEventHandler instance.
 */
export default function createSimpleHandler<
  TContract extends XOrcaSimpleContract<any, any, any>,
>(params: ICreateSimpleCloudEventHandler<TContract>) {
  const contractParams = params.contract.parameters;

  return new CloudEventHandler({
    disableRoutingMetadata: params.disableRoutingMetadata,
    executionUnits: params.executionUnits,
    description: params.description,
    contract: params.contract,
    handler: async ({ data, params: topicParams, openTelemetry }) => {
      const activeContext = getActiveContext(openTelemetry.context.traceparent);
      const activeSpan = openTelemetry.tracer.startSpan(
        `createSimpleHandler<${contractParams.type}>.handler`,
        {
          attributes: {
            'xorca.span.kind': 'SIMPLE_HANDLER',
            'openinference.span.kind': "CHAIN",
          },
        },
        activeContext,
      );

      const result = await context.with(
        trace.setSpan(activeContext, activeSpan),
        async () => {
          {
            let result: CloudEventHandlerFunctionOutput<
              typeof params.contract
            >[] = [];
            try {
              const { __executionunits, ...handlerData } = await params.handler(
                data,
                {
                  span: activeSpan,
                  tracer: openTelemetry.tracer,
                  context: parseContext(activeSpan),
                },
              );
              result.push({
                type: `evt.${formatTemplate(contractParams.type, topicParams)}.success` as any,
                data: handlerData as any,
                executionunits: __executionunits,
              });
              activeSpan.setStatus({
                code: SpanStatusCode.OK,
              });
            } catch (err) {
              const error = err as Error;
              activeSpan.setStatus({
                code: SpanStatusCode.ERROR,
                message: error.message,
              });
              logToSpan(activeSpan, {
                level: 'ERROR',
                message: error.message,
              });
              let eventType: string =
                `evt.${formatTemplate(contractParams.type, topicParams)}.error` as any;
              if (error.name === 'TimeoutError') {
                eventType =
                  `evt.${formatTemplate(contractParams.type, topicParams)}.timeout` as any;
              }
              result.push({
                type: eventType as any,
                data: {
                  errorName: error.name,
                  errorMessage: error.message,
                  errorStack: error.stack,
                } as any,
              });
            }
            return result;
          }
        },
      );
      activeSpan.end();
      return result;
    },
  });
}
