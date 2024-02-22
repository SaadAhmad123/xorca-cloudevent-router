import TraceParent from '../../src/Telemetry/traceparent';

describe('The traceparent spec', () => {
  it('should create a validate a `traceparent` as per the W3C spec', () => {
    expect(
      TraceParent.validate(
        '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
      ),
    ).toBe(true);
    expect(
      TraceParent.validate(
        '00-4bf92f3577b34da6a3ce929d0e0e47-00f067aa0ba902b7-01',
      ),
    ).toBe(false);
  });

  it('should create a new valid traceparent', () => {
    expect(TraceParent.validate(TraceParent.create.traceparent())).toBe(true);
  });

  it('should parse the traceparent correctly and provide the trace context', () => {
    const traceparent =
      '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01';
    const traceId = '4bf92f3577b34da6a3ce929d0e0e4736';
    const parentSpanId = '00f067aa0ba902b7';
    const version = '00';
    const flags = '01';

    const traceContext = TraceParent.parse(traceparent);
    expect(traceContext.traceId).toBe(traceId);
    expect(traceContext.parentId).toBe(parentSpanId);
    expect(traceContext.version).toBe(version);
    expect(traceContext.traceFlags).toBe(flags);
    expect(traceContext.spanId.length).toBe(16);
  });

  it('should create a new trace context if not or invalid traceparent is provided', () => {
    for (const traceparent of [undefined, 'dasdsadsad-dsa-dsad-a-dasdas']) {
      const traceContext = TraceParent.parse(traceparent);
      expect(traceContext.spanId.length).toBe(16);
      expect(traceContext.traceId.length).toBe(32);
      expect(traceContext.parentId).toBe(undefined);
      expect(traceContext.version?.length).toBe(2);
      expect(traceContext.traceFlags.length).toBe(2);
      expect(
        TraceParent.validate(TraceParent.create.traceparent(traceContext)),
      ).toBe(true);
    }
  });
});
