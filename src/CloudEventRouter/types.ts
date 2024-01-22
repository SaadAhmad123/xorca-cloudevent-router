import CloudEventHandler from '../CloudEventHandler';

export interface ICloudEventRouter {
  name: string;
  description?: string;
  handlers: CloudEventHandler<string, string>[];
}
