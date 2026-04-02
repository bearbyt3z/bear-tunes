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
