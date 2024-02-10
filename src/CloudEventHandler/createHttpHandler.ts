import { formatTemplate } from '../utils';
import createSimpleHandler from './createSimpleHandler';
import { ICreateHttpCloudEventHandler } from './types';
import * as zod from 'zod';

/**
 * Creates an HTTP CloudEventHandler for handling HTTP requests and responses.
 * @template TName - The name type for the CloudEventHandler.
 * @param {ICreateHttpCloudEventHandler<TName>} params - Parameters for configuring the HTTP CloudEventHandler.
 * @returns A new CloudEventHandler instance for HTTP requests.
 * @example
 * // Example usage of createHttpHandler
 * const myHttpHandler = createHttpHandler({
 *   name: 'ntk.{{resource}}',
 *   description: 'Handles an HTTP request and its response',
 *   variables: {
 *     apiKey: { value: 'my-api-key', secret: true },
 *   },
 *   timeoutMs: 5000, // Optional timeout in milliseconds
 * });
 */
export default function createHttpHandler<TName extends string>({
  name,
  description = 'A http request handler',
  variables = {},
  timeoutMs = 10000,
}: ICreateHttpCloudEventHandler<TName>) {
  const templateVariables = Object.assign(
    {},
    ...Object.entries(variables).map(([key, value]) => ({
      [key]: value.value,
    })),
  );
  const secretValues = Object.values(variables)
    .filter((item) => Boolean(item.secret))
    .map((item) => item.value);
  return createSimpleHandler<TName>({
    name,
    description,
    timeoutMs,
    accepts: zod.object({
      method: zod
        .enum([
          'GET',
          'POST',
          'PUT',
          'DELETE',
          'PATCH',
          'OPTIONS',
          'HEAD',
          'CONNECT',
          'TRACE',
        ])
        .describe('All HTTP methods'),
      url: zod.string().describe('The request URL'),
      headers: zod
        .record(zod.string(), zod.string())
        .optional()
        .describe(
          'Request headers. By default the headers sent will be "content-type":"application/json"',
        ),
      body: zod
        .string()
        .optional()
        .describe(
          'The request body in utf-8 string format. In case of "GET" this will be ignored. Pass the query parameters in the url string itself',
        ),
    }),
    emits: zod.object({
      statusCode: zod.number().describe('The response status code'),
      statusText: zod
        .string()
        .optional()
        .describe('The response status description'),
      headers: zod
        .record(zod.string(), zod.any())
        .optional()
        .describe('Response headers.'),
      text: zod
        .string()
        .optional()
        .describe('The response in utf-8 string format'),
    }),
    handler: async (data) => {
      const formattedHeaders = Object.assign(
        {},
        ...Object.entries((data.headers || {}) as Record<string, string>).map(
          ([key, value]) => ({
            [key]: formatTemplate(value, templateVariables),
          }),
        ),
      );

      const resp = await fetch(data.url as string, {
        method: data.method,
        headers: {
          'content-type': 'application/json',
          ...formattedHeaders,
        },
        body:
          data.body && data.method !== 'GET'
            ? formatTemplate(data.body, templateVariables)
            : undefined,
      });
      const secureHeaders = Object.assign(
        {},
        ...Object.entries(resp.headers).map(([key, value]) => ({
          [key]: secretValues.includes(value?.toString())
            ? '-- SECRET --'
            : value,
        })),
      );
      return {
        statusCode: resp.status,
        statusText: resp.statusText,
        headers: secureHeaders,
        text: await resp.text(),
      };
    },
  });
}
