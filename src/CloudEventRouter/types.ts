import { CloudEvent } from 'cloudevents';
import CloudEventHandler from '../CloudEventHandler';
import { Logger } from '../CloudEventHandler/types';

export interface ICloudEventRouter {
  name: string;
  description?: string;
  handlers: CloudEventHandler<any, any>[];
  logger?: Logger;
}

export type CloudEventRouterResponse = {
  event: CloudEvent<Record<string, any>>;
  success: boolean;
  errorMessage?: string;
  errorStack?: string;
  errorType?: string;
  eventToEmit?: CloudEvent<Record<string, any>>;
};

export type CloudEventRouterHandlerOptions = {
  responseCallback?: (responses: CloudEventRouterResponse[]) => Promise<void>;
  errorOnNotFound?: boolean;
  timeoutMs?: number;
};
