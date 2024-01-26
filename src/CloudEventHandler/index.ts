import * as zod from 'zod';
import { CloudEvent } from 'cloudevents';
import { ICloudEventHandler } from './types';
import { CloudEventHandlerError } from './errors';
import { zodToJsonSchema } from 'zod-to-json-schema';

/**
 * Represents a CloudEventHandler that processes CloudEvents. This class
 * allows to not only create CloudEvent handlers but also do so while allowing
 * for type validation and documentation. Moreover, since this package is
 * built with xOrca in mind it also preserve subject continuation for keeping
 * track of orchestration references.
 * @template TAcceptType - The type of CloudEvent that the handler accepts.
 * @template TEmitType - The type of CloudEvent that the handler emits.
 * @example
 * // Example usage of CloudEventHandler
 * const myEventHandler = new CloudEventHandler<'UserCreated', 'UserUpdated' | 'UserUpdatedError'>({
 *   name: 'UserEventHandler',
 *   description: 'Handles user-related events',
 *   accepts: {
 *     type: 'UserCreated',
 *     data: zod.object({ id: zod.string(), name: zod.string() }),
 *   },
 *   emits: [
 *     { type: 'UserUpdated', data: zod.object({ id: zod.string(), name: zod.string() }) },
 *     { type: 'UserUpdatedError', data: zod.object({ error: zod.string() }) },
 *   ],
 *   handler: async (event) => {
 *     // Process the 'UserCreated' event and return an 'UserUpdated' event.
 *     return { type: 'UserUpdated', data: { id: event.data.id, name: event.data.name } };
 *   },
 * });
 */
export default class CloudEventHandler<
  TAcceptType extends string,
  TEmitType extends string,
