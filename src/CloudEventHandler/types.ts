import * as zod from 'zod';

/**
 * Represents the validation schema for the CloudEvent.
 * @template TType - The type of the CloudEvent.
 */
export type CloudEventValidationSchema<TType extends string> = {
  type: TType;
  description?: string;
  zodSchema: zod.ZodObject<any>;
};

/**
 * Represents an interface for CloudEvent handlers.
 * @template TAcceptType - The type of CloudEvent that the handler accepts.
 * @template TEmitType - The type of CloudEvent that the handler emits.
 */
export interface ICloudEventHandler<
  TAcceptType extends string,
  TEmitType extends string,
> {
  /**
   * The name of the CloudEvent handler.
   * No spaces or special characters allowed.
   * By default its is the topic name
   */
  name?: string;

  /**
   * Optional description for the CloudEvent handler.
   */
  description?: string;

  /**
   * The validation schema for the CloudEvent that the handler accepts.
   */
  accepts: CloudEventValidationSchema<TAcceptType>;

  /**
   * An array of validation schemas for the CloudEvents that the handler emits.
   */
  emits: CloudEventValidationSchema<TEmitType>[];

  /**
   * The handler function that processes the CloudEvent and returns a new CloudEvent.
   * @template TEventData - The type of data in the CloudEvent.
   * @param event - The CloudEvent to be handled.
   * @returns A Promise resolving to the emitted CloudEvent.
   * @example
   * const handler: ICloudEventHandler<'UserCreated', 'UserUpdated'> = {
   *   name: 'userEventHandler',
   *   accepts: { type: 'UserCreated', data: zod.object({ name: zod.string() }) },
   *   emits: [{ type: 'UserUpdated', data: zod.object({ id: zod.string(), name: zod.string() }) }],
   *   handler: async (event) => {
   *     // Process the 'UserCreated' event and return an 'UserUpdated' event.
   *     return { type: 'UserUpdated', data: { id: event.data.id, name: event.data.name } };
   *   },
   * };
   */
  handler: <
    TEventData extends Record<string, any> = Record<string, any>,
  >(event: {
    type: TAcceptType;
    data: TEventData;
  }) => Promise<{ type: TEmitType; data: Record<string, any> }>;
}
