'use client'

import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import FilterBar from '@/components/FilterBar'
import PropertyCard from '@/components/PropertyCard'
import PropertyPanel from '@/components/PropertyPanel'
import SearchHeader from '@/components/SearchHeader'
import { bedroomAliases } from '@/lib/bedrooms'
import { countyInQuery, detectPlace, matchesTokens, tokenizeQuery } from '@/lib/searchQuery'
import { hasUnitFilters, parseUnitSummary, unitMatchesFilters } from '@/lib/unitFilter'
import { trackEvent } from '@/lib/analytics'
import { Icon } from '@/lib/theme'
import {
  clearShareToken,
  decodeShare,
  importShared,
  readShareToken,
  resolveShared,
  useFavorites,
} from '@/lib/favorites'

const Map = dynamic(() => import('@/components/Map'), { ssr: false })

const PAGE_SIZE = 48

const DEFAULT_FILTERS = {
  search: '',
  neighborhood: '',
  city: '',
  county: '',
  program: '',
  incentive: '',
  bedroom: '',
  maxRent: 0,
  hasListings: false,
  availableNow: false,
  favoritesOnly: false,
  page: 1,
}

const FOOTER_LINKS = [
  { href: '/about', label: 'About' },
  { href: '/privacy', label: 'Privacy' },
  { href: '/terms', label: 'Terms' },
  { href: '/disclaimer', label: 'Disclaimer' },
]

// Tailwind's lg and sm breakpoints, in em as in tailwind.config.js (so a
// larger default text size moves them too): where the details panel stops
// covering the results (lg) and the map (sm).
const LG_UP = '(min-width: 64em)'
const SM_UP = '(min-width: 40em)'

// Short screens (app/globals.css, "Short screens"): under 30em of viewport
// height the page scrolls as one document, and the details and Filters
// panels open as full-screen sheets. The same height as the `short:`
// variant's media query, plus the same height in rem (see useShortScreen).
const SHORT_SCREEN = '(max-height: 30em)'
const SHORT_SCREEN_REM = 30

// A search whose matches number at most this many places on the map reads
// as an address or a street ("e denny way": 15 places), so the map frames
// them. Anything broader ("se" or a half-typed word: hundreds) leaves the
// map where the visitor put it, unless the search names a place.
const ADDRESS_FIT_MAX = 50

const PLACE_KINDS = ['city', 'neighborhood', 'county']

/**
 * Where a set of results is: the place a search names (detectPlace), as a
 * city, neighborhood or county in that order, when at least half of the
 * results lie in it; otherwise null. The name is only a guess at what the
 * words mean, so the results decide: "pike st" never reads "in Stanwood",
 * and "yakima" reads "in Yakima County" when its matches spread over the
 * county's towns rather than the city.
 */
function placeOfResults(name, lists, results) {
  if (!name || !results?.length) return null
  for (const kind of PLACE_KINDS) {
    if (!lists[kind].includes(name)) continue
    let inside = 0
    for (const p of results) if (p[kind] === name) inside += 1
    if (inside * 2 >= results.length) {
      return { kind, name, label: kind === 'county' ? `${name} County` : name }
    }
  }
  return null
}

function useMediaQuery(query) {
  // False on the server and the first client render; the panel that depends
  // on it can only open after mount, so nothing reads the guess.
  const [matches, setMatches] = useState(false)
  useEffect(() => {
    const mql = window.matchMedia(query)
    const update = () => setMatches(mql.matches)
    update()
    if (mql.addEventListener) mql.addEventListener('change', update)
    else mql.addListener(update)
    return () => {
      if (mql.removeEventListener) mql.removeEventListener('change', update)
      else mql.removeListener(update)
    }
  }, [query])
  return matches
}

/**
 * Whether the page is in its short-screen mode. The CSS switches the layout
 * with a media query in em, which follows zoom and the browser's text size;
 * this measures the same height in rem as well, so text enlarged on the root
 * element alone (a user style sheet or an extension) counts too, and marks
 * <html> with .short-screen for the `short:` / `tall:` variants. `probeRef`
 * is a 1rem-wide element: it notices the root text size changing, which
 * fires no resize event.
 */
function useShortScreen(probeRef) {
  const [short, setShort] = useState(false)
  useEffect(() => {
    const root = document.documentElement
    const mql = window.matchMedia(SHORT_SCREEN)
    const update = () => {
      const rem = parseFloat(getComputedStyle(root).fontSize) || 16
      const next = mql.matches || window.innerHeight < SHORT_SCREEN_REM * rem
      root.classList.toggle('short-screen', next)
      setShort(next)
    }
    update()
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null
    if (observer && probeRef.current) observer.observe(probeRef.current)
    if (mql.addEventListener) mql.addEventListener('change', update)
    else mql.addListener(update)
    window.addEventListener('resize', update)
    return () => {
      observer?.disconnect()
      if (mql.removeEventListener) mql.removeEventListener('change', update)
      else mql.removeListener(update)
      window.removeEventListener('resize', update)
      root.classList.remove('short-screen')
    }
  }, [probeRef])
  return short
}

// The .pager recipe adapts it to its width in rem: chevron-only buttons
// (named by their visually hidden words) on narrow phones and at large text,
// and the page label on its own row when even that is too tight.
function Pager({ page, pageCount, onPage }) {
  return (
    <nav aria-label="Pages" className="pager mt-6">
      <div className="pager-row">
        <button
          type="button"
          onClick={() => onPage(page - 1)}
          disabled={page <= 1}
          className="btn btn-secondary pager-btn"
        >
          <Icon name="chevronLeft" className="shrink-0" />
          <span className="pager-btn-text">Previous</span>
        </button>
        <p className="pager-label text-sm text-muted">
          Page <span className="font-mono text-ink">{page}</span> of{' '}
          <span className="font-mono text-ink">{pageCount}</span>
        </p>
        <button
          type="button"
          onClick={() => onPage(page + 1)}
          disabled={page >= pageCount}
          className="btn btn-secondary pager-btn"
        >
          <span className="pager-btn-text">Next</span>
          <Icon name="chevronRight" className="shrink-0" />
        </button>
      </div>
    </nav>
  )
}

