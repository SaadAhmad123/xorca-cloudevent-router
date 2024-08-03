import * as zod from 'zod';
import { CloudEventHandlerError } from './errors';
import { Span, Tracer } from '@opentelemetry/api';
import { XOrcaCloudEvent } from 'xorca-cloudevent';
import {
  XOrcaBaseContract,
  XOrcaContractInfer,
  XOrcaSimpleContract,
} from 'xorca-contract';
import { TelemetryContext } from '../Telemetry/types';

export type HandlerOpenTelemetryContext = {
  span: Span;
  tracer: Tracer;
  context: TelemetryContext;
};

export type CloudEventHandlerFunctionOutput<
  TContract extends XOrcaBaseContract<any, any, any>,
> = {
  [K in keyof TContract['emits']]: {
    type: K;
    data: zod.infer<TContract['emits'][K]>;
    subject?: string;
    source?: string;
    redirectto?: string;
    to?: string;
    executionunits?: number;
  };
}[keyof TContract['emits']];

export type CloudEventHandlerFunctionInput<
  TContract extends XOrcaBaseContract<any, any, any>,
> = {
  type: XOrcaContractInfer<TContract>['accepts']['type'];
  data: XOrcaContractInfer<TContract>['accepts']['data'];
  event: XOrcaCloudEvent<XOrcaContractInfer<TContract>['accepts']['data']>;
  source: string;
  openTelemetry: HandlerOpenTelemetryContext;
  params?: Record<string, string>;
  to?: string;
  redirectto?: string;
};

export interface ICloudEventHandler<
  TContract extends XOrcaBaseContract<any, any, any>,
> {
  description?: string;
  contract: TContract;
  handler: (
    event: CloudEventHandlerFunctionInput<TContract>,
  ) => Promise<CloudEventHandlerFunctionOutput<TContract>[]>;
  executionUnits?: number;
  disableRoutingMetadata?: boolean;
}

export interface ISafeCloudEventResponse {
  success: boolean;
  eventToEmit: XOrcaCloudEvent;
  error?: CloudEventHandlerError;
}

export interface ICreateSimpleCloudEventHandler<
  TContract extends XOrcaSimpleContract<any, any, any>
> {
  description?: string;
  contract: TContract;
  handler: (
    data: zod.infer<TContract['parameters']['schema']>,
    openTelemetry: HandlerOpenTelemetryContext,
  ) => Promise<zod.infer<TContract['parameters']['emits']> & { __executionunits?: number }>;
  executionUnits?: number;
  disableRoutingMetadata?: boolean;
}
