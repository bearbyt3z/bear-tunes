/**
 * Rounds a number to the specified number of decimal places.
 *
 * This helper scales the input by `10^decimalPlaces`, rounds the scaled value
 * with `Math.round()`, and then scales it back to the original magnitude.
 *
 * A small `Number.EPSILON` adjustment is applied before rounding to reduce
 * floating-point precision issues in edge cases such as `1.005`.
 *
 * This approach is based on a commonly used JavaScript rounding pattern
 * discussed in the following Stack Overflow thread and explanatory comment.
 *
 * @param num - Number to round.
 * @param decimalPlaces - Number of decimal places to keep. Defaults to `0`.
 * @returns The rounded number.
 *
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/round | MDN: Math.round()}
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number/EPSILON | MDN: Number.EPSILON}
 * @see {@link https://stackoverflow.com/questions/11832914/how-to-round-to-at-most-2-decimal-places-if-necessary/48764436#48764436 | Stack Overflow: explanation of the EPSILON-based rounding method}
 */
export function roundToDecimalPlaces(num: number, decimalPlaces: number = 0): number {
  const p = Math.pow(10, decimalPlaces);
  const n = (num * p) * (1 + Number.EPSILON);
  return Math.round(n) / p;
}
