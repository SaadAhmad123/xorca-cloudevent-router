import CloudEventHandler from '../CloudEventHandler';
import XOrcaCloudEvent from '../XOrcaCloudEvent';

/**
 * Interface for a CloudEvent Router, which routes incoming CloudEvents to the appropriate handlers.
 *
 * @property {string} name - The name of the CloudEvent Router.
 * @property {string} [description] - Optional. A description of the CloudEvent Router.
 * @property {CloudEventHandler<any, any>[]} handlers - An array of CloudEvent handlers that the router will use to process events.
 * @property {Logger} [logger] - Optional. A logger function for logging events and errors.
 */
export interface ICloudEventRouter {
  name: string;
  description?: string;
  handlers: CloudEventHandler<any, any>[];
}

/**
 * Type defining the response structure for a CloudEvent Router.
 *
 * @property {CloudEvent<Record<string, any>>} event - The CloudEvent that was processed.
 * @property {boolean} success - Indicates whether the event processing was successful.
 * @property {string} [errorMessage] - Optional. An error message if the event processing failed.
 * @property {string} [errorStack] - Optional. The stack trace of the error if the event processing failed.
 * @property {string} [errorType] - Optional. The type of error that occurred during event processing.
 * @property {CloudEvent<Record<string, any>>} [eventToEmit] - Optional. The CloudEvent to emit as a result of processing.
 */
export type CloudEventRouterResponse = {
  event: XOrcaCloudEvent<Record<string, any>>;
  success: boolean;
  errorMessage?: string;
  errorStack?: string;
  errorType?: string;
  eventToEmit?: CloudEvent<Record<string, any>>;
};

/**
 * Options for configuring a CloudEvent Router handler.
 *
 * @property {function} [responseCallback] - Optional. A callback function that is called with the responses after event processing.
 * @property {boolean} [errorOnNotFound] - Optional. If true, an error will be thrown if no matching handler is found for an event.
 */
export type CloudEventRouterHandlerOptions = {
  responseCallback?: (responses: CloudEventRouterResponse[]) => Promise<void>;
  errorOnNotFound?: boolean;
};
