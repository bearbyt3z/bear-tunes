/**
 * Returns the elements of the first array that are not present in the second array.
 *
 * This is a "set" difference operation: `array1 ∖ array2`.
 * Duplicates in the first array are preserved if they are not present in the second.
 *
 * @param array1 The array from which elements are taken.
 * @param array2 The array of elements to exclude.
 * @returns A new array containing elements from `array1` that are not in `array2`.
 */
export function arrayDifference<T>(array1: readonly T[], array2: readonly T[]): T[] {
  const excluded = new Set(array2);
  return array1.filter((value) => !excluded.has(value));
}

/**
 * Returns the elements that are present in both arrays.
 *
 * This is a set intersection operation: `array1 ∩ array2`.
 * Duplicates from the first array are preserved if they also appear in the second.
 *
 * @param array1 The first array.
 * @param array2 The second array.
 * @returns A new array containing elements present in both `array1` and `array2`.
 */
export function arrayIntersection<T>(array1: readonly T[], array2: readonly T[]): T[] {
  const included = new Set(array2);
  return array1.filter((value) => included.has(value));
}

/**
 * Maps an array of strings to their lowercase equivalents.
 *
 * Each element in the returned array is the result of calling
 * `String.prototype.toLowerCase()` on the corresponding element
 * from the input array.
 *
 * @param array The array of strings to convert.
 * @returns A new array where every string is converted to lowercase.
 */
export function arrayToLowerCase(array: string[]): string[] {
  return array.map((value) => value.toLowerCase());
}
