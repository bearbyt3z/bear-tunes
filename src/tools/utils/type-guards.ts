/**
 * Checks if a value is an empty plain object.
 *
 * Type guard returns `value is Record<string, never>`, meaning:
 * - Runtime: empty object with no own enumerable properties
 * - TypeScript: object with no property access (restrictive)
 *
 * Usage:
 * ```ts
 * if (isEmptyPlainObject(trackInfo)) {
 *   // obj has type Record<string, never>
 *   // obj.key is a TS error - correct for empty object
 * }
 * ```
 *
 * @param value - Value to check
 * @returns `true` if empty plain object
 */
export function isEmptyPlainObject(value: unknown): value is Record<string, never> {
  return value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype &&
    Object.keys(value).length === 0;
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
