import * as zod from 'zod';
import { cleanString } from '../utils';

interface IXOrcaCloudEventSchemaGenerator {
  type?: string;
  source?: string;
  data?: zod.AnyZodObject;
}

const XOrcaCloudEventSchemaGenerator = (
  params?: IXOrcaCloudEventSchemaGenerator,
) =>
  zod.object({
    id: zod.string().optional().describe('A UUID of this event'),
    time: zod.string()
      .optional()
      .describe('The creation time of the event'),
    type: (params?.type ? zod.literal(params.type) : zod.string()).describe(
      'The topic of the event',
    ),
    source: (params?.source
      ? zod.literal(encodeURI(params.source))
      : zod.string()
    ).describe(
      cleanString(`
        The source of the event. It may be in rare cases overriden
        to due to the handler function behavior. This is not 
        recommended in most cases.
      `),
    ),
    datacontenttype: zod
      .literal('application/cloudevents+json; charset=UTF-8; profile=xorca')
      .optional(),
    specversion: zod.literal('1.0').optional(),
    subject: zod.string().describe('The subject of the event'),
    data: params?.data ? params.data : zod.record(zod.string(), zod.any()),
    to: zod
      .string()
      .nullable()
      .optional()
      .describe(
        cleanString(`
      This is a metadata field in event routing specifies initial 
      recipients or topics. It enhances routing precision in 
      complex systems. For successful events, it's determined 
      by handler return, redirectTo, or source. For errors, it's 
      set to the event's source.
    `),
      ),
    redirectto: zod
      .string()
      .nullable()
      .optional()
      .describe(
        cleanString(`
      This is a metadata field for events, indicating alternative recipients 
      or destinations. It enables dynamic routing and complex workflows. 
      For successful events, it's set by handlers; for errors, it's 
      null to prevent automatic redirection.
    `),
      ),
    traceparent: zod
      .string()
      .nullable()
      .optional()
      .describe(
        cleanString(`
        The traceparent header is part of the OpenTelemetry specification. 
        It contains trace context information, including trace ID, parent 
        span ID, and trace flags, enabling distributed tracing across 
        services and systems.  
      `),
      ),
    tracestate: zod
      .string()
      .nullable()
      .optional()
      .describe(
        cleanString(`
        The tracestate header in OpenTelemetry is used to convey vendor-specific 
        trace information across service boundaries. It allows for custom 
        key-value pairs to be propagated alongside the traceparent header in 
        distributed tracing scenarios.  
      `),
      ),
    elapsedtime: zod
      .string()
      .nullable()
      .optional()
      .describe(
        cleanString(`
      The amount of time consumed to generate this event
    `),
      ),
    executionunits: zod
      .string()
      .nullable()
      .optional()
      .describe(
        cleanString(`
        This data field represents the cost associated with 
        generating a specific cloudevent. It serves as a metric 
        to track and measure the financial impact of event generation
         within cloud-based systems or applications.
      `),
      ),
  });

export const XOrcaCloudEventSchema = XOrcaCloudEventSchemaGenerator()

export default XOrcaCloudEventSchemaGenerator;
