import {
  HrTime,
  Link,
  SpanAttributeValue,
  SpanAttributes,
  SpanContext,
  SpanExporter,
  SpanKind,
  SpanStatus,
  SpanStatusCode,
  TimedEvent,
} from './types';
import { createSpanException, diffHrTime, getHrTime } from './utils';

/**
 * Represents a span within a distributed tracing system.
 * @class
 */
export default class Span {
  /**
   * The name of the span.
   * @protected
   */
  protected name: string;

  /**
   * The kind of span (e.g., client, server).
   * @protected
   */
  protected kind: SpanKind;

  /**
   * The context of the span, containing essential information for tracing.
   * @protected
   */
  protected context: SpanContext;

  /**
   * The optional parent span ID.
   * @protected
   */
  protected parentId?: string;

  /**
   * The start time of the span in high-resolution time format.
   * @protected
   */
  protected startTime: HrTime = [0, 0];

  /**
   * The end time of the span in high-resolution time format.
   * @protected
   */
  protected endTime: HrTime = [0, 0];

  /**
   * The duration of the span in high-resolution time format.
   * @protected
   */
  protected duration: HrTime = [0, 0];

  /**
   * The status of the span, including a status code.
   * @protected
   */
  protected status: SpanStatus = {
    code: SpanStatusCode.UNSET,
  };

  /**
   * Attributes associated with the span.
   * @protected
   */
  protected attributes: SpanAttributes = {};

  /**
   * Links to other spans.
   * @protected
   */
  protected links: Link[] = [];

  /**
   * Timed events associated with the span.
   * @protected
   */
  protected events: TimedEvent[] = [];

  /**
   * Indicates whether the span has ended.
   * @protected
   */
  protected ended?: boolean = undefined;

  /**
   * The optional exporter function for exporting the span data.
   * @protected
   */
  protected exporter?: SpanExporter = undefined;

  /**
   * Creates a new instance of the Span class.
   * @constructor
   * @param {Object} params - The parameters to initialize the span.
   * @param {string} params.name - The name of the span.
   * @param {SpanKind} params.kind - The kind of span (e.g., client, server).
   * @param {SpanContext} params.context - The context of the span.
   * @param {string} [params.parentId] - The optional parent span ID.
   * @param {SpanExporter} [params.exporter] - The optional exporter function for exporting span data.
   */
  constructor(params: {
    name: string;
    kind: SpanKind;
    context: SpanContext;
    parentId?: string;
    exporter?: SpanExporter;
  }) {
    this.name = params.name;
    this.kind = params.kind;
    this.context = params.context;
    this.parentId = params.parentId;
    this.exporter = params.exporter;
  }

  /**
   * Sets the exporter function for the span.
   * @param {SpanExporter} [exporter] - The exporter function.
   * @returns {Span} - The current span instance.
   */
  setExporter(exporter?: SpanExporter) {
    this.exporter = exporter;
    return this;
  }

  /**
   * Starts the span.
   * @returns {Span} - The current span instance.
   */
  start() {
    this.startTime = getHrTime(Date.now());
    this.status = {
      code: SpanStatusCode.OK,
    };
    this.ended = false;
    return this;
  }

  /**
   * Ends the span.
   * @returns {Span} - The current span instance.
   */
  end() {
    this.endTime = getHrTime(Date.now());
    this.duration = diffHrTime(this.endTime, this.startTime);
    this.ended = true;
    return this;
  }

  /**
   * Sets an attribute for the span.
   * @param {string} key - The key of the attribute.
   * @param {SpanAttributeValue} value - The value of the attribute.
   * @returns {Span} - The current span instance.
   */
  setAttribute(key: string, value: SpanAttributeValue) {
    this.attributes[key] = value;
    return this;
  }

  /**
   * Sets multiple attributes for the span.
   * @param {Record<string, SpanAttributeValue>} attr - The attributes to set.
   * @returns {Span} - The current span instance.
   */
  setAttributes(attr: Record<string, SpanAttributeValue>) {
    this.attributes = {
      ...(this.attributes || {}),
      ...attr,
    };
    return this;
  }

  /**
   * Adds a link to another span.
   * @param {Link} link - The link to add.
   * @returns {Span} - The current span instance.
   */
  link(link: Link) {
    this.links.push(link);
    return this;
  }

  /**
   * Sets multiple links for the span.
   * @param {Link[]} links - The links to set.
   * @returns {Span} - The current span instance.
   */
  setLinks(links: Link[]) {
    this.links = links;
    return this;
  }

  /**
   * Logs a timed event.
   * @param {Omit<TimedEvent, 'time'>} event - The timed event to log.
   * @returns {Span} - The current span instance.
   */
  logEvent(event: Omit<TimedEvent, 'time'>) {
    this.events.push({
      ...event,
      time: getHrTime(Date.now()),
    });
    return this;
  }

  /**
   * Logs an error event with an optional error code.
   * @param {Error} error - The error to log.
   * @param {string | number} [code] - The optional error code.
   * @returns {Span} - The current span instance.
   */
  logError(error: Error, code?: string | number) {
    this.events.push({
      name: 'exception',
      attributes: createSpanException(error, code),
      time: getHrTime(Date.now()),
    });
    return this;
  }

  /**
   * Logs a timed event or an error event with an optional error code.
   * @param {Omit<TimedEvent, 'time'> | Error} event - The event or error to log.
   * @param {string | number} [errorCode] - The optional error code.
   * @returns {Span} - The current span instance.
   */
  log(event: Omit<TimedEvent, 'time'> | Error, errorCode?: string | number) {
    if (event instanceof Error) {
      this.logError(event, errorCode);
    } else {
      this.logEvent(event);
    }
    return this;
  }

  /**
   * Converts the span data to a JSON representation.
   * @returns {Object} - The JSON representation of the span.
   */
  toJSON() {
    return {
      name: this.name,
      kind: this.kind,
      context: this.context,
      parentId: this.parentId,
      startTime: this.startTime,
      endTime: this.endTime,
      status: this.status,
      attributes: this.attributes,
      links: this.links,
      events: this.events,
      duration: this.duration,
      ended: Boolean(this.ended),
      resource: undefined,
      instrumentationLibrary: 'xorca-otel',
      droppedEventsCount: 0,
      droppedAttributesCount: 0,
      droppedLinksCount: 0,
    };
  }

  /**
   * Exports the span data using the configured exporter.
   * @returns {Span} - The current span instance.
   */
  async export() {
    await this.exporter?.(this.toJSON());
    return this;
  }
}
