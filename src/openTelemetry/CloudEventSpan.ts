import { CloudEvent } from "cloudevents"
import Span from "./Span"
import { SpanExporter, SpanKind, TraceFlags } from "./Span/types"
import TraceParent from "./traceparent"

export default class CloudEventSpan extends Span {
    constructor(
        params: {
            name: string,
            kind: SpanKind,
            traceparent: string
            tracestate?: string
            exporter?: SpanExporter
            isRemote?: boolean
        }
    ) {
        const traceParent = TraceParent.parse(params.traceparent)
        super({
            name: params.name,
            kind: params.kind,
            parentId: traceParent.parentSpanId || undefined,
            exporter: params.exporter,
            context: {
                traceFlags: TraceFlags.NONE,
                version: traceParent.version,
                traceState: params.tracestate,
                traceId: traceParent.traceId,
                spanId: traceParent.spanId,
                isRemote: params.isRemote,
            }
        })
    }

    getDistriubutedTraceHeaders() {
        return {
            tracestate: this.context.traceState || '',
            traceparent: TraceParent.create.traceparent({
                version: this.context.version || '00',
                traceId: this.context.traceId,
                spanId: this.context.spanId,
                flags: this.context.traceFlags,
            })
        }
    }

    
    setCloudEvent(event: CloudEvent<any>) {
        this.setAttribute('cloudevent.event_id', event.id)
        this.setAttribute('cloudevent.event_type', event.type)
        this.setAttribute('cloudevent.event_source', event.source || '')
        this.setAttribute('cloudevents.event_spec_version', event.specversion)
        this.setAttribute('cloudevents.event_subject', event.subject || '')
        return this
    }
}