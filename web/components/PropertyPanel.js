'use client'

import { Fragment, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { HeartButton, unitKey, useFavorites } from '@/lib/favorites'
import { trackEvent } from '@/lib/analytics'
import { hasUnitFilters, unitMatchesFilters } from '@/lib/unitFilter'
import {
  AVAILABILITY_PILL,
  Icon,
  TILE_LAYER,
  escapeHtml,
  isDarkTheme,
  markerStyle,
  onThemeChange,
  prefersReducedMotion,
  programColor,
  programName,
} from '@/lib/theme'
import { formatAmi, parseExpiry } from '@/components/PropertyCard'

// Layout effects must not run during server rendering.
const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect

const UNIT_LABELS = {
  micro: 'Micro',
  studio: 'Studio',
  '1br': '1 Bed',
  '2br': '2 Bed',
  '3br': '3 Bed',
  unknown: 'Unit',
}
const unitTypeLabel = (type) => UNIT_LABELS[type] || type || 'Unit'

/** "1-Bedroom" -> "1 Bed", as the apartment rows, cards and filters say it. */
function bedroomLabel(value) {
  const text = String(value ?? '').trim()
  const m = /^(\d+)\s*-?\s*bed(room)?s?$/i.exec(text)
  return m ? `${m[1]} Bed` : text
}

// Incentive programs, from the building's affordable_buildings row.
const INCENTIVES = [
  { flag: 'has_mfte', count: 'total_mfte_units', label: 'MFTE', title: 'Multifamily Tax Exemption' },
  { flag: 'has_iz', count: 'total_iz_units', label: 'IZ', title: 'Incentive Zoning' },
  { flag: 'has_mha', count: 'total_mha_units', label: 'MHA', title: 'Mandatory Housing Affordability' },
]

// Scraped "available from" text that is worth showing when the status is
// unknown. Most of it is crawl debris ("ABLE 1", "New 1", "Fall 2022").
const READABLE_AVAILABILITY =
  /\b(available|now|immediate(ly)?)\b|\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2}\b|\b\d{1,2}\/\d{1,2}(\/\d{2,4})?\b/i

const Num = ({ children }) => <span className="font-mono">{children}</span>

function todayIso() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** "2026-09-10" -> "Sep 10, 2026"; with `short`, the year only when it is not this year. */
function formatDate(iso, { short = false } = {}) {
  if (!iso) return null
  // Parse as local, not UTC, so the date never shifts a day backwards.
  const [y, m, d] = String(iso).split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...((!short || y !== new Date().getFullYear()) && { year: 'numeric' }),
  })
}

const money = (n) => `$${Number(n).toLocaleString('en-US')}`

/** "$1,795", "$2,150–$2,750", or null when the listing has no price. */
function formatRent(unit) {
  const min = Number(unit.rent_min) || 0
  const max = Number(unit.rent_max) || 0
  if (!min) return null
  return max > min ? `${money(min)}–${money(max)}` : money(min)
}

/**
 * Scraped links go straight into href, so only http(s) passes. "www." gains a
 * scheme; junk such as "0" (a handful of rows) returns null.
 */
function safeUrl(value) {
  const raw = String(value ?? '').trim()
  if (!raw) return null
  try {
    const url = new URL(/^www\./i.test(raw) ? `https://${raw}` : raw)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null
  } catch {
    return null
  }
}

function telHref(phone) {
  const digits = String(phone ?? '').replace(/[^\d+]/g, '')
  return digits.length >= 7 ? `tel:${digits}` : null
}

/** "840 E Denny Way · Capitol Hill · Seattle", without repeating what the address already says. */
function placeLine(d) {
  const address = String(d.address || '').trim()
  const lower = address.toLowerCase()
  const extra = [d.neighborhood, d.city].filter(
    (v, i, a) => v && a.indexOf(v) === i && !lower.includes(String(v).toLowerCase())
  )
  return [address, ...extra].filter(Boolean).join(' · ')
}

/** A photo's visible caption: "1 Bed · $2,150/mo · 497 sqft", data in mono. */
function PhotoLabel({ photo }) {
  return (
    <>
      {photo.type}
      {photo.rent && (
        <>
          {' · '}
          <Num>{photo.rent}</Num>/mo
        </>
      )}
      {photo.sqft && (
        <>
          {' · '}
          <Num>{photo.sqft}</Num> sqft
        </>
      )}
    </>
  )
}

/**
 * The lightbox photo in a fixed 3:2 frame: the largest that fits 92vw and the
 * screen's height less about 7rem for the padding and the caption below
 * (never under 12rem wide), so photo and caption fit together where they
 * can, and the dialog scrolls where they cannot. The caption never moves
 * while a remote photo loads, and a pulsing placeholder fills the frame until
 * it arrives. The photo is scaled
 * to fit the frame at its own proportions, never cropped, and centred in it
 * with its own 12px corners, whatever its shape (a 4:3 photo, a square floor
 * plan). Keyed by src, so each photo starts unloaded.
 */
function LightboxPhoto({ src, alt, onError }) {
  const [loaded, setLoaded] = useState(false)
  // Wider than the 3:2 frame: fit its width; otherwise fit its height.
  const [wide, setWide] = useState(true)
  const imgRef = useRef(null)
  const settle = (el) => {
    if (el.naturalWidth > 0 && el.naturalHeight > 0) setWide(el.naturalWidth / el.naturalHeight >= 1.5)
    setLoaded(true)
  }
  // Belt and braces for a photo that was already complete when mounted.
  useEffect(() => {
    const el = imgRef.current
    if (el && el.complete && el.naturalWidth > 0) settle(el)
  }, [])
  return (
    <div
      className={`relative aspect-[3/2] w-[min(92vw,max(12rem,calc((100dvh_-_7rem)*1.5)))] rounded-xl ${
        loaded ? '' : 'skeleton bg-panel-raised'
      }`}
    >
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        referrerPolicy="no-referrer"
        onLoad={(e) => settle(e.currentTarget)}
        onError={onError}
        onClick={(e) => e.stopPropagation()}
        className={`absolute inset-0 m-auto max-h-full max-w-full rounded-xl transition-opacity duration-250 ${
          wide ? 'h-auto w-full' : 'h-full w-auto'
        } ${loaded ? 'opacity-100' : 'opacity-0'}`}
      />
    </div>
  )
}

