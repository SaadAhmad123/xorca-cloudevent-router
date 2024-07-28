import * as zod from 'zod';
import CloudEventHandler from '.';
import {
  CloudEventHandlerFunctionOutput,
  ICreateSimpleCloudEventHandler,
} from './types';
import { formatTemplate } from '../utils';
import { logToSpan } from '../Telemetry';
import { SpanStatusCode } from '@opentelemetry/api';

class TimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TimeoutError';
  }
}

/**
 * Creates a simple CloudEventHandler for asynchronous commands and their corresponding events.
 * @param params - Parameters for configuring the CloudEventHandler.
 * @returns A new CloudEventHandler instance.
 * @example
 * // Example usage of createSimpleHandler
 * const mySimpleHandler = createSimpleHandler({
 *   name: 'MyCommand',
 *   description: 'Handles a simple command and its events',
 *   accepts: zod.object({  ...  }), // Zod schema for command data
 *   emits: zod.object({  ...  }),   // Zod schema for emitted event data
 *   handler: async (data) => {
 *     // Process the command data and return the result
 *     return { ... };
 *   },
 *   timeoutMs: 5000, // Optional timeout in milliseconds
 * });
 *
 * If it is required to dynamically assung
 */
export default function createSimpleHandler<TAcceptType extends string>(
  params: ICreateSimpleCloudEventHandler<TAcceptType>,
) {
  return new CloudEventHandler<
    `cmd.${TAcceptType}`,
    | `evt.${TAcceptType}.success`
    | `evt.${TAcceptType}.error`
    | `evt.${TAcceptType}.timeout`
    | `sys.${TAcceptType}.error`
  >({
    timeoutMs: params.timeoutMs,
    disableRoutingMetadata: params.disableRoutingMetadata,
    executionUnits: params.executionUnits,
    name: params.name || `cmd.${params.accepts.type}`,
    description: params.description,
    accepts: {
      type: `cmd.${params.accepts.type}`,
      description: params.accepts.description,
      zodSchema: params.accepts.zodSchema,
    },
    emits: [
      {
        type: `evt.${params.accepts.type}.success`,
        zodSchema: params.emits,
      },
      {
        type: `evt.${params.accepts.type}.error`,
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
        }),
      },
      {
        type: `evt.${params.accepts.type}.timeout`,
        zodSchema: zod.object({
          timeout: zod
            .number()
            .describe('The timeout in milliseconds which the handler exceeded'),
          errorName: zod.string().optional().describe('The name of the error'),
          errorMessage: zod
            .string()
            .optional()
            .describe('The message of the error'),
          errorStack: zod
            .string()
            .optional()
            .describe('The stack of the error'),
          eventData: zod.any().optional().describe('The input to the handler'),
        }),
      },
    ],
    handler: async ({
      type,
      data,
      params: topicParams,
      openTelemetry,
      isTimedOut,
      timeoutMs
    }) => {
      const throwTimeoutError = () => { throw new TimeoutError(`The createSimpleHandler<${params.name || params.accepts.type}>.handler timed out after ${timeoutMs}`) }

      return await openTelemetry.tracer.startActiveSpan(`createSimpleHandler<${params.name || params.accepts.type}>.handler`, async (span) => {
        let result: CloudEventHandlerFunctionOutput<
          | `evt.${TAcceptType}.success`
          | `evt.${TAcceptType}.error`
          | `evt.${TAcceptType}.timeout`
          | `sys.${TAcceptType}.error`
        >[] = [];
        const start = performance.now()
        try {
          const { __executionunits, ...handlerData } = await params.handler(
            data,
            {
              span: span,
              tracer: openTelemetry.tracer
            },
            {
              startMs: start,
              timeoutMs,
              isTimedOut,
              throwTimeoutError,
              throwOnTimeoutError: () => {
                if (!isTimedOut()) return
                throwTimeoutError()
              },
            }
          );
          result.push({
            type: `evt.${formatTemplate(params.accepts.type, topicParams)}.success` as `evt.${TAcceptType}.success`,
            data: handlerData,
            executionunits: __executionunits,
          });
          span.setStatus({
            code: SpanStatusCode.OK
          })
        }
        catch (err) {
          const error = err as Error;
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: error.message
          })
          logToSpan(span, {
            level: "ERROR",
            message: error.message,
          })
          let eventType: string = `evt.${formatTemplate(params.accepts.type, topicParams)}.error` as `evt.${TAcceptType}.error`
          if (error.name === "TimeoutError") {
            eventType = `evt.${formatTemplate(params.accepts.type, topicParams)}.timeout` as `evt.${TAcceptType}.timeout`
          }
          result.push({
            type: eventType as any,
            data: {
              timeout: timeoutMs,
              errorName: error.name,
              errorMessage: error.message,
              errorStack: error.stack,
              eventData: { type, data },
            },
          });
        }
        span.end()
        return result
      })
    },
  });
}