// Placeholder cards with PropertyCard's anatomy and height (title row with
// the heart's slot; place line, price and two snippet lines beside the
// photo; pill row), so the list does not jump when results arrive.
function ResultSkeleton() {
  return (
    <div className="card-list mt-3 space-y-3" aria-hidden="true">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="card p-4">
          <div className="flex h-8 items-center">
            <div className="skeleton h-4 w-2/3" />
          </div>
          <div className="mt-1 flex gap-3">
            <div className="min-w-0 flex-1 pt-1">
              <div className="skeleton h-3 w-1/2" />
              <div className="skeleton mt-3 h-4 w-28" />
              <div className="skeleton mt-3 h-3 w-full" />
              <div className="skeleton mt-2.5 h-3 w-4/5" />
            </div>
            <div className="card-thumb skeleton size-[4.5rem] shrink-0 rounded-lg sm:size-20" />
          </div>
          <div className="mt-3 flex items-center gap-1.5">
            <div className="skeleton h-[1.625rem] w-24 rounded-full" />
            <div className="skeleton h-[1.625rem] w-20 rounded-full" />
            <div className="skeleton h-3 w-24" />
          </div>
        </div>
      ))}
    </div>
  )
}

// fetch() that treats an HTTP error as a failure, not as data.
function getJson(url, init) {
  return fetch(url, init).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    return r.json()
  })
}

