import * as dotenv from 'dotenv';
dotenv.config();
import createHttpHandler from './createHttpHandler';
import { CloudEvent } from 'cloudevents';

describe('createHttpHandler test', () => {
  const openAiHttpHandler = createHttpHandler({
    name: 'ntk.{{response}}',
    variables: {
      OPEN_AI_API_KEY: {
        value: process.env.OPEN_AI_API_KEY || '',
        secret: true,
      },
    },
  });

  it('should call OpenAI api successfully', async () => {
    const resp = await openAiHttpHandler.cloudevent(
      new CloudEvent<Record<string, any>>({
        type: 'cmd.ntk.openai.completion',
        source: '/test',
        subject: '1234',
        datacontenttype: 'application/json',
        data: {
          method: 'POST',
          url: 'https://api.openai.com/v1/chat/completions',
          headers: {
            Authorization: 'Bearer {{OPEN_AI_API_KEY}}',
          },
          body: JSON.stringify({
            model: 'gpt-3.5-turbo',
            messages: [
              {
                role: 'system',
                content: 'You are a helpful assistant.',
              },
              {
                role: 'user',
                content: 'Hello!',
              },
            ],
          }),
        },
      }),
    );

    expect(resp.type).toBe('evt.ntk.openai.completion.success');
    expect(resp?.data?.statusCode).toBe(200);
    const parsedData = JSON.parse(resp?.data?.text || '{}');
    expect(parsedData?.object).toBe('chat.completion');
    expect(parsedData?.model).toBe('gpt-3.5-turbo-0613');
    expect(parsedData?.choices?.length).toBe(1);
  });

  it('should fail calling OpenAI api successfully', async () => {
    const resp = await openAiHttpHandler.cloudevent(
      new CloudEvent<Record<string, any>>({
        type: 'cmd.ntk.openai.completion',
        source: '/test',
        subject: '1234',
        datacontenttype: 'application/json',
        data: {
          method: 'POST',
          url: 'https://api.openai.com/v1/chat/completions',
          headers: {
            Authorization: 'Bearer1 {{OPEN_AI_API_KEY}}',
          },
          body: JSON.stringify({
            model: 'gpt-3.5-turbo',
            messages: [
              {
                role: 'system',
                content: 'You are a helpful assistant.',
              },
              {
                role: 'user',
                content: 'Hello!',
              },
            ],
          }),
        },
      }),
    );

    expect(resp.type).toBe('evt.ntk.openai.completion.success');
    expect(resp?.data?.statusCode).toBe(401);
    const parsedData = JSON.parse(resp?.data?.text || '{}');
    expect(parsedData?.error?.message).toBe(
      "You didn't provide an API key. You need to provide your API key in an Authorization header using Bearer auth (i.e. Authorization: Bearer YOUR_KEY), or as the password field (with blank username) if you're accessing the API from your browser and are prompted for a username and password. You can obtain an API key from https://platform.openai.com/account/api-keys.",
    );
  });

  it('should fail validation on calling OpenAI api', async () => {
    const {
      success,
      eventToEmit: resp,
      error,
    } = await openAiHttpHandler.safeCloudevent(
      new CloudEvent<Record<string, any>>({
        type: 'cmd.ntk.openai.completion',
        source: '/test',
        subject: '1234',
        datacontenttype: 'application/json',
        data: {
          method: 'SOMETHING',
          url: 'https://api.openai.com/v1/chat/completions',
          headers: {
            Authorization: 'Bearer {{OPEN_AI_API_KEY}}',
          },
          body: JSON.stringify({
            model: 'gpt-3.5-turbo',
            messages: [
              {
                role: 'system',
                content: 'You are a helpful assistant.',
              },
              {
                role: 'user',
                content: 'Hello!',
              },
            ],
          }),
        },
      }),
    );
    expect(success).toBe(false);
    expect(resp.type).toBe('sys.ntk.{{response}}.error');
    expect(resp?.data?.errorMessage).toBe(
      '[CloudEventHandler][cloudevent] Invalid handler input data. The response data does not match type=cmd.ntk.{{response}} expected data shape',
    );
    expect(resp?.data?.errorName).toBe('CloudEventHandlerError');
  });
});