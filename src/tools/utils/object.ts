/**
 * Sets an object field to the provided value, or deletes the field when the
 * value is `undefined`.
 *
 * This helper is useful when building object copies that should omit optional
 * fields with missing values instead of storing them as `undefined`.
 *
 * @param obj - Object to update.
 * @param key - Field name to set or delete.
 * @param value - Value to assign, or `undefined` to remove the field.
 */
export function setOrDeleteObjectField(
  obj: Record<string, unknown>,
  key: string,
  value: unknown,
): void {
  if (value === undefined) {
    delete obj[key];
    return;
  }

  obj[key] = value;
}
