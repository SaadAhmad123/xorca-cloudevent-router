import * as zod from 'zod';
import CloudEventHandler from '../src/CloudEventHandler';
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
    handler: async (event: any) => [
      {
        type: 'evt.weather.fetch.success',
        data: {
          status: 200,
          weather: {
            temperature: 34,
            unit: 'C',
          },
        },
      },
    ],
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

    let resp = (
      await handler.safeCloudevent(
        new CloudEvent({
          source: '/test/saad',
          type: 'evt.handler',
        }),
      )
    )[0];
    expect(resp.success).toBe(false);
    expect(resp.eventToEmit.type).toBe('sys.cmd.{{resource}}.fetch.error');
    expect(resp.eventToEmit.to).toBe('/test/saad');

    resp = (
      await handler.safeCloudevent(
        new CloudEvent({
          source: '/test/saad',
          redirectto: '/test/saad/1',
          type: 'evt.handler',
          subject: 'some',
        }),
      )
    )[0];
    expect(resp.success).toBe(false);
    expect(resp.eventToEmit.type).toBe('sys.cmd.{{resource}}.fetch.error');
    expect(resp.eventToEmit.to).toBe('/test/saad');

    resp = (
      await handler.safeCloudevent(
        new CloudEvent({
          source: '/test/saad',
          type: 'evt.handler',
          subject: 'some',
          data: {},
        }),
      )
    )[0];
    expect(resp.success).toBe(false);
    expect(resp.eventToEmit?.data?.errorMessage).toBe(
      '[CloudEventHandler][cloudevent] The datacontenttype MUST be provided.',
    );
    expect(resp.eventToEmit.type).toBe('sys.cmd.{{resource}}.fetch.error');

    resp = (
      await handler.safeCloudevent(
        new CloudEvent({
          source: '/test/saad',
          type: 'evt.handler',
          subject: 'some',
          data: {},
          datacontenttype: 'application',
        }),
      )
    )[0];
    expect(resp.success).toBe(false);
    expect(resp.eventToEmit?.data?.errorMessage).toBe(
      "[CloudEventHandler][cloudevent] The event 'datacontenttype' MUST be 'application/cloudevents+json; charset=UTF-8' but the provided is application",
    );
    expect(resp.eventToEmit.type).toBe('sys.cmd.{{resource}}.fetch.error');

    resp = (
      await handler.safeCloudevent(
        new CloudEvent({
          source: '/test/saad',
          type: 'evt.handler',
          subject: 'some',
          data: {},
          datacontenttype: 'application/cloudevents+json; charset=UTF-8',
        }),
      )
    )[0];
    expect(resp.success).toBe(false);
    expect(resp.eventToEmit?.data?.errorMessage).toBe(
      '[CloudEventHandler][cloudevent] The handler only accepts type=cmd.{{resource}}.fetch but the provided is evt.handler.',
    );
    expect(resp.eventToEmit.type).toBe('sys.cmd.{{resource}}.fetch.error');

    resp = (
      await handler.safeCloudevent(
        new CloudEvent({
          source: '/test/saad',
          type: 'cmd.weather.fetch',
          subject: 'some',
          data: {},
          datacontenttype: 'application/cloudevents+json; charset=UTF-8',
        }),
      )
    )[0];

    expect(resp.success).toBe(false);
    expect(resp.eventToEmit?.data?.errorMessage).toBe(
      '[CloudEventHandler][cloudevent] Invalid handler input data. The response data does not match type=cmd.{{resource}}.fetch expected data shape',
    );
    expect(resp.eventToEmit.type).toBe('sys.cmd.{{resource}}.fetch.error');

    resp = (
      await handler.safeCloudevent(
        new CloudEvent({
          source: '/test/saad',
          type: 'cmd.weather.fetch',
          subject: 'some',
          data: {
            date: new Date(),
          },
          datacontenttype: 'application/cloudevents+json; charset=UTF-8',
        }),
      )
    )[0];

    expect(resp.success).toBe(true);
    expect(resp.eventToEmit.type).toBe('evt.weather.fetch.success');
    expect(resp.eventToEmit.to).toBe('/test/saad');
  });

  it('Should throw an error if handler returns invalid data', async () => {
    const evt = new CloudEvent({
      source: '/test/saad',
      type: 'cmd.weather.fetch',
      subject: 'some',
      data: {
        date: new Date(),
      },
      datacontenttype: 'application/cloudevents+json; charset=UTF-8',
      redirectto: '/test/saad/1',
    });

    let handler = new CloudEventHandler({
      ...params,
      handler: async ({ data }) => [
        {
          type: 'evt.weather.fetch',
          data: {},
        },
      ],
    });
    let resp = (await handler.safeCloudevent(evt))[0];
    expect(resp.success).toBe(false);
    expect(resp.eventToEmit?.data?.errorMessage).toBe(
      "[CloudEventHandler][cloudevent] Invalid handler repsonse. The response type=evt.weather.fetch does not match any of the provided in 'emits'",
    );
    expect(resp.eventToEmit.type).toBe('sys.cmd.{{resource}}.fetch.error');
    expect(resp.eventToEmit.to).toBe('/test/saad');

    handler = new CloudEventHandler({
      ...params,
      handler: async ({ data }) => [
        {
          type: 'evt.weather.fetch.success',
          data: {},
        },
      ],
    });
    resp = (await handler.safeCloudevent(evt))[0];
    expect(resp.success).toBe(false);
    expect(resp.eventToEmit?.data?.errorMessage).toBe(
      '[CloudEventHandler][cloudevent] Invalid handler repsonse. The response data does not match type=evt.weather.fetch.success expected data shape',
    );
    expect(resp.eventToEmit.type).toBe('sys.cmd.{{resource}}.fetch.error');

    handler = new CloudEventHandler({
      ...params,
      handler: async ({ data }) => [
        {
          type: 'evt.weather.fetch.success',
          data: {
            status: 200,
            weather: {
              temperature: 34,
              unit: 'C',
            },
          },
        },
      ],
    });
    resp = (await handler.safeCloudevent(evt))[0];
    expect(resp.success).toBe(true);
    expect(resp.eventToEmit.type).toBe('evt.weather.fetch.success');
    expect(resp.eventToEmit.data?.status).toBe(200);
    expect(resp.eventToEmit.data?.weather?.temperature).toBe(34);
    expect(resp.eventToEmit.data?.weather?.unit).toBe('C');
    expect(resp.eventToEmit.to).toBe('/test/saad/1');

    handler = new CloudEventHandler({
      ...params,
      handler: async ({ data }) => {
        throw new Error('some error');
      },
    });
    resp = (await handler.safeCloudevent(evt))[0];
    expect(resp.success).toBe(false);
    expect(resp.eventToEmit?.data?.errorMessage).toBe(
      '[CloudEventHandler][cloudevent][handler] Handler errored (message=some error)',
    );
    expect(resp.eventToEmit.type).toBe('sys.cmd.{{resource}}.fetch.error');
  });

  it('should return a interface with input and output schemas', () => {
    const expectedSchema = {
      name: '{{resource}}.fetch',
      description: 'It fetches the weather data from opensource',
      accepts: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'A UUID of this event',
          },
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
            const: 'cmd.%7B%7Bresource%7D%7D.fetch',
            description:
              'The source of the event. It may be in rare cases overriden to due to the handler function behavior. This is not recommended in most cases.',
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
            const: 'application/cloudevents+json; charset=UTF-8',
            description:
              "Must be either 'application/cloudevents+json; charset=UTF-8'",
          },
          traceparent: {
            type: 'string',
            pattern: '^[\\da-f]{2}-[\\da-f]{32}-[\\da-f]{16}-[\\da-f]{2}$',
            description:
              'The traceparent header represents the incoming request in a tracing system in a common format.See the W3C spec for the definition as per [CloudEvents Distributed Tracing Specification](https://github.com/cloudevents/spec/blob/main/cloudevents/extensions/distributed-tracing.md).',
          },
          tracestate: {
            type: 'string',
            description:
              'Additional tracing info as per the [spec](https://www.w3.org/TR/trace-context/#tracestate-header)',
          },
          to: {
            type: 'string',
            description:
              "\n**URI reference so encoded via encodeURI**\nSpecifies the intended initial recipient(s) or destination topic(s) for the event.\nThis field acts as metadata to assist in the event routing process, indicating where\nthe event should be initially directed. While optional, specifying this field can\nsignificantly enhance routing precision and efficiency within event brokers or middleware,\nguiding the event toward the appropriate service or component for initial processing. It is\nespecially useful in complex distributed systems where events may be handled by multiple\nservices or in multi-step workflows.\n\nThe logic for determining its value here is as follows:\n- For successful events, the system first looks for a value specified in the handler's return (Return<handler>.to). If not provided, it then considers the incomingEvent.redirectTo field, which indicates where the event should be directed after initial processing. If this is also absent, it falls back to the incomingEvent.source, essentially directing the event back to its originator. If none of these fields provide a directive, the to field is set to null, indicating no specific routing is required.\n- For error events, the to field is explicitly set to the event's source (incomingEvent.source). This ensures that error notifications are directed back to the event producer or the system component responsible for the event, allowing for the acknowledgment of the error and potential corrective actions.\n",
          },
          redirectTo: {
            type: 'string',
            description:
              '\n**URI reference so encoded via encodeURI**\nIndicates an alternative or subsequent recipient(s) or destination topic(s) for the event,\nsuggesting where the event should be forwarded after initial processing. Like the "to" field,\n"redirectTo" is metadata that can be leveraged to dynamically alter the event\'s routing path,\nfacilitating complex workflows or multi-stage processing scenarios. It allows for the decoupling\nof event production from consumption, enabling flexible, dynamic routing without requiring the\nevent producer to be aware of the full processing pipeline.\n\nThe logic for determining its value here is as follows:\n- For successful events, the redirectTo value is taken directly from Return<handler>.redirectTo. This allows event handlers to dynamically alter the event\'s routing path based on processing outcomes, facilitating complex workflows or conditional processing scenarios.\n- For error events, the redirectTo field is set to null. This decision is made to halt further automatic redirection of error notifications, ensuring that error events are not inadvertently routed through the system but are instead directed to a specific handler or service for error handling and logging.\n',
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
            id: {
              type: 'string',
              description: 'A UUID of this event',
            },
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
              const: 'cmd.%7B%7Bresource%7D%7D.fetch',
              description:
                'The source of the event. It may be in rare cases overriden to due to the handler function behavior. This is not recommended in most cases.',
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
              const: 'application/cloudevents+json; charset=UTF-8',
              description:
                "Must be either 'application/cloudevents+json; charset=UTF-8'",
            },
            traceparent: {
              type: 'string',
              pattern: '^[\\da-f]{2}-[\\da-f]{32}-[\\da-f]{16}-[\\da-f]{2}$',
              description:
                'The traceparent header represents the incoming request in a tracing system in a common format.See the W3C spec for the definition as per [CloudEvents Distributed Tracing Specification](https://github.com/cloudevents/spec/blob/main/cloudevents/extensions/distributed-tracing.md).',
            },
            tracestate: {
              type: 'string',
              description:
                'Additional tracing info as per the [spec](https://www.w3.org/TR/trace-context/#tracestate-header)',
            },
            to: {
              type: 'string',
              description:
                "\n**URI reference so encoded via encodeURI**\nSpecifies the intended initial recipient(s) or destination topic(s) for the event.\nThis field acts as metadata to assist in the event routing process, indicating where\nthe event should be initially directed. While optional, specifying this field can\nsignificantly enhance routing precision and efficiency within event brokers or middleware,\nguiding the event toward the appropriate service or component for initial processing. It is\nespecially useful in complex distributed systems where events may be handled by multiple\nservices or in multi-step workflows.\n\nThe logic for determining its value here is as follows:\n- For successful events, the system first looks for a value specified in the handler's return (Return<handler>.to). If not provided, it then considers the incomingEvent.redirectTo field, which indicates where the event should be directed after initial processing. If this is also absent, it falls back to the incomingEvent.source, essentially directing the event back to its originator. If none of these fields provide a directive, the to field is set to null, indicating no specific routing is required.\n- For error events, the to field is explicitly set to the event's source (incomingEvent.source). This ensures that error notifications are directed back to the event producer or the system component responsible for the event, allowing for the acknowledgment of the error and potential corrective actions.\n",
            },
            redirectTo: {
              type: 'string',
              description:
                '\n**URI reference so encoded via encodeURI**\nIndicates an alternative or subsequent recipient(s) or destination topic(s) for the event,\nsuggesting where the event should be forwarded after initial processing. Like the "to" field,\n"redirectTo" is metadata that can be leveraged to dynamically alter the event\'s routing path,\nfacilitating complex workflows or multi-stage processing scenarios. It allows for the decoupling\nof event production from consumption, enabling flexible, dynamic routing without requiring the\nevent producer to be aware of the full processing pipeline.\n\nThe logic for determining its value here is as follows:\n- For successful events, the redirectTo value is taken directly from Return<handler>.redirectTo. This allows event handlers to dynamically alter the event\'s routing path based on processing outcomes, facilitating complex workflows or conditional processing scenarios.\n- For error events, the redirectTo field is set to null. This decision is made to halt further automatic redirection of error notifications, ensuring that error events are not inadvertently routed through the system but are instead directed to a specific handler or service for error handling and logging.\n',
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
            id: {
              type: 'string',
              description: 'A UUID of this event',
            },
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
              const: 'cmd.%7B%7Bresource%7D%7D.fetch',
              description:
                'The source of the event. It may be in rare cases overriden to due to the handler function behavior. This is not recommended in most cases.',
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
              const: 'application/cloudevents+json; charset=UTF-8',
              description:
                "Must be either 'application/cloudevents+json; charset=UTF-8'",
            },
            traceparent: {
              type: 'string',
              pattern: '^[\\da-f]{2}-[\\da-f]{32}-[\\da-f]{16}-[\\da-f]{2}$',
              description:
                'The traceparent header represents the incoming request in a tracing system in a common format.See the W3C spec for the definition as per [CloudEvents Distributed Tracing Specification](https://github.com/cloudevents/spec/blob/main/cloudevents/extensions/distributed-tracing.md).',
            },
            tracestate: {
              type: 'string',
              description:
                'Additional tracing info as per the [spec](https://www.w3.org/TR/trace-context/#tracestate-header)',
            },
            to: {
              type: 'string',
              description:
                "\n**URI reference so encoded via encodeURI**\nSpecifies the intended initial recipient(s) or destination topic(s) for the event.\nThis field acts as metadata to assist in the event routing process, indicating where\nthe event should be initially directed. While optional, specifying this field can\nsignificantly enhance routing precision and efficiency within event brokers or middleware,\nguiding the event toward the appropriate service or component for initial processing. It is\nespecially useful in complex distributed systems where events may be handled by multiple\nservices or in multi-step workflows.\n\nThe logic for determining its value here is as follows:\n- For successful events, the system first looks for a value specified in the handler's return (Return<handler>.to). If not provided, it then considers the incomingEvent.redirectTo field, which indicates where the event should be directed after initial processing. If this is also absent, it falls back to the incomingEvent.source, essentially directing the event back to its originator. If none of these fields provide a directive, the to field is set to null, indicating no specific routing is required.\n- For error events, the to field is explicitly set to the event's source (incomingEvent.source). This ensures that error notifications are directed back to the event producer or the system component responsible for the event, allowing for the acknowledgment of the error and potential corrective actions.\n",
            },
            redirectTo: {
              type: 'string',
              description:
                '\n**URI reference so encoded via encodeURI**\nIndicates an alternative or subsequent recipient(s) or destination topic(s) for the event,\nsuggesting where the event should be forwarded after initial processing. Like the "to" field,\n"redirectTo" is metadata that can be leveraged to dynamically alter the event\'s routing path,\nfacilitating complex workflows or multi-stage processing scenarios. It allows for the decoupling\nof event production from consumption, enabling flexible, dynamic routing without requiring the\nevent producer to be aware of the full processing pipeline.\n\nThe logic for determining its value here is as follows:\n- For successful events, the redirectTo value is taken directly from Return<handler>.redirectTo. This allows event handlers to dynamically alter the event\'s routing path based on processing outcomes, facilitating complex workflows or conditional processing scenarios.\n- For error events, the redirectTo field is set to null. This decision is made to halt further automatic redirection of error notifications, ensuring that error events are not inadvertently routed through the system but are instead directed to a specific handler or service for error handling and logging.\n',
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
            id: {
              type: 'string',
              description: 'A UUID of this event',
            },
            subject: {
              type: 'string',
              description: 'The subject of the event',
            },
            type: {
              type: 'string',
              const: 'sys.cmd.{{resource}}.fetch.error',
              description: 'The topic of the event',
            },
            source: {
              type: 'string',
              const: 'cmd.%7B%7Bresource%7D%7D.fetch',
              description:
                'The source of the event. It may be in rare cases overriden to due to the handler function behavior. This is not recommended in most cases.',
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
              const: 'application/cloudevents+json; charset=UTF-8',
              description:
                "Must be either 'application/cloudevents+json; charset=UTF-8'",
            },
            traceparent: {
              type: 'string',
              pattern: '^[\\da-f]{2}-[\\da-f]{32}-[\\da-f]{16}-[\\da-f]{2}$',
              description:
                'The traceparent header represents the incoming request in a tracing system in a common format.See the W3C spec for the definition as per [CloudEvents Distributed Tracing Specification](https://github.com/cloudevents/spec/blob/main/cloudevents/extensions/distributed-tracing.md).',
            },
            tracestate: {
              type: 'string',
              description:
                'Additional tracing info as per the [spec](https://www.w3.org/TR/trace-context/#tracestate-header)',
            },
            to: {
              type: 'string',
              description:
                "\n**URI reference so encoded via encodeURI**\nSpecifies the intended initial recipient(s) or destination topic(s) for the event.\nThis field acts as metadata to assist in the event routing process, indicating where\nthe event should be initially directed. While optional, specifying this field can\nsignificantly enhance routing precision and efficiency within event brokers or middleware,\nguiding the event toward the appropriate service or component for initial processing. It is\nespecially useful in complex distributed systems where events may be handled by multiple\nservices or in multi-step workflows.\n\nThe logic for determining its value here is as follows:\n- For successful events, the system first looks for a value specified in the handler's return (Return<handler>.to). If not provided, it then considers the incomingEvent.redirectTo field, which indicates where the event should be directed after initial processing. If this is also absent, it falls back to the incomingEvent.source, essentially directing the event back to its originator. If none of these fields provide a directive, the to field is set to null, indicating no specific routing is required.\n- For error events, the to field is explicitly set to the event's source (incomingEvent.source). This ensures that error notifications are directed back to the event producer or the system component responsible for the event, allowing for the acknowledgment of the error and potential corrective actions.\n",
            },
            redirectTo: {
              type: 'string',
              description:
                '\n**URI reference so encoded via encodeURI**\nIndicates an alternative or subsequent recipient(s) or destination topic(s) for the event,\nsuggesting where the event should be forwarded after initial processing. Like the "to" field,\n"redirectTo" is metadata that can be leveraged to dynamically alter the event\'s routing path,\nfacilitating complex workflows or multi-stage processing scenarios. It allows for the decoupling\nof event production from consumption, enabling flexible, dynamic routing without requiring the\nevent producer to be aware of the full processing pipeline.\n\nThe logic for determining its value here is as follows:\n- For successful events, the redirectTo value is taken directly from Return<handler>.redirectTo. This allows event handlers to dynamically alter the event\'s routing path based on processing outcomes, facilitating complex workflows or conditional processing scenarios.\n- For error events, the redirectTo field is set to null. This decision is made to halt further automatic redirection of error notifications, ensuring that error events are not inadvertently routed through the system but are instead directed to a specific handler or service for error handling and logging.\n',
            },
          },
          required: ['subject', 'type', 'source', 'data', 'datacontenttype'],
          additionalProperties: false,
          description:
            "Event raised when error happens while using 'safeCloudevent' method. Can happen on invalid events types or some other errors",
          $schema: 'http://json-schema.org/draft-07/schema#',
        },
      ],
    };

    const handler = new CloudEventHandler(params);
    console.log(JSON.stringify(handler.getInterface(), null, 2));
    expect(JSON.stringify(handler.getInterface())).toBe(
      JSON.stringify(expectedSchema),
    );
  });
});
