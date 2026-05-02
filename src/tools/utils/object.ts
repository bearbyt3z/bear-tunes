/**
 * Returns a shallow copy of an object without properties whose values are `undefined`.
 *
 * Keeps all other property values unchanged, including `null`, `false`, `0`,
 * empty strings, arrays, and nested objects.
 *
 * @typeParam T - Object type to clean.
 * @param object - Object to copy and clean.
 * @returns A shallow copy of `object` with all `undefined`-valued properties removed.
 */
export function removeUndefinedObjectFields<T extends object>(object: T): T {
  return Object.fromEntries(
    Object.entries(object).filter(([, value]) => value !== undefined),
  ) as T;
}
