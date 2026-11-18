/**
 * Shared design constants for the parts of the UI that JavaScript styles
 * directly: Leaflet markers (SVG paths styled through options, not classes),
 * inline program-colour dots, the OG image, and the shared icon set.
 *
 * Anything CSS can reach is a token in app/globals.css with a class in
 * tailwind.config.js (bg-panel, text-muted, text-saved ...). Prefer those.
 * The hex values here mirror those tokens; keep the two in sync.
 */

/* ------------------------------------------------------------- programs */

/** properties.program values, in display order. */
export const PROGRAMS = ['Mixed Market and Affordable', 'Fully Affordable', 'Market Rate']

/**
 * Program colours: identical in both appearances and everywhere a program is
 * shown (markers, legend, chip dots, card dots). Okabe-Ito-inspired, so the
 * three stay distinct with common colour-vision deficiencies. They are
 * decorative: always pair a colour with the program's text label.
 */
export const PROGRAM_COLORS = {
  'Mixed Market and Affordable': '#f4c430', // gold
  'Fully Affordable': '#20b486', // bluish green
  'Market Rate': '#56b4e9', // sky blue
}

/** Short labels (cards, popups, the panel's program pill). */
export const PROGRAM_LABELS = {
  'Mixed Market and Affordable': 'Mixed',
  'Fully Affordable': 'Affordable',
  'Market Rate': 'Market Rate',
}

/** Medium labels (filter chips, map legend), where there is room. */
export const PROGRAM_NAMES = {
  'Mixed Market and Affordable': 'Mixed Market',
  'Fully Affordable': 'Fully Affordable',
  'Market Rate': 'Market Rate',
}

/** Unknown or missing programs fall back to this one (as before). */
export const DEFAULT_PROGRAM = 'Fully Affordable'

export const programColor = (program) =>
  PROGRAM_COLORS[program] ?? PROGRAM_COLORS[DEFAULT_PROGRAM]
export const programLabel = (program) =>
  PROGRAM_LABELS[program] ?? PROGRAM_LABELS[DEFAULT_PROGRAM]
export const programName = (program) => PROGRAM_NAMES[program] ?? PROGRAM_NAMES[DEFAULT_PROGRAM]

/** One list for the program chips and the legend. */
export const PROGRAM_OPTIONS = PROGRAMS.map((value) => ({
  value,
  label: PROGRAM_NAMES[value],
  short: PROGRAM_LABELS[value],
  color: PROGRAM_COLORS[value],
}))

/* --------------------------------------------------------------- colours */

/** Every token's hex value per appearance, for places that cannot read CSS
 *  variables (Leaflet path options, the OG image, canvas). */
export const TOKENS = {
  light: {
    canvas: '#f3f6f9',
    panel: '#ffffff',
    panelRaised: '#e8eff5',
    edge: '#cfdbe5',
    controlEdge: '#6f8798',
    ink: '#0b2233',
    muted: '#4b6577',
    accent: '#f4c430',
    accentHover: '#d9a916',
    accentInk: '#0b2233',
    accentText: '#7a5800',
    accentSoft: '#6e5100',
    accentStrong: '#9a7200',
    focus: '#9a7200',
    green: '#157a42',
    saved: '#c7323b',
  },
  dark: {
    canvas: '#081c2b',
    panel: '#0d2536',
    panelRaised: '#123048',
    edge: '#1d4059',
    controlEdge: '#5a7f99',
    ink: '#eef7fd',
    muted: '#8fb2c6',
    accent: '#f4c430',
    accentHover: '#d9a916',
    accentInk: '#081c2b',
    accentText: '#f4c430',
    accentSoft: '#ecd383',
    accentStrong: '#f4c430',
    focus: '#f4c430',
    green: '#3ecf72',
    saved: '#ff6b6b',
  },
}

/** Navy marker / dot outline. Gives every marker 3:1+ against light tiles. */
export const MARKER_OUTLINE = '#0b2233'

/** Saved / heart colour (text-saved in CSS). Ring on saved markers. */
export const SAVED_COLORS = { light: '#c7323b', dark: '#ff6b6b' }

/** Live-pricing green (text-green / bg-green in CSS). */
export const LIVE_COLORS = { light: '#157a42', dark: '#3ecf72' }

