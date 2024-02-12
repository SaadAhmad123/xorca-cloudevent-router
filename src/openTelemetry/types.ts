export type TraceContext = {
  traceId: string;
  spanId: string;
  parentSpanId: string | null;
  version: string;
  flags: string;
};

export interface ICreateTraceParent {
  traceId: string;
  spanId: string;
  version: string;
  flags: string;
}
