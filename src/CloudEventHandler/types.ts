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

/**
 * Represents the OpenTelemetry context for a handler.
 */
export type HandlerOpenTelemetryContext = {
  /** The current span */
  span: Span;

  /** The tracer instance */
  tracer: Tracer;
  
  /** The telemetry context */
  context: TelemetryContext;
};

/**
 * Represents the output of a CloudEventHandler function.
 * @template TContract The type of the XOrcaBaseContract.
 */
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

/**
 * Represents the input of a CloudEventHandler function.
 * @template TContract The type of the XOrcaBaseContract.
 */
export type CloudEventHandlerFunctionInput<
  TContract extends XOrcaBaseContract<any, any, any>,
> = {
  /** The type of the accepted event */
  type: XOrcaContractInfer<TContract>['accepts']['type'];
  
  /** The data of the accepted event */
  data: XOrcaContractInfer<TContract>['accepts']['data'];
  
  /** The full cloud event */
  event: XOrcaCloudEvent<XOrcaContractInfer<TContract>['accepts']['data']>;
  
  /** The source of the event */
  source: string;
  
  /** The OpenTelemetry context */
  openTelemetry: HandlerOpenTelemetryContext;
  
  /** Optional parameters */
  params?: Record<string, string>;
  
  /** Optional recipient */
  to?: string;
  
  /** Optional redirect destination */
  redirectto?: string;
};

/**
 * Interface for a CloudEventHandler.
 * @template TContract The type of the XOrcaBaseContract.
 */
export interface ICloudEventHandler<
  TContract extends XOrcaBaseContract<any, any, any>,
> {
  /** Optional name of the handler */
  name?: string 

  /** Optional description of the handler */
  description?: string;
  
  /** The contract for the handler */
  contract: TContract;
  
  /** The handler function */
  handler: (
    event: CloudEventHandlerFunctionInput<TContract>,
  ) => Promise<CloudEventHandlerFunctionOutput<TContract>[]>;
  
  /** Optional execution units */
  executionUnits?: number;
  
  /** Optional flag to disable routing metadata */
  disableRoutingMetadata?: boolean;
}

/**
 * Interface for a safe CloudEvent response.
 */
export type SafeCloudEventResponse = {
  /** Indicates if the operation was successful */
  success: boolean;

  /** The event to emit */
  eventToEmit: XOrcaCloudEvent;
  
  /** Optional error information */
  error?: CloudEventHandlerError;
}

/**
 * Interface for creating a simple CloudEventHandler.
 * @template TContract The type of the XOrcaSimpleContract.
 */
export interface ICreateSimpleCloudEventHandler<
  TContract extends XOrcaSimpleContract<any, any, any>
> {
  /** Optional description of the handler */
  description?: string;
  
  /** The contract for the handler */
  contract: TContract;
  
  /** The handler function */
  handler: (
    data: zod.infer<TContract['parameters']['schema']>,
    openTelemetry: HandlerOpenTelemetryContext,
  ) => Promise<zod.infer<TContract['parameters']['emits']> & { __executionunits?: number }>;
  
  /** Optional execution units */
  executionUnits?: number;
  
  /** Optional flag to disable routing metadata */
  disableRoutingMetadata?: boolean;
}