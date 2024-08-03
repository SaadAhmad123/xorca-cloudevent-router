import * as zod from 'zod';
import CloudEventHandler from '../src/CloudEventHandler';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { ConsoleSpanExporter } from '@opentelemetry/sdk-trace-node';
import { Resource } from '@opentelemetry/resources';
import { SEMRESATTRS_SERVICE_NAME } from '@opentelemetry/semantic-conventions';
import { XOrcaCloudEvent } from 'xorca-cloudevent';
import { XOrcaBaseContract } from 'xorca-contract';
import { cleanString } from '../src/utils';

describe('CloudEventHandler Spec', () => {
  const sdk = new NodeSDK({
    resource: new Resource({
      [SEMRESATTRS_SERVICE_NAME]: 'hello-cli',
    }),
    traceExporter: new ConsoleSpanExporter(),
  });

  const globalHandler = new CloudEventHandler({
    executionUnits: 1.5,
    contract: new XOrcaBaseContract({
      accepts: {
        type: 'cmd.{{resource}}.fetch',
        schema: zod.object({
          date: zod.date(),
        }),
      },
      emits: {
        'evt.weather.fetch.success': zod.object({
          status: zod.number(),
          weather: zod.object({
            temperature: zod.number(),
            unit: zod.string(),
          }),
        }),
        'evt.weather.fetch.error': zod.object({
          status: zod.number(),
          error: zod.string(),
        }),
      },
    }),
    handler: async () => [
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

  beforeAll(() => {
    sdk.start();
  });

  afterAll(() => {
    sdk.shutdown();
  });

  it('Should throw error if the invalid event type is provided', async () => {
    expect(globalHandler.topic).toBe('cmd.{{resource}}.fetch');

    let resp = (
      await globalHandler.cloudevent(
        new XOrcaCloudEvent({
          source: '/test/saad',
          type: 'evt.handler',
          subject: 'something',
          data: {},
        }),
      )
    )[0];
    expect(resp.success).toBe(false);
    expect(resp.eventToEmit.type).toBe('sys.cmd.{{resource}}.fetch.error');
    expect(resp.eventToEmit.to).toBe('/test/saad');
    expect(resp.eventToEmit.executionunits).toBe((1.5).toString());

    resp = (
      await globalHandler.cloudevent(
        new XOrcaCloudEvent({
          source: '/test/saad',
          redirectto: '/test/saad/1',
          type: 'evt.handler',
          subject: 'some',
          data: {},
          traceparent:
            '00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01',
        }),
      )
    )[0];
    expect(resp.success).toBe(false);
    expect(resp.eventToEmit.type).toBe('sys.cmd.{{resource}}.fetch.error');
    expect(resp.eventToEmit.to).toBe('/test/saad');

    resp = (
      await globalHandler.cloudevent(
        new XOrcaCloudEvent({
          source: '/test/saad',
          type: 'evt.handler',
          subject: 'some',
          data: {},
          datacontenttype:
            'application/cloudevents+json; charset=UTF-8; profile=xorca',
        }),
      )
    )[0];
    expect(resp.success).toBe(false);
    expect(resp.eventToEmit?.data?.errorMessage).toBe(
      '[CloudEventHandler][cloudevent] The handler only accepts type=cmd.{{resource}}.fetch but the provided is evt.handler.',
    );
    expect(resp.eventToEmit.type).toBe('sys.cmd.{{resource}}.fetch.error');

    resp = (
      await globalHandler.cloudevent(
        new XOrcaCloudEvent({
          source: '/test/saad',
          type: 'cmd.weather.fetch',
          subject: 'some',
          data: {},
          datacontenttype:
            'application/cloudevents+json; charset=UTF-8; profile=xorca',
        }),
      )
    )[0];

    expect(resp.success).toBe(false);
    expect(resp.eventToEmit?.data?.errorMessage).toBe(
      cleanString(`
        [CloudEventHandler][cloudevent] Invalid handler input data. 
        The response data does not match type=cmd.{{resource}}.fetch 
        expected data shape  
      `),
    );
    expect(resp.eventToEmit.type).toBe('sys.cmd.{{resource}}.fetch.error');

    resp = (
      await globalHandler.cloudevent(
        new XOrcaCloudEvent({
          source: '/test/saad',
          type: 'cmd.weather.fetch',
          subject: 'some',
          data: {
            date: new Date(),
          },
          datacontenttype:
            'application/cloudevents+json; charset=UTF-8; profile=xorca',
        }),
      )
    )[0];

    expect(resp.success).toBe(true);
    expect(resp.eventToEmit.type).toBe('evt.weather.fetch.success');
    expect(resp.eventToEmit.to).toBe('/test/saad');
    expect(resp.eventToEmit.executionunits).toBe((1.5).toString());
  });

  it('Should throw an error if handler returns invalid data', async () => {
    const evt = new XOrcaCloudEvent({
      source: '/test/saad',
      type: 'cmd.weather.fetch',
      subject: 'some',
      data: {
        date: new Date(),
      },
      datacontenttype:
        'application/cloudevents+json; charset=UTF-8; profile=xorca',
      redirectto: '/test/saad/1',
    });

    let handler = new CloudEventHandler({
      ...globalHandler.toDict(),
      handler: async ({ data }) => [
        {
          type: 'evt.weather.fetch' as any,
          data: {},
        },
      ],
    });
    let resp = (await handler.cloudevent(evt))[0];
    expect(resp.success).toBe(false);
    expect(resp.eventToEmit?.data?.errorMessage).toBe(
      "[CloudEventHandler][cloudevent] Invalid handler repsonse. The response type=evt.weather.fetch does not match any of the provided in 'emits'",
    );
    expect(resp.eventToEmit.type).toBe('sys.cmd.{{resource}}.fetch.error');
    expect(resp.eventToEmit.to).toBe('/test/saad');

    handler = new CloudEventHandler({
      ...globalHandler.toDict(),
      executionUnits: undefined,
      handler: async ({ data }) => [
        {
          type: 'evt.weather.fetch.success',
          data: {} as any,
        },
      ],
    });
    resp = (await handler.cloudevent(evt))[0];
    expect(resp.success).toBe(false);
    expect(resp.eventToEmit?.data?.errorMessage).toBe(
      '[CloudEventHandler][cloudevent] Invalid handler repsonse. The response data does not match type=evt.weather.fetch.success expected data shape',
    );
    expect(resp.eventToEmit.type).toBe('sys.cmd.{{resource}}.fetch.error');
    expect(resp.eventToEmit.executionunits).toBe((0).toString());

    handler = new CloudEventHandler({
      ...globalHandler.toDict(),
      executionUnits: undefined,
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
    resp = (await handler.cloudevent(evt))[0];
    expect(resp.success).toBe(true);
    expect(resp.eventToEmit.type).toBe('evt.weather.fetch.success');
    expect(resp.eventToEmit.data?.status).toBe(200);
    expect(resp.eventToEmit.data?.weather?.temperature).toBe(34);
    expect(resp.eventToEmit.data?.weather?.unit).toBe('C');
    expect(resp.eventToEmit.to).toBe('/test/saad/1');
    expect(resp.eventToEmit.executionunits).toBe((0).toString());

    handler = new CloudEventHandler({
      ...globalHandler.toDict(),
      handler: async ({ data }) => {
        throw new Error('some error');
      },
    });
    resp = (await handler.cloudevent(evt))[0];
    expect(resp.success).toBe(false);
    expect(resp.eventToEmit?.data?.errorMessage).toBe(
      '[CloudEventHandler][cloudevent][handler] Handler errored (message=some error)',
    );
    expect(resp.eventToEmit.type).toBe('sys.cmd.{{resource}}.fetch.error');
  });
});