> {
  /**
   * Creates an instance of CloudEventHandler.
   * @param params - Parameters for configuring the CloudEventHandler.
   * @throws {CloudEventHandlerError} - Throws an error if the 'name' contains spaces or special characters.
   */
  constructor(private params: ICloudEventHandler<TAcceptType, TEmitType>) {
    this.params.name = this.params.name || this.topic;
    if (this.params.name.includes(' ')) {
      throw new CloudEventHandlerError(
        `[CloudEventHandler][constructor] The 'name' must not contain any spaces or special characters but the provided is ${this.params.name}`,
      );
    }
  }

  /**
   * The type of CloudEvent to which this handler listens to and handles.
   */
  public get topic() {
    return this.params.accepts.type;
  }

  /**
   * Processes the given CloudEvent and returns a new CloudEvent.
   * @param event - The CloudEvent to be processed.
   * @returns A Promise resolving to the emitted CloudEvent.
   * @throws {CloudEventHandlerError} - Throws an error if required properties are missing or validation fails.
   */
  async cloudevent(
    event: CloudEvent<Record<string, any>>,
  ): Promise<CloudEvent<Record<string, any>>> {
    for (const prop of ['subject', 'type', 'data', 'datacontenttype']) {
      if (!event[prop]) {
        throw new CloudEventHandlerError(
          `[CloudEventHandler][cloudevent] The ${prop} MUST be provided.`,
          event,
        );
      }
    }
    const { subject, type, data, datacontenttype } = event;
    if (![datacontenttype].includes('application/json')) {
      throw new CloudEventHandlerError(
        `[CloudEventHandler][cloudevent] The event 'datacontenttype' MUST be 'application/json' but the provided is ${datacontenttype}`,
        event,
      );
    }
    if (this.params.accepts.type !== type) {
      throw new CloudEventHandlerError(
        `[CloudEventHandler][cloudevent] The handler only accepts type=${this.params.accepts.type} but the provided is ${type}.`,
        event,
      );
    }

    const inputParse = this.params.accepts.zodSchema.safeParse(data);
    if (!inputParse.success) {
      throw new CloudEventHandlerError(
        `[CloudEventHandler][cloudevent] Invalid handler input data. The response data does not match type=${this.params.accepts.type} expected data shape`,
        event,
        {
          error: inputParse.error.message,
          issues: inputParse.error.issues,
        },
      );
    }

    let resp: any = {
      type: '',
      data: {},
    };
    try {
      resp = await this.params.handler({
        type: type as TAcceptType,
        data: data || {},
      });
    } catch (e) {
      throw new CloudEventHandlerError(
        `[CloudEventHandler][cloudevent][handler] Handler errored (message=${(e as Error).message})`,
        event,
        {
          error: (e as Error).toString(),
        },
      );
    }

    const respEvent = this.params.emits.filter(
      (item) => item.type === resp.type,
    );

    if (!respEvent.length) {
      throw new CloudEventHandlerError(
        `[CloudEventHandler][cloudevent] Invalid handler repsonse. The response type=${resp.type} does not match any of the provided in 'emits'`,
        event,
        { handlerResponse: resp },
      );
    }

    const parseResp = respEvent[0].zodSchema.safeParse(resp.data);
    if (!parseResp.success) {
      throw new CloudEventHandlerError(
        `[CloudEventHandler][cloudevent] Invalid handler repsonse. The response data does not match type=${resp.type} expected data shape`,
        event,
        {
          handlerResponse: resp,
          error: parseResp.error.message,
          issues: parseResp.error.issues,
        },
      );
    }

    return new CloudEvent<Record<string, any>>({
      ...resp,
      datacontenttype,
      subject,
      source: this.params.name || this.topic,
    });
  }

  /**
   * Processes the given CloudEvent safely and returns a new CloudEvent.
   * If an error occurs during processing, a new CloudEvent representing the error is returned.
   * @param event - The CloudEvent to be processed.
   * @returns A Promise resolving to the emitted CloudEvent or an error CloudEvent.
   */
  async safeCloudevent(event: CloudEvent<Record<string, any>>): Promise<{
    success: boolean;
    eventToEmit: CloudEvent<Record<string, any>>;
    error?: CloudEventHandlerError;
  }> {
    try {
      return {
        success: true,
        eventToEmit: await this.cloudevent(event),
      };
    } catch (e) {
      return {
        success: false,
        error: e as CloudEventHandlerError,
        eventToEmit: new CloudEvent({
          source: this.params.name || this.topic,
          type: `sys.${this.params.name}.error`,
          subject: event.subject || `no-subject:cloudevent-id=${event.id}`,
          data: {
            errorName: (e as CloudEventHandlerError).name,
            errorStack: (e as CloudEventHandlerError).stack,
            errorMessage: (e as CloudEventHandlerError).message,
            additional: (e as CloudEventHandlerError).additional,
            event: (e as CloudEventHandlerError).event,
          },
          datacontenttype: 'application/json',
        }),
      };
    }
  }

  /**
   * Gets an interface representing the CloudEventHandler configuration.
   * @returns An object representing the CloudEventHandler interface.
   * @example
   * // Example usage to get the interface
   * const interfaceInfo = myEventHandler.getInterface();
   * console.log(interfaceInfo);
   * // Output: { name: 'UserEventHandler', description: 'Handles user-related events', accepts: {...}, emits: [...] }
   */
  getInterface(): Record<string, any> {
    return {
      name: this.params.name,
      description: this.params.description,
      accepts: {
        type: this.params.accepts.type,
        description: this.params.accepts.description,
        schema: zodToJsonSchema(this.params.accepts.zodSchema),
      },
      emits: [
        ...this.params.emits,
        {
          type: `sys.${this.params.name}.error`,
          description:
            "Event raised when error happens while using 'safeCloudevent' method",
          zodSchema: zod.object({
            errorName: zod.string().optional(),
            errorMessage: zod.string().optional(),
            errorStack: zod.string().optional(),
            event: zod.string(),
            additional: zod.any(),
          }),
        },
      ].map((item) => ({
        type: item.type,
        description: item.description,
        schema: zodToJsonSchema(item.zodSchema),
      })),
    };
  }

  /**
   * Get the params of the handler. Can be used for cloning
   * @returns a object with parameters of this object
   */
  toDict(): ICloudEventHandler<TAcceptType, TEmitType> {
    return this.params;
  }
}
