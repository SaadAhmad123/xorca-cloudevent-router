import CloudEventHandler from '../CloudEventHandler';
import { CloudEvent } from 'cloudevents';
import { CloudEventHandlerError } from '../CloudEventHandler/errors';
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
   * @param timeoutMs - Timeout duration for each CloudEvent processing. Default is 5000ms.
   * @returns A Promise resolving to an array of processed CloudEvents.
   */
  async cloudevents(
    events: CloudEvent<Record<string, any>>[],
    errorOnNotFound: boolean = true,
    timeoutMs: number = 5000,
  ) {
    return (
      await Promise.all(
        events.map(async (item) => {
          if (!this.handlerMap[item.type]) {
            if (!errorOnNotFound) return undefined;
            return {
              eventId: item.id,
              event: item,
              success: false,
              error: new CloudEventHandlerError(
                `[CloudEventRouter][cloudevents] No handler found for event.type=${item.type}`,
              ),
            };
          }
          const resp = await timedPromise(
            this.handlerMap[item.type].safeCloudevent,
            timeoutMs,
          )(item);
          return {
            eventId: item.id,
            event: item,
            success: resp.success,
            error: resp.error,
            eventToEmit: resp.eventToEmit,
          };
        }),
      )
    ).filter((item) => Boolean(item)) as Array<{
      eventId: string;
      event: CloudEvent<Record<string, any>>;
      success: boolean;
      error?: CloudEventHandlerError;
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
}
