import * as zod from 'zod';
import CloudEventHandler from '.';
import { ICreateAyncCloudEventHandler } from './types';
import { timedPromise } from '../utils';


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
  params: ICreateAyncCloudEventHandler<TName>,
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
    handler: async ({ type, data }) => {
      const timeoutMs = params.timeoutMs || 10000;
      try {
        return await timedPromise(async () => {
          try {
            return {
              type: `evt.${params.name}.success` as `evt.${TName}.success`,
              data: await params.handler(data),
            };
          } catch (error) {
            return {
              type: `evt.${params.name}.error` as `evt.${TName}.error`,
              data: {
                errorName: (error as Error)?.name,
                errorMessage: (error as Error)?.message,
                errorStack: (error as Error)?.stack,
              },
            };
          }
        }, timeoutMs)();
      } catch (err) {
        return {
          type: `evt.${params.name}.timeout` as `evt.${TName}.timeout`,
          data: {
            timeout: timeoutMs,
            errorName: (err as Error)?.name,
            errorMessage: (err as Error)?.message,
            errorStack: (err as Error)?.stack,
            eventData: { type, data },
          },
        };
      }
    },
  });
}