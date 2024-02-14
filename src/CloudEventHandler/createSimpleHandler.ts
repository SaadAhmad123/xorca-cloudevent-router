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
export default function createSimpleHandler<TName extends string>(
  params: ICreateSimpleCloudEventHandler<TName>,
) {
  return new CloudEventHandler<
    `cmd.${TName}`,
    | `evt.${TName}.success`
    | `evt.${TName}.error`
    | `evt.${TName}.timeout`
    | `sys.${TName}.error`
  >({
    name: params.name,
    description: params.description,
    accepts: {
      type: `cmd.${params.name}`,
      zodSchema: params.accepts,
    },
    emits: [
      {
        type: `evt.${params.name}.success`,
        zodSchema: params.emits,
      },
      {
        type: `evt.${params.name}.error`,
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
        type: `evt.${params.name}.timeout`,
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
    handler: async ({ type, data, params: topicParams, spanContext }) => {
      const timeoutMs = params.timeoutMs || 10000;
      const start: number = performance.now()
      let result: any;
      let error: Error | undefined = undefined;
      try {
        await timedPromise(async () => {
          try {
            result = {
              type: `evt.${formatTemplate(params.name, topicParams)}.success` as `evt.${TName}.success`,
              data: await params.handler(data, spanContext),
            };
          } catch (err) {
            error = err as Error;
            result = {
              type: `evt.${formatTemplate(params.name, topicParams)}.error` as `evt.${TName}.error`,
              data: {
                errorName: (error as Error)?.name,
                errorMessage: (error as Error)?.message,
                errorStack: (error as Error)?.stack,
              },
            };
          }
        }, timeoutMs)();
      } catch (err) {
        error = err as Error;
        result = {
          type: `evt.${formatTemplate(params.name, topicParams)}.timeout` as `evt.${TName}.timeout`,
          data: {
            timeout: timeoutMs,
            errorName: (err as Error)?.name,
            errorMessage: (err as Error)?.message,
            errorStack: (err as Error)?.stack,
            eventData: { type, data },
          },
        };
      }
      try {
        await params.logger?.({
          spanContext,
          input: { type, data },
          output: { type, data },
          duration: performance.now() - start,
          params: topicParams,
          error,
        });
      } catch (e) {
        console.error(e);
      }
      return result;
    },
  });
}
