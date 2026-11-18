'use client'

import { useEffect, useRef } from 'react'
import ShareFavorites from '@/components/ShareFavorites'
import { Icon, PROGRAM_OPTIONS } from '@/lib/theme'

const BEDROOM_OPTIONS = [
  { value: '', label: 'All types' },
  { value: 'Micro', label: 'Micro' },
  { value: 'Studio', label: 'Studio' },
  { value: '1-Bedroom', label: '1 Bed' },
  { value: '2-Bedroom', label: '2 Bed' },
  { value: '3-Bedroom', label: '3 Bed' },
]

// Market-rate incentive programs tracked in affordable_buildings. "None" is the
// rest of the dataset: buildings affordable through LIHTC, project-based
// Section 8 or city funding rather than a zoning/tax incentive.
const INCENTIVE_OPTIONS = [
  { value: '', label: 'Any' },
  { value: 'mfte', label: 'MFTE' },
  { value: 'iz', label: 'Incentive Zoning (IZ)' },
  { value: 'mha', label: 'MHA' },
  { value: 'none', label: 'None of these' },
]

// Shown as visible helper text (and kept as the select's tooltip), so the
// explanation never depends on hovering.
const INCENTIVE_HELP =
  'MFTE, Incentive Zoning and MHA are market-rate buildings with set-aside affordable units. “None of these” covers the rest — LIHTC, project-based Section 8 and city-funded buildings.'

// Max rent per month; 0 means no cap ("Any").
const RENT_PRESETS = [0, 1000, 1500, 2000, 2500, 3000]

// How a choice made in the Filters panel reads as a chip in the strip.
const BEDROOM_CHIP = Object.fromEntries(BEDROOM_OPTIONS.map((o) => [o.value, o.label]))
const INCENTIVE_CHIP = {
  mfte: 'MFTE',
  iz: 'Incentive Zoning',
  mha: 'MHA',
  none: 'No incentive program',
}

/** The panel's active choices, in panel order, as { key, label | rent }. */
function panelChoices(filters) {
  const out = []
  if (filters.city) out.push({ key: 'city', label: filters.city })
  if (filters.neighborhood) out.push({ key: 'neighborhood', label: filters.neighborhood })
  if (filters.county) out.push({ key: 'county', label: `${filters.county} County` })
  if (filters.bedroom) {
    out.push({ key: 'bedroom', label: BEDROOM_CHIP[filters.bedroom] || filters.bedroom })
  }
  if (filters.incentive) {
    out.push({ key: 'incentive', label: INCENTIVE_CHIP[filters.incentive] || filters.incentive })
  }
  if (filters.maxRent > 0) out.push({ key: 'maxRent', rent: filters.maxRent })
  return out
}

/** "≤$2,000", read as "Up to $2,000". */
function RentLabel({ value }) {
  return (
    <>
      <span className="sr-only">Up to </span>
      <span className="font-mono">
        <span aria-hidden="true">≤</span>${value.toLocaleString('en-US')}
      </span>
    </>
  )
}

const PANEL_ID = 'filters-panel'

/**
 * The one toggle chip. aria-pressed drives the gold active style through the
 * .chip recipe, so the state a screen reader hears and the state on screen
 * cannot drift apart; the check glyph confirms it without relying on colour.
 */
function ToggleChip({ pressed, onClick, title, children }) {
  return (
    <button type="button" className="chip" aria-pressed={!!pressed} onClick={onClick} title={title}>
      {pressed && <Icon name="check" size={14} />}
      {children}
    </button>
  )
}

/**
 * A labelled select. Holding a choice (not its "All ..." default) it gets
 * the thin gold indicator (.field[data-active]). Labels may wrap; the
 * select sits at the bottom of its cell, so selects in a row stay aligned.
 * `className` places the cell in the grid (filters-wide: a row of its own
 * in the two-column layout).
 */
