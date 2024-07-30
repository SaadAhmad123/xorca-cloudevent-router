import { v4 as uuidv4 } from 'uuid';
import * as zod from 'zod'
import { XOrcaCloudEventSchema } from './schema';
import { convertToISOString } from './utils';

/**
 * Represents an extended CloudEvent class with additional properties specific to XOrca.
 * This class implements the CloudEvents specification with XOrca-specific extensions.
 *
 * @see https://github.com/cloudevents/spec/blob/v1.0/spec.md
 */
export default class XOrcaCloudEvent {
  id: string;
  type: string;
  source: string;
  specversion: "1.0";
  datacontenttype: "application/cloudevents+json; charset=UTF-8; profile=xorca";
  subject: string;
  time: string;
  data: Record<string, any>;
  redirectto: string | null;
  to: string | null;
  traceparent: string | null;
  tracestate: string | null;
  elapsedtime: string | null;
  executionunits: string | null;

  /**
   * Creates a new XOrcaCloudEvent object with the provided properties.
   *
   * @param event - The event properties conforming to IXOrcaCloudEvent interface.
   */
  constructor(event: zod.infer<typeof XOrcaCloudEventSchema>) {
    this.id = event.id || uuidv4();
    this.time = convertToISOString(event.time)
    this.type = event.type;
    this.source = encodeURI(event.source);
    this.datacontenttype =
      event.datacontenttype || 'application/cloudevents+json; charset=UTF-8; profile=xorca';
    this.subject = event.subject;    
    this.data = event.data;
    this.specversion = event.specversion || '1.0';
    this.to = event.to ? encodeURI(event.to) : null;
    this.redirectto = event.redirectto ? encodeURI(event.redirectto) : null;
    this.traceparent = event.traceparent || null;
    this.tracestate = event.tracestate || null;
    this.elapsedtime = event.elapsedtime || null;
    this.executionunits = event.executionunits || null;
    Object.freeze(this);
  }

  /**
   * Converts the XOrcaCloudEvent object to a plain JavaScript object.
   * This method is used by JSON.stringify() when converting this object to JSON.
   * 
   * @returns A plain object representation of this event.
   */
  toJSON(): zod.infer<typeof XOrcaCloudEventSchema> {
    return { ...this };
  }

  /**
   * Returns a JSON string representation of the XOrcaCloudEvent.
   * 
   * @returns A JSON string representation of the event.
   */
  toString(): string {
    return JSON.stringify(this.toJSON(), null, 2);
  }

  /**
   * Returns an object containing only the XOrca-specific extension fields.
   * 
   * @returns An object with XOrca-specific extension data.
   */
  get xorcaExtensions() {
    return {
      "to": this.to,
      "redirectto": this.redirectto,
      "traceparent": this.traceparent,
      "tracestate": this.tracestate,
      "executionunits" : this.executionunits,
      "elapsedtime": this.elapsedtime
    }
  }
  
  /**
   * Returns a list of all XOrca-specific extension field names.
   * 
   * @returns An array of strings representing XOrca extension field names.
   */
  get extensionFields() {
    return Object.keys(this.xorcaExtensions) as string[]
  }

  /**
   * Returns an object containing only the standard CloudEvents fields.
   * 
   * @returns An object with standard CloudEvents fields.
   */
  get cloudevent() {
    return Object.assign(
      {},
      ...Object.entries(
        this.toJSON()
      )
      .filter(([key]) => !this.extensionFields.includes(key))
      .map(([key, value]) => ({[key]: value}))
    ) as Omit<zod.infer<typeof XOrcaCloudEventSchema>, keyof typeof this.xorcaExtensions>
  }
}
