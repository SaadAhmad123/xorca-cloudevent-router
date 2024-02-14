import CloudEventHandler from '../CloudEventHandler';
import { Logger } from '../CloudEventHandler/types';

export interface ICloudEventRouter {
  name: string;
  description?: string;
  handlers: CloudEventHandler<any, any>[];
  logger?: Logger;
}
