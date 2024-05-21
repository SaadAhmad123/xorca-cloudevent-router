import * as zod from 'zod';
import CloudEventHandler from '.';
import {
  CloudEventHandlerFunctionOutput,
  ICreateSimpleCloudEventHandler,
} from './types';
import { formatTemplate } from '../utils';
import TraceParent from '../Telemetry/traceparent';

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
    logger: params.logger,
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
      spanContext,
      logger,
      isTimedOut,
      timeoutMs
    }) => {
      const start: number = performance.now();
      let result: CloudEventHandlerFunctionOutput<
        | `evt.${TAcceptType}.success`
        | `evt.${TAcceptType}.error`
        | `evt.${TAcceptType}.timeout`
        | `sys.${TAcceptType}.error`
      >[] = [];

      const throwTimeoutError = () => {throw new TimeoutError(`The createSimpleHandler<${params.name || params.accepts.type}>.handler timed out after ${timeoutMs}`)}

      try {
        await logger({
          type: 'START',
          source: `createSimpleHandler<${params.name || params.accepts.type}>.handler`,
          spanContext,
          input: { type, data },
          startTime: start,
          params: topicParams,
        });
        const { __executionunits, ...handlerData } = await params.handler(
          data,
          TraceParent.create.next(spanContext),
          logger,
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
      } catch (err) {
        const error = err as Error;
        let eventType: string = `evt.${formatTemplate(params.accepts.type, topicParams)}.error` as `evt.${TAcceptType}.error`
        if (error.name === "TimeoutError") {
          eventType = `evt.${formatTemplate(params.accepts.type, topicParams)}.timeout` as `evt.${TAcceptType}.timeout`
        }
        await logger({
          type: 'ERROR',
          source: `createSimpleHandler<${params.name || params.accepts.type}>.handler`,
          spanContext,
          input: { type, data },
          params: topicParams,
          error,
        });
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
      const endTime = performance.now();
      await Promise.all(
        result.map(
          async (item) =>
            await logger?.({
              type: 'LOG',
              source: `createSimpleHandler<${params.name || params.accepts.type}>.handler`,
              spanContext,
              output: item,
            }),
        ),
      );
      await logger?.({
        type: 'END',
        source: `createSimpleHandler<${params.name || params.accepts.type}>.handler`,
        spanContext,
        startTime: start,
        endTime,
        duration: endTime - start,
        params: topicParams,
      });
      return result;
    },
  });
}


/**
 * 
 * try {
        await timedPromise(async () => {
          
        }, timeoutMs)();
      } catch (err) {
        const error = err as Error;
        
      }
 */
