import XOrcaCloudEvent from '../src/XOrcaCloudEvent';

describe('XOrcaCloudEvent', () => {
  const mockUuid = '123e4567-e89b-12d3-a456-426614174000';
  const mockTime = '2023-05-01T12:00:00.000Z';

  it('should create an XOrcaCloudEvent with default values', () => {
    const event = new XOrcaCloudEvent({
      type: 'test.event',
      source: 'http://example.com',
      subject: 'Test Subject',
      data: { key: 'value' },
    });

    expect(event.type).toBe('test.event');
    expect(event.source).toBe('http://example.com');
    expect(event.datacontenttype).toBe('application/cloudevents+json; charset=UTF-8; profile=xorca');
    expect(event.subject).toBe('Test Subject');
    expect(event.data).toEqual({ key: 'value' });
    expect(event.specversion).toBe('1.0');
    expect(event.to).toBeNull();
    expect(event.redirectto).toBeNull();
    expect(event.traceparent).toBeNull();
    expect(event.tracestate).toBeNull();
    expect(event.elapsedtime).toBeNull();
    expect(event.executionunits).toBeNull();
  });

  it('should create an XOrcaCloudEvent with custom values', () => {
    const event = new XOrcaCloudEvent({
      id: 'custom-id',
      time: '2023-05-01T14:30:00Z',
      type: 'custom.event',
      source: 'https://custom.com',
      datacontenttype: "application/cloudevents+json; charset=UTF-8; profile=xorca",
      subject: 'Custom Subject',
      data: { custom: 'data' },
      specversion: '1.0',
      to: 'https://destination.com',
      redirectto: 'https://redirect.com',
      traceparent: 'traceparent-value',
      tracestate: 'tracestate-value',
      elapsedtime: '100',
      executionunits: '5',
    });

    expect(event.id).toBe('custom-id');
    expect(event.time).toBe('2023-05-01T14:30:00.000Z');
    expect(event.type).toBe('custom.event');
    expect(event.source).toBe('https://custom.com');
    expect(event.datacontenttype).toBe('application/cloudevents+json; charset=UTF-8; profile=xorca');
    expect(event.subject).toBe('Custom Subject');
    expect(event.data).toEqual({ custom: 'data' });
    expect(event.specversion).toBe('1.0');
    expect(event.to).toBe('https://destination.com');
    expect(event.redirectto).toBe('https://redirect.com');
    expect(event.traceparent).toBe('traceparent-value');
    expect(event.tracestate).toBe('tracestate-value');
    expect(event.elapsedtime).toBe('100');
    expect(event.executionunits).toBe('5');
  });

  it('should encode URI values', () => {
    const event = new XOrcaCloudEvent({
      type: 'test.event',
      source: 'http://example.com/path with spaces',
      subject: 'Test Subject',
      data: {},
      to: 'http://destination.com/path with spaces',
      redirectto: 'http://redirect.com/path with spaces',
    });

    expect(event.source).toBe('http://example.com/path%20with%20spaces');
    expect(event.to).toBe('http://destination.com/path%20with%20spaces');
    expect(event.redirectto).toBe('http://redirect.com/path%20with%20spaces');
  });

  it('should convert to JSON correctly', () => {
    const event = new XOrcaCloudEvent({
      id: mockUuid,
      time: mockTime,
      type: 'test.event',
      source: 'http://example.com',
      subject: 'Test Subject',
      data: { key: 'value' },
    });

    const testData = JSON.stringify({
      id: mockUuid,
      time: mockTime,
      type: 'test.event',
      source: 'http://example.com',
      datacontenttype: 'application/cloudevents+json; charset=UTF-8; profile=xorca',
      subject: 'Test Subject',
      data: { key: 'value' },
      specversion: '1.0',
      to: null,
      redirectto: null,
      traceparent: null,
      tracestate: null,
      elapsedtime: null,
      executionunits: null
    }, null, 2)
    expect(JSON.stringify(event.toJSON(), null, 2)).toEqual(testData)
    expect(event.toString()).toEqual(testData)
  });

  it('should return XOrca extensions correctly', () => {
    const event = new XOrcaCloudEvent({
      type: 'test.event',
      source: 'http://example.com',
      subject: 'Test Subject',
      data: {},
      to: 'http://destination.com',
      redirectto: 'http://redirect.com',
      traceparent: 'traceparent-value',
      tracestate: 'tracestate-value',
      elapsedtime: '100',
      executionunits: '5',
    });

    expect(event.xorcaExtensions).toEqual({
      to: 'http://destination.com',
      redirectto: 'http://redirect.com',
      traceparent: 'traceparent-value',
      tracestate: 'tracestate-value',
      elapsedtime: '100',
      executionunits: '5',
    });
  });

  it('should return extension fields correctly', () => {
    const event = new XOrcaCloudEvent({
      type: 'test.event',
      source: 'http://example.com',
      subject: 'Test Subject',
      data: {},
    });

    expect(event.extensionFields).toEqual([
      'to',
      'redirectto',
      'traceparent',
      'tracestate',
      'executionunits',
      'elapsedtime',
    ]);
  });

  it('should return standard CloudEvents fields correctly', () => {
    const event = new XOrcaCloudEvent({
      id: mockUuid,
      time: mockTime,
      type: 'test.event',
      source: 'http://example.com',
      subject: 'Test Subject',
      data: { key: 'value' },
    });

    expect(JSON.stringify(event.cloudevent)).toEqual(JSON.stringify({
      id: mockUuid,
      time: mockTime,
      type: 'test.event',
      source: 'http://example.com',
      datacontenttype: 'application/cloudevents+json; charset=UTF-8; profile=xorca',
      subject: 'Test Subject',
      data: { key: 'value' },
      specversion: '1.0'
    }))
  });
});

