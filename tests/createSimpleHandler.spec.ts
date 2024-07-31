import { describe, it } from '@jest/globals';
import * as zod from 'zod';
import { createSimpleHandler } from '../src';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { ConsoleSpanExporter } from '@opentelemetry/sdk-trace-node';
import { Resource } from '@opentelemetry/resources';
import { SEMRESATTRS_SERVICE_NAME } from '@opentelemetry/semantic-conventions';
import { XOrcaCloudEvent } from 'xorca-cloudevent';

describe('createSimpleHandler', () => {
  const sdk = new NodeSDK({
    resource: new Resource({
      [SEMRESATTRS_SERVICE_NAME]: 'hello-cli',
    }),
    traceExporter: new ConsoleSpanExporter(),
  });

  beforeAll(() => {
    sdk.start();
  });

  afterAll(() => {
    sdk.shutdown();
  });

  it('should handle successful execution', async () => {
    const handler = createSimpleHandler({
      name: 'TestCommand',
      accepts: {
        type: 'evt.handler',
        zodSchema: zod.object({ input: zod.string() }),
      },
      emits: zod.object({ output: zod.string() }),
      handler: async (data) => ({ output: `Processed: ${data.input}` }),
    });

    handler.cloudevent(
      new XOrcaCloudEvent({
        source: '/test/saad',
        type: 'cmd.evt.handler',
        subject: "something",
        data: {
          input: "Saad"
        }
      })
    )
    
  });

  it('should handle errors', async () => {
    const handler = createSimpleHandler({
      name: 'TestCommand',
      accepts: {
        type: 'test',
        zodSchema: zod.object({ input: zod.string() }),
      },
      emits: zod.object({ output: zod.string() }),
      handler: async () => {
        throw new Error('Test error');
      },
    });

    handler.cloudevent(
      new XOrcaCloudEvent({
        source: '/test/saad',
        type: 'cmd.test',
        subject: "something",
        data: {
          input: "Saad"
        }
      })
    )
  });
});