> For a comprehensive understanding/ documentation of this project, kindly visit the [Github repository](https://github.com/SaadAhmad123/xorca-cloudevent-router).

# xOrca CloudEvent Router

This package is meticulously crafted with a focus on seamless integration with the [xOrca orchestration engine](https://github.com/SaadAhmad123/xOrca). While originally tailored for the xOrca ecosystem, this versatile package stands independently, allowing you to construct robust CloudEvent-based services. It remains agnostic to any specific runtime environment, ensuring compatibility across platforms with a NodeJS executor.

In the context of xOrca, this router serves as a fundamental component for the [microservices fleet](https://github.com/SaadAhmad123/xOrca?tab=readme-ov-file#concepts), orchestrating their interactions under the guidance of the xOrca orchestrator.

## Installation

Seamlessly integrate this package into your project using NPM:

```bash
npm install xorca-cloudevent-router
```

Alternatively, opt for YARN:

```bash
yarn add xorca-cloudevent-router
```

## Components

### `CloudEventHandler`

The `CloudEventHandler` class facilitates the creation of an asynchronous handler for CloudEvents, providing a structured approach for defining input and output schemas for handlers. This ensures that the specified schema is adhered to during event processing. Additionally, the handler enforces validation checks on crucial CloudEvent fields, ensuring a seamless transition of the subject from the input to the output. This is particularly significant in the orchestration pattern recommended by xOrca.

#### Features:

- **Schema Definition:** Allows the definition of input and output schemas for handlers, enhancing clarity and consistency in event processing.

- **Validation Checks:** Enforces validation checks on CloudEvent fields, ensuring that essential properties are present.

- **Subject Pass-Through:** Guarantees that the input and output CloudEvents share the same subject, aligning with best practices in the orchestration pattern advocated by xOrca.

- **Documentation:** Provides a function to output the handler schema in JSON format via `getInterface()` method.

#### CloudEvent Schema Example:

```json
{
  "subject": "some string",
  "datacontenttype": "application/cloudevents+json; charset=UTF-8",
  "source": "some string",
  "type": "the name/topic of the event, e.g., cmd.books.fetch or evt.books.fetch.success",
  "data": {
    "example": "Data must be a JSON object with the required information."
  }
}
```

The provided CloudEvent serves as a demonstration of the required schema, highlighting the essential fields and their expected formats. This structured approach ensures the consistent handling and validation of CloudEvents within the defined event processing framework.

#### Example

```typescript
import * as zod from 'zod'
import { CloudEventHandler } from 'path/to/package'
import { CloudEvent } from 'cloudevents';

const handler = new CloudEventHandler({
    name: "books.fetch", // Recommended to be the service handler
    description: ""
    accepts: {
        /**
         * The schema of the event that this handler accepts.
         * We just need to define the type and the zodSchema for the
         * data field of the CloudEvent other validations, etc. are
         * taken care of by the class itself
         */
        type: "cmd.books.fetch"
        zodSchema: zod.object({
            bookId: zod.string().describe("The ID of the book to fetch"),
        })
    },
    emits: [
        /**
         * Define the schema and type of the CloudEvents which this handler
         * can possibly emit as output
         */
        {
            type: "evt.books.fetch.success",
            zodSchema: zod.object({
                bookId: zod.string().describe("The ID of the book to fetch"),
                bookContent: zod.string().array().describe("The pages are array of strings"),
            })
        },
        {
            type: "evt.books.fetch.error",
            zodSchema: zod.object({
                errorName: zod.stirng().optional(),
                errorMessage: zod.string().optional(),
                errorStack: zod.string().optional(),
            })
        },
    ],
    handler: async ({type, data}) => {
        try {
            const bookId = data.bookId
            let bookContent: string[] = []
            // TODO fetch book data
            return {
                type: "evt.books.fetch.success",
                data: {
                    bookId,
                    bookContent
                }
            }
        } catch (err) {
            return {
                type: "evt.books.fetch.error",
                data: {
                    errorName: err.name,
                    errorMessage: err.message,
                    errorStack: err.stack,
                }
            }
        }
    }
})

// Usage
const {
    success, // A boolean on if the handler executed without crashing
    error, // Error is success is false
    eventToEmit, // The cloudevent to emit. If success=false, then type='sys.books.fetch.error'
} = await handler.safeCloudevent(new CloudEvent({
    type: 'cmd.books.fetch',
    data: {
        bookId: "1234.pdf",
    },
    datacontenttype: "application/cloudevents+json; charset=UTF-8",
    subject: "subject_string",
    source: "/test",
}))
```

### `createSimpleHandler`

The `createSimpleHandler` function is a factory function designed for the streamlined creation of a straightforward CloudEvent handler. This function is particularly useful when the handler involves a simple process with a clear and expected successful output. It is specifically recommended for scenarios where error handling is encapsulated within the handler, eliminating the need for explicit `try/catch` statements in the handler implementation.

#### Key Benefits:

- **Simplicity:** Simplifies the process of creating a CloudEvent handler by encapsulating common patterns for success scenarios.

- **Error Handling:** Efficiently manages error scenarios within the handler, alleviating the need for extensive error-handling code in the client application.

- **Clear Output Expectations:** Tailored for use cases where the handler primarily produces successful outputs, ensuring a focused and concise implementation.

- **Timeout:** Allows to add a timeout to the handler. If the timeout is hit then the handler return a timeout event.

#### Example:

```typescript
import * as zod from 'zod';
import { createSimpleHandler } from 'path/to/package';
import { CloudEvent } from 'cloudevents';

const mySimpleHandler = createSimpleHandler({
  /**
   * The name MUST BE intentionally defined as 'books.fetch', serving
   * as the foundation for the events the handler listens to or emits.
   * In this context, the handler listens to 'cmd.books.fetch' and
   * emits events such as 'evt.books.fetch.success',
   * 'evt.books.fetch.error', 'evt.books.fetch.timeout', or
   * 'sys.books.fetch.error'.
   */
  name: 'books.fetch',
  description: 'Handles a simple command and its events',
  accepts: zod.object({
    bookId: zod.string().describe('The ID of the book to fetch'),
  }),
  emits: zod.object({
    bookId: zod.string().describe('The ID of the book to fetch'),
    bookContent: zod
      .string()
      .array()
      .describe('The pages are array of strings'),
  }),
  handler: async (data) => {
    const bookId = data.bookId;
    let bookContent = ['string', 'string'];
    // Process the command data and return the result
    return {
      bookId,
      bookContent,
    };
  },
  timeoutMs: 5000, // Optional timeout in milliseconds
});

// Usage similar to 'CloudEventHandler'
const {
  success, // Indicates if the handler executed without errors
  error, // Error object if success is false
  eventToEmit, // The CloudEvent to emit. If success=false, type='sys.books.fetch.error'
} = await mySimpleHandler.safeCloudevent(
  new CloudEvent({
    type: 'cmd.books.fetch',
    data: {
      bookId: '1234.pdf',
    },
    datacontenttype: 'application/cloudevents+json; charset=UTF-8',
    subject: 'subject_string',
    source: '/test',
  }),
);
```

This function provides a clear and efficient approach for handling CloudEvents in scenarios where the primary focus is on successful outcomes, making it a valuable tool for developers aiming to streamline their event-handling logic.

### What is `sys.books.fetch.error`?

`sys.books.fetch.error` is a system-level error CloudEvent that may be emitted by a CloudEvent handler. This error is triggered under specific circumstances, mainly when the handler encounters issues that surpass the capabilities of its internal error handling mechanism or when unexpected errors occur.

In the context of `createSimpleHandler`, this error type is mentioned as a precautionary measure. The function is designed to encapsulate error handling within the handler itself, minimizing the likelihood of encountering such system errors. The `sys.books.fetch.error` is a fail-safe mechanism, addressing scenarios where the handler's internal error handling may fall short or if the handler crashes unexpectedly.

Contrastingly, in the case of `CloudEventHandler`, which offers greater flexibility, the assumption is that developers using this class will implement their own robust error handling within the `handler` function. Hence, the occurrence of `sys.books.fetch.error` is less expected in the context of `createSimpleHandler` due to its simplified and encapsulated error-handling approach.

### `CloudEventRouter`

The `CloudEventRouter` class efficiently manages multiple `CloudEventHandler` instances, providing a centralized mechanism for handling CloudEvents through its `cloudevents()` method. This router intelligently determines the appropriate handler for each event based on the `type` field, gathers their respective emitted events, and compiles a list for further emission into the event bus. Notably, the router executes all asynchronous handlers concurrently, ensuring parallel processing for enhanced efficiency.

#### Key Features:

- **Dynamic Event Routing:** Determines the appropriate `CloudEventHandler` for each incoming CloudEvent based on the event's `type` field.

- **Parallel Processing:** Executes asynchronous handlers concurrently, optimizing performance by processing multiple events simultaneously.

- **Global Timeout Handling:** Allows for a global timeout configuration, ensuring that all handlers are executed within the specified timeframe. In the event of a timeout, the router returns a log entry for the timed-out event, offering flexibility in handling timeout scenarios.

#### Example:

```typescript
import { CloudEventRouter, createSimpleHandler } from 'path/to/package';
import { CloudEvent } from 'cloudevents';

const myCloudEventRouter = new CloudEventRouter({
    name: "Router",
    description: "Some router"
    handlers: [
        createSimpleHandler(/* ... */),
        new CloudEventHandler(/* ... */),
    ]
});

// Process an array of CloudEvents
const results = await myCloudEventRouter.cloudevents(
    [event1, event2, ...],
    true, /* return an error log in case the event handler is not found */
    900 * 1000, /* router timeout */
);

// Usage

/**
results[0] === {
    event: CloudEvent,          // Then input event
    success: boolean,           // process success
    errorMessage?: string       // error message if raised due to router system error
    errorStack?: string,        // error stack is raised due to router system error
    errorType?: string,         // error type if raised due to router system error
    eventToEmit?: CloudEvent,   // event to emit in case of successful event handling
}
 */
```

This class serves as a versatile and efficient router for CloudEvents, simplifying event handling, parallelizing asynchronous processing, and offering flexibility in managing global timeouts.

## Contributing and Feedback

Contributions are encouraged to expand the library's capabilities, such as adding new storage backends, enhancing locking strategies, and refining documentation. If you have questions, suggestions, or feedback, feel free to open an issue in the GitHub repository.

## License

`xorca-cloudevent-router` is available under the MIT License. For more details, refer to the [LICENSE.md](/LICENSE.md) file in the project repository.
