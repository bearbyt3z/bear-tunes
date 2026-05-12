import logger from '#logger';
import {
  fetchWebPage,
  isObjectRecord,
  isUnknownArray,
} from '#tools';

/**
 * Extracts the primary dehydrated payload from a Next.js page.
 *
 * The function loads the target page, reads the `#__NEXT_DATA__` element,
 * parses its JSON content, and returns the first resolved query payload from
 * `props.pageProps.dehydratedState`.
 *
 * @param url - Absolute URL of the Next.js page.
 * @returns Extracted query payload, or `undefined` when the page could not be fetched.
 * @throws {TypeError} When the page does not expose the expected Next.js structure.
 */
export async function extractNextJSData(url: URL): Promise<unknown> {
  const page = await fetchWebPage(url);

  logger.debug(
    'Fetched page for Next.js data extraction',
    {
      url: url.toString(),
      attempts: page.attempts,
    },
  );

  if (!page.success || page.document === null) {
    return undefined;
  }

  const doc = page.document;

  const nextJSElement = doc.querySelector('#__NEXT_DATA__'); // Next.js object containing element
  const nextJSText = nextJSElement?.textContent; // Next.js object text

  if (!nextJSText) {
    throw new TypeError('Cannot obtain Next.js object.');
  }

  let data: unknown;
  try {
    data = JSON.parse(nextJSText);
  } catch (error) {
    throw new TypeError('Cannot parse Next.js object.', { cause: error });
  }

  if (!isObjectRecord(data)) {
    throw new TypeError('Parsed Next.js object is not an object.');
  }

  const props = data.props;
  if (!isObjectRecord(props)) {
    throw new TypeError('Cannot unpack props from Next.js object.');
  }

  const pageProps = props.pageProps;
  if (!isObjectRecord(pageProps)) {
    throw new TypeError('Cannot unpack pageProps from Next.js object.');
  }

  const dehydratedState = pageProps.dehydratedState;
  if (!isObjectRecord(dehydratedState)) {
    throw new TypeError('Cannot unpack dehydratedState from Next.js object.');
  }

  const queries = dehydratedState.queries;
  if (!isUnknownArray(queries) || queries.length < 1) {
    throw new TypeError('Cannot unpack queries from Next.js object.');
  }

  const firstQuery = queries[0];
  if (!isObjectRecord(firstQuery)) {
    throw new TypeError('Cannot unpack first query from Next.js object.');
  }

  const state = firstQuery.state;
  if (!isObjectRecord(state)) {
    throw new TypeError('Cannot unpack state from Next.js object.');
  }

  const stateData = state.data;
  if (!stateData) {
    throw new TypeError('Cannot unpack state data from Next.js object.');
  }

  if (
    isObjectRecord(stateData)
    && 'data' in stateData
    && isUnknownArray(stateData.data)
  ) {
    return stateData.data;
  }

  return stateData;
}
