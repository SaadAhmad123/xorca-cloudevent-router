/**
 * Custom error class for representing a promise timeout.
 */
export class PromiseTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PromiseTimeoutError';
  }
}

/**
 * Wraps a promise function and adds a timeout feature.
 *
 * @typeParam T - The type of the promise result.
 * @typeParam U - The type of the arguments for the promise function.
 * @param promise - The promise function to be wrapped.
 * @param timeoutMs - The timeout duration in milliseconds.
 * @returns A new function that wraps the original promise function with a timeout.
 *
 * @example
 * ```typescript
 * const delayedPromise = (value: number, delay: number) =>
 *   new Promise<number>(resolve => setTimeout(() => resolve(value), delay));
 *
 * const wrappedPromise = timedPromise(delayedPromise, 1000);
 * const result = await wrappedPromise(42, 500); // Resolves successfully after 500ms.
 * ```
 */
export function timedPromise<T, U extends any[]>(
  promise: (...args: U) => Promise<T>,
  timeoutMs: number,
) {
  return async (...args: U) => {
    let timeoutHandler: any;

    const resp = await Promise.race([
      promise(...args),
      new Promise<T>((_, reject) => {
        timeoutHandler = setTimeout(() => {
          reject(
            new PromiseTimeoutError(`Promise timed out after ${timeoutMs}ms.`),
          );
        }, timeoutMs);
      }),
    ]);

    clearTimeout(timeoutHandler);
    return resp;
  };
}
