import { CloudEvent } from 'cloudevents';

/**
 * Custom error class for representing a promise timeout.
 */
export class PromiseTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PromiseTimeoutError';
  }
}

/**
 * Wraps a promise function and adds a timeout feature.
 *
 * @typeParam T - The type of the promise result.
 * @typeParam U - The type of the arguments for the promise function.
 * @param promise - The promise function to be wrapped.
 * @param timeoutMs - The timeout duration in milliseconds.
 * @returns A new function that wraps the original promise function with a timeout.
 *
 * @example
 * ```typescript
 * const delayedPromise = (value: number, delay: number) =>
 *   new Promise<number>(resolve => setTimeout(() => resolve(value), delay));
 *
 * const wrappedPromise = timedPromise(delayedPromise, 1000);
 * const result = await wrappedPromise(42, 500); // Resolves successfully after 500ms.
 * ```
 */
export const timedPromise = <T, U extends any[]>(
  promise: (...args: U) => Promise<T>,
  timeoutMs: number,
) => {
  return async (...args: U) => {
    let timeoutHandler: any;

    const resp = await Promise.race([
      promise(...args),
      new Promise<T>((_, reject) => {
        timeoutHandler = setTimeout(() => {
          reject(
            new PromiseTimeoutError(`Promise timed out after ${timeoutMs}ms.`),
          );
        }, timeoutMs);
      }),
    ]);

    clearTimeout(timeoutHandler);
    return resp;
  };
};

/**
 * Checks if a string contains both opening and closing double curly braces.
 * @param {string} inputString - The input string to be checked.
 * @returns {boolean} - Returns true if the input string contains both {{ and }}; otherwise, returns false.
 * @example
 * // Returns false
 * containsDoubleCurlyBraces('x.y.{car}');
 *
 * // Returns false
 * containsDoubleCurlyBraces('x.y.z');
 *
 * // Returns false
 * containsDoubleCurlyBraces('x.y.x.{}');
 *
 * // Returns true
 * containsDoubleCurlyBraces('x.y.{{car}}');
 *
 * // Returns false
 * containsDoubleCurlyBraces('x.y.x.{{.xcdsa');
 */
export function containsDoubleCurlyBraces(inputString: string): boolean {
  return /\{\{.*\}\}/.test(inputString);
}

/**
 * Matches an input string against a template containing variables.
 * @param {string} inputString - The input string to be matched.
 * @param {string} template - The template string containing variables in the form {{variable}}.
 * @returns {{ matched: boolean, result?: Record<string, string> }} - An object indicating whether the template matched and, if so, the values of the variables.
 *
 * @example
 * const template = 'x.y.{{car}}.z.{{owner}}';
 * const inputString = 'x.y.sedan.z.john';
 * const { matched, result } = matchTemplate(inputString, template);
 * if (matched) {
 *  console.log('Template matched:', result);
 * } else {
 *  console.log('Template did not match.');
 * }
 */
export function matchStringTemplate(
  inputString: string,
  template: string,
): { matched: boolean; result?: Record<string, string> } {
  const regex = new RegExp(template.replace(/\{\{([^}]+)\}\}/g, '(.+)'));
  const match = inputString.match(regex);
  if (!match) return { matched: false };
  const variableValues = match.slice(1);
  const variableNames =
    template.match(/\{\{([^}]+)\}\}/g)?.map((match) => match.slice(2, -2)) ||
    [];
  const result: Record<string, string> = {};
  variableNames.forEach((name, index) => {
    result[name] = variableValues[index];
  });
  return { matched: true, result };
}

/**
 * Matches inputString against an array of templates with optional parameters.
 * The first best match is considered in the matching process.
 *
 * @param inputString - The string to be matched against templates.
 * @param templates - An array of template strings to compare against inputString.
 * @returns An object containing the matched template and optional parameters,
 *          or undefined if no match is found.
 *
 * @example
 * // Consider the input string "Hello world!" and two templates:
 * // Template 1: "Hello {{name}}!"
 * // Template 2: "{{greeting}} world!"
 * // Assuming `inputString` is matched against these templates, the result will be:
 * matchTemplates("Hello world!", ["Hello {{name}}!", "{{greeting}} world!"]);
 * // Output: { matchedTemplate: "Hello {{name}}!", params: {name: "world"} }
 */
export function matchTemplates(
  inputString: string,
  templates: string[],
): { matchedTemplate: string; params?: Record<string, string> } | undefined {
  // Sort templates based on the presence of double curly braces.
  templates = templates.sort(
    (a, b) =>
      Number(containsDoubleCurlyBraces(a)) -
      Number(containsDoubleCurlyBraces(b)),
  );

  // Map each template to an object containing the template and its match result.
  const matchedTemplates = templates
    .map((item) => ({
      template: item,
      ...matchStringTemplate(inputString, item),
    }))
    // Filter templates to include only those that have a successful match.
    .filter((item) => item.matched);

  // If no matched templates are found, return undefined.
  if (!matchedTemplates?.length) return undefined;

  // Return the first matched template and its result parameters.
  return {
    matchedTemplate: matchedTemplates[0].template,
    params: matchedTemplates[0]?.result,
  };
}

/**
 * Formats a template string by replacing placeholders with provided parameter values.
 *
 * @param template - The template string containing placeholders in the format `{{key}}`.
 * @param params - An optional object containing key-value pairs for placeholder replacements.
 * @returns The formatted string with replaced placeholders.
 *
 * @example
 * // Format a template with parameters:
 * const formattedString = formatTemplate("Hello, {{name}}!", { name: "John" });
 * // Output: "Hello, John!"
 *
 * @example
 * // Format a template without parameters:
 * const formattedStringWithoutParams = formatTemplate("Greetings!");
 * // Output: "Greetings!"
 */
export function formatTemplate(
  template: string,
  params?: Record<string, string>,
) {
  return Object.entries(params || {}).reduce(
    (acc, [key, value]) => acc.replace(`{{${key}}}`, value),
    template,
  );
}

/**
 * Prints the current time provided by `Date.now()` in hexadecimal format with 8 digits.
 * as per [documentation] https://docs.aws.amazon.com/xray/latest/devguide/xray-api-sendingdata.html#xray-api-traceids
 * @param currentTimeInMilliseconds - Optional parameter for a specific time in milliseconds.
 *                                    Defaults to the current time obtained from `Date.now()`.
 * @returns A string representing the current time in hexadecimal with 8 digits.
 */
export function makeTimeWithHexDigits(
  currentTimeInMilliseconds: number = Date.now(),
): string {
  const hexTime: string = currentTimeInMilliseconds.toString(16).toUpperCase();
  return hexTime.padStart(8, '0');
}

export function insertHyphen(inputString: string, position: number): string {
  if (position < 0 || position > inputString.length) {
    throw new Error('Invalid position');
  }
  const hyphenatedString =
    inputString.slice(0, position) + '-' + inputString.slice(position);
  return hyphenatedString;
}

export function cleanString(s: string): string {
  return s
    .split('\n')
    .map((item) => item.trim())
    .join('\n');
}
