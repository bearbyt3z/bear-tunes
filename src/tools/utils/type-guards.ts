/**
 * Checks if a value is an empty plain object.
 *
 * An empty plain object is a non-null object whose prototype is
 * `Object.prototype`, is not an array, and has no own properties.
 *
 * The type guard narrows the value to `Record<string, never>`, meaning
 * string-keyed property access produces the `never` type.
 *
 * Usage:
 * ```ts
 * const payload: unknown = {};
 *
 * if (isEmptyPlainObject(payload)) {
 *   const value = payload.someKey;
 *   // value has type `never`
 * }
 * ```
 *
 * @param value - Value to check.
 * @returns `true` if the value is an empty plain object.
 */
export function isEmptyPlainObject(
  value: unknown,
): value is Record<string, never> {
  return value !== null
    && typeof value === 'object'
    && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype
    && Reflect.ownKeys(value).length === 0;
}

/**
 * Checks whether a value is an Error with a string error code.
 *
 * @param value - Unknown value to inspect.
 * @returns `true` when the value is an Error with a string `code` property.
 */
export function isErrorWithStringCode(
  value: unknown,
): value is Error & { code: string } {
  return (
    value instanceof Error
    && 'code' in value
    && typeof value.code === 'string'
  );
}

/**
 * Checks if a value is a plain object suitable for use as a string-keyed record.
 *
 * A value is considered an object record when it is a non-null, non-array object
 * whose prototype is either `Object.prototype` or `null`.
 *
 * The type guard narrows the value to `Record<string, unknown>`, allowing
 * access to string-keyed properties while keeping their values typed as `unknown`.
 *
 * Usage:
 * ```ts
 * const value: unknown = {
 *   name: 'Track',
 * };
 *
 * if (isObjectRecord(value)) {
 *   const name = value.name;
 *   // name has type `unknown`
 * }
 * ```
 *
 * @param value - Value to check.
 * @returns `true` if the value is a plain object suitable for use as a record.
 */
export function isObjectRecord(
  value: unknown,
): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') {
    return false;
  }

  if (Array.isArray(value)) {
    return false;
  }

  const prototype = Reflect.getPrototypeOf(value);

  return prototype === Object.prototype || prototype === null;
}

/**
 * Checks if a value is an array.
 *
 * The type guard narrows the value to `unknown[]`, meaning that the value
 * is known to be an array while its element types remain `unknown`.
 *
 * Usage:
 * ```ts
 * const value: unknown = ['artist', 42, null];
 *
 * if (isUnknownArray(value)) {
 *   const firstItem = value[0];
 *   // firstItem has type `unknown`
 * }
 * ```
 *
 * @param value - Value to check.
 * @returns `true` if the value is an array.
 */
export function isUnknownArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

/**
 * Checks if a value is an array containing only non-null, non-array objects.
 *
 * Type guard returns `value is object[]`, meaning:
 * - Runtime: the value is an array and every item is a non-null, non-array object.
 * - TypeScript: the value is narrowed from `unknown` to `object[]`.
 *
 * Usage:
 * ```ts
 * if (isObjectArray(value)) {
 *   // value has type object[]
 *   const firstItem = value[0];
 * }
 * ```
 *
 * @param value - Value to check.
 * @returns `true` if the value is an array containing only non-null, non-array objects.
 */
export function isObjectArray(value: unknown): value is object[] {
  return isUnknownArray(value)
    && value.every((item) => typeof item === 'object' && item !== null && !Array.isArray(item));
}
