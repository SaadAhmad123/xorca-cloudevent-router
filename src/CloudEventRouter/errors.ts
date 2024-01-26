export class CloudEventRouterError extends Error {
  constructor(message?: string) {
    super(message);
    this.name = 'CloudEventRouterError';
  }
}
