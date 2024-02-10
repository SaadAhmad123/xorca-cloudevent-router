import * as zod from 'zod';
import CloudEventHandler from '.';
import { CloudEvent } from 'cloudevents';

describe('CloudEventHandler Spec', () => {
  const params = {
    name: '{{resource}}.fetch',
    description: 'It fetches the weather data from opensource',
    accepts: {
      type: 'cmd.{{resource}}.fetch',
      zodSchema: zod.object({
        date: zod.date(),
      }),
    },
    emits: [
      {
        type: 'evt.weather.fetch.success',
        zodSchema: zod.object({
          status: zod.number(),
          weather: zod.object({
            temperature: zod.number(),
            unit: zod.string(),
          }),
        }),
      },
      {
        type: 'evt.weather.fetch.error',
        zodSchema: zod.object({
          status: zod.number(),
          error: zod.string(),
        }),
      },
    ],
    handler: async (event: any) => {
      return {
        type: 'evt.weather.fetch.success',
        data: {
          status: 200,
          weather: {
            temperature: 34,
            unit: 'C',
          },
        },
      };
    },
  };

  it('Should throw error if the invalid event type is provided', async () => {
    const handler = new CloudEventHandler(params);
    expect(handler.topic).toBe('cmd.{{resource}}.fetch');

    let error: Error | undefined;
    try {
      new CloudEventHandler({ ...params, name: 'saad   ahmad' });
    } catch (e) {
      error = e as Error;
    }

    expect(error?.message).toBe(
      "[CloudEventHandler][constructor] The 'name' must not contain any spaces or special characters but the provided is saad   ahmad",
    );

    let resp = await handler.safeCloudevent(
      new CloudEvent({
        source: '/test/saad',
        type: 'evt.handler',
      }),
    );
    expect(resp.success).toBe(false);
    expect(resp.error?.message).toBe(
      '[CloudEventHandler][cloudevent] The subject MUST be provided.',
    );
    expect(resp.eventToEmit.type).toBe('sys.{{resource}}.fetch.error');

    resp = await handler.safeCloudevent(
      new CloudEvent({
        source: '/test/saad',
        type: 'evt.handler',
        subject: 'some',
      }),
    );
    expect(resp.success).toBe(false);
    expect(resp.error?.message).toBe(
      '[CloudEventHandler][cloudevent] The data MUST be provided.',
    );
    expect(resp.eventToEmit.type).toBe('sys.{{resource}}.fetch.error');

    resp = await handler.safeCloudevent(
      new CloudEvent({
        source: '/test/saad',
        type: 'evt.handler',
        subject: 'some',
        data: {},
      }),
    );
    expect(resp.success).toBe(false);
    expect(resp.error?.message).toBe(
      '[CloudEventHandler][cloudevent] The datacontenttype MUST be provided.',
    );
    expect(resp.eventToEmit.type).toBe('sys.{{resource}}.fetch.error');

    resp = await handler.safeCloudevent(
      new CloudEvent({
        source: '/test/saad',
        type: 'evt.handler',
        subject: 'some',
        data: {},
        datacontenttype: 'application',
      }),
    );
    expect(resp.success).toBe(false);
    expect(resp.error?.message).toBe(
      "[CloudEventHandler][cloudevent] The event 'datacontenttype' MUST be 'application/json' but the provided is application",
    );
    expect(resp.eventToEmit.type).toBe('sys.{{resource}}.fetch.error');

    resp = await handler.safeCloudevent(
      new CloudEvent({
        source: '/test/saad',
        type: 'evt.handler',
        subject: 'some',
        data: {},
        datacontenttype: 'application/json',
      }),
    );
    expect(resp.success).toBe(false);
    expect(resp.error?.message).toBe(
      '[CloudEventHandler][cloudevent] The handler only accepts type=cmd.{{resource}}.fetch but the provided is evt.handler.',
    );
    expect(resp.eventToEmit.type).toBe('sys.{{resource}}.fetch.error');

    resp = await handler.safeCloudevent(
      new CloudEvent({
        source: '/test/saad',
        type: 'cmd.weather.fetch',
        subject: 'some',
        data: {},
        datacontenttype: 'application/json',
      }),
    );

    expect(resp.success).toBe(false);
    expect(resp.error?.message).toBe(
      '[CloudEventHandler][cloudevent] Invalid handler input data. The response data does not match type=cmd.{{resource}}.fetch expected data shape',
    );
    expect(resp.eventToEmit.type).toBe('sys.{{resource}}.fetch.error');

    resp = await handler.safeCloudevent(
      new CloudEvent({
        source: '/test/saad',
        type: 'cmd.weather.fetch',
        subject: 'some',
        data: {
          date: new Date(),
        },
        datacontenttype: 'application/json',
      }),
    );

    expect(resp.success).toBe(true);
    expect(resp.eventToEmit.type).toBe('evt.weather.fetch.success');
  });

  it('Should throw an error if handler returns invalid data', async () => {
    const evt = new CloudEvent({
      source: '/test/saad',
      type: 'cmd.weather.fetch',
      subject: 'some',
      data: {
        date: new Date(),
      },
      datacontenttype: 'application/json',
    });

    let handler = new CloudEventHandler({
      ...params,
      handler: async ({ data }) => ({
        type: 'evt.weather.fetch',
        data: {},
      }),
    });
    let resp = await handler.safeCloudevent(evt);
    expect(resp.success).toBe(false);
    expect(resp.error?.message).toBe(
      "[CloudEventHandler][cloudevent] Invalid handler repsonse. The response type=evt.weather.fetch does not match any of the provided in 'emits'",
    );
    expect(resp.eventToEmit.type).toBe('sys.{{resource}}.fetch.error');

    handler = new CloudEventHandler({
      ...params,
      handler: async ({ data }) => ({
        type: 'evt.weather.fetch.success',
        data: {},
      }),
    });
    resp = await handler.safeCloudevent(evt);
    expect(resp.success).toBe(false);
    expect(resp.error?.message).toBe(
      '[CloudEventHandler][cloudevent] Invalid handler repsonse. The response data does not match type=evt.weather.fetch.success expected data shape',
    );
    expect(resp.eventToEmit.type).toBe('sys.{{resource}}.fetch.error');

    handler = new CloudEventHandler({
      ...params,
      handler: async ({ data }) => ({
        type: 'evt.weather.fetch.success',
        data: {
          status: 200,
          weather: {
            temperature: 34,
            unit: 'C',
          },
        },
      }),
    });
    resp = await handler.safeCloudevent(evt);
    expect(resp.success).toBe(true);
    expect(resp.eventToEmit.type).toBe('evt.weather.fetch.success');
    expect(resp.eventToEmit.data?.status).toBe(200);
    expect(resp.eventToEmit.data?.weather?.temperature).toBe(34);
    expect(resp.eventToEmit.data?.weather?.unit).toBe('C');

    handler = new CloudEventHandler({
      ...params,
      handler: async ({ data }) => {
        throw new Error('some error');
      },
    });
    resp = await handler.safeCloudevent(evt);
    expect(resp.success).toBe(false);
    expect(resp.error?.message).toBe(
      '[CloudEventHandler][cloudevent][handler] Handler errored (message=some error)',
    );
    expect(resp.eventToEmit.type).toBe('sys.{{resource}}.fetch.error');
  });

  it('should return a interface with input and output schemas', () => {
    const expectedSchema = {
      name: '{{resource}}.fetch',
      description: 'It fetches the weather data from opensource',
      accepts: {
        type: 'object',
        properties: {
          subject: {
            type: 'string',
            description: 'The subject of the event',
          },
          type: {
            type: 'string',
            const: 'cmd.{{resource}}.fetch',
            description: 'The topic of the event',
          },
          source: {
            type: 'string',
            const: '%7B%7Bresource%7D%7D.fetch',
            description: 'The source of the event',
          },
          data: {
            type: 'object',
            properties: {
              date: {
                type: 'string',
                format: 'date-time',
              },
            },
            required: ['date'],
            additionalProperties: false,
          },
          datacontenttype: {
            type: 'string',
            const: 'application/json',
            description:
              "Must be either 'application/json' or 'application/json; charset=utf-8'",
          },
        },
        required: ['subject', 'type', 'source', 'data', 'datacontenttype'],
        additionalProperties: false,
        description: 'The event which can be accepted by this handler',
        $schema: 'http://json-schema.org/draft-07/schema#',
      },
      emits: [
        {
          type: 'object',
          properties: {
            subject: {
              type: 'string',
              description: 'The subject of the event',
            },
            type: {
              type: 'string',
              const: 'evt.weather.fetch.success',
              description: 'The topic of the event',
            },
            source: {
              type: 'string',
              const: '%7B%7Bresource%7D%7D.fetch',
              description: 'The source of the event',
            },
            data: {
              type: 'object',
              properties: {
                status: {
                  type: 'number',
                },
                weather: {
                  type: 'object',
                  properties: {
                    temperature: {
                      type: 'number',
                    },
                    unit: {
                      type: 'string',
                    },
                  },
                  required: ['temperature', 'unit'],
                  additionalProperties: false,
                },
              },
              required: ['status', 'weather'],
              additionalProperties: false,
            },
            datacontenttype: {
              type: 'string',
              const: 'application/json',
              description:
                "Must be either 'application/json' or 'application/json; charset=utf-8'",
            },
          },
          required: ['subject', 'type', 'source', 'data', 'datacontenttype'],
          additionalProperties: false,
          description: 'The event which can be accepted by this handler',
          $schema: 'http://json-schema.org/draft-07/schema#',
        },
        {
          type: 'object',
          properties: {
            subject: {
              type: 'string',
              description: 'The subject of the event',
            },
            type: {
              type: 'string',
              const: 'evt.weather.fetch.error',
              description: 'The topic of the event',
            },
            source: {
              type: 'string',
              const: '%7B%7Bresource%7D%7D.fetch',
              description: 'The source of the event',
            },
            data: {
              type: 'object',
              properties: {
                status: {
                  type: 'number',
                },
                error: {
                  type: 'string',
                },
              },
              required: ['status', 'error'],
              additionalProperties: false,
            },
            datacontenttype: {
              type: 'string',
              const: 'application/json',
              description:
                "Must be either 'application/json' or 'application/json; charset=utf-8'",
            },
          },
          required: ['subject', 'type', 'source', 'data', 'datacontenttype'],
          additionalProperties: false,
          description: 'The event which can be accepted by this handler',
          $schema: 'http://json-schema.org/draft-07/schema#',
        },
        {
          type: 'object',
          properties: {
            subject: {
              type: 'string',
              description: 'The subject of the event',
            },
            type: {
              type: 'string',
              const: 'sys.{{resource}}.fetch.error',
              description: 'The topic of the event',
            },
            source: {
              type: 'string',
              const: '%7B%7Bresource%7D%7D.fetch',
              description: 'The source of the event',
            },
            data: {
              type: 'object',
              properties: {
                errorName: {
                  type: 'string',
                  description: 'The name of the error',
                },
                errorMessage: {
                  type: 'string',
                  description: 'The message of the error',
                },
                errorStack: {
                  type: 'string',
                  description: 'The stack of the error',
                },
                event: {
                  type: 'string',
                  description: 'The event which caused the error',
                },
                additional: {
                  description: 'The error additional error data',
                },
              },
              required: ['event'],
              additionalProperties: false,
            },
            datacontenttype: {
              type: 'string',
              const: 'application/json',
              description:
                "Must be either 'application/json' or 'application/json; charset=utf-8'",
            },
          },
          required: ['subject', 'type', 'source', 'data', 'datacontenttype'],
          additionalProperties: false,
          description:
            "Event raised when error happens while using 'safeCloudevent' method",
          $schema: 'http://json-schema.org/draft-07/schema#',
        },
      ],
    };

    const handler = new CloudEventHandler(params);
    expect(JSON.stringify(handler.getInterface())).toBe(
      JSON.stringify(expectedSchema),
    );
  });
});
