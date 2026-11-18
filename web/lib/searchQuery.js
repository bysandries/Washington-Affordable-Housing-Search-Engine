/**
 * Turns a free-text query like "rent in seattle" into the keywords that
 * actually identify places and buildings. Shared by the server query
 * (lib/db.js) and the client-side map mirror so both always agree.
 */

// Filler vocabulary people naturally type into a housing search. None of these
// words distinguish one property from another, so they carry no constraint —
// "rent in seattle" must mean exactly what "seattle" means.
const STOPWORDS = new Set([
  'rent', 'rents', 'rental', 'rentals', 'rented', 'renting',
  'apartment', 'apartments', 'apt', 'apts',
  'housing', 'house', 'houses', 'home', 'homes', 'condo', 'condos',
  'unit', 'units', 'room', 'rooms', 'listing', 'listings',
  'property', 'properties', 'building', 'buildings',
  'in', 'near', 'nearby', 'around', 'at', 'on', 'by', 'to', 'of',
  'for', 'with', 'and', 'or', 'the', 'a', 'an', 'me', 'my',
  'cheap', 'affordable', 'available', 'now', 'new',
  'wa', 'washington', 'state', 'usa',
])

/**
 * Query → meaningful lowercase tokens. Single characters are dropped too:
 * they match half the dataset and constrain nothing.
 */
export function tokenizeQuery(query) {
  return (query || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t))
}

/**
 * AND across tokens, OR across fields: every keyword must appear somewhere,
 * but each may hit a different field ("broadway seattle" → name + city).
 * Substring rather than whole-word so partial input matches while typing.
 */
export function matchesTokens(tokens, fields) {
  return tokens.every((t) => fields.some((f) => (f || '').toLowerCase().includes(t)))
}

/** A place name's words that a query could match (filler words drop out). */
function placeWords(name) {
  const words = String(name || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 1)
  const significant = words.filter((w) => !STOPWORDS.has(w))
  // A name made only of filler ("Home", WA) stays matchable by its words.
  return significant.length ? significant : words
}

/** Compare two [wholeName, matched, exact] scores; > 0 when a beats b. */
function compareScores(a, b) {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i]
  return 0
}

// The words of a street address that name no place: street types, unit
// designators and compass abbreviations. Such a word never identifies a place
// by itself ("pike st" is not Stanwood, "e denny way" is not Federal Way,
// "22nd ave ne" is not Nespelem); it can only complete a place whose other
// words match too ("federal way", "university place").
const ADDRESS_WORDS = new Set([
  'st', 'street', 'ave', 'av', 'avenue', 'way', 'rd', 'road', 'dr', 'drive',
  'pl', 'place', 'ct', 'court', 'ln', 'lane', 'blvd', 'boulevard', 'hwy',
  'highway', 'pkwy', 'parkway', 'ter', 'terrace', 'cir', 'circle', 'loop',
  'trl', 'trail', 'sq', 'square', 'aly', 'alley', 'row', 'apt', 'ste',
  'suite', 'bldg', 'fl', 'floor', 'ne', 'nw', 'se', 'sw',
])

// A query word matches a place word exactly, or as the start of it once at
// least this long, so typing "lyn" finds Lynnwood while "st" or "se" never
// stand in for Stanwood or Seattle.
const MIN_PREFIX = 3

/**
 * The place a query names, if any — used to say where the results are and
 * to focus the map there. Matching is word-prefix rather than substring so
 * "lynn" finds Lynnwood but a stray "ent" inside "Kent" never triggers a jump.
 * Words holding a digit ("840", "22nd") are house numbers and street names,
 * never places, and street words only ever complete a match (ADDRESS_WORDS).
 *
 * Every candidate is scored rather than taking the first hit, so a
 * multi-word name beats a place that merely shares one of its words
 * ("capitol hill" is Capitol Hill, not Beacon Hill; "spokane valley" is
 * Spokane Valley, not Spokane; "wenatchee" is Wenatchee, not East
 * Wenatchee). Ranked by, in order:
 *   1. every word of the name is matched (a whole-name match),
 *   2. how many of the name's words are matched,
 *   3. how many of those match a query word exactly rather than by prefix,
 *   4. the caller's priority order (cities, then neighborhoods, then
 *      counties): ties keep the earlier name.
 *
 * A name is only a guess at what the query means: page.js shows it only when
 * the results actually lie there.
 */
export function detectPlace(tokens, placeNames) {
  const words = (tokens || []).filter((t) => !/\d/.test(t))
  if (!words.length) return ''
  const hits = (w) => words.filter((t) => t === w || (t.length >= MIN_PREFIX && w.startsWith(t)))
  let best = ''
  let bestScore = null
  for (const name of placeNames) {
    const nameWords = placeWords(name)
    let matched = 0
    let exact = 0
    let anchored = false
    for (const w of nameWords) {
      const by = hits(w)
      if (!by.length) continue
      matched += 1
      if (by.includes(w)) exact += 1
      if (by.some((t) => !ADDRESS_WORDS.has(t))) anchored = true
    }
    if (!matched || !anchored) continue
    const score = [matched === nameWords.length ? 1 : 0, matched, exact]
    if (!bestScore || compareScores(score, bestScore) > 0) {
      best = name
      bestScore = score
    }
  }
  return best
}

/**
 * A county named as a county ("king county", "rent in grays harbor county").
 * The county column holds "King", never the word "county", so as a keyword
 * search it matches nothing. Returns the county and the query's other words
 * ({ county: 'King', rest: [] }) so the caller can apply it as the County
 * filter, or null. Whole words only.
 */
export function countyInQuery(tokens, counties) {
  if (!tokens || !(tokens.includes('county') || tokens.includes('counties'))) return null
  let best = null
  for (const name of counties || []) {
    const words = placeWords(name)
    if (words.length && words.every((w) => tokens.includes(w))) {
      if (!best || words.length > best.words.length) best = { name, words }
    }
  }
  if (!best) return null
  const drop = new Set([...best.words, 'county', 'counties'])
  return { county: best.name, rest: tokens.filter((t) => !drop.has(t)) }
}
