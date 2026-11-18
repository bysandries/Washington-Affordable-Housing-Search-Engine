'use client'

import { useEffect, useId, useRef, useState } from 'react'
import ThemeToggle from '@/components/ThemeToggle'
import Wordmark from '@/components/Wordmark'
import { Icon } from '@/lib/theme'

/* The two views. The ids are shared with page.js and the view_changed event. */
const VIEWS = [
  { id: 'listings', label: 'List', icon: 'list' },
  { id: 'map', label: 'Map', icon: 'map' },
]

const SEARCH_PLACEHOLDER = 'Search city, neighborhood, or address'

/* ----------------------------------------------------------------- search */

function SearchField({ value, onSearch, className = '' }) {
  // A local draft keeps typing instant. Each applied query refetches the
  // list and re-filters every map marker, so applying it is debounced.
  const [draft, setDraft] = useState(value)
  const timer = useRef(null)
  const inputRef = useRef(null)
  const id = useId()

  useEffect(() => {
    setDraft(value)
  }, [value])
  useEffect(() => () => clearTimeout(timer.current), [])

  const setSearch = (v) => {
    setDraft(v)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => onSearch(v), 250)
  }

  // Enter, or the Search key on a touch keyboard, applies the draft at once.
  const flush = () => {
    clearTimeout(timer.current)
    onSearch(draft)
  }

  const clear = () => {
    setDraft('')
    clearTimeout(timer.current)
    onSearch('')
    // The clear button disappears with the text, so keep focus in the field
    // instead of dropping it to the page.
    inputRef.current?.focus()
  }

  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault()
        flush()
        // On touch layouts, put the keyboard away so the results show.
        if (window.matchMedia?.('(pointer: coarse)')?.matches) inputRef.current?.blur()
      }}
      // Height and placement come from the .site-header-search recipe.
      className={`field neo-inset flex min-w-0 items-center gap-2 pl-3 pr-1 ${className}`}
    >
      {/* The magnifier is the field's label, so clicking it focuses the input. */}
      <label htmlFor={id} className="flex shrink-0 cursor-text items-center text-muted">
        <Icon name="search" size={18} />
        <span className="sr-only">{SEARCH_PLACEHOLDER}</span>
      </label>
      <input
        ref={inputRef}
        id={id}
        type="search"
        value={draft}
        onChange={(e) => setSearch(e.target.value)}
        onKeyDown={(e) => {
          // Esc empties a filled field, as platform search fields do, and
          // stops there so the same press does not also close the details
          // panel. With the field already empty, Esc passes through.
          if (e.key === 'Escape' && draft) {
            e.preventDefault()
            e.stopPropagation()
            clear()
          }
        }}
        placeholder={SEARCH_PLACEHOLDER}
        enterKeyHint="search"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        className="field-input"
      />
      {draft && (
        <button
          type="button"
          onClick={clear}
          aria-label="Clear search"
          className="btn-icon btn-icon-sm focus-ring-inset"
        >
          <Icon name="close" />
        </button>
      )}
    </form>
  )
}

/* ------------------------------------------------------------ view switch */

function ViewSwitch({ view, onViewChange }) {
  const refs = useRef([])
  // Exactly one radio must stay in the tab order, whatever view is passed.
  const current = VIEWS.some((v) => v.id === view) ? view : VIEWS[0].id

  // Radio-group keyboard model: one tab stop; arrows (and Home / End) move
  // to the next option and select it.
  const onKeyDown = (e, i) => {
    const last = VIEWS.length - 1
    let next = -1
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = i === last ? 0 : i + 1
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = i === 0 ? last : i - 1
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = last
    if (next < 0) return
    e.preventDefault()
    onViewChange(VIEWS[next].id)
    refs.current[next]?.focus()
  }

  // Hidden on phones, where the floating pill in page.js switches views,
  // except on short screens: there the pill would cover the strip or the
  // results, so the switch stays in the header row instead.
  return (
    <div role="radiogroup" aria-label="View" className="segmented hidden sm:inline-flex short:inline-flex">
      {VIEWS.map((v, i) => {
        const checked = v.id === current
        return (
          <button
            key={v.id}
            ref={(el) => {
              refs.current[i] = el
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            onClick={() => onViewChange(v.id)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className="segmented-item"
          >
            {/* Shown only when the header has room (see .site-header). */}
            <Icon name={v.icon} className="view-switch-icon" />
            {v.label}
          </button>
        )
      })}
    </div>
  )
}

/* ----------------------------------------------------------------- header */

export default function SearchHeader({
  title, // the page's visually hidden h1
  search,
  onSearch,
  view, // 'listings' | 'map'
  onViewChange,
  onClearAll,
  // Behind a full-screen sheet (page.js) the header is inert.
  inert = false,
}) {
  // The wordmark starts a fresh search (filters cleared, list view) without
  // a reload. Modified clicks still open a new tab or window as usual. Its
  // name starts with the visible "WA HOUSING" so voice control can target it
  // (WCAG 2.5.3, Label in Name) and then gives the full product name.
  const goHome = (e) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    e.preventDefault()
    onClearAll()
    onViewChange('listings')
  }

  // sm and up, with room: one 48px row (wordmark, search, view switch,
  // appearance). Phones, and wherever one row would squeeze the search field
  // (large text sizes): wordmark and controls on the first row, then a
  // full-width search field. The .site-header recipe in globals.css decides
  // with a container query in rem. Below sm the view switch moves to the
  // floating pill in page.js (except on short screens).
  // The h1 sits here, in the banner, because the header is the one region
  // the details panel never covers (what it covers is made inert).
  return (
    <header
      inert={inert ? '' : undefined}
      className="app-bar site-header relative z-header shrink-0"
    >
      {title && <h1 className="sr-only">{title}</h1>}
      <div className="site-header-row">
        <a
          href="/"
          onClick={goHome}
          aria-label="WA Housing — Washington Affordable Housing Search, home"
          className="relative -mx-1 my-1 flex h-10 shrink-0 items-center rounded-md px-1 before:absolute before:-inset-y-0.5 before:inset-x-0"
        >
          <Wordmark />
        </a>
        <SearchField value={search} onSearch={onSearch} className="site-header-search" />
        {/* May wrap onto two lines where the List | Map switch and the
            toggle cannot share one (a short phone screen with large text). */}
        <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-2">
          <ViewSwitch view={view} onViewChange={onViewChange} />
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}
