/**
 * query-string v9 is pure ESM. expo-router uses CommonJS require() and
 * calls queryString.stringify / queryString.parse on the result.
 *
 * Since Metro can't handle ESM directly, we re-export the functions
 * that expo-router needs as a plain CJS module.
 *
 * We duplicate the minimal subset of the API that expo-router/getPathFromState
 * uses: stringify and parse.
 */

// Inline the encode/decode logic that query-string provides,
// covering the subset expo-router actually calls.

function encode(value) {
  return encodeURIComponent(String(value)).replace(/%20/g, '+');
}

function decode(value) {
  try {
    return decodeURIComponent(String(value).replace(/\+/g, ' '));
  } catch {
    return value;
  }
}

function stringify(object, options = {}) {
  if (!object) return '';
  const { encode: shouldEncode = true, sort = false } = options;
  let keys = Object.keys(object);
  if (sort) keys = keys.sort();
  return keys
    .filter(key => object[key] !== undefined && object[key] !== null)
    .map(key => {
      const val = object[key];
      const encodedKey = shouldEncode ? encode(key) : key;
      if (Array.isArray(val)) {
        return val.map(v => `${encodedKey}=${shouldEncode ? encode(v) : v}`).join('&');
      }
      return `${encodedKey}=${shouldEncode ? encode(val) : val}`;
    })
    .join('&');
}

function parse(input, options = {}) {
  if (!input) return {};
  const { decode: shouldDecode = true } = options;
  return input
    .replace(/^\?/, '')
    .split('&')
    .filter(Boolean)
    .reduce((acc, pair) => {
      const idx = pair.indexOf('=');
      const key = idx >= 0 ? pair.slice(0, idx) : pair;
      const val = idx >= 0 ? pair.slice(idx + 1) : '';
      const decodedKey = shouldDecode ? decode(key) : key;
      const decodedVal = shouldDecode ? decode(val) : val;
      acc[decodedKey] = decodedVal;
      return acc;
    }, {});
}

function parseUrl(url, options) {
  const [path, query] = url.split('?');
  return { url: path, query: parse(query || '', options) };
}

function stringifyUrl({ url, query }, options) {
  const qs = stringify(query, options);
  return qs ? `${url}?${qs}` : url;
}

module.exports = { stringify, parse, parseUrl, stringifyUrl };
