/**
 * Checks if a value is an empty plain object.
 *
 * Type guard returns `value is Record<string, never>`, meaning:
 * - Runtime: empty object with no own enumerable properties
 * - TypeScript: object with no property access (restrictive)
 *
 * Usage:
 * ```ts
 * if (isEmptyPlainObject(payload)) {
 *   // payload has type Record<string, never>
 *   // payload.key is a TS error - correct for empty object
 * }
 * ```
 *
 * @param value - Value to check.
 * @returns `true` if the value is an empty plain object.
 */
export function isEmptyPlainObject(value: unknown): value is Record<string, never> {
  return value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype &&
    Object.keys(value).length === 0;
}

/**
 * Checks if a value is a non-null object accessible through string keys.
 *
 * Type guard returns `value is Record<string, unknown>`, meaning:
 * - Runtime: non-null value with the `object` type
 * - TypeScript: object properties can be accessed safely after further narrowing
 *
 * Usage:
 * ```ts
 * if (isObjectRecord(value)) {
 *   // value has type Record<string, unknown>
 *   const prop = value.someKey;
 * }
 * ```
 *
 * @param value - Value to check.
 * @returns `true` if the value is a non-null object.
 */
export function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

/**
 * Returns whether the given value is a readonly array of strings.
 *
 * This helper exists primarily as a TypeScript narrowing workaround. In some
 * `string | readonly string[]` unions, `Array.isArray()` alone may not narrow
 * the non-array branch correctly, which can still produce property access errors
 * on the remaining `string` path.
 *
 * @param value - Value to check.
 * @returns `true` when the value is a readonly string array; otherwise `false`.
 */
export function isReadonlyStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value);
}

/**
 * Checks if a value is an array.
 *
 * Type guard returns `value is unknown[]`, meaning:
 * - Runtime: the value is an array
 * - TypeScript: array elements keep the `unknown` type instead of `any`
 *
 * Usage:
 * ```ts
 * if (isUnknownArray(value)) {
 *   // value has type unknown[]
 *   const firstItem = value;
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
 * Checks if a value is an array of non-null objects with string keys.
 *
 * Type guard returns `value is Record<string, unknown>[]`, meaning:
 * - Runtime: the value is an array and every item is a non-null object
 * - TypeScript: array elements are narrowed from `unknown` to `Record<string, unknown>`
 *
 * Usage:
 * ```ts
 * if (isRecordArray(value)) {
 *   // value has type Record<string, unknown>[]
 *   const firstItem = value;
 * }
 * ```
 *
 * @param value - Value to check.
 * @returns `true` if the value is an array containing only non-null, non-array objects.
 */
export function isRecordArray(value: unknown): value is Record<string, unknown>[] {
  return isUnknownArray(value)
    && value.every((item) => typeof item === 'object' && item !== null && !Array.isArray(item));
}
