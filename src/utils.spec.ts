import { timedPromise, PromiseTimeoutError } from './utils';

describe('Util specs', () => {
  it('should timeout if the promise takes longer than expected', async () => {
    let error: PromiseTimeoutError | undefined;
    try {
      await timedPromise(async () => {
        await new Promise((res) => setTimeout(res, 2000));
      }, 1000)();
    } catch (e) {
      error = e as PromiseTimeoutError;
    }
    expect(error?.name).toBe('PromiseTimeoutError');
    expect(error?.message).toBe('Promise timed out after 1000ms.');
  });

  it('should timeout if the promise takes longer than expected', async () => {
    let error: Error | undefined;
    try {
      await timedPromise(async () => {
        await new Promise((res) => setTimeout(res, 200));
      }, 5000)();
    } catch (e) {
      error = e as Error;
    }
    expect(error).toBe(undefined);
  });
});
