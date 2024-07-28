import { trace, context, propagation, Context, Span } from '@opentelemetry/api';
import { TelemetryContext, TelemetryLogLevels } from './types';

export const getActiveContext = (traceheader?: string | null)  => {
  if (traceheader) {
    return propagation.extract(context.active(), { traceparent: traceheader });
  }
  return context.active()
}

export const parseContext = (span: Span, activeContext: Context = context.active())  => {
  let carrier: TelemetryContext = {
    traceparent: null,
    tracestate: null
  }
  propagation.inject(trace.setSpan(activeContext, span), carrier);
  return carrier
}

export const logToSpan = (span: Span, params: {
  level: TelemetryLogLevels,
  message: string,
  [key: string]: any,
}) => {
  span.addEvent('log_message', {
    ...params,
    timestamp: performance.now()
  })
}