'use client'

import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import {
  ICONS,
  Icon,
  PROGRAM_OPTIONS,
  TILE_LAYER,
  escapeHtml,
  isDarkTheme,
  markerStyle,
  onThemeChange,
  prefersReducedMotion,
  programColor,
  programLabel,
} from '@/lib/theme'

const SEATTLE_CENTER = [47.6062, -122.3321]

// closeOnEscapeKey off: Leaflet keeps a closed popup as the map's "open"
// one and, while the map has keyboard focus, swallows every later Escape to
// close it again, so Escape could never reach the page to close the details
// panel. A popup only ever belongs to the selected place, and closing the
// panel (Escape included) closes it (see the highlight effect).
const POPUP_OPTIONS = { maxWidth: 260, minWidth: 180, closeOnEscapeKey: false }

// The app's heart icon, for the popup's "Saved" line (popups are HTML strings).
// Sized in rem like every other icon, so it grows with the user's text size.
const HEART_SVG = `<svg viewBox="0 0 24 24" width="12" height="12" style="width:0.75rem;height:0.75rem" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="${ICONS.heart}"/></svg>`

/**
 * A marker's look from its data plus the current saved / selected / theme
 * state. Every restyle goes through here (markerStyle in lib/theme.js), so
 * the list, selection and theme effects can never disagree.
 */
function styleFor(id, meta, { savedIds, highlightId, dark }) {
  return markerStyle({
    program: meta?.program,
    hasListings: !!meta?.hasListings,
    saved: !!savedIds && savedIds.has(Number(id)),
    selected: highlightId != null && Number(id) === Number(highlightId),
    dark,
  })
}

/**
 * Popup HTML. Leaflet treats the string as markup and these fields are
 * scraped from property websites, so every value is escaped. Colours come
 * from token classes that follow the appearance; the only inline colour is
 * the program dot, a constant from lib/theme.js.
 */
function popupHtml(p, { saved, savedUnits }) {
  const address = String(p.address ?? '')
  const neighborhood = String(p.neighborhood ?? '')
  // Statewide rows carry their city as the neighborhood, which the address
  // usually spells out already; show it only when it adds something.
  const showPlace = neighborhood && !address.toLowerCase().includes(neighborhood.toLowerCase())
  const rent = Number(p.min_rent) > 0 ? Number(p.min_rent).toLocaleString('en-US') : ''
  const units = Number(savedUnits) || 0

  let html = `<div class="text-sm font-semibold leading-snug tracking-tight text-ink">${escapeHtml(p.building_name)}</div>`
  if (address) html += `<div class="mt-0.5 text-muted">${escapeHtml(address)}</div>`
  html +=
    '<div class="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted">' +
    `<span class="chip-dot" style="background:${programColor(p.program)}" aria-hidden="true"></span>` +
    `<span>${escapeHtml(programLabel(p.program))}</span>` +
    (showPlace ? `<span aria-hidden="true">·</span><span>${escapeHtml(neighborhood)}</span>` : '') +
    '</div>'
  if (p.listing_count > 0) {
    html +=
      '<div class="mt-1.5 flex items-center gap-1.5 text-xs">' +
      '<span class="live-dot" aria-hidden="true"></span>' +
      '<span class="font-medium text-green">Live pricing</span>' +
      (rent
        ? `<span class="ml-auto whitespace-nowrap pl-2 text-ink"><span class="text-muted">from </span><span class="font-mono font-semibold">$${rent}</span><span class="text-muted">/mo</span></span>`
        : '') +
      '</div>'
  }
  if (saved) {
    html +=
      `<div class="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-saved">${HEART_SVG}<span>Saved` +
      (units ? ` · <span class="font-mono">${units}</span> apartment${units !== 1 ? 's' : ''}` : '') +
      '</span></div>'
  }
  return html
}

/** Fixed-width slot so legend labels line up whatever the swatch size. */
function Swatch({ children }) {
  return (
    <span className="flex w-5 shrink-0 items-center justify-center" aria-hidden="true">
      {children}
    </span>
  )
}

