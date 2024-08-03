import { trace, context, propagation, Context, Span } from '@opentelemetry/api';
import { TelemetryContext, TelemetryLogLevels } from './types';

/**
 * Retrieves the active context based on the provided trace header.
 * @param traceparent - The trace header string.
 * @returns The active context.
 */
export const getActiveContext = (traceparent?: string | null): Context => {
  if (traceparent) {
    return propagation.extract(context.active(), { traceparent: traceparent });
  }
  return context.active();
};

/**
 * Parses the context from a span and active context.
 * @param span - The span to parse the context from.
 * @param activeContext - The active context (optional, defaults to the current active context).
 * @returns The parsed telemetry context.
 */
export const parseContext = (
  span: Span,
  activeContext: Context = context.active(),
): TelemetryContext => {
  let carrier: TelemetryContext = {
    traceparent: null,
    tracestate: null,
  };
  propagation.inject(trace.setSpan(activeContext, span), carrier);
  return carrier;
};

/**
 * Logs a message to a span with additional parameters.
 * @param span - The span to log the message to.
 * @param params - The parameters for the log message.
 * @param params.level - The log level.
 * @param params.message - The log message.
 * @param params[key] - Additional key-value pairs to include in the log.
 */
export const logToSpan = (
  span: Span,
  params: {
    level: TelemetryLogLevels;
    message: string;
    [key: string]: any;
  },
): void => {
  span.addEvent('log_message', {
    ...params,
    timestamp: performance.now(),
  });
};
