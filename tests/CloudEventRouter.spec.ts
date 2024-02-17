import * as zod from 'zod';
import CloudEventHandler from '../src/CloudEventHandler';
import CloudEventRouter from '../src/CloudEventRouter';
import { CloudEvent } from 'cloudevents';

import createSimpleHandler from '../src/CloudEventHandler/createSimpleHandler';

const bookFetchHandler = createSimpleHandler({
  name: '{{resource}}.fetch',
  accepts: zod.object({
    book_id: zod.string(),
  }),
  emits: zod.object({
    book_id: zod.string(),
    book_content: zod.string().array(),
  }),
  handler: async (data) => ({
    book_id: data.book_id,
    book_content: ['this is', 'the book id'],
  }),
});

const summaryHandler = new CloudEventHandler({
  name: 'gpt.summary',
  accepts: {
    type: 'cmd.gpt.summary',
    zodSchema: zod.object({
      content: zod.string(),
    }),
  },
  emits: [
    {
      type: 'evt.gpt.summary.success',
      zodSchema: zod.object({
        summary: zod.string(),
      }),
    },
    {
      type: 'evt.gpt.summary.error',
      zodSchema: zod.object({
        error: zod.string(),
      }),
    },
  ],
  handler: async ({ data }) => [
    {
      type: 'evt.gpt.summary.success',
      data: {
        summary: 'the summary',
      },
    },
  ],
});

const handlers = [bookFetchHandler, summaryHandler];

describe('CloudEventRouter spec', () => {
  it('should emit the event defined in the router', async () => {
    const router = new CloudEventRouter({
      name: 'SummaryRouter',
      handlers,
    });
    const resp = await router.cloudevents([
      new CloudEvent({
        subject: 'saad',
        type: 'cmd.books.fetch',
        data: {
          book_id: 'saad',
        },
        source: '/test',
        datacontenttype: 'application/cloudevents+json; charset=UTF-8',
      }),
      new CloudEvent({
        subject: 'saad',
        type: 'cmd.gpt.summary',
        data: {
          content: 'content to look at',
        },
        source: '/test',
        datacontenttype: 'application/cloudevents+json; charset=UTF-8',
      }),
    ]);
    expect(resp.length).toBe(2);
    expect(resp.filter((item) => item.success === true).length).toBe(2);
    expect(
      resp.filter(
        (item) => item.eventToEmit?.type === 'evt.books.fetch.success',
      ).length,
    ).toBe(1);
    expect(
      resp.filter(
        (item) => item.eventToEmit?.type === 'evt.gpt.summary.success',
      ).length,
    ).toBe(1);
  });

  it('should emit the event defined in the router', async () => {
    const router = new CloudEventRouter({
      name: 'SummaryRouter',
      handlers,
    });
    const resp = await router.cloudevents([
      new CloudEvent({
        subject: 'saad',
        type: 'evt.books.fetch',
        data: {
          book_id: 'saad',
        },
        source: '/test',
        datacontenttype: 'application/cloudevents+json; charset=UTF-8',
      }),
    ]);
    expect(resp.length).toBe(1);
    expect(resp.filter((item) => item.success === false).length).toBe(1);
    expect(
      resp.filter((item) => item.errorType === 'CloudEventRouterError').length,
    ).toBe(1);
    expect(
      resp.filter(
        (item) =>
          item.errorMessage ===
          '[CloudEventRouter][cloudevents] No handler found for event.type=evt.books.fetch. The accepts type are: cmd.gpt.summary, cmd.{{resource}}.fetch',
      ).length,
    ).toBe(1);
  });

  it('should throw error on duplicate handlers', async () => {
    let error: Error | undefined;
    try {
      const router = new CloudEventRouter({
        name: 'SummaryRouter',
        handlers: [...handlers, bookFetchHandler],
      });
    } catch (e) {
      error = e as Error;
    }
    expect(error?.message).toBe(
      "[CloudEventRouter][constructor] There must be only one CloudEventHandler for one 'accepts.type' cloudevent",
    );
  });

  it('should return resp error on wrong handler', async () => {
    const router = new CloudEventRouter({
      name: 'SummaryRouter',
      handlers: [
        new CloudEventHandler({
          ...bookFetchHandler.toDict(),
          handler: async ({ data }) => [
            {
              type: 'evt.books.fetch.success',
              data: {
                something: 'wrong',
              },
            },
          ],
        }),
      ],
    });
    const resp = await router.cloudevents([
      new CloudEvent({
        subject: 'saad',
        type: 'cmd.books.fetch',
        data: {
          book_id: 'saad',
        },
        source: '/test',
        datacontenttype: 'application/cloudevents+json; charset=UTF-8',
      }),
    ]);
    expect(resp.length).toBe(1);
    expect(resp[0].success).toBe(false);
    expect(resp[0].eventToEmit?.data?.errorName).toBe('CloudEventHandlerError');
    expect(resp[0].eventToEmit?.data?.errorMessage).toBe(
      '[CloudEventHandler][cloudevent] Invalid handler repsonse. The response data does not match type=evt.books.fetch.success expected data shape',
    );
  });

  it('should return resp error on error in handler', async () => {
    const router = new CloudEventRouter({
      name: 'SummaryRouter',
      handlers: [
        createSimpleHandler({
          name: 'books.fetch',
          accepts: zod.object({
            book_id: zod.string(),
          }),
          emits: zod.object({
            book_id: zod.string(),
            book_content: zod.string().array(),
          }),
          handler: async (data) => {
            throw new Error('Some error went wrong');
          },
        }),
      ],
    });
    const resp = await router.cloudevents([
      new CloudEvent({
        subject: 'saad',
        type: 'cmd.books.fetch',
        data: {
          book_id: 'saad',
        },
        source: '/test',
        datacontenttype: 'application/cloudevents+json; charset=UTF-8',
      }),
    ]);
    expect(resp.length).toBe(1);
    expect(resp[0].eventToEmit?.type).toBe('evt.books.fetch.error');
    expect(resp[0].eventToEmit?.data?.errorMessage).toBe(
      'Some error went wrong',
    );
  });

  it('should return resp error on timout in handler', async () => {
    const router = new CloudEventRouter({
      name: 'SummaryRouter',
      handlers: [
        createSimpleHandler({
          timeoutMs: 100,
          name: 'books.fetch',
          accepts: zod.object({
            book_id: zod.string(),
          }),
          emits: zod.object({
            book_id: zod.string(),
            book_content: zod.string().array(),
          }),
          handler: async () => {
            await new Promise((res) => setTimeout(res, 1000));
            return {};
          },
        }),
      ],
    });
    const resp = await router.cloudevents([
      new CloudEvent({
        subject: 'saad',
        type: 'cmd.books.fetch',
        data: {
          book_id: 'saad',
        },
        source: '/test',
        datacontenttype: 'application/cloudevents+json; charset=UTF-8',
      }),
    ]);
    expect(resp.length).toBe(1);
    expect(resp[0].eventToEmit?.type).toBe('evt.books.fetch.timeout');
    expect(resp[0].eventToEmit?.data?.errorMessage).toBe(
      'Promise timed out after 100ms.',
    );
  });
});