function AvailBadge({ unit }) {
  // availability_status is frozen at scrape time, so a date that has since
  // passed would still read "future". Re-derive it against today.
  let status = unit.availability_status
  if (status === 'future' && unit.available_date && unit.available_date <= todayIso()) {
    status = 'now'
  }
  const date = formatDate(unit.available_date, { short: true })

  if (status === 'now') return <span className={AVAILABILITY_PILL.now}>Available now</span>
  if (status === 'waitlist') {
    const closed = /closed/i.test(unit.available_from || '')
    return (
      <span className={AVAILABILITY_PILL.waitlist}>
        {closed ? 'Waitlist closed' : 'Waitlist'}
        {date && (
          <>
            {' · '}
            <Num>{date}</Num>
          </>
        )}
      </span>
    )
  }
  if (status === 'future' && (date || unit.available_from)) {
    return (
      <span className={AVAILABILITY_PILL.future}>
        Available <Num>{date || unit.available_from}</Num>
      </span>
    )
  }
  // Unknown: show the scraped text only when it reads as availability.
  const raw = String(unit.available_from || '').trim()
  return READABLE_AVAILABILITY.test(raw) ? (
    <span className={AVAILABILITY_PILL.unknown}>{raw}</span>
  ) : null
}

/**
 * A static location map: no dragging, zooming or keyboard focus, so it never
 * traps scrolling or Tab. Marker colours come from theme.js and follow the
 * appearance live.
 */
function MiniMap({ lat, long, name, program, hasListings }) {
  const ref = useRef(null)

  useEffect(() => {
    const el = ref.current
    if (!el || !lat || !long) return
    let map = null
    let cancelled = false
    let unsubscribe = () => {}
    let observer = null

    import('leaflet').then((L) => {
      if (cancelled) return
      map = L.map(el, {
        zoomControl: false,
        dragging: false,
        scrollWheelZoom: false,
        doubleClickZoom: false,
        touchZoom: false,
        boxZoom: false,
        keyboard: false,
      }).setView([lat, long], 15)
      L.tileLayer(TILE_LAYER.url, TILE_LAYER.options).addTo(map)

      const styleFor = (dark) => markerStyle({ program, hasListings, selected: true, dark })
      const marker = L.circleMarker([lat, long], { ...styleFor(isDarkTheme()), interactive: false })
        .addTo(map)
        .bindPopup(`<strong class="text-13 font-semibold text-ink">${escapeHtml(name)}</strong>`, {
          closeButton: false,
          autoClose: false,
          closeOnClick: false,
          autoPan: false,
          offset: [0, -8],
        })
        .openPopup()
      // setStyle applies the radius too (Leaflet 1.9).
      unsubscribe = onThemeChange((dark) => marker.setStyle(styleFor(dark)))
      if (typeof ResizeObserver !== 'undefined') {
        observer = new ResizeObserver(() => map && map.invalidateSize())
        observer.observe(el)
      }
    })

    return () => {
      cancelled = true
      unsubscribe()
      if (observer) observer.disconnect()
      if (map) map.remove()
      map = null
    }
  }, [lat, long, name, program, hasListings])

  return <div ref={ref} className="h-44 w-full overflow-hidden rounded-xl border border-edge" />
}

/**
 * One apartment. With a listing link, the unit name's .card-link ::after
 * stretches over the row, so the whole row opens the listing; the heart and
 * the photo sit above that overlay.
 *
 * The row wraps instead of overflowing: when the panel is narrow or the text
 * is enlarged, the price and availability drop under the details (right
 * aligned), so nothing is clipped or overlaps.
 */
function UnitRow({ unit, saved, onToggleSave, photoOk, photoColumn, onEnlarge, onPhotoError }) {
  const type = unitTypeLabel(unit.unit_type)
  const rent = formatRent(unit)
  const listing = safeUrl(unit.listing_url)
  const summary = [type, unit.sqft ? `${unit.sqft} sqft` : null, rent ? `${rent}/mo` : null]
    .filter(Boolean)
    .join(', ')

  return (
    <li
      className={`relative flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2.5 pl-1.5 pr-3 first:rounded-t-[11px] last:rounded-b-[11px] ${
        listing
          ? 'card-interactive hover:bg-panel-raised/60 [&:has(.card-link:focus-visible)]:-outline-offset-2'
          : ''
      }`}
    >
      <HeartButton
        active={saved}
        onToggle={onToggleSave}
        size="sm"
        label={`apartment (${summary})`}
      />
      {/* The photo column makes way where the list is narrow in rem
          (.unit-thumb in globals.css); the carousel still shows the photo. */}
      {unit.image_url && photoOk ? (
        <button
          type="button"
          onClick={(e) => onEnlarge(unit.image_url, e.currentTarget)}
          aria-label={`Enlarge photo: ${summary}`}
          className="unit-thumb relative z-10 shrink-0 cursor-zoom-in overflow-hidden rounded-lg"
        >
          <img
            src={unit.image_url}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => onPhotoError(unit.image_url)}
            className="h-12 w-16 bg-panel-raised object-cover"
          />
        </button>
      ) : photoColumn ? (
        // Holds the photo column's place, only when another row has a photo.
        <span
          aria-hidden="true"
          className="unit-thumb flex h-12 w-16 shrink-0 items-center justify-center rounded-lg bg-panel-raised text-muted"
        >
          <Icon name="home" size={18} strokeWidth={1.75} />
        </span>
      ) : null}
      {/* Wraps the price under it once it would get narrower than 5rem. */}
      <div className="min-w-0 flex-1 basis-20">
        <p className="text-sm font-medium text-ink">
          {listing ? (
            <a
              href={listing}
              target="_blank"
              rel="noopener noreferrer"
              // The conversion that matters: someone left to view a real
              // apartment listing. Fires for clicks anywhere on the row.
              onClick={() => trackEvent('listing_outbound')}
              className="card-link inline-flex items-center gap-1"
            >
              {type}
              <Icon name="external" size={12} className="text-muted" />
              <span className="sr-only">
                {`${unit.sqft ? `, ${unit.sqft} sqft` : ''}${
                  rent ? `, ${rent} per month` : ''
                }. View listing (opens in a new tab)`}
              </span>
            </a>
          ) : (
            type
          )}
        </p>
        <p className="mt-0.5 text-xs text-muted">
          {unit.sqft ? (
            <>
              <Num>{unit.sqft}</Num> sqft
            </>
          ) : (
            'Size not listed'
          )}
        </p>
      </div>
      <div className="ml-auto flex min-w-0 max-w-full flex-col items-end gap-1 text-right [&_.pill]:whitespace-normal">
        {rent ? (
          <p className="whitespace-nowrap font-mono text-sm font-semibold text-ink">{rent}</p>
        ) : (
          <p className="text-xs font-medium text-muted">Contact for pricing</p>
        )}
        <AvailBadge unit={unit} />
      </div>
    </li>
  )
}