// Keeps a point this far inside the visible edges when nudging it into view.
const EDGE_MARGIN = 32

// Space kept between a popup and the visible strip's edges.
const POPUP_GUTTER = 8

// The legend opens by itself only on a map at least this roomy (in rem, so
// it follows the text size the legend itself scales with).
const LEGEND_ROOM = { width: 26, height: 20 }

export default function Map({
  properties,
  highlightId,
  onSelect,
  fitTo,
  // Optional { kind: 'city' | 'neighborhood' | 'county', name }: when a fit
  // happens, frame only the places there (the place a search names, where
  // most of its matches are), falling back to every place shown.
  fitPlace,
  savedIds,
  savedUnitCountFor,
  // Optional: () => px of the map's right edge hidden behind an overlay (the
  // details panel in the Map view), so centring targets the visible part.
  getRightInset,
  // The screen-reader hint after the keyboard instructions: how to open a
  // place from wherever the map is shown (page.js passes one per view).
  hint = 'Open a place from the list.',
}) {
  const rootRef = useRef(null)
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const markersRef = useRef({}) // id -> L.CircleMarker
  const metaRef = useRef({}) // id -> { program, hasListings }, to restyle in place
  const selectedRef = useRef(null) // id currently drawn as selected
  // Bounds a fit asked for while the map was hidden (List view below lg,
  // where its wrapper is display:none). Fitting a 0x0 map drops to zoom 0, so
  // the fit waits here until the map has a size (the ResizeObserver).
  const pendingFitRef = useRef(null)
  // The latest view (a fit or a centring) asked for while a zoom animation
  // was running. Leaflet ignores a new view until that animation ends, so a
  // search settling mid-zoom would leave the map on the previous one. Kept
  // here instead and applied, without animation, once the zoom ends; a newer
  // request replaces it, so the last one always lands. See applyView.
  const queuedViewRef = useRef(null)
  const viewSeqRef = useRef(0) // counts view requests, so an older one never lands late
  const darkRef = useRef(false)
  const propsRef = useRef(properties)
  const onSelectRef = useRef(onSelect)
  const savedIdsRef = useRef(savedIds)
  const highlightRef = useRef(highlightId)
  const insetRef = useRef(getRightInset)
  const fitPlaceRef = useRef(fitPlace)
  // A popup's padding and border around its content box, measured from an
  // open popup (Leaflet's min/maxWidth size the content box).
  const popupChromeRef = useRef(60)
  const [mapReady, setMapReady] = useState(false)
  // The legend sits behind a toggle chip at every size. It opens by itself
  // where the map has room for it (LEGEND_ROOM) and folds away where it would
  // cover too much: phones, the narrow List-view card beside an open panel,
  // or large text sizes. Once toggled, the visitor's choice sticks.
  const [legendRoomy, setLegendRoomy] = useState(false)
  const [legendChoice, setLegendChoice] = useState(null) // null = automatic
  const legendOpen = legendChoice ?? legendRoomy
  const uid = useId()
  const legendId = `${uid}legend`
  const legendTitleId = `${uid}legend-title`
  const helpId = `${uid}map-help`

  propsRef.current = properties
  onSelectRef.current = onSelect
  savedIdsRef.current = savedIds
  highlightRef.current = highlightId
  insetRef.current = getRightInset
  fitPlaceRef.current = fitPlace

  const rightInset = () => {
    const px = insetRef.current ? Number(insetRef.current()) : 0
    return Number.isFinite(px) && px > 0 ? px : 0
  }
  // The inset, but always leaving a usable strip of map to centre in.
  const visibleInset = (map) =>
    Math.max(0, Math.min(rightInset(), map.getSize().x - 3 * EDGE_MARGIN))

  // Hidden maps (display:none) measure 0x0.
  const hasSize = (map) => {
    const el = map.getContainer()
    return el.clientWidth > 0 && el.clientHeight > 0
  }

  const fitToBounds = (map, bounds, animate) => {
    const inset = visibleInset(map)
    map.fitBounds(bounds, {
      animate,
      maxZoom: 15,
      ...(inset && { paddingBottomRight: [inset, 0] }),
    })
  }

  // Centre a place in the part of the map still visible: with the details
  // panel over the map's right edge, shift the view by half the hidden width,
  // so the place and its open popup sit clear of the panel.
  const centreOn = (map, latlng, zoom, animate) => {
    const inset = visibleInset(map)
    const center = inset ? map.unproject(map.project(latlng, zoom).add([inset / 2, 0]), zoom) : latlng
    map.setView(center, zoom, { animate })
  }

  // Every programmatic move goes through here: { kind: 'fit', bounds } or
  // { kind: 'centre', latlng, minZoom }. While a zoom animation runs (when
  // Leaflet would drop it) the request waits in queuedViewRef for the
  // animation's zoomend (see the map setup); otherwise it applies now.
  const applyView = (map, view, animate) => {
    const seq = ++viewSeqRef.current
    if (map._animatingZoom) {
      queuedViewRef.current = { ...view, seq }
      return
    }
    if (view.kind === 'fit') fitToBounds(map, view.bounds, animate)
    else centreOn(map, view.latlng, Math.max(map.getZoom(), view.minZoom), animate)
  }

  // Size the selected place's popup to the map's visible strip: on a strip
  // narrower than the usual popup (the Map view beside the details panel on
  // small tablets and landscape phones) its content narrows, so it is never
  // cut by the panel or the map's left edge. A popup opened while the map
  // was hidden (the List view below lg) is also re-measured here once the
  // map is shown (`update`); Leaflet measured it at zero width.
  const sizePopup = (map, marker, update) => {
    const popup = marker.getPopup()
    if (!popup) return
    const el = popup.isOpen() ? popup.getElement() : null
    const content = el && el.querySelector('.leaflet-popup-content')
    if (el && content && el.offsetWidth > 0) {
      popupChromeRef.current = el.offsetWidth - content.offsetWidth
    }
    const strip = map.getSize().x - visibleInset(map)
    const max = Math.max(
      120,
      Math.min(POPUP_OPTIONS.maxWidth, strip - 2 * POPUP_GUTTER - popupChromeRef.current)
    )
    const changed = popup.options.maxWidth !== max
    popup.options.maxWidth = max
    popup.options.minWidth = Math.min(POPUP_OPTIONS.minWidth, max)
    if (update && popup.isOpen() && (changed || el?.offsetWidth === 0 || update === 'force')) {
      popup.update()
    }
  }

  // Whether the legend has room to open by itself: the map's visible part
  // (left of the details panel in the Map view) against LEGEND_ROOM.
  const measureLegendRoom = () => {
    const el = rootRef.current
    if (!el) return
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
    const width = el.clientWidth - rightInset()
    setLegendRoomy(width >= LEGEND_ROOM.width * rem && el.clientHeight >= LEGEND_ROOM.height * rem)
  }

  useEffect(() => {
    if (typeof window === 'undefined' || !containerRef.current) return
    let disposed = false

    import('leaflet').then((L) => {
      if (disposed || mapRef.current || !containerRef.current) return

      const map = L.map(containerRef.current, { zoomControl: false }).setView(SEATTLE_CENTER, 12)

      L.control.zoom({ position: 'bottomright' }).addTo(map)

      L.tileLayer(TILE_LAYER.url, TILE_LAYER.options).addTo(map)

      // A view requested during a zoom animation lands when it ends, after
      // Leaflet has finished its own zoomend and moveend work.
      map.on('zoomend', () => {
        const queued = queuedViewRef.current
        if (!queued) return
        queuedViewRef.current = null
        requestAnimationFrame(() => {
          // Superseded meanwhile by a request that applied at once.
          if (mapRef.current !== map || viewSeqRef.current !== queued.seq) return
          if (!hasSize(map)) {
            if (queued.kind === 'fit') pendingFitRef.current = queued.bounds
            return
          }
          applyView(map, queued, false)
        })
      })

      mapRef.current = map
      setMapReady(true)
    })

    // The container changes size without a window resize when the layout
    // reshapes between the List view's map card and the full-bleed Map view;
    // Leaflet only listens for window resizes, so re-measure explicitly.
    // A fit that arrived while the map was hidden is applied once it has a
    // size. A selected place is centred in the visible part again when the
    // map has just been shown (the List -> Map switch below lg) or the
    // details panel newly covers part of it (the same switch from lg), so its
    // popup is not left under the panel; on any other resize it is only
    // nudged back into view if the new shape hid it.
    const seen = { shown: false, inset: 0 }
    const observer = new ResizeObserver(() => {
      const map = mapRef.current
      if (!map) return
      map.invalidateSize()
      if (!hasSize(map)) {
        seen.shown = false
        return
      }
      const wasShown = seen.shown
      const insetBefore = seen.inset
      seen.shown = true
      seen.inset = visibleInset(map)
      if (pendingFitRef.current) {
        const bounds = pendingFitRef.current
        pendingFitRef.current = null
        fitToBounds(map, bounds, false)
        return
      }
      const marker = selectedRef.current ? markersRef.current[selectedRef.current] : null
      if (!marker) return
      if (!wasShown || seen.inset !== insetBefore) {
        applyView(map, { kind: 'centre', latlng: marker.getLatLng(), minZoom: map.getZoom() }, false)
        sizePopup(map, marker, wasShown ? true : 'force')
      } else {
        sizePopup(map, marker, true)
        map.panInside(marker.getLatLng(), {
          paddingTopLeft: [EDGE_MARGIN, EDGE_MARGIN],
          paddingBottomRight: [seen.inset + EDGE_MARGIN, EDGE_MARGIN],
          animate: false,
        })
      }
    })
    observer.observe(containerRef.current)

    return () => {
      disposed = true
      observer.disconnect()
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
        markersRef.current = {}
        metaRef.current = {}
        selectedRef.current = null
      }
    }
  }, [])

  // Whether the map has room to show the legend open (see legendOpen).
  // Measured before the first paint (a layout effect; this component never
  // renders on the server), so the legend appears in its final state rather
  // than opening a moment later and shifting. Re-measured on resize, and
  // when a selection or a view switch changes how much the details panel
  // covers.
  useLayoutEffect(() => {
    const el = rootRef.current
    if (!el) return undefined
    measureLegendRoom()
    if (typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver(() => measureLegendRoom())
    observer.observe(el)
    return () => observer.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => {
    measureLegendRoom()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightId, getRightInset])

  // Appearance: read the html.dark class now, then follow it (a
  // MutationObserver inside onThemeChange). The markers already on the map
  // are restyled in place; recreating ~2,800 of them would freeze the tab.
  useEffect(() => {
    darkRef.current = isDarkTheme()
    return onThemeChange((dark) => {
      darkRef.current = dark
      const ctx = { savedIds: savedIdsRef.current, highlightId: highlightRef.current, dark }
      Object.entries(markersRef.current).forEach(([id, marker]) => {
        marker.setStyle(styleFor(id, metaRef.current[id], ctx))
      })
    })
  }, [])

  // Render markers once map is ready and properties are available
  useEffect(() => {
    const map = mapRef.current
    if (!mapReady || !map || !properties) return

    import('leaflet').then((L) => {
      if (mapRef.current !== map) return
      // Diff against the markers already on the map instead of recreating all
      // of them: with ~2,800 properties a full teardown per filter change
      // blocks the main thread long enough to freeze the tab.
      const seen = new Set()
      const ctx = { savedIds, highlightId: highlightRef.current, dark: darkRef.current }

      properties.forEach((p) => {
        if (!p.lat || !p.long) return
        const id = String(p.id)
        seen.add(id)

        // A building counts as saved whether it was hearted itself or holds a
        // saved apartment; either way the whole building is marked, so a saved
        // unit is findable on the map.
        const saved = !!savedIds && savedIds.has(Number(p.id))
        const savedUnits = savedUnitCountFor ? savedUnitCountFor(p.id) : 0
        const meta = { program: p.program, hasListings: p.listing_count > 0 }
        metaRef.current[id] = meta
        const style = styleFor(id, meta, ctx)
        const popup = popupHtml(p, { saved, savedUnits })

        const existing = markersRef.current[id]
        if (existing) {
          // Leaflet 1.9's CircleMarker.setStyle applies `radius` too.
          existing.setStyle(style)
          existing.setPopupContent(popup)
          return
        }

        const marker = L.circleMarker([p.lat, p.long], style)
        marker.bindPopup(popup, POPUP_OPTIONS)
        marker.on('click', () => onSelectRef.current && onSelectRef.current(p.id))
        marker.addTo(map)
        markersRef.current[id] = marker
      })

      Object.keys(markersRef.current).forEach((id) => {
        if (!seen.has(id)) {
          markersRef.current[id].remove()
          delete markersRef.current[id]
          delete metaRef.current[id]
        }
      })
    })
  }, [mapReady, properties, savedIds, savedUnitCountFor])

  // Recentre when `fitTo` changes (a City or County filter, or a search):
  // the map opens on Seattle, so another place would otherwise leave the
  // viewport somewhere empty. Frames `fitPlace` when given. While the map is
  // hidden the fit is parked in pendingFitRef and applied when it is shown.
  useEffect(() => {
    const map = mapRef.current
    if (!mapReady || !map) return
    if (!fitTo) {
      // Nothing to frame now: an older fit still waiting must not land.
      pendingFitRef.current = null
      if (queuedViewRef.current?.kind === 'fit') queuedViewRef.current = null
      return
    }
    const all = (propsRef.current || []).filter((p) => p.lat && p.long)
    const focus = fitPlaceRef.current
    const inFocus = focus ? all.filter((p) => p[focus.kind] === focus.name) : []
    const pts = (inFocus.length ? inFocus : all).map((p) => [p.lat, p.long])
    if (!pts.length) return
    import('leaflet').then((L) => {
      if (mapRef.current !== map) return
      const bounds = L.latLngBounds(pts).pad(0.15)
      if (!hasSize(map)) {
        pendingFitRef.current = bounds
        queuedViewRef.current = null
        return
      }
      pendingFitRef.current = null
      applyView(map, { kind: 'fit', bounds }, !prefersReducedMotion())
    })
  }, [mapReady, fitTo])

  // Highlight selected marker
  useEffect(() => {
    const map = mapRef.current
    if (!mapReady || !map) return

    // Chained on the same import as the marker effect, so it runs after the
    // markers for this render exist.
    import('leaflet').then(() => {
      if (mapRef.current !== map) return
      const ctx = { savedIds: savedIdsRef.current, highlightId, dark: darkRef.current }
      const next = highlightId != null ? String(highlightId) : null
      const prev = selectedRef.current

      // Only the marker losing the selection and the one gaining it change;
      // their saved ring comes back with the rest of their style, and the
      // popup of the place let go of closes, so the map never shows a place
      // the page has moved on from.
      if (prev && prev !== next && markersRef.current[prev]) {
        const prevMarker = markersRef.current[prev]
        prevMarker.setStyle(styleFor(prev, metaRef.current[prev], ctx))
        prevMarker.closePopup()
      }
      selectedRef.current = next

      const marker = next ? markersRef.current[next] : null
      if (!marker) {
        // Nothing selected (the panel closed), or a place with no map
        // location: no popup may stay open for another place, and a
        // centring still waiting on a zoom must not land.
        map.closePopup()
        if (queuedViewRef.current?.kind === 'centre') queuedViewRef.current = null
        return
      }
      // A selection is the newer intent: a fit still waiting for the hidden
      // map to appear must not pull the view away from it.
      pendingFitRef.current = null
      marker.setStyle(styleFor(next, metaRef.current[next], ctx))
      marker.bringToFront()
      // Popup first, then setView: a popup's auto-pan stops any running pan
      // animation, so opening it after setView left a same-zoom selection
      // uncentred. setView stops the auto-pan instead, and the marker ends
      // up centred with its popup open. Sized for the visible strip first.
      sizePopup(map, marker, false)
      marker.openPopup()
      const p = properties?.find((x) => x.id === Number(highlightId))
      if (p?.lat && p?.long) {
        // In the part still visible when the details panel covers the map's
        // right edge (centreOn); after any running zoom (applyView).
        applyView(map, { kind: 'centre', latlng: [p.lat, p.long], minZoom: 15 }, !prefersReducedMotion())
      }
    })
  }, [mapReady, highlightId, properties, savedIds])

  return (
    // rounded-[inherit] carries the List-view card's radius down to the
    // Leaflet container, so its keyboard focus ring follows the rounded frame.
    <div ref={rootRef} className="map-root relative h-full w-full rounded-[inherit]">
      {/* Leaflet makes this focusable: arrow keys pan, plus and minus zoom,
          Escape closes an open popup, and Tab moves on (no focus trap). */}
      <div
        ref={containerRef}
        className="h-full w-full rounded-[inherit]"
        role="region"
        aria-label="Map of matching places"
        aria-describedby={helpId}
      />
      <p id={helpId} className="sr-only">
        {`Arrow keys pan the map and the plus and minus keys zoom. ${hint}`}
      </p>

      {/* Legend. Leaflet's panes are isolated inside the map container, so
          z-10 keeps it on top. On phones it sits above the floating List/Map
          switch (not shown on short screens). The chip folds it away at
          every size; the open card scrolls rather than running past the top
          of a short map; and a map too small in rem drops it altogether
          (.map-legend in globals.css). */}
      <div className="map-legend pointer-events-none absolute bottom-[calc(5rem_+_env(safe-area-inset-bottom,0px))] left-3 top-3 z-10 flex flex-col-reverse items-start gap-2 sm:bottom-8 short:bottom-8">
        <button
          type="button"
          onClick={() => setLegendChoice(!legendOpen)}
          aria-expanded={legendOpen}
          aria-controls={legendId}
          className="chip focus-ring-halo pointer-events-auto shrink-0 shadow-card aria-expanded:border-accent-strong aria-expanded:text-ink"
        >
          {/* The colour preview gives way on a map narrow in rem (.map-root). */}
          <span className="legend-chip-dots items-center gap-1" aria-hidden="true">
            {PROGRAM_OPTIONS.map((p) => (
              <span key={p.value} className="chip-dot" style={{ background: p.color }} />
            ))}
          </span>
          Legend
          <Icon
            name="chevronDown"
            size={14}
            className={`transition-transform ${legendOpen ? '' : 'rotate-180'}`}
          />
        </button>

        <div
          id={legendId}
          role="group"
          aria-labelledby={legendTitleId}
          // The card recipe (12px radius, opaque panel), with tighter padding.
          className={`${legendOpen ? 'block' : 'hidden'} card scrollbar-thin pointer-events-auto min-h-0 overflow-y-auto px-3 py-2.5 shadow-card`}
        >
          <p id={legendTitleId} className="section-label">
            Legend
          </p>
          {/* Swatches mirror the markers: program fill with the same navy
              (light) or canvas (dark) outline, via .chip-dot's ring. */}
          <ul className="mt-2 space-y-1.5 text-xs text-muted">
            {PROGRAM_OPTIONS.map((p) => (
              <li key={p.value} className="flex items-center gap-2">
                <Swatch>
                  <span className="chip-dot h-3 w-3" style={{ background: p.color }} />
                </Swatch>
                {p.label}
              </li>
            ))}
          </ul>
          {/* Size and ring, not colour: hollow rings, so neither can be
              read as a fourth program. Sized like the markers they explain
              (a live-pricing dot is 18px across; a saved one has a 3px ring). */}
          <ul className="mt-2 space-y-1.5 border-t border-edge pt-2 text-xs text-muted">
            <li className="flex items-center gap-2">
              <Swatch>
                <span className="block size-[1.125rem] rounded-full border-[1.5px] border-ink/60" />
              </Swatch>
              Has live pricing (larger dot)
            </li>
            <li className="flex items-center gap-2">
              <Swatch>
                <span className="block size-3.5 rounded-full border-[3px] border-saved" />
              </Swatch>
              Saved
            </li>
          </ul>
        </div>
      </div>
    </div>
  )
}
