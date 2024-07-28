import { v4 as uuidv4 } from "uuid";
import { IXOrcaCloudEvent } from "./types";

/**
 * Represents an extended CloudEvent class with additional properties specific to XOrca.
 * 
 * @see https://github.com/cloudevents/spec/blob/v1.0/spec.md
 */
export default class XOrcaCloudEvent<T = Record<string, any>> {
  id: string;
  type: string;
  source: string;
  specversion: string;
  datacontenttype?: string;
  dataschema?: string;
  subject?: string;
  time?: string;
  data?: T;
  redirectto: string | null;
  to: string | null;
  traceparent: string | null;
  tracestate: string | null;
  elapsedtime: string | null;
  executionunits: string | null;

  /**
   * Creates a new CloudEvent object with the provided properties. If there is a chance that the event
   * properties will not conform to the CloudEvent specification, you may pass a boolean `false` as a
   * second parameter to bypass event validation.
   *
   * @param event the event properties
   */
  constructor(event: Partial<IXOrcaCloudEvent<T>>) {
    this.id = (event.id as string) || uuidv4();
    this.time = event.time || new Date().toISOString();
    this.type = event.type as string;
    this.source = encodeURI(event.source as string);
    this.datacontenttype = "application/cloudevents+json; charset=UTF-8; profile=xorca";
    this.subject = event.subject;
    this.dataschema = event.dataschema as string;
    if (event.data) {
      this.data = event.data
    }
    this.specversion = "1.0"
    this.to = encodeURI(event.to || '')
    this.redirectto =  encodeURI(event.redirectto || '')
    this.traceparent = event.traceparent || null
    this.tracestate = event.tracestate || null
    this.elapsedtime = event.elapsedtime || null
    this.executionunits = event.executionunits || null
    Object.freeze(this);
  }

  /**
   * Used by JSON.stringify(). The name is confusing, but this method is called by
   * JSON.stringify() when converting this object to JSON.
   * @return {object} this event as a plain object
   */
  toJSON(): Record<string, unknown> {
    const event: Record<string, any> = { ...this };
    event.time = new Date(this.time as string).toISOString();
    if (event.data_base64 && event.data) {
      delete event.data;
    }
    return event;
  }

  toString(): string {
    return JSON.stringify(this);
  }
}