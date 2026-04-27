import {
  capitalize,
} from '#tools';

/**
 * A single step in the title normalization pipeline.
 *
 * Each step receives the current title value and returns the normalized value
 * passed to the next step.
 *
 * @internal
 */
type TitleNormalizationStep = (title: string) => string;

/**
 * Ordered pipeline used to normalize a built track title.
 *
 * The order is intentional and must be preserved, because some steps depend on
 * the output produced by earlier ones.
 */
const titleNormalizationPipeline = [
  normalizeTitleSpacingAndParentheses,
  normalizeTitleMixNames,
  normalizeTitleCapitalization,
] as const satisfies readonly TitleNormalizationStep[];

/**
 * Normalizes the "feat" fragment inside a title.
 *
 * Standardizes the featuring marker to `feat.` and wraps it in parentheses when
 * it is present but not already enclosed.
 *
 * @internal
 *
 * @param title - Raw track title.
 * @returns Title with normalized featuring notation.
 *
 * @example
 * normalizeFeaturingInTitle('Title of a Track feat Someone')
 * // => 'Title of a Track (feat. Someone)'
 *
 * @example
 * normalizeFeaturingInTitle('Title of a Track (feat. Someone)')
 * // => 'Title of a Track (feat. Someone)'
 */
function normalizeFeaturingInTitle(title: string): string {
  if (!/\bfeat\b/i.test(title)) {
    return title;
  }

  // add a missing dot after the "feat" marker and normalize "Feat" to "feat"
  let normalizedTitle = title.replace(/\bfeat\.? /i, 'feat. ');

  // if "feat" is not enclosed in parentheses, add them
  if (!normalizedTitle.includes('(feat')) {
    normalizedTitle = `${normalizedTitle.replace(/\bfeat\. /, '(feat. ')})`;
  }

  return normalizedTitle;
}

/**
 * Normalizes spacing and bracket usage in a title.
 *
 * This step fixes spacing around parentheses, collapses repeated whitespace,
 * converts square brackets to parentheses, and removes duplicated outer
 * parentheses created by earlier transformations or input inconsistencies.
 *
 * @internal
 *
 * @param title - Title to normalize.
 * @returns Title with normalized spacing and parentheses.
 */
function normalizeTitleSpacingAndParentheses(title: string): string {
  return title
    .replaceAll(/\)\(/g, ') (') // add space between parentheses
    .replaceAll(/\s+\)/g, ')') // remove spaces before closing parentheses
    .replaceAll(/\(\s+/g, '(') // remove spaces after opening parentheses
    .replaceAll(/\s{2,}/g, ' ') // replace multiple whitespace chars with a single space
    .replaceAll(/\[(.*)\]/g, '($1)') // replace square brackets by parentheses
    .replaceAll(/\({2}(.*)\){2}/g, '($1)'); // replace doubled parentheses with a single one
}

/**
 * Reorders nested remix parentheses into separate title fragments.
 *
 * This callback is used by `String.prototype.replace()` to transform nested
 * forms such as `(FirstArtist Remix (SecondArtist Re-Edit))` into
 * `(FirstArtist Remix) (SecondArtist Re-Edit)`.
 *
 * @internal
 *
 * @param _fullMatch - Full regex match, unused by the transformation.
 * @param remixPart - Main remix fragment.
 * @param nestedPart - Nested fragment that should become a separate parenthesized part.
 * @returns Reordered remix fragments.
 */
function normalizeNestedRemixParentheses(
  _fullMatch: string,
  remixPart: string,
  nestedPart: string,
): string {
  return remixPart.replace(nestedPart, '') + nestedPart;
}

/**
 * Normalizes mix and remix naming inside a title.
 *
 * This step repairs common mix-label inconsistencies, such as missing `Mix`,
 * shorthand `RMX`, duplicated mix fragments, and nested remix parentheses.
 *
 * @internal
 *
 * @param title - Title to normalize.
 * @returns Title with normalized mix and remix naming.
 *
 * @example
 * normalizeTitleMixNames('Title of a Track (Original)')
 * // => 'Title of a Track (Original Mix)'
 *
 * @example
 * normalizeTitleMixNames('Title of a Track - Artist Remix (Original Mix)')
 * // => 'Title of a Track (Artist Remix)'
 */
function normalizeTitleMixNames(title: string): string {
  return title
    // add the missing "Mix" suffix
    .replace(/\((Original|Extended|Instrumental|Dub)\)/i, '($1 Mix)')
    // replace the "RMX" shorthand with "Remix"
    .replace(/\((.*)RMX(.*)\)/i, '($1Remix$2)')
    // remove a duplicated mix/remix fragment (for example one coming from both the title and mix_name)
    .replace(/(\(.*\b(\sMix|Mix\s|\sRemix|Remix\s)\b.*\))\s*(\(.*\b(Mix|Remix)\b.*\))/i, '$1')
    // e.g.: "Title of a Track - Artist Remix (Original Mix)"
    // => "Title of a Track (Artist Remix)"
    .replace(/(-|–)\s+(.*Remix)\s+\(Original Mix\)/i, '($2)')
    // e.g.: "Title of a Track (FirstArtist Remix (SecondArtist Re-Edit))"
    // => "Title of a Track (FirstArtist Remix) (SecondArtist Re-Edit)"
    .replace(/(\(.*\sRemix(\s+\(.*\))\))/, normalizeNestedRemixParentheses);
}

/**
 * Normalizes capitalization of common release and mix keywords.
 *
 * This step capitalizes well-known release and version markers used in track
 * titles, such as `Original`, `Extended`, `Mix`, `Remix`, and `Edit`.
 *
 * @internal
 *
 * @param title - Title to normalize.
 * @returns Title with normalized keyword capitalization.
 */
function normalizeTitleCapitalization(title: string): string {
  return title.replaceAll(
    /\b(original|extended|instrumental|dub|radio|mix|remix|edit|demo|tape)\b/g,
    capitalize,
  );
}

/**
 * Runs the ordered title normalization pipeline.
 *
 * The function applies all defined normalization steps sequentially. The
 * pipeline order is part of the normalization contract and should not be changed
 * casually.
 *
 * @internal
 *
 * @param title - Title to normalize.
 * @returns Fully normalized title.
 */
function runTitleNormalizationPipeline(title: string): string {
  let normalizedTitle = title;

  for (const normalizeTitle of titleNormalizationPipeline) {
    normalizedTitle = normalizeTitle(normalizedTitle);
  }

  return normalizedTitle;
}

/**
 * Builds a canonical normalized track title from a track name and optional mix name.
 *
 * The function trims inputs, normalizes featuring notation in the base title,
 * appends the mix name when provided, and runs the shared title normalization pipeline.
 *
 * @param trackName - Base track name.
 * @param trackMixName - Optional mix/version name appended in parentheses.
 * @returns Canonical normalized track title, or an empty string when the base track name is missing.
 *
 * @example
 * normalizeTrackTitle('Title of a Track feat Someone', 'Original')
 * // => 'Title of a Track (feat. Someone) (Original Mix)'
 */
export function normalizeTrackTitle(trackName?: string, trackMixName?: string): string {
  const normalizedTrackName = trackName?.trim();
  if (!normalizedTrackName) {
    return '';
  }

  let title = normalizeFeaturingInTitle(normalizedTrackName);

  const normalizedMixName = trackMixName?.trim();
  if (normalizedMixName) {
    title += ` (${normalizedMixName})`;
  }

  title = runTitleNormalizationPipeline(title);

  return title;
}
