import XOrcaCloudEvent from '../XOrcaCloudEvent';

/**
 * Custom error class for CloudEvent handler errors.
 * @extends Error
 */
export class CloudEventHandlerError extends Error {
  /**
   * Creates an instance of CloudEventHandlerError.
   * @param message - The error message.
   * @param event - The CloudEvent associated with the error (optional).
   * @param additional - Additional information about the error (optional).
   */
  constructor(
    public message: string,
    public event?: XOrcaCloudEvent,
    public additional?: Record<string, any>,
  ) {
    super(message);
    this.name = 'CloudEventHandlerError';
  }

  /**
   * Returns a JSON string representation of the error, including name, message, event, and additional information.
   * @returns A stringified JSON representation of the error.
   * @example
   * const error = new CloudEventHandlerError('Handler failed', event, { reason: 'Invalid data' });
   * console.log(error.toString());
   * // Output:
   * // {
   * //   "name": "CloudEventHandlerError",
   * //   "message": "Handler failed",
   * //   "event": {...}, // CloudEvent object
   * //   "additional": {"reason": "Invalid data"}
   * // }
   */
  public toString() {
    return JSON.stringify(
      {
        name: this.name,
        message: this.message,
        event: this.event,
        additional: this.additional,
      },
      null,
      2,
    );
  }
}