/**
 * Ring on the selected marker. Light: the accent-strong gold, so the
 * selection stands out among the navy-outlined markers once its popup closes
 * (3.8:1+ against light tiles). Dark: the ink colour, as before.
 */
export const SELECTED_RING = { light: TOKENS.light.accentStrong, dark: TOKENS.dark.ink }

/* --------------------------------------------------------------- markers */

export const MARKER_RADIUS = { base: 6, live: 9, saved: 9, savedLive: 11, selected: 13 }
export const MARKER_WEIGHT = { base: 1.5, saved: 3, selected: 3.5 }

/**
 * Leaflet circleMarker options for one property, in one place so the map,
 * the legend and the selection highlight agree.
 *
 *   const s = markerStyle({ program, hasListings, saved, selected, dark })
 *   L.circleMarker(latlng, s)   // on create
 *   marker.setStyle(s)          // on update
 *
 * Leaflet 1.9's CircleMarker.setStyle applies `radius` too (it calls
 * setRadius itself), so a separate setRadius would only redraw twice.
 * `dark` comes from isDarkTheme(); re-style on onThemeChange().
 */
export function markerStyle({
  program,
  hasListings = false,
  saved = false,
  selected = false,
  dark = false,
}) {
  const mode = dark ? 'dark' : 'light'
  let radius = saved
    ? hasListings
      ? MARKER_RADIUS.savedLive
      : MARKER_RADIUS.saved
    : hasListings
    ? MARKER_RADIUS.live
    : MARKER_RADIUS.base
  let color = MARKER_OUTLINE
  let weight = MARKER_WEIGHT.base
  if (saved) {
    color = SAVED_COLORS[mode]
    weight = MARKER_WEIGHT.saved
  }
  if (selected) {
    color = SELECTED_RING[mode]
    weight = MARKER_WEIGHT.selected
    radius = MARKER_RADIUS.selected
  }
  return {
    radius,
    color,
    weight,
    opacity: 1,
    fillColor: programColor(program),
    fillOpacity: hasListings || selected ? 0.95 : 0.7,
  }
}

/** The one tile layer both maps use (Map.js and the panel's mini map). */
export const TILE_LAYER = {
  url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  options: {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19,
  },
}

/**
 * Escape scraped text before it goes into Leaflet HTML (bindPopup and
 * setPopupContent treat strings as HTML).
 */
export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/* ------------------------------------------------------- status classes */

/** Availability pills (panel unit rows, cards). Every pairing is 4.5:1+. */
export const AVAILABILITY_PILL = {
  now: 'pill border-green/40 text-green',
  future: 'pill text-ink',
  waitlist: 'pill border-accent/50 text-accent',
  unknown: 'pill text-muted',
}

/* -------------------------------------------------------- theme helpers */

/** localStorage key for an explicit appearance choice ('light' | 'dark'). */
export const THEME_STORAGE_KEY = 'theme'

export function isDarkTheme() {
  return typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
}

/**
 * Point the browser's theme-color (its toolbar tint on phones) at the canvas
 * of the appearance shown. The no-flash script in app/layout.js adds this one
 * meta before paint and updates it on an OS change; this keeps it in step
 * with the toggle (and adds it if a navigation lost it).
 */
export function syncThemeColor(dark = isDarkTheme()) {
  if (typeof document === 'undefined') return
  let meta = document.querySelector('meta[name="theme-color"]')
  if (!meta) {
    meta = document.createElement('meta')
    meta.setAttribute('name', 'theme-color')
    document.head.appendChild(meta)
  }
  const color = dark ? TOKENS.dark.canvas : TOKENS.light.canvas
  if (meta.getAttribute('content') !== color) meta.setAttribute('content', color)
}

/** Record an explicit choice and apply it (the theme toggle). */
export function setTheme(dark) {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  // Every surface switches in the same frame: the recipes' 180ms colour
  // transitions are off (.theme-switching in globals.css) while the new
  // colours are computed, then back on for hover and press feedback.
  root.classList.add('theme-switching')
  root.classList.toggle('dark', dark)
  syncThemeColor(dark)
  void root.offsetWidth // apply the new colours now, with transitions off
  requestAnimationFrame(() => root.classList.remove('theme-switching'))
  try {
    localStorage.setItem(THEME_STORAGE_KEY, dark ? 'dark' : 'light')
  } catch {
    // Private mode or blocked storage: the class still applies this session.
  }
}

