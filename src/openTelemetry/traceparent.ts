import * as crypto from 'crypto';
import { SpanContext } from './Span/types';
import { insertHyphen, makeTimeWithHexDigits } from '../utils';

/**
 * This class contains functions to handle the CloudEvent
 * `traceparent` field, essential for maintaining trace
 * context across executions for telemetry governed by the OpenTelemetry spec.
 * The traceparent field is defined as per [CloudEvents Distributed Tracing Specification](https://github.com/cloudevents/spec/blob/main/cloudevents/extensions/distributed-tracing.md).
 */
export default class TraceParent {
  static validationRegex = /^[\da-f]{2}-[\da-f]{32}-[\da-f]{16}-[\da-f]{2}$/;

  /**
   * Validates the traceparent string.
   * @param {string} traceparent - The traceparent string.
   * @returns {boolean} - Validation flag (true if valid, false otherwise).
   */
  static validate(traceparent: string): boolean {
    return TraceParent.validationRegex.test(traceparent);
  }

  /**
   * Utilities to build trace context for
   * the CloudEvent traceparent field.
   */
  static create = {
    /**
     * Generates the version part of the traceparent.
     * @returns {string} - The version string.
     */
    version: (): string => Buffer.alloc(1).toString('hex'),

    /**
     * Generates a random trace ID for the traceparent.
     * @returns {string} - The generated trace ID.
     */
    traceId: (): string => crypto.randomBytes(16).toString('hex'),

    /**
     * Generates a random span ID for the traceparent.
     * @returns {string} - The generated span ID.
     */
    spanId: (): string => crypto.randomBytes(8).toString('hex'),

    /**
     * Generates the flags part of the traceparent.
     * @returns {string} - The flags string.
     */
    flags: (): string => '01',

    traceparent: (params?: SpanContext) =>
      [
        params?.version || TraceParent.create.version(),
        params?.traceId || TraceParent.create.traceId(),
        params?.spanId || TraceParent.create.spanId(),
        params?.traceFlags || TraceParent.create.flags(),
      ].join('-'),

    headers: (spanContext: SpanContext) => ({
      'X-Amzn-Trace-Id': [
        `Root=1-${insertHyphen(spanContext.traceId, 8)}`,
        `Sampled=${spanContext.traceFlags}`,
        spanContext.parentId ? `Parent=${spanContext.parentId}` : '',
      ].join(),
      id: `${spanContext.traceId}.${spanContext.spanId}`,
      ...(spanContext.parentId
        ? {
            operation_ParentId: `${spanContext.traceId}.${spanContext.parentId}`,
          }
        : {}),
      operation_Id: spanContext.traceId,
      traceparent: TraceParent.create.traceparent(spanContext),
      'X-Cloud-Trace-Context': `${spanContext.traceId}/${spanContext.spanId};o=1`,
    }),
  };

  /**
   * Parses the `traceparent` field of the CloudEvent
   * to create a trace context for OpenTelemetry reporting.
   * @param {string} traceparent - The CloudEvent `traceparent` field.
   * @returns {TraceContext} - The trace context data.
   */
  static parse(traceparent?: string, tracestate?: string): SpanContext {
    let parsedTraceParent: string[] | undefined;

    if (TraceParent.validate((traceparent || '') as string)) {
      parsedTraceParent = (traceparent as string | undefined)?.split?.('-');
    }

    return {
      traceId: parsedTraceParent?.[1] || TraceParent.create.traceId(),
      spanId: TraceParent.create.spanId(),
      parentId: parsedTraceParent?.[2],
      version: parsedTraceParent?.[0] || TraceParent.create.version(),
      traceFlags: parsedTraceParent?.[3] || TraceParent.create.flags(),
      traceState: tracestate,
    } as SpanContext;
  }
}
