export enum TraceFlags {
  /** Represents no flag set. */
  NONE = '00',
  /** Bit to represent whether trace is sampled in trace flags. */
  SAMPLED = '01',
}
export enum SpanKind {
  /** Default value. Indicates that the span is used internally. */
  INTERNAL = 0,
  /**
   * Indicates that the span covers server-side handling of an RPC or other
   * remote request.
   */
  SERVER = 1,
  /**
   * Indicates that the span covers the client-side wrapper around an RPC or
   * other remote request.
   */
  CLIENT = 2,
  /**
   * Indicates that the span describes producer sending a message to a
   * broker. Unlike client and server, there is no direct critical path latency
   * relationship between producer and consumer spans.
   */
  PRODUCER = 3,
  /**
   * Indicates that the span describes consumer receiving a message from a
   * broker. Unlike client and server, there is no direct critical path latency
   * relationship between producer and consumer spans.
   */
  CONSUMER = 4,
}
/**
 * A SpanContext represents the portion of a {@link ReadableSpan} which must be
 */
export type SpanContext = {
  /**
   * The version of the tracer or instrumentation library.
   * For this, it can be '00'
   */
  version?: string;
  /**
   * The ID of the trace that this span belongs to. It is worldwide unique
   * with practically sufficient probability by being made as 16 randomly
   * generated bytes, encoded as a 32 lowercase hex characters corresponding to
   * 128 bits.
   */
  traceId: string;
  /**
   * The ID of the Span. It is globally unique with practically sufficient
   * probability by being made as 8 randomly generated bytes, encoded as a 16
   * lowercase hex characters corresponding to 64 bits.
   */
  spanId: string;
  /**
   * Only true if the SpanContext was propagated from a remote parent.
   */
  isRemote?: boolean;
  /**
   * Trace flags to propagate.
   *
   * It is represented as 1 byte (bitmap) <or 2 character string>. Bit to represent whether trace is
   * sampled or not. When set, the least significant bit documents that the
   * caller may have recorded trace data. A caller who does not record trace
   * data out-of-band leaves this flag unset.
   *
   * see {@link TraceFlags} for valid flag values.
   */
  traceFlags: TraceFlags;
  /**
   * Tracing-system-specific info to propagate.
   *
   * The tracestate field value is a `list` as defined below. The `list` is a
   * series of `list-members` separated by commas `,`, and a list-member is a
   * key/value pair separated by an equals sign `=`. Spaces and horizontal tabs
   * surrounding `list-members` are ignored. There can be a maximum of 32
   * `list-members` in a `list`.
   * More Info: https://www.w3.org/TR/trace-context/#tracestate-field
   *
   * Examples:
   *     Single tracing system (generic format):
   *         tracestate: rojo=00f067aa0ba902b7
   *     Multiple tracing systems (with different formatting):
   *         tracestate: rojo=00f067aa0ba902b7,congo=t61rcWkgMzE
   */
  traceState?: string;
};
/**
 * Defines High-Resolution Time.
 *
 * The first number, HrTime[0], is UNIX Epoch time in seconds since 00:00:00 UTC on 1 January 1970.
 * The second number, HrTime[1], represents the partial second elapsed since Unix Epoch time represented by first number in nanoseconds.
 * For example, 2021-01-01T12:30:10.150Z in UNIX Epoch time in milliseconds is represented as 1609504210150.
 * The first number is calculated by converting and truncating the Epoch time in milliseconds to seconds:
 * HrTime[0] = Math.trunc(1609504210150 / 1000) = 1609504210.
 * The second number is calculated by converting the digits after the decimal point of the subtraction, (1609504210150 / 1000) - HrTime[0], to nanoseconds:
 * HrTime[1] = Number((1609504210.150 - HrTime[0]).toFixed(9)) * 1e9 = 150000000.
 * This is represented in HrTime format as [1609504210, 150000000].
 */
export type HrTime = [number, number];
/**
 * Defines TimeInput.
 *
 * hrtime, epoch milliseconds, performance.now() or Date
 */
export type TimeInput = HrTime | number | Date;
export type SpanStatus = {
  /** The status code of this message. */
  code: SpanStatusCode;
  /** A developer-facing error message. */
  message?: string;
};
/**
 * An enumeration of status codes.
 */
export enum SpanStatusCode {
  /**
   * The default status.
   */
  UNSET = 0,
  /**
   * The operation has been validated by an Application developer or
   * Operator to have completed successfully.
   */
  OK = 1,
  /**
   * The operation contains an error.
   */
  ERROR = 2,
}
export type SpanAttributeValue =
  | string
  | number
  | boolean
  | Array<null | undefined | string>
  | Array<null | undefined | number>
  | Array<null | undefined | boolean>;
export type SpanAttributes = Record<string, SpanAttributeValue>;
/**
 * A pointer from the current {@link ReadableSpan} to another span in the same trace or
 * in a different trace.
 * Few examples of Link usage.
 * 1. Batch Processing: A batch of elements may contain elements associated
 *    with one or more traces/spans. Since there can only be one parent
 *    SpanContext, Link is used to keep reference to SpanContext of all
 *    elements in the batch.
 * 2. Public Endpoint: A SpanContext in incoming client request on a public
 *    endpoint is untrusted from service provider perspective. In such case it
 *    is advisable to start a new trace with appropriate sampling decision.
 *    However, it is desirable to associate incoming SpanContext to new trace
 *    initiated on service provider side so two traces (from Client and from
 *    Service Provider) can be correlated.
 */
export type Link = {
  /** The {@link SpanContext} of a linked span. */
  context: SpanContext;
  /** A set of {@link SpanAttributes} on the link. */
  attributes?: SpanAttributes;
  /** Count of attributes of the link that were dropped due to collection limits */
  droppedAttributesCount?: number;
};
/**
 * Represents a timed event.
 * A timed event is an event with a timestamp.
 */
export type TimedEvent = {
  time: HrTime;
  /** The name of the event. */
  name: string;
  /** The attributes of the event. */
  attributes?: SpanAttributes;
  /** Count of attributes of the event that were dropped due to collection limits */
  droppedAttributesCount?: number;
};
export type SpanException = {
  code?: string | number;
  message: string;
  name: string;
  stack: string;
};
/**
 * Defined as per the documentation provided by
 * [OpenTelemetry Spec](https://opentelemetry.io/docs/concepts/signals/traces/)
 * and implementation by the [node js library](https://www.npmjs.com/package/@opentelemetry/sdk-trace-base?activeTab=readme)
 */
export type ReadableSpan = {
  name: string;
  kind: SpanKind;
  context: SpanContext;
  parentId?: string;
  startTime: HrTime;
  endTime: HrTime;
  status: SpanStatus;
  attributes: SpanAttributes;
  links: Link[];
  events: TimedEvent[];
  duration: HrTime;
  ended: boolean;
  resource: any;
  instrumentationLibrary: any;
  droppedAttributesCount: number;
  droppedEventsCount: number;
  droppedLinksCount: number;
};

export type SpanExporter = (span: ReadableSpan) => Promise<void>;