export default function HomePage() {
  const [filters, setFilters] = useState(DEFAULT_FILTERS)
  const [properties, setProperties] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  // The filters that produced `properties` and `total`. Until they match the
  // current filters the list counts as loading, so a count is never shown or
  // announced next to a place it was not computed for.
  const [resultsFilters, setResultsFilters] = useState(null)
  // The list request failed (offline, server error, unreadable reply).
  // `listAttempt` re-runs it from the error card's "Try again".
  const [listError, setListError] = useState(false)
  const [listAttempt, setListAttempt] = useState(0)
  const [mapProperties, setMapProperties] = useState([])
  // The map's points (a large payload) arrive well after the list. Until
  // they do, the map says it is loading rather than "0 places on the map".
  const [mapLoading, setMapLoading] = useState(true)
  const [mapError, setMapError] = useState(false)
  const [mapAttempt, setMapAttempt] = useState(0)
  const [neighborhoods, setNeighborhoods] = useState([])
  const [cities, setCities] = useState([])
  const [counties, setCounties] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const {
    properties: favoriteProperties,
    units: favoriteUnits,
    places: favoritePlaces,
    propertyIds: favoritePropertyIds,
    isPropertyFavorite,
    toggleProperty,
    savedUnitCount,
    count: favoriteCount,
  } = useFavorites()
  // A list opened from a shared link. Held separately from this browser's own
  // favorites so arriving on a link never quietly rewrites what someone saved.
  const [shared, setShared] = useState(null)
  const [detailId, setDetailId] = useState(null)
  // 'listings' (results + map card) | 'map' (the map, full bleed)
  const [view, setView] = useState('listings')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const listRef = useRef(null)
  const abortRef = useRef(null)
  const remProbeRef = useRef(null)
  // The map card's error message, and the box holding the map, so a
  // successful "Try again" can hand focus from the one to the other.
  const mapErrorRef = useRef(null)
  const mapBoxRef = useRef(null)
  // Focus targets: the results heading (where focus goes when the control
  // that had it disappears), the details panel, and what opened the panel.
  const headingRef = useRef(null)
  const panelRef = useRef(null)
  const panelOpenerRef = useRef(null)
  const isLgUp = useMediaQuery(LG_UP)
  const isSmUp = useMediaQuery(SM_UP)
  const isShort = useShortScreen(remProbeRef)

  // Load static data once. The place lists only power the selects and place
  // detection, so a failure leaves them empty; the map's points say so on
  // the map and can be retried.
  useEffect(() => {
    const loadList = (type, set) =>
      getJson(`/api/properties?type=${type}`)
        .then((d) => set(Array.isArray(d) ? d : []))
        .catch(() => set([]))
    loadList('neighborhoods', setNeighborhoods)
    loadList('cities', setCities)
    loadList('counties', setCounties)
  }, [])

  // A retry ("Try again" on the map's error card) keeps the card up, saying
  // it is loading, until the request settles: a failure leaves keyboard focus
  // on the same Try again, and a success hands it to the map itself before
  // the card goes, never to <body>.
  useEffect(() => {
    let cancelled = false
    setMapLoading(true)
    getJson('/api/properties?type=map')
      .then((d) => {
        if (cancelled) return
        if (!Array.isArray(d)) throw new Error('Unexpected map data')
        if (mapErrorRef.current?.contains(document.activeElement)) {
          mapBoxRef.current?.querySelector('.leaflet-container')?.focus()
        }
        setMapProperties(d)
        setMapError(false)
        setMapLoading(false)
      })
      .catch(() => {
        if (cancelled) return
        setMapError(true)
        setMapLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [mapAttempt])

  // A shared link decodes into a view of someone else's list, shown until it is
  // either imported or dismissed. The token is stripped from the address bar so
  // a later reload does not resurrect it.
  useEffect(() => {
    const token = readShareToken()
    if (!token) return
    let cancelled = false
    decodeShare(token)
      // Re-point the list at current ids before showing it, so a building whose
      // id was reissued still appears instead of reading as "no longer listed".
      .then((list) => (list ? resolveShared(list) : null))
      .then((list) => {
        if (cancelled || !list || (!list.properties.length && !list.units.length)) return
        setShared(list)
        setFilters((f) => ({ ...f, favoritesOnly: true, page: 1 }))
        clearShareToken()
      })
    return () => { cancelled = true }
  }, [])

  // While viewing a shared list, "favorites" means theirs, not this browser's.
  // Declared before the effects that read it, or the dependency array evaluates
  // it in the temporal dead zone.
  const activeFavoriteIds = useMemo(() => {
    if (!shared) return favoritePropertyIds
    return [...new Set([...shared.properties, ...shared.units.map((u) => u.propertyId)])]
  }, [shared, favoritePropertyIds])

  // Buildings to mark on the map: hearted outright, or holding a saved
  // apartment. Shown while browsing, not only under the favorites filter.
  const savedIds = useMemo(() => new Set(activeFavoriteIds.map(Number)), [activeFavoriteIds])

  const sharedSavedUnitCount = useCallback(
    (id) =>
      shared
        ? shared.units.filter((u) => Number(u.propertyId) === Number(id)).length
        : savedUnitCount(id),
    [shared, savedUnitCount]
  )

  const sharedUnitKeys = useMemo(
    () => (shared ? new Set(shared.units.map((u) => u.key)) : null),
    [shared]
  )

  // The filters as the list query and the map mirror apply them. A county
  // typed as a county ("king county", "rent in grays harbor county") is a
  // hint, never searched literally, since no field holds the word "county".
  // On its own it applies as the County filter (the query's other words are
  // still searched, and the search field keeps what was typed). An explicit
  // choice always wins: with a County, City or Neighborhood filter set, the
  // county words are dropped, so "king county" plus City = Tacoma lists
  // Tacoma's places rather than none.
  const applyCountyWords = useCallback(
    (f) => {
      if (!f?.search) return f
      const hit = countyInQuery(tokenizeQuery(f.search), counties)
      if (!hit) return f
      const search = hit.rest.join(' ')
      if (f.county || f.city || f.neighborhood) return { ...f, search }
      return { ...f, county: hit.county, search }
    },
    [counties]
  )
  const applied = useMemo(() => applyCountyWords(filters), [applyCountyWords, filters])

  // Load filtered properties
  useEffect(() => {
    if (abortRef.current) abortRef.current.abort()
    const controller = new AbortController()
    abortRef.current = controller

    const requested = filters
    setLoading(true)
    setListError(false)
    const params = new URLSearchParams(
      Object.entries(applied)
        .filter(([k, v]) => k !== 'favoritesOnly' && v !== '' && v !== 0 && v !== false)
        .map(([k, v]) => [k, String(v)])
    )
    // Sent even when empty, so "no favorites yet" returns nothing rather than
    // silently falling back to every property.
    if (applied.favoritesOnly) params.set('ids', activeFavoriteIds.join(','))

    getJson(`/api/properties?${params}`, { signal: controller.signal })
      .then((data) => {
        const list = data?.properties
        const count = Number(data?.total)
        if (!Array.isArray(list) || !Number.isFinite(count)) throw new Error('Unexpected reply')
        // A page past the end, as when the only place on the last page of
        // the Saved view is unsaved: step back to the last page with
        // results instead of "No matching places" under a non-zero count.
        const lastPage = Math.max(1, Math.ceil(count / PAGE_SIZE))
        if (!list.length && count > 0 && requested.page > lastPage) {
          setFilters((f) => (f === requested ? { ...f, page: lastPage } : f))
          return
        }
        setProperties(list)
        setTotal(count)
        setResultsFilters(requested)
        setLoading(false)
        const results = listRef.current
        if (results) {
          results.scrollTop = 0
          // Short screens scroll the page itself: bring the top of the
          // results back if the visitor had scrolled past it.
          if (results.getBoundingClientRect().top < 0) results.scrollIntoView({ block: 'start' })
        }
      })
      .catch((e) => {
        if (e.name === 'AbortError') return
        // Never leave the previous results standing under the new filters,
        // and never report a failure as "No matching places".
        setProperties([])
        setTotal(0)
        setResultsFilters(requested)
        setListError(true)
        setLoading(false)
      })
    // `applied` changes with every change to the filters. Favorites are
    // joined rather than passed by reference: unhearting while the favorites
    // filter is on must refetch, but toggling otherwise should not.
  }, [applied, listAttempt, filters.favoritesOnly ? activeFavoriteIds.join(',') : ''])

  // Remember what had focus when the panel opened (the card's title), so
  // closing the panel can hand focus back to it.
  const handleCardClick = useCallback((id) => {
    panelOpenerRef.current = document.activeElement
    setSelectedId(id)
    setDetailId(id)
    trackEvent('property_opened', { source: 'list' })
  }, [])

  const handleMapSelect = useCallback((id) => {
    panelOpenerRef.current = document.activeElement
    setSelectedId(id)
    setDetailId(id)
    trackEvent('property_opened', { source: 'map' })
  }, [])

  const handleFilterChange = useCallback((next) => {
    setFilters(next)
  }, [])

  const handleSearch = useCallback((value) => {
    setFilters((f) => ({ ...f, search: value, page: 1 }))
  }, [])

  const clearFilters = useCallback(() => setFilters(DEFAULT_FILTERS), [])

  // Only what the shared list still finds (sharedFoundIds): a building that
  // has vanished since the link was made would count in Saved with no card
  // to unsave it, and travel on in every link shared from this list. If the
  // check failed, nothing can be told apart, so everything is kept.
  const acceptShared = () => {
    const keep = sharedFoundIds instanceof Set ? (id) => sharedFoundIds.has(Number(id)) : () => true
    importShared({
      properties: shared.properties.filter(keep),
      units: shared.units.filter((u) => keep(u.propertyId)),
      places: Object.fromEntries(Object.entries(shared.places || {}).filter(([id]) => keep(id))),
    })
    setShared(null)
  }

  const dismissShared = () => {
    setShared(null)
    setFilters((f) => ({ ...f, favoritesOnly: false, page: 1 }))
  }

  // Paging, the empty state's button and the shared-list banner all remove
  // the control that was just pressed. Move focus to the top of the results
  // first, so keyboard and screen-reader users are not dropped on the page.
  const focusResults = () => headingRef.current?.focus()

  // PropertyPanel moves focus to its heading on open and back to its opener
  // on close. This is the fallback for when that opener is gone or was never
  // focused (Safari does not focus buttons on click; map markers are not
  // focusable): return to the property's card, else the results heading.
  const closePanel = useCallback(() => {
    const id = detailId
    const panel = panelRef.current
    const focusWasInPanel = !!panel && panel.contains(document.activeElement)
    setDetailId(null)
    setSelectedId(null)
    // Only take focus back when it would otherwise be lost with the panel:
    // Esc pressed while typing in the search field leaves focus there.
    if (!focusWasInPanel) return
    requestAnimationFrame(() => {
      // Still on the page and visible (the map card is hidden below lg).
      const usable = (el) =>
        el && el !== document.body && el.isConnected && el.getClientRects().length > 0
      const opener = panelOpenerRef.current
      const card = listRef.current?.querySelector(`[data-property-id="${CSS.escape(String(id))}"]`)
      const target =
        (usable(opener) ? opener : null) ||
        card?.querySelector('.card-link') ||
        card?.querySelector('button') ||
        headingRef.current
      target?.focus()
    })
  }, [detailId])

  // Mirror the list query's filter semantics (lib/db.js getProperties) so the
  // map always shows the same set of properties as the list.
  const visibleMapProperties = useMemo(() => {
    const f = applied
    const tokens = tokenizeQuery(f.search)
    return mapProperties.filter((p) => {
      if (f.favoritesOnly && !activeFavoriteIds.includes(Number(p.id))) return false
      if (f.hasListings && !(p.listing_count > 0)) return false
      if (f.neighborhood && p.neighborhood !== f.neighborhood) return false
      if (f.city && p.city !== f.city) return false
      if (f.county && p.county !== f.county) return false
      if (f.program && p.program !== f.program) return false
      if (f.incentive) {
        const inAny = p.has_mfte || p.has_iz || p.has_mha
        if (f.incentive === 'none' ? inAny : !p[`has_${f.incentive}`]) return false
      }
      if (f.bedroom) {
        // Mirrors BEDROOM_ALIASES in lib/db.js — the Seattle layer spells these
        // "1-Bedroom" while scraped statewide rows use "1br". Building-level,
        // so buildings without live pricing still match on what they publish.
        const types = (p.br_types || '').toLowerCase()
        if (!bedroomAliases(f.bedroom).some((a) => types.includes(a))) return false
      }
      // The per-unit rule from lib/db.js: one live unit must satisfy every
      // unit-level filter at once, or the building has no live pricing to
      // judge (and the filter does not itself demand live data).
      if (hasUnitFilters(f)) {
        const units = parseUnitSummary(p.unit_summary)
        if (units.length === 0) {
          if (f.availableNow || f.hasListings) return false
        } else if (!units.some((u) => unitMatchesFilters(u, f))) {
          return false
        }
      }
      if (
        tokens.length &&
        !matchesTokens(tokens, [p.building_name, p.address, p.neighborhood, p.city, p.county])
      )
        return false
      return true
    })
  }, [mapProperties, applied, activeFavoriteIds])

  // The place a search names ("rent in lynnwood" → Lynnwood). Cities take
  // priority over neighborhoods over counties (lib/searchQuery.js). Only a
  // guess at what the words mean: the count line and the map use it only
  // where the results actually are (placeOfResults).
  const placeLists = useMemo(
    () => ({ city: cities, neighborhood: neighborhoods, county: counties }),
    [cities, neighborhoods, counties]
  )
  const nameInSearch = useCallback(
    (search) => {
      const tokens = tokenizeQuery(search)
      return tokens.length ? detectPlace(tokens, [...cities, ...neighborhoods, ...counties]) : ''
    },
    [cities, neighborhoods, counties]
  )
  const searchPlace = useMemo(() => nameInSearch(applied.search), [nameInSearch, applied.search])
  const searchTokens = useMemo(() => tokenizeQuery(applied.search), [applied.search])
  const countyFromWords = !!applied.county && applied.county !== filters.county

  // Where the map looks after a settled change. It moves for a City or
  // County filter (county words in the search included); for a place the
  // search names (detectPlace, as before the redesign), framed on the places
  // there when most of the results are ("spokane" frames Spokane, not the
  // Seattle street of the same name), else on every match; and for an
  // address-like search, one matching at most ADDRESS_FIT_MAX places on the
  // map ("e denny way"). A broad or partial query ("se") leaves the map
  // alone. Map.js applies the latest request once any running zoom ends.
  // Waits for the map's places to load.
  const mapFocus = useMemo(
    () => placeOfResults(searchPlace, placeLists, visibleMapProperties),
    [searchPlace, placeLists, visibleMapProperties]
  )
  const mappedMatches = visibleMapProperties.length
  const fitKey = mapLoading
    ? ''
    : applied.city ||
      applied.county ||
      (searchPlace ? `place:${searchPlace}` : '') ||
      (searchTokens.length && mappedMatches > 0 && mappedMatches <= ADDRESS_FIT_MAX
        ? `search:${searchTokens.join(' ')}`
        : '')

  // One search event per settled query (not per keystroke), carrying only
  // derived signals — never the text the visitor typed.
  useEffect(() => {
    const tokens = tokenizeQuery(filters.search)
    if (!tokens.length) return
    const t = setTimeout(
      () =>
        trackEvent('search', {
          place_matched: !!searchPlace || countyFromWords,
          keywords: tokens.length,
        }),
      1500
    )
    return () => clearTimeout(t)
  }, [filters.search, searchPlace, countyFromWords])

  // Which surface gets used: the list or the full map.
  const firstView = useRef(true)
  useEffect(() => {
    if (firstView.current) {
      firstView.current = false
      return
    }
    trackEvent('view_changed', { view })
  }, [view])

  const activeFilterCount = [
    filters.search,
    filters.neighborhood,
    filters.city,
    filters.county,
    filters.program,
    filters.incentive,
    filters.bedroom,
    filters.maxRent > 0,
    filters.hasListings,
    filters.availableNow,
    filters.favoritesOnly,
  ].filter(Boolean).length

  const pageCount = Math.ceil(total / PAGE_SIZE)

  // The list is settled once the shown results belong to the current filters.
  const showLoading = loading || resultsFilters !== filters

  // Where the shown results are, read from the filters that produced them.
  // A place named only in the search is checked against the results: all
  // of them that the map can place once its points are in (the same set
  // whatever the page), until then the page shown.
  const placeLabel = useMemo(() => {
    const f = applyCountyWords(resultsFilters)
    if (!f) return ''
    if (f.neighborhood) return f.neighborhood
    if (f.city) return f.city
    if (f.county) return `${f.county} County`
    const results = visibleMapProperties.length ? visibleMapProperties : properties
    return placeOfResults(nameInSearch(f.search), placeLists, results)?.label || ''
  }, [resultsFilters, applyCountyWords, nameInSearch, placeLists, visibleMapProperties, properties])

  // What the polite status region says: only the settled outcome, only once
  // typing has paused (750ms after the results land, on top of the search
  // field's 250ms debounce), and only when it differs from what it last
  // said, so a slow typist hears one count, not one per keystroke.
  const settledText = showLoading
    ? null
    : listError
    ? 'Couldn’t load places'
    : `${total.toLocaleString()} ${total === 1 ? 'place' : 'places'}${
        placeLabel ? ` in ${placeLabel}` : ''
      }${pageCount > 1 ? `, page ${resultsFilters.page} of ${pageCount}` : ''}`
  const [announcement, setAnnouncement] = useState('')
  useEffect(() => {
    if (settledText == null) return undefined
    const t = setTimeout(() => setAnnouncement(settledText), 750)
    return () => clearTimeout(t)
  }, [settledText])

  // The shared list's buildings that still exist, read once per shared list
  // straight from the list query (its ids, every page, no other filter), so
  // the count does not depend on the filters on screen: undefined while
  // measuring, null if the request failed, else a Set of ids. The banner
  // counts these buildings and the apartments in them, never the current
  // list total (turning Saved off makes that the whole catalogue), and
  // "Save to my list" imports only them.
  const [sharedFoundIds, setSharedFoundIds] = useState(undefined)
  useEffect(() => {
    setSharedFoundIds(undefined)
    if (!shared) return undefined
    const ids = [...new Set([...shared.properties, ...shared.units.map((u) => u.propertyId)])]
      .map(Number)
      .filter(Number.isFinite)
    if (!ids.length) {
      setSharedFoundIds(new Set())
      return undefined
    }
    const controller = new AbortController()
    const measure = async () => {
      const found = new Set()
      for (let page = 1; ; page += 1) {
        const data = await getJson(`/api/properties?ids=${ids.join(',')}&page=${page}`, {
          signal: controller.signal,
        })
        const list = data?.properties
        const count = Number(data?.total)
        if (!Array.isArray(list) || !Number.isFinite(count)) throw new Error('Unexpected reply')
        list.forEach((p) => found.add(Number(p.id)))
        if (!list.length || page * PAGE_SIZE >= count) return found
      }
    }
    measure()
      .then((found) => setSharedFoundIds(found))
      .catch((e) => {
        if (e?.name !== 'AbortError') setSharedFoundIds(null)
      })
    return () => controller.abort()
  }, [shared])
  // Until it is measured, the banner states no count: the link's own list
  // can include buildings that no longer exist.
  const sharedMeasured = sharedFoundIds instanceof Set
  const sharedFound = sharedMeasured ? sharedFoundIds.size : 0
  const sharedMissing = sharedMeasured
    ? activeFavoriteIds.filter((id) => !sharedFoundIds.has(Number(id))).length
    : 0
  // Apartments count only where their building was found.
  const sharedUnitCount = shared
    ? sharedMeasured
      ? shared.units.filter((u) => sharedFoundIds.has(Number(u.propertyId))).length
      : shared.units.length
    : 0

  // The caption under the List view's map card counts the places on the map
  // and, when some matches have no map location, out of how many: "2,626 of
  // 2,848 places on the map". Both numbers come from the same settled
  // results, so while new results load it keeps the last pair instead of
  // flicking between the two forms. `of` is null when the list failed.
  const [mapCaption, setMapCaption] = useState(null)
  const captionReady = !showLoading && !mapLoading && !mapError
  const captionOf = listError ? null : total
  useEffect(() => {
    if (captionReady) setMapCaption({ shown: mappedMatches, of: captionOf })
  }, [captionReady, mappedMatches, captionOf])

  // In the Saved view, unsaving a building (with no saved apartment left in
  // it) removes its card when the list refetches. Note where keyboard focus
  // should go instead of <body>: the next card, else the previous one, else
  // the results heading. Applied once the new results have rendered.
  const pendingFocusRef = useRef(null)
  const handleToggleFavorite = (p) => {
    if (filters.favoritesOnly && !shared && isPropertyFavorite(p.id) && savedUnitCount(p.id) === 0) {
      const i = properties.findIndex((x) => x.id === p.id)
      const neighbour = properties[i + 1] || properties[i - 1]
      pendingFocusRef.current = neighbour ? neighbour.id : 'heading'
    }
    toggleProperty(p.id, { address: p.address, city: p.city })
  }
  useEffect(() => {
    if (showLoading || pendingFocusRef.current == null) return
    const id = pendingFocusRef.current
    pendingFocusRef.current = null
    const card =
      id === 'heading'
        ? null
        : listRef.current?.querySelector(`[data-property-id="${CSS.escape(String(id))}"] .card-link`)
    ;(card || headingRef.current)?.focus()
  }, [showLoading, properties])

  // Keyboard focus moving through the results scrolls the whole card into
  // view, clear of the floating List/Map pill on phones (the main's
  // scroll-padding). Browsers alone stop at the edge, under the pill.
  const keepFocusInView = (e) => {
    const el = e.target
    if (!(el instanceof HTMLElement) || !el.matches(':focus-visible')) return
    ;(el.closest('article') || el).scrollIntoView({ block: 'nearest' })
  }

  // Where the details panel goes. From lg (on a screen that is not short)
  // it is the third column beside the results and the map. Between sm and
  // lg it covers the results (List view) or floats over the map's right
  // edge (Map view). On phones and on short screens it is a full-screen
  // sheet over everything, header and filter strip included, so the details
  // get the whole screen rather than what the fixed rows leave. Whatever it
  // hides is made inert, so keyboard focus never lands out of sight behind
  // it. The Filters panel is a full-screen sheet on short screens too.
  const threeColumns = isLgUp && !isShort
  const panelIsSheet = !isSmUp || isShort
  const panelCoversList = !!detailId && view === 'listings' && !threeColumns
  const panelCoversMap = !!detailId && view === 'map' && panelIsSheet
  const panelCoversChrome = !!detailId && panelIsSheet
  const filtersSheet = filtersOpen && isShort

  // From sm the Map view's panel floats over the map's right edge. The map
  // centres a selection in the part still visible, and its right-hand
  // controls (zoom, attribution) move clear of the panel; see the wrapper.
  const mapRightInset = useCallback(
    () =>
      view === 'map' && isSmUp && !isShort && panelRef.current ? panelRef.current.offsetWidth : 0,
    [view, isSmUp, isShort]
  )

  const emptyHint =
    filters.favoritesOnly && !shared && favoriteCount === 0
      ? 'Save a place with its heart button and it will appear here.'
      : filters.search
      ? 'Check the spelling, or try a nearby city or neighborhood.'
      : 'Try removing a filter or searching a nearby city.'

  // Behind a full-screen sheet (the details on phones and short screens,
  // Filters on short screens) the header, strip and banner are inert too.
  const chromeInert = panelCoversChrome || filtersSheet

  return (
    // Short screens: as tall as its content, so the page scrolls as a whole.
    <div className="relative flex h-full flex-col short:h-auto">
      {/* 1rem wide: useShortScreen notices the root text size changing. */}
      <div
        ref={remProbeRef}
        aria-hidden="true"
        className="pointer-events-none invisible absolute left-0 top-0 h-0 w-4"
      />

      {view === 'listings' && !panelCoversList && !filtersSheet && (
        <a
          href="#results-heading"
          onClick={(e) => {
            e.preventDefault()
            focusResults()
          }}
          className="skip-link"
        >
          Skip to places
        </a>
      )}

      {/* The results count for screen readers (see settledText). Outside the
          results, so it still speaks while the panel makes them inert. */}
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {announcement}
      </p>
      {/* The map's own status, always mounted so a failure is announced: a
          live region inserted already holding its text is not. */}
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {mapError ? (mapLoading ? 'Loading map locations…' : 'Map locations couldn’t be loaded.') : ''}
      </p>

      {/* The page's one h1 (visually hidden) is rendered inside the header. */}
      <SearchHeader
        title="Washington Affordable Housing Search"
        search={filters.search}
        onSearch={handleSearch}
        view={view}
        onViewChange={setView}
        onClearAll={clearFilters}
        inert={chromeInert}
      />

      {/* FilterBar renders its own labelled landmark (section "Filters"). */}
      <FilterBar
        filters={filters}
        neighborhoods={neighborhoods}
        cities={cities}
        counties={counties}
        favoriteCount={favoriteCount}
        favoritesState={{
          properties: favoriteProperties,
          units: favoriteUnits,
          places: favoritePlaces,
        }}
        filtersOpen={filtersOpen}
        onFiltersToggle={() => setFiltersOpen((o) => !o)}
        onChange={handleFilterChange}
        onClearAll={clearFilters}
        hasActiveFilters={activeFilterCount > 0}
        // On short screens the Filters panel opens as a full-screen sheet.
        sheet={isShort}
        inert={panelCoversChrome}
      />

      {/* Shared list banner */}
      {shared && (
        <section
          aria-label="Shared list"
          inert={chromeInert ? '' : undefined}
          className="callout callout-tint mx-4 my-3 flex shrink-0 flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3 sm:mx-5"
        >
          <p className="flex min-w-0 flex-1 basis-64 items-start gap-2 text-sm leading-relaxed text-ink">
            <Icon name="heart" filled size={16} className="mt-0.5 shrink-0 text-saved" />
            <span>
              {/* With Saved turned off (or filters cleared) the list below is
                  no longer the shared one, so say it is hidden. */}
              {filters.favoritesOnly ? 'Viewing a shared list' : 'Shared list hidden'}
              {sharedMeasured ? (
                <>
                  {': '}
                  <span className="font-mono font-semibold">{sharedFound.toLocaleString()}</span>{' '}
                  {sharedFound === 1 ? 'place' : 'places'}
                  {sharedUnitCount > 0 && (
                    <>
                      {' '}and <span className="font-mono font-semibold">{sharedUnitCount}</span>{' '}
                      saved apartment{sharedUnitCount !== 1 ? 's' : ''}
                    </>
                  )}
                  {/* A listing can vanish between sharing and opening. Say so
                      rather than quietly showing fewer than the sender picked. */}
                  {sharedMissing > 0 && (
                    <>
                      {' '}
                      <span className="whitespace-nowrap text-muted">
                        · <span className="font-mono">{sharedMissing}</span> no longer listed
                      </span>
                    </>
                  )}
                </>
              ) : (
                sharedFoundIds === undefined && (
                  <span
                    className="skeleton ml-2 inline-block h-3 w-32 align-middle"
                    aria-hidden="true"
                  />
                )
              )}
            </span>
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {!filters.favoritesOnly && (
              <button
                type="button"
                onClick={() => {
                  setFilters((f) => ({ ...f, favoritesOnly: true, page: 1 }))
                  // The button goes away with the press; land on the results.
                  focusResults()
                }}
                className="btn btn-secondary btn-sm"
              >
                Show list
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                acceptShared()
                focusResults()
              }}
              className="btn btn-primary btn-sm"
            >
              Save to my list
            </button>
            <button
              type="button"
              onClick={() => {
                dismissShared()
                focusResults()
              }}
              className="btn btn-ghost btn-sm"
            >
              Dismiss
            </button>
          </div>
        </section>
      )}

      {/* Body. On short screens it is part of the scrolling page, not a
          frame of its own. */}
      <div className="relative flex min-h-0 flex-1 overflow-hidden short:flex-none short:overflow-visible">
        {/* Results rail: full width on phones, tablets and short screens, a
            fixed third from lg. The map takes the rest, and gives half of it
            up to the details panel while a property is open. Its own scroller,
            except on short screens, where the page scrolls. */}
        {view === 'listings' && (
          <main
            ref={listRef}
            inert={panelCoversList || filtersSheet ? '' : undefined}
            onFocus={keepFocusInView}
            className="w-full min-w-0 scroll-pb-24 overflow-y-auto scrollbar-thin sm:scroll-pb-0 short:overflow-visible lg:tall:w-1/3 lg:tall:shrink-0 lg:tall:border-r lg:tall:border-edge"
          >
            {/* pb-28 clears the phones' floating List/Map switch. On a short
                but wide screen the cards keep a readable width. */}
            <div className="px-4 pb-28 pt-4 sm:px-5 sm:pb-12 short:mx-auto short:max-w-3xl short:pb-12">
              {/* The count is also the results heading (and where focus
                  lands after paging). Screen readers hear it through the
                  status region above, once it has settled. */}
              <h2
                id="results-heading"
                ref={headingRef}
                tabIndex={-1}
                className="section-label w-fit rounded-sm"
              >
                {showLoading ? (
                  'Searching…'
                ) : listError ? (
                  'Couldn’t load places'
                ) : (
                  <>
                    <span className="font-mono">{total.toLocaleString()}</span>{' '}
                    {total === 1 ? 'place' : 'places'}
                    {placeLabel && (
                      <>
                        {' '}
                        <span aria-hidden="true">· </span>in {placeLabel}
                      </>
                    )}
                    {pageCount > 1 && (
                      <span className="sr-only">
                        , page {resultsFilters.page} of {pageCount}
                      </span>
                    )}
                  </>
                )}
              </h2>

              {showLoading ? (
                <ResultSkeleton />
              ) : listError ? (
                // The request failed: say so, keep the filters, offer a retry.
                // Never "No matching places", which would send people off
                // removing filters that are not the problem.
                <div className="card mt-3 text-center">
                  <h3 className="text-lg font-semibold tracking-tight text-ink">
                    Something went wrong
                  </h3>
                  <p className="mt-1 text-sm leading-relaxed text-muted">
                    Check your connection and try again. Your filters are kept.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setListAttempt((n) => n + 1)
                      focusResults()
                    }}
                    className="btn btn-secondary mt-4"
                  >
                    Try again
                  </button>
                </div>
              ) : properties.length === 0 ? (
                <div className="card mt-3 text-center">
                  <h3 className="text-lg font-semibold tracking-tight text-ink">
                    No matching places
                  </h3>
                  <p className="mt-1 text-sm leading-relaxed text-muted">{emptyHint}</p>
                  <button
                    type="button"
                    onClick={() => {
                      clearFilters()
                      focusResults()
                    }}
                    className="btn btn-secondary mt-4"
                  >
                    Clear filters
                  </button>
                </div>
              ) : (
                <>
                  <ul role="list" className="card-list mt-3 space-y-3">
                    {properties.map((p) => (
                      <li key={p.id} data-property-id={p.id}>
                        <PropertyCard
                          property={p}
                          isSelected={selectedId === p.id}
                          onClick={() => handleCardClick(p.id)}
                          isFavorite={isPropertyFavorite(p.id)}
                          onToggleFavorite={() => handleToggleFavorite(p)}
                          savedUnitCount={sharedSavedUnitCount(p.id)}
                          highlighted={savedIds.has(Number(p.id))}
                        />
                      </li>
                    ))}
                  </ul>

                  {pageCount > 1 && (
                    <Pager
                      page={filters.page}
                      pageCount={pageCount}
                      onPage={(p) => {
                        setFilters((f) => ({ ...f, page: p }))
                        focusResults()
                      }}
                    />
                  )}
                </>
              )}

              {!showLoading && (
                <footer className="mt-10 border-t border-edge pt-5 text-13 text-muted">
                  <nav aria-label="Site">
                    <ul role="list" className="flex flex-wrap gap-x-5 gap-y-1">
                      {FOOTER_LINKS.map((l) => (
                        <li key={l.href}>
                          <Link
                            href={l.href}
                            // The invisible ::before widens the target (44px
                            // tall on touch layouts with coarse:min-h-11).
                            className="relative inline-flex min-h-6 items-center rounded-sm transition-colors before:absolute before:-inset-x-2 before:inset-y-0 hover:text-ink coarse:min-h-11"
                          >
                            {l.label}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </nav>
                  <p className="mt-2">Washington State · indexed from public housing data</p>
                </footer>
              )}
            </div>
          </main>
        )}

        {/* One map instance for both views. The wrapper reshapes from a card
            beside the results (List) to full bleed (Map) and keeps the map
            mounted, so Leaflet is never torn down on a view switch. It is the
            page's main landmark in the Map view and complementary beside the
            list; a div, so changing the role never remounts the map. */}
        <div
          role={view === 'map' ? 'main' : 'complementary'}
          aria-label="Map"
          inert={panelCoversMap || filtersSheet ? '' : undefined}
          // In the Map view, Leaflet's bottom-right controls slide left of the
          // open details panel so zoom and the map attribution stay visible.
          // These widths must match the floating panel's (27.5rem from sm,
          // 30rem from xl, on screens that are not short).
          // On short screens the Map view gets a height of its own in the
          // scrolling page: at least 12rem, so its zoom bar and Legend stay
          // inside it, and always 2.75rem short of the screen, so a finger
          // can still scroll the page past it (the map pans under a drag).
          // In the List view the map card shows from lg on tall screens.
          className={
            view === 'map'
              ? `flex min-h-0 min-w-0 flex-1 flex-col short:h-[max(12rem,calc(100dvh_-_6rem))] short:max-h-[calc(100dvh_-_2.75rem)] [&_.leaflet-right]:transition-[right] [&_.leaflet-right]:duration-250 ${
                  detailId
                    ? 'sm:tall:[&_.leaflet-right]:right-[27.5rem] xl:tall:[&_.leaflet-right]:right-[30rem]'
                    : ''
                }`
              : 'hidden min-h-0 min-w-0 flex-1 flex-col gap-2 p-4 lg:tall:flex'
          }
        >
          <div
            ref={mapBoxRef}
            className={`relative min-h-0 flex-1 ${
              view === 'map' ? '' : 'overflow-hidden rounded-xl border border-edge shadow-card'
            }`}
          >
            <Map
              properties={visibleMapProperties}
              highlightId={selectedId}
              onSelect={handleMapSelect}
              fitTo={fitKey}
              fitPlace={mapFocus}
              savedIds={savedIds}
              savedUnitCountFor={sharedSavedUnitCount}
              getRightInset={mapRightInset}
              // Markers are not focusable, so keyboard and screen-reader
              // users open places from the list; say where it is.
              hint={
                view === 'map'
                  ? 'Switch to the List view to open a place.'
                  : 'Open a place from the list.'
              }
            />
            {/* While the map's points load, say so on the map (both views)
                rather than showing bare tiles. The dot's pulse stops under
                reduced motion. */}
            {mapLoading && !mapError && (
              <div className="pointer-events-none absolute inset-x-3 top-3 z-10 flex justify-center">
                <p className="card flex items-center gap-2 px-4 py-2.5 text-13 text-muted shadow-popover">
                  <span
                    className="size-2 shrink-0 animate-pulse rounded-full bg-accent-strong"
                    aria-hidden="true"
                  />
                  Loading places…
                </p>
              </div>
            )}
            {/* The map's points failed to load: say so on the map itself (in
                both views) instead of showing an empty map as "0 places".
                Announced by the map status line above, so its Try again
                button is not inside a live region. During a retry the card
                stays, saying it is loading, with Try again unavailable; see
                the map effect for where focus goes. */}
            {mapError && (
              <div className="pointer-events-none absolute inset-x-3 top-3 z-10 flex justify-center">
                <div
                  ref={mapErrorRef}
                  className="card pointer-events-auto flex flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 py-2.5 text-13 text-muted shadow-popover"
                >
                  <span>{mapLoading ? 'Loading places…' : 'Map locations couldn’t be loaded.'}</span>
                  <button
                    type="button"
                    aria-disabled={mapLoading || undefined}
                    onClick={() => {
                      if (!mapLoading) setMapAttempt((n) => n + 1)
                    }}
                    className="link inline-flex h-8 items-center px-1 font-medium coarse:h-11 aria-disabled:cursor-progress aria-disabled:opacity-50"
                  >
                    Try again
                  </button>
                </div>
              </div>
            )}
          </div>
          {view === 'listings' && (
            <div className="flex items-center justify-between gap-3 px-1 text-xs text-muted">
              {mapError ? (
                <p>Map unavailable</p>
              ) : mapLoading || !mapCaption ? (
                <p>Loading map…</p>
              ) : (
                <p>
                  <span className="font-mono text-ink">{mapCaption.shown.toLocaleString()}</span>
                  {/* Some places have no map location; say how many of the
                      list's places the map can show rather than imply the
                      two counts disagree (see mapCaption). */}
                  {mapCaption.of != null && mapCaption.shown < mapCaption.of ? (
                    <>
                      {' '}of <span className="font-mono text-ink">{mapCaption.of.toLocaleString()}</span>{' '}
                      {mapCaption.of === 1 ? 'place' : 'places'} on the map
                    </>
                  ) : (
                    <> {mapCaption.shown === 1 ? 'place' : 'places'} on the map</>
                  )}
                </p>
              )}
              <button
                type="button"
                onClick={() => setView('map')}
                className="link inline-flex h-8 items-center px-1 text-13 font-medium coarse:h-11"
              >
                Expand map
              </button>
            </div>
          )}
        </div>

        {/* Phones: a floating List / Map switch, since the header's view
            switch is hidden there. Hidden while the details panel covers the
            screen, and while the Filters panel is open, whose last choices
            it would otherwise cover. Never on short screens, where it would
            sit on the strip or the results: the header's List | Map control
            shows there instead (SearchHeader). */}
        {!detailId && !filtersOpen && (
          <button
            type="button"
            onClick={() => setView(view === 'map' ? 'listings' : 'map')}
            className="btn-float fixed bottom-safe left-1/2 z-float -translate-x-1/2 sm:hidden short:hidden"
          >
            <Icon name={view === 'map' ? 'list' : 'map'} />
            <span className="sr-only">Show</span> {view === 'map' ? 'List' : 'Map'}
          </button>
        )}

        {/* Property details (see panelIsSheet). In the List view it joins
            the row as an equal third column from lg (results | map |
            details), flat like the results rail; in the Map view it floats
            over the map's right edge with a shadow from sm. No backdrop: the
            list and map stay live, and picking another property swaps the
            content in place. Between sm and lg it covers the results at full
            width. On phones and short screens it is a full-screen sheet. */}
        {detailId && (
          <div
            ref={panelRef}
            className={`panel-slide-in fixed inset-0 z-panel w-full shadow-popover sm:tall:absolute ${
              view === 'listings'
                ? 'lg:tall:static lg:tall:inset-auto lg:tall:z-auto lg:tall:w-1/3 lg:tall:min-w-0 lg:tall:shrink-0 lg:tall:shadow-none'
                : 'sm:tall:left-auto sm:tall:w-[27.5rem] xl:tall:w-[30rem]'
            }`}
          >
            <PropertyPanel
              propertyId={detailId}
              filters={filters}
              sharedUnitKeys={sharedUnitKeys}
              onClose={closePanel}
              // While it covers the (then inert) results or map, the panel is
              // the page's main content; beside them it is complementary.
              landmark={panelCoversList || panelCoversMap ? 'main' : 'complementary'}
            />
          </div>
        )}
      </div>
    </div>
  )
}
