import CloudEventHandler from '../CloudEventHandler';
import { CloudEventRouterError } from './errors';
import { matchTemplates } from '../utils';
import {
  CloudEventRouterHandlerOptions,
  CloudEventRouterResponse,
  ICloudEventRouter,
} from './types';
import XOrcaCloudEvent from '../XOrcaCloudEvent';

/**
 * Represents a CloudEventRouter that routes and processes an array of CloudEvents using registered CloudEventHandlers.
 * @example
 * // Example usage of CloudEventRouter
 * const myCloudEventRouter = new CloudEventRouter({
 *   handlers: [cloudEventHandler1, cloudEventHandler2, ...],
 * });
 */
export default class CloudEventRouter {
  protected handlerMap: Record<string, CloudEventHandler<string, string>> = {};

  /**
   * Creates an instance of CloudEventRouter.
   * @param params - Parameters for configuring the CloudEventRouter.
   * @throws {Error} - Throws an error if there are duplicate 'accepts.type' values among the provided handlers.
   */
  constructor(protected params: ICloudEventRouter) {
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
      ...this.params.handlers.map((item) => ({
        [item.topic]: item,
      })),
    );
  }

  /**
   * Processes an array of CloudEvents using registered CloudEventHandlers.
   *
   * @param events - An array of CloudEvents to be processed.
   * @param [options] - An options object
   * @property [options.responseCallback] - A callback function to react to events generated after a handler processed an event. Use this if you don't want to wait for other handlers to finish executions before replying for all the events
   * @param [options.errorOnNotFound] - If true, returns an error for events without a corresponding handler.
   * @returns A Promise resolving to an array of processed CloudEvents.
   */
  async cloudevents(
    events: XOrcaCloudEvent[],
    options?: CloudEventRouterHandlerOptions,
  ) {
    const { responseCallback, errorOnNotFound = true } = options || {};
    const handlerKeys = Object.keys(this.handlerMap || {});
    return (
      await Promise.all(
        events.map(async (item) => {
          let finalResponses: CloudEventRouterResponse[] = [];
          try {
            const matchTemplateResp = matchTemplates(item.type, handlerKeys);
            if (!matchTemplateResp) {
              if (!errorOnNotFound) return [];
              throw new CloudEventRouterError(
                `[CloudEventRouter][cloudevents] No handler found for event.type=${item.type}. The accepts type are: ${handlerKeys.join(', ')}`,
              );
            }
            const responses =
              await this.handlerMap[
                matchTemplateResp.matchedTemplate
              ].cloudevent(item);
            finalResponses = [
              ...finalResponses,
              ...responses.map((resp) => ({
                event: item,
                success: resp.success,
                eventToEmit: resp.eventToEmit,
              })),
            ];
          } catch (error) {
            finalResponses = [
              ...finalResponses,
              {
                event: item,
                success: false,
                errorMessage: (error as Error)?.message,
                errorStack: (error as Error)?.stack,
                errorType: (error as Error)?.name,
              },
            ];
          }
          await responseCallback?.(finalResponses).catch(console.error);
          return finalResponses;
        }),
      )
    ).reduce((acc, cur) => [...acc, ...cur], [] as CloudEventRouterResponse[]);
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
