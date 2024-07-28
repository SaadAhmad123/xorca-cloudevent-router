import { CloudEventV1} from "cloudevents";


/**
 * Represents an extended CloudEvent interface with additional properties specific to XOrca.
 * This interface extends the standard CloudEvent interface from the 'cloudevents' package.
 * 
 * @template T - The type of the event data payload (default is undefined).
 * @extends CloudEvent<T>
 */
export interface IXOrcaCloudEvent<T = undefined> extends CloudEventV1<T> {
  /**
   * The intended recipient of the event.
   */
  to?: string | null;

  /**
   * The redirect destination for the event, if applicable.
   */
  redirectto?: string | null;

  /**
   * The W3C Trace Context traceparent header value for distributed tracing.
   */
  traceparent?: string | null;

  /**
   * The W3C Trace Context tracestate header value for distributed tracing.
   */
  tracestate?: string | null;

  /**
   * A string representing the execution units associated with the event.
   */
  executionunits?: string | null;

  /**
   * A string representing the time in milliseconds taken to create the event
   */
  elapsedtime?: string | null;
}