/**
 * Call `callback(isDark)` whenever the appearance changes (the toggle, or the
 * OS when no explicit choice is stored). Returns an unsubscribe function.
 */
export function onThemeChange(callback) {
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') {
    return () => {}
  }
  const root = document.documentElement
  let dark = root.classList.contains('dark')
  const observer = new MutationObserver(() => {
    const next = root.classList.contains('dark')
    if (next !== dark) {
      dark = next
      callback(next)
    }
  })
  observer.observe(root, { attributes: true, attributeFilter: ['class'] })
  return () => observer.disconnect()
}

/** For JS-driven motion (Leaflet setView / flyTo `animate`). */
export function prefersReducedMotion() {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

/* ----------------------------------------------------------------- icons */

/**
 * One 24x24 stroke-icon vocabulary for the whole app. Render with <Icon>, or
 * use a path directly: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
 * strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={ICONS.check} /></svg>
 */
export const ICONS = {
  search: 'M18 11a7 7 0 1 1-14 0 7 7 0 0 1 14 0zM16.5 16.5L21 21',
  close: 'M6 6l12 12M18 6L6 18',
  check: 'M4.5 12.5l5 5 10-11',
  sliders:
    'M4 7h10M18 7h2M4 17h2M10 17h10M18.2 7a2.2 2.2 0 1 1-4.4 0 2.2 2.2 0 0 1 4.4 0zM10.2 17a2.2 2.2 0 1 1-4.4 0 2.2 2.2 0 0 1 4.4 0z',
  heart:
    'M12 20.5s-7.5-4.6-9.3-9.2C1.4 8 3.3 4.5 6.9 4.5c2.1 0 3.6 1.1 5.1 3 1.5-1.9 3-3 5.1-3 3.6 0 5.5 3.5 4.2 6.8-1.8 4.6-9.3 9.2-9.3 9.2z',
  share:
    'M21 5a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM9 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM21 19a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM8.6 10.5l6.8-4M8.6 13.5l6.8 4',
  link: 'M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1',
  copy: 'M9 9h10v11H9zM5 15V5a1 1 0 0 1 1-1h9',
  map: 'M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14',
  list: 'M4 6h16M4 12h16M4 18h16',
  layers: 'M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5',
  sun: 'M16.5 12a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0zM12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.6 4.6l1.8 1.8M17.6 17.6l1.8 1.8M19.4 4.6l-1.8 1.8M6.4 17.6l-1.8 1.8',
  moon: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z',
  chevronLeft: 'M14.5 5.5L8 12l6.5 6.5',
  chevronRight: 'M9.5 5.5L16 12l-6.5 6.5',
  chevronDown: 'M6 9l6 6 6-6',
  arrowLeft: 'M19 12H5M11 18l-6-6 6-6',
  external: 'M14 4h6v6M20 4l-9 9M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5',
  phone:
    'M5 4h3.5l1.8 4.5-2.3 1.4a11 11 0 0 0 6.1 6.1l1.4-2.3L20 15.5V19a1.5 1.5 0 0 1-1.6 1.5A16.5 16.5 0 0 1 3.5 5.6 1.5 1.5 0 0 1 5 4z',
  home: 'M3 11l9-7 9 7M5 9.5V20h14V9.5',
  info: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0zM12 11v5M12 7.5v.01',
}

/** px at the default text size -> rem, so icons grow with the user's text size. */
export const iconRem = (size) => `${size / 16}rem`

/**
 * Decorative icon (aria-hidden): the control around it carries the name.
 *   <Icon name="search" />  <Icon name="heart" filled size={20} />
 * `size` is in px at the default 16px text size; it renders in rem (the
 * width/height attributes are only a no-CSS fallback).
 */
export function Icon({ name, size = 16, strokeWidth = 2, filled = false, className = '' }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      style={{ width: iconRem(size), height: iconRem(size) }}
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <path d={ICONS[name]} />
    </svg>
  )
}
