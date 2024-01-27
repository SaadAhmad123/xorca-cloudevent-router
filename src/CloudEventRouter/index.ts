import CloudEventHandler from '../CloudEventHandler';
import { CloudEvent } from 'cloudevents';
import { CloudEventRouterError } from './errors';
import { timedPromise } from '../utils';
import { ICloudEventRouter } from './types';

/**
 * Represents a CloudEventRouter that routes and processes an array of CloudEvents using registered CloudEventHandlers.
 * @example
 * // Example usage of CloudEventRouter
 * const myCloudEventRouter = new CloudEventRouter({
 *   handlers: [cloudEventHandler1, cloudEventHandler2, ...],
 * });
 */
export default class CloudEventRouter {
  private handlerMap: Record<string, CloudEventHandler<string, string>> = {};

  /**
   * Creates an instance of CloudEventRouter.
   * @param params - Parameters for configuring the CloudEventRouter.
   * @throws {Error} - Throws an error if there are duplicate 'accepts.type' values among the provided handlers.
   */
  constructor(private params: ICloudEventRouter) {
    if (
      this.params.handlers.length !==
      Array.from(new Set(this.params.handlers.map((item) => item.topic))).length
    ) {
      throw new Error(
        `[CloudEventRouter][constructor] There must be only one CloudEventHandler for one 'accepts.type' cloudevent`,
      );
    }
    this.handlerMap = Object.assign(
      {},
      ...this.params.handlers.map((item) => ({ [item.topic]: item })),
    );
  }

  /**
   * Processes an array of CloudEvents using registered CloudEventHandlers.
   *
   * @param events - An array of CloudEvents to be processed.
   * @param errorOnNotFound - If true, returns an error for events without a corresponding handler.
   * @param timeoutMs - Timeout duration for each CloudEvent processing. Default is 900000ms = 15min.
   * @returns A Promise resolving to an array of processed CloudEvents.
   */
  async cloudevents(
    events: CloudEvent<Record<string, any>>[],
    errorOnNotFound: boolean = true,
    timeoutMs: number = 900000,
  ) {
    return (
      await Promise.all(
        events.map(async (item) => {
          if (!this.handlerMap[item.type]) {
            if (!errorOnNotFound) return undefined;
            const error = new CloudEventRouterError(
              `[CloudEventRouter][cloudevents] No handler found for event.type=${item.type}`,
            );
            return {
              event: item,
              success: false,
              errorMessage: error.toString(),
              errorStack: error.stack,
              errorType: error.name,
              eventToEmit: undefined,
            };
          }
          try {
            const resp = await timedPromise(
              () => this.handlerMap[item.type].safeCloudevent(item),
              timeoutMs,
            )();
            return {
              event: item,
              success: resp.success,
              errorMessage: resp.error?.toString(),
              errorStack: resp.error?.stack,
              errorType: resp?.error?.name,
              eventToEmit: resp.eventToEmit,
            };
          } catch (error) {
            return {
              event: item,
              success: false,
              errorMessage: `[CloudEventRouter][Timeout=${timeoutMs}]${error?.toString()}`,
              errorStack: (error as Error)?.stack,
              errorType: `[CloudEventRouter][Timeout]`,
              eventToEmit: undefined,
            };
          }
        }),
      )
    ).filter((item) => Boolean(item)) as Array<{
      event: CloudEvent<Record<string, any>>;
      success: boolean;
      errorMessage?: string;
      errorStack?: string;
      errorType?:
        | 'PromiseTimeoutError'
        | 'CloudEventHandlerError'
        | 'CloudEventRouterError';
      eventToEmit?: CloudEvent<Record<string, any>>;
    }>;
  }

  /**
   * Gets an array of interfaces representing the configurations of registered CloudEventHandlers.
   * @returns An array of objects representing the CloudEventHandler interfaces.
   * @example
   * // Example usage to get the interfaces
   * const interfaceInfoArray = myCloudEventRouter.getInterface();
   * console.log(interfaceInfoArray);
   */
  getInterface() {
    return {
      name: this.params.name,
      description: this.params.description,
      handlers: this.params.handlers.map((item) => item.getInterface()),
    };
  }

  /**
   * Get the params of the router. Can be used for cloning
   * @returns a object with parameters of this object
   */
  toDict(): ICloudEventRouter {
    return { ...this.params };
  }
}