/**
 * Estimated rent and income limits. Program sits under the unit and the two
 * income limits stack, so the table fits a 360px panel without scrolling.
 * When it still overflows (narrow phones), the wrapper becomes a named,
 * focusable region so keyboard users can scroll it; otherwise it adds no
 * tab stop.
 */
function QualificationTable({ rows, labelledBy }) {
  const ref = useRef(null)
  const [scrollable, setScrollable] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const check = () => setScrollable(el.scrollWidth > el.clientWidth + 1)
    check()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(check)
    observer.observe(el)
    return () => observer.disconnect()
  }, [rows])

  return (
    <div
      ref={ref}
      {...(scrollable && { role: 'region', 'aria-labelledby': labelledBy, tabIndex: 0 })}
      // relative: the table's visually hidden labels are absolutely
      // positioned, and would otherwise escape this scroller's clip and make
      // the whole panel scroll sideways when the table is wider than it.
      className="relative mt-3 overflow-x-auto rounded-xl border border-edge scrollbar-thin"
    >
      <table className="w-full text-left text-sm">
        <caption className="sr-only">Estimated maximum rent and income limits by unit type</caption>
        <thead className="border-b border-edge bg-panel-raised text-xs text-muted">
          <tr>
            <th scope="col" className="px-3 py-2 font-medium">
              Unit
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              AMI
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Max rent
              <span className="block font-normal">per month</span>
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Max income
              <span className="block font-normal">1 / 2 people</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-edge">
          {rows.map((q, i) => (
            <tr key={i} className="transition-colors hover:bg-panel-raised/50">
              <th scope="row" className="px-3 py-2.5 align-top font-medium text-ink">
                <span className="whitespace-nowrap">{bedroomLabel(q.bedroom)}</span>
                {q.program && (
                  <span className="block text-xs font-normal text-muted">{q.program}</span>
                )}
              </th>
              <td className="px-3 py-2.5 text-right align-top font-mono text-muted">
                {q.ami_pct != null ? `${q.ami_pct}%` : '—'}
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 text-right align-top font-mono font-semibold text-ink">
                {q.max_rent ? money(q.max_rent) : '—'}
              </td>
              <td className="whitespace-nowrap px-3 py-2.5 text-right align-top font-mono text-xs leading-5 text-muted">
                {q.income_limit_1 ? (
                  <>
                    <span className="block">
                      <span className="sr-only">1 person: </span>
                      {money(q.income_limit_1)}
                    </span>
                    <span className="block">
                      <span className="sr-only">2 people: </span>
                      {q.income_limit_2 ? money(q.income_limit_2) : '—'}
                    </span>
                  </>
                ) : (
                  '—'
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/**
 * Property details as a side panel, not a modal: no backdrop, the page stays
 * interactive, and selecting another property swaps the content in place.
 * The close button (or Escape) closes it. Focus moves to the heading when a
 * property loads and returns to whatever opened the panel when it closes.
 *
 * `landmark` is the panel's landmark role, set by the page: 'complementary'
 * while it sits beside the results or floats over the map, 'main' while it
 * covers the page's main content (which is then inert). The root is a div so
 * the role can change across breakpoints without remounting the panel.
 */
export default function PropertyPanel({
  propertyId,
  filters,
  onClose,
  sharedUnitKeys,
  landmark = 'complementary',
}) {
  const { isPropertyFavorite, toggleProperty, isUnitFavorite, toggleUnit } = useFavorites()
  // Units the shared list marked. Shown as saved so a recipient sees exactly
  // which apartments were picked, even before importing the list.
  const inShared = (unit) => !!sharedUnitKeys && sharedUnitKeys.has(unitKey(unit))
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [photoIdx, setPhotoIdx] = useState(0)
  const [lightbox, setLightbox] = useState(false)
  // Photo URLs whose CDN link has died (the listing closed): dropped from the
  // carousel instead of showing a broken frame.
  const [broken, setBroken] = useState(() => new Set())
  // Lets the visitor look past the filters at everything the building offers.
  const [showAllUnits, setShowAllUnits] = useState(false)
  // Whether the header (name, address, save, close) stays pinned while the
  // details scroll under it. Only while it is a modest share of the panel:
  // with enlarged text or a short, zoomed viewport it scrolls away with the
  // rest, so it can never cover the details.
  const [pinHeader, setPinHeader] = useState(true)

  const titleId = useId()
  const qualHeadingId = useId()
  const panelRef = useRef(null)
  const scrollRef = useRef(null)
  const headerRef = useRef(null)
  const unitsHeadingRef = useRef(null)
  const headingRef = useRef(null)
  const openerRef = useRef(null)
  const railRef = useRef(null)
  const lightboxRef = useRef(null)
  const lightboxCloseRef = useRef(null)
  const lightboxTriggerRef = useRef(null)

  // Remember what opened the panel (a result card, usually) so closing it can
  // hand focus back instead of dropping it on <body>.
  useEffect(() => {
    const active = document.activeElement
    if (active && active !== document.body && !panelRef.current?.contains(active)) {
      openerRef.current = active
    }
  }, [propertyId])

  useEffect(() => {
    if (!propertyId) return
    let cancelled = false
    setLoading(true)
    setFailed(false)
    setData(null)
    setPhotoIdx(0)
    setLightbox(false)
    setShowAllUnits(false)
    setBroken(new Set())
    fetch(`/api/properties/${propertyId}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((d) => {
        if (cancelled) return
        setData(d)
        setLoading(false)
      })
      .catch(() => {
        if (cancelled) return
        setFailed(true)
        setLoading(false)
      })
    // A new selection starts reading from the top, not wherever the previous
    // property was scrolled to.
    if (scrollRef.current) scrollRef.current.scrollTop = 0
    // A faster later selection must not be overwritten by a slower earlier one.
    return () => {
      cancelled = true
    }
  }, [propertyId, attempt])

  // With the header pinned, an element focused while scrolled under it (Shift
  // +Tab, say) would be hidden behind it: browsers only scroll a focused
  // element to the scroller's edge. Scroll it clear of the header instead.
  const keepFocusClearOfHeader = (e) => {
    const scroller = scrollRef.current
    const header = headerRef.current
    const el = e.target
    if (!pinHeader || !scroller || !header || !(el instanceof Element) || header.contains(el)) return
    if (!el.matches(':focus-visible')) return // keyboard focus only; clicks never jump
    const gap = header.getBoundingClientRect().bottom - el.getBoundingClientRect().top
    if (gap > -8) scroller.scrollTop -= gap + 8 // 8px: room for the focus ring
  }

  // Pin the header only while it takes at most half the panel's height.
  useEffect(() => {
    const scroller = scrollRef.current
    const header = headerRef.current
    if (!scroller || !header || typeof ResizeObserver === 'undefined') return
    const check = () => setPinHeader(header.offsetHeight <= scroller.clientHeight * 0.5)
    check()
    const observer = new ResizeObserver(check)
    observer.observe(scroller)
    observer.observe(header)
    return () => observer.disconnect()
  }, [])

  // Once a property has loaded, move focus to its name, unless the visitor
  // has already moved on (typing in the search field, say).
  useEffect(() => {
    if (loading) return
    const active = document.activeElement
    if (
      !active ||
      active === document.body ||
      active === openerRef.current ||
      panelRef.current?.contains(active)
    ) {
      headingRef.current?.focus({ preventScroll: true })
    }
  }, [loading])

  // On close, give focus back to the opener if it was inside the panel.
  // A layout-effect cleanup runs before React removes the panel's DOM.
  useIsoLayoutEffect(() => {
    const panel = panelRef.current
    return () => {
      const opener = openerRef.current
      const active = document.activeElement
      if (
        opener?.isConnected &&
        (!active || active === document.body || panel?.contains(active))
      ) {
        opener.focus({ preventScroll: true })
      }
    }
  }, [])

  const allUnits = data?.units?.filter((u) => u.rent_min || u.available_from) ?? []

  // A filtered search has to hold here too: under "1 Bed, ≤$1,500" the panel
  // lists only the apartments that are both, never the building's $2,800
  // one-bedroom. Same rule as the query; see lib/unitFilter.js.
  const filtersActive = hasUnitFilters(filters)
  const matchingUnits = filtersActive
    ? allUnits.filter((u) => unitMatchesFilters(u, filters))
    : allUnits
  const hiddenCount = allUnits.length - matchingUnits.length
  const units = showAllUnits ? allUnits : matchingUnits

  // Every distinct listing photo, labeled by the unit it belongs to. Powers
  // the carousel, the thumbnail rail and the lightbox. Hot-linked from the
  // source, never copied. Follows the visible units, so a filtered panel never
  // shows photos of apartments it is hiding.
  const photos = useMemo(() => {
    const out = []
    const seen = new Set()
    for (const u of units) {
      if (!u.image_url || seen.has(u.image_url) || broken.has(u.image_url)) continue
      seen.add(u.image_url)
      const rent = formatRent(u)
      const type = unitTypeLabel(u.unit_type)
      out.push({
        src: u.image_url,
        href: safeUrl(u.listing_url),
        // `label` names the photo in aria-labels; the parts render the
        // visible caption with mono numbers (PhotoLabel).
        label: `${type}${rent ? ` · ${rent}/mo` : ''}${u.sqft ? ` · ${u.sqft} sqft` : ''}`,
        type,
        rent,
        sqft: u.sqft || null,
      })
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, broken, showAllUnits, filters])

  // photoIdx can point past the end after a broken photo drops out.
  const idx = photos.length ? Math.min(photoIdx, photos.length - 1) : 0
  const stepPhoto = (d) =>
    setPhotoIdx(photos.length ? (idx + d + photos.length) % photos.length : 0)
  const markBroken = (src) => setBroken((b) => new Set(b).add(src))
  const lightboxOpen = lightbox && photos.length > 0

  const openLightbox = (at, trigger) => {
    if (at != null) {
      const i = photos.findIndex((p) => p.src === at)
      if (i < 0) return
      setPhotoIdx(i)
    }
    lightboxTriggerRef.current = trigger ?? null
    setLightbox(true)
    trackEvent('photos_enlarged')
  }

  // The lightbox takes focus on open and returns it to the photo that opened
  // it on close.
  useEffect(() => {
    if (!lightboxOpen) return
    lightboxCloseRef.current?.focus()
    return () => {
      const trigger = lightboxTriggerRef.current
      lightboxTriggerRef.current = null
      if (trigger?.isConnected) trigger.focus({ preventScroll: true })
    }
  }, [lightboxOpen])

  // Keep the active thumbnail in view. Scrolls the rail sideways only, never
  // the panel, so paging inside the lightbox cannot move the page behind it.
  useEffect(() => {
    const rail = railRef.current
    const thumb = rail?.children[idx]
    if (!rail || !thumb) return
    rail.scrollTo({
      left: Math.max(0, thumb.offsetLeft - (rail.clientWidth - thumb.offsetWidth) / 2),
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    })
  }, [idx, photos.length])

  // Escape closes the lightbox first, then the panel; arrows page through
  // photos while the lightbox is up.
  useEffect(() => {
    const handler = (e) => {
      if (e.defaultPrevented) return
      if (e.key === 'Escape') {
        if (lightboxOpen) {
          setLightbox(false)
          return
        }
        // An Escape meant for another open dialog (the share popover) closes
        // that dialog only.
        const dialog =
          e.target instanceof Element && e.target.closest('[role="dialog"], [role="alertdialog"]')
        const panel = panelRef.current
        if (dialog && panel && !dialog.contains(panel) && !panel.contains(dialog)) return
        onClose()
      } else if (lightboxOpen && photos.length > 1) {
        if (e.key === 'ArrowRight') stepPhoto(1)
        else if (e.key === 'ArrowLeft') stepPhoto(-1)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  })

  // Tab and Shift+Tab cycle inside the open lightbox.
  const trapFocus = (e) => {
    if (e.key !== 'Tab') return
    const root = lightboxRef.current
    const items = root ? [...root.querySelectorAll('button:not([disabled]), a[href]')] : []
    if (!items.length) return
    const first = items[0]
    const last = items[items.length - 1]
    const active = document.activeElement
    const outside = active === root || !root.contains(active)
    if (e.shiftKey && (outside || active === first)) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && (outside || active === last)) {
      e.preventDefault()
      first.focus()
    }
  }

  const onPhotoKeyDown = (e) => {
    if (photos.length < 2) return
    if (e.key === 'ArrowRight') {
      e.preventDefault()
      stepPhoto(1)
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      stepPhoto(-1)
    }
  }

  // ------------------------------------------------------------ derived
  const ready = !loading && !failed && !!data
  const website = ready ? safeUrl(data.website) : null
  const phone = ready ? String(data.phone || '').trim() : ''
  const tel = telHref(phone)
  const incentives = ready
    ? INCENTIVES.filter((b) => data.affordable?.[b.flag] || data.affordable?.[b.count] > 0)
    : []
  const unitCounts = ready ? INCENTIVES.filter((b) => data.affordable?.[b.count] > 0) : []
  const expiry = ready ? parseExpiry(data.expiration_date) : []
  const thisYear = new Date().getFullYear()
  const expired = expiry.length > 0 && expiry.every((e) => e.year && e.year < thisYear)
  const prices = units.map((u) => Number(u.rent_min) || 0).filter((n) => n > 0)
  const minRent = prices.length ? Math.min(...prices) : null
  // No price anywhere (not merely filtered out): the header says so.
  const anyPrice = allUnits.some((u) => Number(u.rent_min) > 0)
  // The apartment rows keep a photo column only if some row has a photo.
  const unitPhotos = units.some((u) => u.image_url && !broken.has(u.image_url))
  const hasListingLinks = units.some((u) => safeUrl(u.listing_url))
  const infoUrl = ready ? safeUrl(data.pageInfo?.info_url) : null

  const facts = ready
    ? [
        // Rent from is not repeated here: it leads the header.
        data.amis && {
          key: 'ami',
          term: (
            <>
              <abbr title="Area median income" className="no-underline">
                AMI
              </abbr>{' '}
              range
            </>
          ),
          value: <Num>{formatAmi(data.amis)}</Num>,
        },
        // Statewide market-rate rows have no unit counts: the portal
        // publishes vacancies, not building totals.
        data.total_units > 0 && {
          key: 'units',
          term: 'Units',
          value:
            data.income_restricted_units > 0 ? (
              <>
                <Num>{data.income_restricted_units}</Num> of <Num>{data.total_units}</Num>{' '}
                income-restricted
              </>
            ) : (
              <>
                <Num>{data.total_units}</Num> total
              </>
            ),
        },
        expiry.length > 0 && {
          key: 'expiry',
          term: expired ? 'Program ended' : 'Program ends',
          value: expiry.map((e, i) => (
            <Fragment key={i}>
              {i > 0 && ' · '}
              <Num>{e.iso ? formatDate(e.iso) : e.year ?? e.text}</Num>
              {e.label && ` ${e.label}`}
            </Fragment>
          )),
        },
        data.owner_management && {
          key: 'management',
          term: 'Management',
          value: data.owner_management,
          wide: String(data.owner_management).length > 22,
        },
      ].filter(Boolean)
    : []
  // Two columns; wide facts take a full row, and an odd one out spans both.
  const regularFacts = facts.filter((f) => !f.wide)
  const orderedFacts = [...regularFacts, ...facts.filter((f) => f.wide)]
  const spansRow = (f, i) =>
    f.wide || (i === regularFacts.length - 1 && regularFacts.length % 2 === 1)

  // The heading takes focus programmatically. It is not a control, so instead
  // of the box ring it gets a gold underline as its "you are here" cue.
  const headingClass =
    'pt-1.5 text-lg font-semibold leading-snug tracking-tight text-ink focus-visible:underline focus-visible:decoration-accent focus-visible:decoration-2 focus-visible:underline-offset-4 focus-visible:outline-none'

  return (
    <div
      ref={panelRef}
      role={landmark === 'main' ? 'main' : 'complementary'}
      aria-labelledby={titleId}
      aria-busy={loading || undefined}
      // No shadow of its own: page.js adds one only where the panel floats
      // over the map, not where it sits flat as the third column.
      className="flex h-full flex-col border-l border-edge bg-panel"
    >
      {/* One scroll container for the whole panel, so every part of it can
          be reached at any text size or zoom level. */}
      <div
        ref={scrollRef}
        onFocus={keepFocusClearOfHeader}
        className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain scrollbar-thin"
      >
      {/* Header: name, address, program, save and close. Pinned (sticky)
          while it fits comfortably; see pinHeader. z-20 keeps it above the
          body's raised controls (hearts, photo buttons). A div, not
          <header>: inside a div landmark a <header> would read as a second
          page banner. */}
      {/* Below lg it covers the page at full width: the header row and the
          body keep to a centred, readable column (max-w-2xl). */}
      <div
        ref={headerRef}
        className={`${pinHeader ? 'sticky top-0 z-20' : ''} border-b border-edge bg-panel py-4`}
      >
        <div className="mx-auto flex w-full max-w-2xl items-start gap-3 px-5">
          <div className="min-w-0 flex-1">
            {loading ? (
              <>
                <h2 id={titleId} className="sr-only">
                  Loading property details
                </h2>
                {/* Same height as the loaded header (title, address, price,
                    pills), so nothing jumps when the data arrives. */}
                <div aria-hidden="true" className="pt-1.5">
                  <div className="skeleton h-6 w-3/4" />
                  <div className="skeleton mt-1.5 h-4 w-1/2" />
                  <div className="skeleton mt-2 h-4 w-28" />
                  <div className="skeleton mt-2.5 h-[1.625rem] w-36 rounded-full" />
                </div>
              </>
            ) : ready ? (
              <>
                <h2 id={titleId} ref={headingRef} tabIndex={-1} className={headingClass}>
                  {data.building_name}
                </h2>
                {placeLine(data) && <p className="mt-0.5 text-sm text-muted">{placeLine(data)}</p>}
                {/* The price leads with the name and the place, pinned with
                    them while the details scroll. */}
                {minRent ? (
                  <p className="mt-1 text-sm text-ink">
                    <span className="text-xs text-muted">from </span>
                    <span className="font-mono font-semibold">{money(minRent)}</span>
                    <span className="text-xs text-muted" aria-hidden="true">
                      /mo
                    </span>
                    <span className="sr-only"> per month</span>
                  </p>
                ) : !anyPrice ? (
                  <p className="mt-1 text-xs font-medium leading-5 text-muted">Contact for pricing</p>
                ) : null}
                <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                  <span className="pill text-muted">
                    <span
                      className="chip-dot"
                      style={{ background: programColor(data.program) }}
                      aria-hidden="true"
                    />
                    {programName(data.program)}
                  </span>
                  {incentives.map((b) => (
                    <abbr key={b.flag} title={b.title} className="badge no-underline">
                      {b.label}
                    </abbr>
                  ))}
                </div>
              </>
            ) : (
              // Named after the outcome: focus lands here when loading ends,
              // so a screen reader announces the failure, not a generic title.
              <h2 id={titleId} ref={headingRef} tabIndex={-1} className={headingClass}>
                Couldn’t load this property
              </h2>
            )}
          </div>
          <div className="-mr-2 flex shrink-0 items-center gap-1">
            {/* Save only what has loaded: never a place the panel could not
                show. Close is there in every state. */}
            {ready && (
              <HeartButton
                active={isPropertyFavorite(propertyId)}
                onToggle={() => toggleProperty(propertyId, { address: data.address, city: data.city })}
                label={data.building_name || 'this building'}
              />
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close details"
              className="btn-icon before:absolute before:-inset-0.5"
            >
              <Icon name="close" size={20} />
            </button>
          </div>
        </div>
      </div>

      {/* Body */}
        {loading ? (
          <div aria-hidden="true" className="mx-auto max-w-2xl space-y-5 px-5 py-5">
            <div className="skeleton aspect-video w-full rounded-lg" />
            <div className="grid grid-cols-2 gap-2">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="skeleton h-[3.75rem] rounded-lg" />
              ))}
            </div>
            <div className="skeleton h-9 w-52" />
            <div className="skeleton h-40 w-full rounded-xl" />
          </div>
        ) : !ready ? (
          <div className="mx-auto max-w-2xl px-5 py-10 text-center">
            <p className="text-sm text-muted">Check your connection and try again.</p>
            <button
              type="button"
              onClick={() => setAttempt((n) => n + 1)}
              className="btn btn-secondary mt-4 coarse:h-11"
            >
              Try again
            </button>
          </div>
        ) : (
          <div className="panel-body mx-auto w-full max-w-2xl space-y-6 px-5 pt-5 pb-safe">
            {/* Photo carousel: arrows page through every unit's photo, and
                selecting the photo opens the lightbox instead of leaving. */}
            {photos.length > 0 && (
              <div>
                <div className="relative">
                  <button
                    type="button"
                    onClick={(e) => openLightbox(null, e.currentTarget)}
                    onKeyDown={onPhotoKeyDown}
                    aria-label={`Enlarge photo ${idx + 1} of ${photos.length}: ${photos[idx].label}`}
                    className="block w-full cursor-zoom-in overflow-hidden rounded-lg bg-panel-raised"
                  >
                    {/* 16:9 at the panel's width: a photo, not a strip, at
                        every panel size. */}
                    <img
                      src={photos[idx].src}
                      alt=""
                      referrerPolicy="no-referrer"
                      onError={() => markBroken(photos[idx].src)}
                      className="aspect-video w-full object-cover"
                    />
                  </button>
                  {/* Which apartment this photo belongs to. Visual only: the
                      button's name and the live region below say the same. */}
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute bottom-2 left-2 max-w-[calc(100%-5rem)] truncate rounded-full bg-black/60 px-2.5 py-1 text-2xs font-medium text-white"
                  >
                    <PhotoLabel photo={photos[idx]} />
                  </span>
                  {photos.length > 1 && (
                    <>
                      {/* Over the photo: focus-ring-photo puts the gold ring
                          on a navy halo so it shows on any image. */}
                      <button
                        type="button"
                        onClick={() => stepPhoto(-1)}
                        aria-label="Previous photo"
                        className="btn-icon focus-ring-photo absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/55 text-white hover:bg-black/75 hover:text-white"
                      >
                        <Icon name="chevronLeft" size={20} strokeWidth={2.5} />
                      </button>
                      <button
                        type="button"
                        onClick={() => stepPhoto(1)}
                        aria-label="Next photo"
                        className="btn-icon focus-ring-photo absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/55 text-white hover:bg-black/75 hover:text-white"
                      >
                        <Icon name="chevronRight" size={20} strokeWidth={2.5} />
                      </button>
                      <span
                        aria-hidden="true"
                        className="pointer-events-none absolute bottom-2 right-2 rounded-full bg-black/60 px-2 py-1 font-mono text-2xs font-medium text-white"
                      >
                        {idx + 1} / {photos.length}
                      </span>
                    </>
                  )}
                  {/* Announces paging; silent while the lightbox speaks. */}
                  <p className="sr-only" aria-live={lightboxOpen ? 'off' : 'polite'} aria-atomic="true">
                    {`Photo ${idx + 1} of ${photos.length}: ${photos[idx].label}`}
                  </p>
                </div>

                {/* Thumbnail rail: jump straight to an apartment's photo. The
                    padding keeps focus rings clear of the scroll clip. */}
                {photos.length > 1 && (
                  <div
                    ref={railRef}
                    // A thumbnail reached with Tab scrolls fully into view,
                    // focus ring included (scroll-px-1 = the ring's reach).
                    onFocus={(e) => {
                      if (e.target instanceof HTMLElement && e.target.matches(':focus-visible')) {
                        e.target.scrollIntoView({ block: 'nearest', inline: 'nearest' })
                      }
                    }}
                    className="relative -mx-1 mt-1 flex scroll-px-1 gap-1.5 overflow-x-auto p-1 no-scrollbar"
                  >
                    {photos.map((p, i) => (
                      <button
                        key={p.src}
                        type="button"
                        onClick={() => setPhotoIdx(i)}
                        aria-label={`Show photo ${i + 1}: ${p.label}`}
                        aria-current={i === idx ? 'true' : undefined}
                        className={`shrink-0 overflow-hidden rounded-md border-2 transition-opacity ${
                          i === idx
                            ? 'border-accent-strong'
                            : 'border-transparent opacity-70 hover:opacity-100 focus-visible:opacity-100'
                        }`}
                      >
                        <img
                          src={p.src}
                          alt=""
                          loading="lazy"
                          referrerPolicy="no-referrer"
                          onError={() => markBroken(p.src)}
                          className="h-11 w-16 bg-panel-raised object-cover"
                        />
                      </button>
                    ))}
                  </div>
                )}

                <p className="mt-1.5 text-2xs text-muted">
                  Photos from the property’s listing site. Select a photo to enlarge it.
                </p>
              </div>
            )}

            {/* Key facts */}
            {/* Two columns, one when the panel is narrow in rem (.facts-grid);
                a value too long for its tile wraps rather than overflowing. */}
            {orderedFacts.length > 0 && (
              <dl className="facts-grid">
                {orderedFacts.map((f, i) => (
                  <div
                    key={f.key}
                    className={`min-w-0 rounded-lg bg-panel-raised px-3 py-2.5 ${
                      spansRow(f, i) ? 'col-span-full' : ''
                    }`}
                  >
                    <dt className="section-label">{f.term}</dt>
                    <dd className="mt-1 min-w-0 break-words text-sm font-medium leading-snug text-ink">
                      {f.value}
                    </dd>
                  </div>
                ))}
              </dl>
            )}

            {/* Contact: one primary action. The buttons grow to fill the row,
                stack full width when the panel is too narrow for both, and
                wrap their labels at large text sizes (.btn-wrap). */}
            {(website || tel) && (
              <div className="flex flex-wrap gap-2">
                {website && (
                  <a
                    href={website}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => trackEvent('website_outbound')}
                    className="btn btn-primary btn-wrap grow coarse:min-h-11"
                  >
                    Visit property website
                    <Icon name="external" size={14} className="shrink-0" />
                    <span className="sr-only"> (opens in a new tab)</span>
                  </a>
                )}
                {tel && (
                  <a href={tel} className="btn btn-secondary btn-wrap grow coarse:min-h-11">
                    <Icon name="phone" size={14} className="shrink-0" />
                    <span>
                      Call <span className="whitespace-nowrap font-mono">{phone}</span>
                    </span>
                  </a>
                )}
              </div>
            )}

            {/* Apartments: live unit listings */}
            <section>
              {/* Focusable (-1) so "Show them anyway", which replaces itself
                  with the list, can hand focus here instead of to <body>. */}
              <h3
                ref={unitsHeadingRef}
                tabIndex={-1}
                className="section-label flex w-fit items-center gap-2 rounded-sm"
              >
                {units.length > 0 && <span className="live-dot" aria-hidden="true" />}
                Apartments
                {units.length > 0 && (
                  <span className="font-mono tracking-normal">{units.length}</span>
                )}
              </h3>

              {filtersActive && hiddenCount > 0 && units.length > 0 && (
                <div className="mt-1 flex flex-wrap items-center gap-x-1">
                  <p className="text-13 text-muted">
                    {showAllUnits ? (
                      <>
                        Showing all, including <Num>{hiddenCount}</Num> outside your filters.
                      </>
                    ) : (
                      <>
                        <Num>{hiddenCount}</Num> more here {hiddenCount === 1 ? 'doesn’t' : 'don’t'}{' '}
                        match your filters.
                      </>
                    )}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setShowAllUnits((v) => !v)
                      // With none matching, hiding the rest replaces the list
                      // (and this button) with the "None of the …" note:
                      // hand focus to the section heading, not <body>.
                      if (showAllUnits && matchingUnits.length === 0) {
                        requestAnimationFrame(() => unitsHeadingRef.current?.focus())
                      }
                    }}
                    className="btn btn-ghost btn-sm -ml-1 coarse:h-11"
                  >
                    {!showAllUnits
                      ? 'Show all'
                      : matchingUnits.length > 0
                      ? `Show only the ${matchingUnits.length} that match`
                      : 'Hide apartments outside your filters'}
                  </button>
                </div>
              )}

              {units.length > 0 ? (
                <>
                  <ul className="unit-list mt-3 divide-y divide-edge rounded-xl border border-edge">
                    {units.map((u, i) => (
                      <UnitRow
                        key={`${unitKey(u)}:${i}`}
                        unit={u}
                        saved={isUnitFavorite(u) || inShared(u)}
                        onToggleSave={() =>
                          toggleUnit(u, propertyId, { address: data.address, city: data.city })
                        }
                        photoOk={!broken.has(u.image_url)}
                        photoColumn={unitPhotos}
                        onEnlarge={openLightbox}
                        onPhotoError={markBroken}
                      />
                    ))}
                  </ul>
                  <p className="mt-2 text-xs leading-relaxed text-muted">
                    <Icon name="heart" size={12} className="mr-1 inline-block align-[-2px]" />
                    <span className="sr-only">The heart button </span>
                    saves one apartment
                    {hasListingLinks ? ' · Select a row to open its listing' : ''}
                    {' · Prices may have changed since indexing'}
                  </p>
                </>
              ) : allUnits.length > 0 ? (
                // Everything here was filtered out: say so rather than reading
                // as a building with no pricing at all.
                <div className="mt-3 rounded-xl border border-edge p-4 text-center">
                  <p className="text-sm text-muted">
                    None of the <Num>{allUnits.length}</Num> apartment
                    {allUnits.length !== 1 ? 's' : ''} listed here match your filters.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setShowAllUnits(true)
                      // The button is replaced by the list on the next render.
                      requestAnimationFrame(() => unitsHeadingRef.current?.focus())
                    }}
                    className="btn btn-secondary btn-sm mt-3 coarse:h-11"
                  >
                    Show them anyway
                  </button>
                </div>
              ) : (
                <div className="mt-3 rounded-xl border border-edge p-4 text-center">
                  <p className="text-sm font-medium text-ink">No live listings right now</p>
                  <p className="mt-1 text-sm text-muted">
                    Contact the property for current rents and availability.
                  </p>
                </div>
              )}
            </section>

            {/* Affordable unit qualification */}
            {data.qualifications?.length > 0 && (
              <section>
                <h3 id={qualHeadingId} className="section-label">
                  Affordable unit qualification
                </h3>
                {unitCounts.length > 0 && (
                  <p className="mt-1 text-13 text-muted">
                    {unitCounts.map((b, i) => (
                      <Fragment key={b.flag}>
                        {i > 0 && ' · '}
                        <Num>{data.affordable[b.count]}</Num>{' '}
                        <abbr title={b.title} className="no-underline">
                          {b.label}
                        </abbr>
                      </Fragment>
                    ))}
                    {' units'}
                  </p>
                )}
                {/* The callout recipe (as on the Disclaimer page), tighter. */}
                {data.pageInfo?.has_waitlist_mention === 1 && (
                  <div className="callout mt-3 px-4 py-3">
                    <p className="section-label text-accent">Waitlist</p>
                    <p className="mt-1 text-13 leading-relaxed text-ink">
                      This property’s website mentions a waitlist.
                      {infoUrl && (
                        <>
                          {' '}
                          <a
                            href={infoUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="link-inline font-medium"
                          >
                            See details
                            <span className="sr-only"> (opens in a new tab)</span>
                          </a>
                        </>
                      )}
                    </p>
                  </div>
                )}
                <QualificationTable rows={data.qualifications} labelledBy={qualHeadingId} />
                <p className="mt-2 text-xs leading-relaxed text-muted">
                  Estimated from the Seattle Office of Housing 2026–2027 rent &amp; income
                  schedules. Actual rents, unit assignments, and MFTE phase may differ —
                  verify with the property.
                </p>
              </section>
            )}

            {/* Location */}
            {data.lat && data.long ? (
              <section>
                <h3 className="section-label mb-3">Location</h3>
                <MiniMap
                  lat={data.lat}
                  long={data.long}
                  name={data.building_name}
                  program={data.program}
                  hasListings={allUnits.length > 0}
                />
              </section>
            ) : null}
          </div>
        )}
      </div>

      {/* Lightbox: the photo full-size in-app, portaled to <body> so no
          ancestor transform or stacking context can trap it. A modal dialog:
          focus moves in, Tab stays inside, and Escape, the close button or
          the scrim close it and return focus to the photo that opened it.
          `dark` gives the black scrim the dark tokens in both appearances. */}
      {lightboxOpen &&
        createPortal(
          <div
            ref={lightboxRef}
            role="dialog"
            aria-modal="true"
            aria-label={`Photos of ${data?.building_name || 'this property'}`}
            tabIndex={-1}
            onKeyDown={trapFocus}
            onClick={() => setLightbox(false)}
            // It scrolls when the photo and caption are taller than the
            // screen (400% zoom, a landscape phone with large text); the
            // content is centred with auto margins, which, unlike
            // justify-center, never push its top out of reach. The close
            // button and arrows are fixed, so they stay put while it scrolls.
            className="dark fixed inset-0 z-dialog flex flex-col overflow-y-auto overscroll-contain bg-black/90 p-4 text-ink outline-none"
          >
            <button
              ref={lightboxCloseRef}
              type="button"
              onClick={() => setLightbox(false)}
              aria-label="Close photo viewer"
              className="btn-icon focus-ring-photo fixed right-3 top-3 z-10 size-11 rounded-full bg-panel/80 text-ink hover:bg-panel hover:text-ink sm:right-5 sm:top-5"
            >
              <Icon name="close" size={22} />
            </button>

            <div className="my-auto flex flex-col items-center">
              <LightboxPhoto
                key={photos[idx].src}
                src={photos[idx].src}
                alt={`${data?.building_name ?? 'Property'}, ${photos[idx].label}`}
                onError={() => markBroken(photos[idx].src)}
              />

              {photos.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      stepPhoto(-1)
                    }}
                    aria-label="Previous photo"
                    className="btn-icon focus-ring-photo fixed left-3 top-1/2 z-10 size-12 -translate-y-1/2 rounded-full bg-panel/80 text-ink hover:bg-panel hover:text-ink sm:left-6"
                  >
                    <Icon name="chevronLeft" size={24} strokeWidth={2.5} />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      stepPhoto(1)
                    }}
                    aria-label="Next photo"
                    className="btn-icon focus-ring-photo fixed right-3 top-1/2 z-10 size-12 -translate-y-1/2 rounded-full bg-panel/80 text-ink hover:bg-panel hover:text-ink sm:right-6"
                  >
                    <Icon name="chevronRight" size={24} strokeWidth={2.5} />
                  </button>
                </>
              )}

              <div
                onClick={(e) => e.stopPropagation()}
                className="mt-4 flex max-w-[92vw] flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm"
              >
                <p aria-live="polite" aria-atomic="true" className="text-center">
                  <span className="font-medium text-ink">
                    <PhotoLabel photo={photos[idx]} />
                  </span>
                  {photos.length > 1 && (
                    <>
                      <span aria-hidden="true" className="ml-3 font-mono text-muted">
                        {idx + 1} / {photos.length}
                      </span>
                      <span className="sr-only">{`, photo ${idx + 1} of ${photos.length}`}</span>
                    </>
                  )}
                </p>
                {photos[idx].href && (
                  <a
                    href={photos[idx].href}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => trackEvent('listing_outbound')}
                    className="link -my-3 inline-flex items-center gap-1.5 py-3 font-medium"
                  >
                    Open this apartment’s listing
                    <Icon name="external" size={14} />
                    <span className="sr-only"> (opens in a new tab)</span>
                  </a>
                )}
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  )
}