function SelectField({ id, label, value, onChange, className = '', children }) {
  return (
    <div className={`flex min-w-0 flex-col ${className}`}>
      <label htmlFor={id} className="section-label mb-1.5 block break-words">
        {label}
      </label>
      <select
        id={id}
        data-active={value ? '' : undefined}
        className="field mt-auto w-full"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {children}
      </select>
    </div>
  )
}

export default function FilterBar({
  filters,
  neighborhoods = [],
  cities = [],
  counties = [],
  favoriteCount = 0,
  favoritesState,
  filtersOpen,
  onFiltersToggle,
  onChange,
  onClearAll,
  hasActiveFilters,
  // Short screens: the Filters panel opens as a full-screen sheet with its
  // own title bar (the `short:` classes below draw it; this drives focus).
  sheet = false,
  // Behind the full-screen details sheet (page.js) the whole region is inert.
  inert = false,
}) {
  const filtersButtonRef = useRef(null)
  const sheetTitleRef = useRef(null)
  const sheetOpen = sheet && filtersOpen
  const set = (key, value) => onChange({ ...filters, [key]: value, page: 1 })
  const choices = panelChoices(filters)

  // A panel choice's chip removes just that filter, in one tap. The chip
  // goes with it, so keyboard focus moves to the Filters chip beside it.
  const removeChoice = (e, key) => {
    const hadFocus = e.currentTarget === document.activeElement
    set(key, key === 'maxRent' ? 0 : '')
    if (hadFocus) filtersButtonRef.current?.focus()
  }

  // Filters that live inside the panel, for the badge on the Filters chip.
  // Everything else in the strip shows its own state.
  const panelCount = [
    filters.county,
    filters.city,
    filters.neighborhood,
    filters.bedroom,
    filters.incentive,
    filters.maxRent > 0,
  ].filter(Boolean).length

  const clearAll = () => {
    onClearAll()
    // The button disappears along with the filters; keep keyboard focus in the
    // strip (or on the sheet's title) instead of letting it fall back to the
    // page.
    ;(sheetOpen ? sheetTitleRef : filtersButtonRef).current?.focus()
  }

  // The full-screen sheet covers the strip and everything else (made inert
  // while it is open): opening it moves focus to its title, and closing it
  // (Done or Escape) brings focus back to the Filters chip, once the strip
  // is no longer inert.
  const wasSheetOpen = useRef(false)
  useEffect(() => {
    if (sheetOpen) {
      sheetTitleRef.current?.focus()
    } else if (wasSheetOpen.current && !filtersOpen) {
      const panel = document.getElementById(PANEL_ID)
      const active = document.activeElement
      if (!active || active === document.body || panel?.contains(active)) {
        filtersButtonRef.current?.focus()
      }
    }
    wasSheetOpen.current = sheetOpen
  }, [sheetOpen, filtersOpen])

  // A chip reached with Tab is scrolled fully into view. Browsers scroll a
  // focused element only until it touches the edge, under the fade and with
  // its ring clipped; scrollIntoView honours the strip's scroll padding.
  const revealFocused = (e) => {
    const el = e.target
    if (el instanceof HTMLElement && el.matches(':focus-visible')) {
      el.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    }
  }

  // Escape folds the panel away while focus is in the strip or the panel, and
  // stops there, so the same key press never also closes the details panel.
  const onKeyDown = (e) => {
    if (e.key !== 'Escape' || !filtersOpen) return
    e.stopPropagation()
    onFiltersToggle()
    filtersButtonRef.current?.focus()
  }

  // A labelled region, so the strip and panel sit inside a landmark wherever
  // the page places them (between the header and the results). While the
  // panel is open the region may shrink (min-h-0): the panel then takes only
  // the height left under the header and scrolls, instead of running past
  // the bottom of the screen on a short or text-enlarged phone.
  return (
    <section
      aria-label="Filters"
      inert={inert ? '' : undefined}
      className={`flex flex-col border-b border-edge ${filtersOpen ? 'min-h-0' : 'shrink-0'}`}
      onKeyDown={onKeyDown}
    >
      <div inert={sheetOpen ? '' : undefined} className="flex shrink-0 items-center">
        {/* Chip strip. It scrolls sideways on narrow screens; the fade, as
            wide as the end padding, only ever covers chips scrolled under the
            edge, hinting that more follow. py-2.5 leaves room for the 44px
            touch targets and the focus ring; scroll padding keeps a chip
            reached with Tab clear of the fade. */}
        <div
          onFocus={revealFocused}
          // pr-5: 4px more than the fade, so even the last chip's focus
          // ring ends before the fade starts.
          className="no-scrollbar flex min-w-0 items-center gap-2 overflow-x-auto overscroll-x-contain py-2.5 pl-4 pr-5 scroll-pl-4 scroll-pr-8 [mask-image:linear-gradient(to_right,black_calc(100%_-_1rem),transparent)]"
        >
          <button
            ref={filtersButtonRef}
            type="button"
            className="chip aria-expanded:border-accent-strong aria-expanded:text-ink"
            aria-expanded={!!filtersOpen}
            aria-controls={PANEL_ID}
            onClick={onFiltersToggle}
          >
            <Icon name="sliders" />
            Filters
            {panelCount > 0 && (
              <span className="chip-count">
                <span className="sr-only">, </span>
                {panelCount}
                <span className="sr-only"> active</span>
              </span>
            )}
          </button>

          {/* What the panel has set, visible with the panel closed, each one
              tap to undo. The one active chip style (gold fill + check). */}
          {choices.map((c) => (
            <ToggleChip
              key={c.key}
              pressed
              onClick={(e) => removeChoice(e, c.key)}
              title="Remove this filter"
            >
              {c.rent ? <RentLabel value={c.rent} /> : c.label}
            </ToggleChip>
          ))}

          <ToggleChip
            pressed={filters.favoritesOnly}
            onClick={() => set('favoritesOnly', !filters.favoritesOnly)}
            title="Show only properties you have saved"
          >
            <Icon name="heart" size={14} filled={!!filters.favoritesOnly} />
            Saved
            {favoriteCount > 0 && (
              <span className="font-mono">
                <span className="sr-only">, </span>
                {favoriteCount}
              </span>
            )}
          </ToggleChip>

          <ShareFavorites state={favoritesState} disabled={favoriteCount === 0} />

          <ToggleChip pressed={filters.hasListings} onClick={() => set('hasListings', !filters.hasListings)}>
            Live pricing
          </ToggleChip>

          <ToggleChip
            pressed={filters.availableNow}
            onClick={() => set('availableNow', !filters.availableNow)}
            title="Units listed as available now, or whose availability date has arrived"
          >
            Available now
          </ToggleChip>

          <span className="h-5 w-px shrink-0 bg-edge" aria-hidden="true" />

          {/* Dots use the program colours of the map markers and legend. */}
          {PROGRAM_OPTIONS.map((p) => {
            const on = filters.program === p.value
            return (
              <ToggleChip key={p.value} pressed={on} onClick={() => set('program', on ? '' : p.value)}>
                <span className="chip-dot" style={{ background: p.color }} aria-hidden="true" />
                {p.label}
              </ToggleChip>
            )
          })}
        </div>

        {/* Pinned outside the scrolling area, so it is visible whenever a
            filter is active, even on a phone where the chips overflow. */}
        {hasActiveFilters && (
          <div className="flex shrink-0 items-center gap-1 py-2.5 pr-4">
            <span className="h-5 w-px shrink-0 bg-edge" aria-hidden="true" />
            <button type="button" className="btn btn-ghost btn-sm" onClick={clearAll}>
              Clear filters
            </button>
          </div>
        )}
      </div>

      {/* Filters panel. Always rendered, so aria-controls always points at a
          real element; `hidden` removes it from layout and the accessibility
          tree. No display utility on this element, or it would beat
          [hidden]. It scrolls, and shrinks below 60dvh when that is more
          than the room left (min-h-0 in the region's flex column). The grid
          adapts to its width in rem (.filters-panel / .filters-grid). On
          short screens it is a full-screen sheet with a title bar, Clear
          filters and Done (see sheetOpen). */}
      <div
        id={PANEL_ID}
        role="group"
        aria-label="More filters"
        hidden={!filtersOpen}
        className="filters-panel scrollbar-thin max-h-[60dvh] min-h-0 overflow-y-auto overscroll-contain border-t border-edge bg-panel short:fixed short:inset-0 short:z-panel short:max-h-none short:border-t-0"
      >
        <div className="sticky top-0 z-10 hidden items-center gap-2 border-b border-edge bg-panel px-4 py-2 short:flex">
          {/* Takes focus when the sheet opens. Not a control, so like the
              details panel's name it gets a gold underline, not a ring. */}
          <h2
            ref={sheetTitleRef}
            tabIndex={-1}
            className="mr-auto text-base font-semibold tracking-tight text-ink focus-visible:underline focus-visible:decoration-accent focus-visible:decoration-2 focus-visible:underline-offset-4 focus-visible:outline-none"
          >
            Filters
          </h2>
          {hasActiveFilters && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={clearAll}>
              Clear filters
            </button>
          )}
          <button type="button" className="btn btn-primary btn-sm" onClick={onFiltersToggle}>
            Done
          </button>
        </div>

        <div className="px-4 pb-4 pt-3">
          <div className="filters-grid">
            {/* City and Seattle neighborhood first: they hold the long values,
                so they take a row each in the two-column layout (filters-wide)
                and County and Bedrooms share the next. */}
            <SelectField
              id="f-city"
              label="City"
              value={filters.city}
              onChange={(v) => set('city', v)}
              className="filters-wide"
            >
              <option value="">All Washington</option>
              {cities.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </SelectField>

            <SelectField
              id="f-neighborhood"
              label="Seattle neighborhood"
              value={filters.neighborhood}
              onChange={(v) => set('neighborhood', v)}
              className="filters-wide"
            >
              <option value="">All neighborhoods</option>
              {neighborhoods.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </SelectField>

            <SelectField id="f-county" label="County" value={filters.county} onChange={(v) => set('county', v)}>
              <option value="">All counties</option>
              {counties.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </SelectField>

            <SelectField id="f-bedroom" label="Bedrooms" value={filters.bedroom} onChange={(v) => set('bedroom', v)}>
              {BEDROOM_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </SelectField>

            <div className="col-span-full">
              <label htmlFor="f-incentive" className="section-label mb-1.5 block">
                Incentive program
              </label>
              <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-4">
                <select
                  id="f-incentive"
                  data-active={filters.incentive ? '' : undefined}
                  className="field w-full sm:w-56 sm:shrink-0"
                  value={filters.incentive}
                  onChange={(e) => set('incentive', e.target.value)}
                  title={INCENTIVE_HELP}
                  aria-describedby="f-incentive-help"
                >
                  {INCENTIVE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <p id="f-incentive-help" className="max-w-2xl text-xs leading-relaxed text-muted">
                  {INCENTIVE_HELP}
                </p>
              </div>
            </div>

            <div className="col-span-full">
              <p id="f-rent-label" className="section-label mb-1.5">
                Max rent / month
              </p>
              {/* 12px between wrapped rows: each 32px chip's 44px touch area
                  reaches 6px past it, so closer rows would overlap. */}
              <div role="group" aria-labelledby="f-rent-label" className="flex flex-wrap gap-x-2 gap-y-3">
                {RENT_PRESETS.map((value) => {
                  const on = (filters.maxRent || 0) === value
                  return (
                    <ToggleChip
                      key={value}
                      pressed={on}
                      // Pressing the active cap again removes it: every filter
                      // is one tap to undo.
                      onClick={() => set('maxRent', on && value ? 0 : value)}
                    >
                      {value ? <RentLabel value={value} /> : 'Any'}
                    </ToggleChip>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
