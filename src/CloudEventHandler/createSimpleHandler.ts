import * as zod from 'zod';
import CloudEventHandler from '.';
import { ICreateSimpleCloudEventHandler } from './types';
import {
  containsDoubleCurlyBraces,
  formatTemplate,
  timedPromise,
} from '../utils';

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
    name: params.name,
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
    }) => {
      const timeoutMs = params.timeoutMs || 10000;
      const start: number = performance.now();
      let result: {
        type:
          | `evt.${TAcceptType}.success`
          | `evt.${TAcceptType}.error`
          | `evt.${TAcceptType}.timeout`
          | `sys.${TAcceptType}.error`;
        data: Record<string, any>;
      }[] = [];
      try {
        await timedPromise(async () => {
          try {
            await logger({
              type: 'START',
              source: `createSimpleHandler<${params.name}>.handler`,
              spanContext,
              input: { type, data },
              startTime: start,
              params: topicParams,
            });
            result.push({
              type: `evt.${formatTemplate(params.accepts.type, topicParams)}.success` as `evt.${TAcceptType}.success`,
              data: await params.handler(data, spanContext, logger),
            });
          } catch (err) {
            const error = err as Error;
            await logger({
              type: 'ERROR',
              source: `createSimpleHandler<${params.name}>.handler`,
              spanContext,
              input: { type, data },
              params: topicParams,
              error,
            });
            result.push({
              type: `evt.${formatTemplate(params.accepts.type, topicParams)}.error` as `evt.${TAcceptType}.error`,
              data: {
                errorName: (error as Error)?.name,
                errorMessage: (error as Error)?.message,
                errorStack: (error as Error)?.stack,
              },
            });
          }
        }, timeoutMs)();
      } catch (err) {
        const error = err as Error;
        await logger({
          type: 'ERROR',
          source: `createSimpleHandler<${params.name}>.handler`,
          spanContext,
          input: { type, data },
          params: topicParams,
          error,
        });
        result.push({
          type: `evt.${formatTemplate(params.accepts.type, topicParams)}.timeout` as `evt.${TAcceptType}.timeout`,
          data: {
            timeout: timeoutMs,
            errorName: (err as Error)?.name,
            errorMessage: (err as Error)?.message,
            errorStack: (err as Error)?.stack,
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
              source: `createSimpleHandler<${params.name}>.handler`,
              spanContext,
              output: item,
            }),
        ),
      );
      await logger?.({
        type: 'END',
        source: `createSimpleHandler<${params.name}>.handler`,
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
