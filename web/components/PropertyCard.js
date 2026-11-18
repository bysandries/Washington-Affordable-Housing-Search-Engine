'use client'

import { Fragment, useId } from 'react'
import { HeartButton } from '@/lib/favorites'
import { Icon, programColor, programLabel } from '@/lib/theme'

// Incentive programs a building can carry; absent on properties outside them.
// (The panel spells them out; here the card's overlay would hide a tooltip.)
const INCENTIVES = [
  { key: 'has_mfte', label: 'MFTE' },
  { key: 'has_iz', label: 'IZ' },
  { key: 'has_mha', label: 'MHA' },
]

// Named unit types, smallest first. The datasets spell bedroom counts as
// "Studio, 1-Bedroom" (Seattle Office of Housing), "1br, studio" (statewide
// listings) or "3+ Bedroom", so they are matched by pattern rather than split
// on spaces, which used to break "Sleeping Room" into two types.
const NAMED_TYPES = [
  [/sleeping\s*room/, 'Sleeping room'],
  [/\bsro\b/, 'SRO'],
  [/\bmicro\b/, 'Micro'],
  [/\bstudio\b/, 'Studio'],
]

/** "Studio, 1-Bedroom, 2-Bedroom" -> "Studio, 1–2 Bed". Unknown text drops out. */
function formatBedrooms(brTypes) {
  if (!brTypes) return ''
  const text = String(brTypes).toLowerCase()
  const parts = NAMED_TYPES.filter(([pattern]) => pattern.test(text)).map(([, label]) => label)

  const counts = new Set()
  const plus = new Set()
  for (const m of text.matchAll(/(\d)\s*(\+)?\s*-?\s*(?:bedroom|bed|br)/g)) {
    counts.add(Number(m[1]))
    if (m[2]) plus.add(Number(m[1]))
  }
  if (counts.size) {
    const sorted = [...counts].sort((a, b) => a - b)
    // Consecutive counts collapse into a range; gaps stay visible ("1–2, 4").
    const runs = []
    for (const n of sorted) {
      const run = runs[runs.length - 1]
      if (run && n === run[1] + 1) run[1] = n
      else runs.push([n, n])
    }
    const max = sorted[sorted.length - 1]
    const label = runs.map(([a, b]) => (a === b ? `${a}` : `${a}–${b}`)).join(', ')
    parts.push(`${label}${plus.has(max) ? '+' : ''} Bed`)
  }
  return parts.join(', ')
}

/** "65-85%" -> "65–85%". */
export function formatAmi(amis) {
  return String(amis ?? '')
    .trim()
    .replace(/\s*-\s*/g, '–')
}

/**
 * Affordability program end dates, from "2046-12-31", "2029" or
 * "2029 (MFTE) 2068 (IZ)". "N/A" and blanks return []. Text that holds no
 * year comes back as-is, so nothing is silently hidden.
 */
export function parseExpiry(raw) {
  const text = String(raw ?? '').trim()
  if (!text || /^n\/?a$/i.test(text)) return []
  const entries = []
  for (const m of text.matchAll(/(\d{4})(?:-(\d{2})-(\d{2}))?\s*(?:\(\s*([^)]+?)\s*\))?/g)) {
    entries.push({
      year: Number(m[1]),
      iso: m[2] ? `${m[1]}-${m[2]}-${m[3]}` : null,
      label: m[4] || null,
    })
  }
  return entries.length ? entries : [{ year: null, iso: null, label: null, text }]
}

function todayIso() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** "2026-09-10" -> "Sep 10" (with the year when it is not this year). */
function formatShortDate(iso) {
  const [y, m, d] = String(iso || '').split('-').map(Number)
  if (!y || !m || !d) return iso
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(y !== new Date().getFullYear() && { year: 'numeric' }),
  })
}

const Num = ({ children }) => <span className="font-mono">{children}</span>

/**
 * The short, muted line under the meta line: street address (when it is not
 * already the building's name), availability, AMI and restricted units.
 */
function snippetParts(property) {
  const parts = []
  const name = String(property.building_name || '').trim().toLowerCase()
  const address = String(property.address || '').trim()
  if (address && !(name && address.toLowerCase().startsWith(name))) parts.push(address)

  const nowCount = Number(property.available_now_count) || 0
  if (nowCount > 0) {
    parts.push(
      <span className="font-medium text-green">
        <Num>{nowCount}</Num> available now
      </span>
    )
  } else if (property.next_available_date && property.next_available_date >= todayIso()) {
    // A date that has passed is stale scrape data, not an upcoming opening.
    parts.push(
      <>
        Next opening <Num>{formatShortDate(property.next_available_date)}</Num>
      </>
    )
  }
  if (property.amis) {
    parts.push(
      <>
        <Num>{formatAmi(property.amis)}</Num> AMI
      </>
    )
  }
  if (property.income_restricted_units > 0 && property.total_units > 0) {
    parts.push(
      <>
        <Num>{property.income_restricted_units}</Num> of <Num>{property.total_units}</Num> units
        income-restricted
      </>
    )
  }
  return parts
}

/**
 * One search result. The title is a real <button>; its .card-link ::after
 * stretches over the whole card, so the card is a single click target with
 * no nested controls. The heart sits above that overlay (relative z-10).
 */
export default function PropertyCard({
  property,
  isSelected,
  onClick,
  isFavorite,
  onToggleFavorite,
  savedUnitCount = 0,
  // Whether this building belongs to the list being shown. Distinct from
  // isFavorite: viewing someone's shared list highlights their picks, while the
  // heart keeps reflecting what the viewer themselves saved.
  highlighted,
}) {
  const titleId = useId()
  const hasListings = property.listing_count > 0
  const marked = highlighted ?? (isFavorite || savedUnitCount > 0)

  const area = [property.neighborhood, property.city]
    .filter(Boolean)
    .filter((v, i, a) => a.indexOf(v) === i)
  const meta = [...area, formatBedrooms(property.br_types)].filter(Boolean).join(' · ')
  const snippet = snippetParts(property)
  const incentives = INCENTIVES.filter((b) => property[b.key])
  const expiry = parseExpiry(property.expiration_date)
  const thisYear = new Date().getFullYear()
  const expired = expiry.length > 0 && expiry.every((e) => e.year && e.year < thisYear)

  return (
    <article
      aria-labelledby={titleId}
      className={`card card-interactive p-4 ${
        isSelected ? 'card-selected' : marked ? 'card-saved' : ''
      }`}
    >
      {/* Name, saved-apartment count, heart. An h3 under the results heading
          (h2 "N places"); the open panel's name is an h2 of its own. */}
      <div className="flex items-start gap-2">
        <h3
          id={titleId}
          className="min-w-0 flex-1 pt-1.5 text-15 font-semibold leading-snug tracking-tight text-ink"
        >
          <button
            type="button"
            onClick={onClick}
            aria-current={isSelected ? 'true' : undefined}
            className="card-link block w-full"
          >
            {/* break-words: a long word wraps (hyphenated where the browser
                can) instead of being clipped in a narrow card (the lg rail at
                large text sizes). Two lines at
                most, except where the list is narrow in rem (.card-title in
                globals.css): there the name takes the lines it needs. */}
            <span className="card-title line-clamp-2 break-words hyphens-auto">{property.building_name}</span>
          </button>
        </h3>
        {savedUnitCount > 0 && (
          <span className="mt-2 inline-flex shrink-0 items-center gap-1 font-mono text-2xs font-medium text-saved">
            <Icon name="heart" size={12} filled />
            {savedUnitCount}
            <span className="sr-only">
              {` saved apartment${savedUnitCount !== 1 ? 's' : ''}`}
            </span>
          </span>
        )}
        <HeartButton
          active={isFavorite}
          onToggle={onToggleFavorite}
          size="sm"
          label={property.building_name || 'this building'}
          className="-mr-2"
        />
      </div>

      {/* Where, what and from how much, with the listing photo alongside:
          the name, the place and the price lead, then the details. */}
      <div className="mt-1 flex gap-3">
        <div className="min-w-0 flex-1">
          {meta && <p className="truncate text-13 text-muted">{meta}</p>}
          {property.min_rent ? (
            <p className="mt-1 text-sm text-ink">
              <span className="text-xs text-muted">from </span>
              <span className="font-mono font-semibold">
                ${Number(property.min_rent).toLocaleString('en-US')}
              </span>
              <span className="text-xs text-muted" aria-hidden="true">
                /mo
              </span>
              <span className="sr-only"> per month</span>
            </p>
          ) : (
            <p className="mt-1 text-xs font-medium leading-5 text-muted">Contact for pricing</p>
          )}
          {snippet.length > 0 && (
            <p className="mt-1 line-clamp-2 text-13 text-muted">
              {snippet.map((part, i) => (
                <Fragment key={i}>
                  {i > 0 && ' · '}
                  {part}
                </Fragment>
              ))}
            </p>
          )}
        </div>
        {/* Hot-linked from the property's own listing site. A dead link (the
            listing closed) hides itself instead of showing a broken image.
            Decorative here: the title already names the building. It makes
            way for the text in a narrow card (.card-thumb in a .card-list). */}
        {property.image_url && (
          <img
            src={property.image_url}
            alt=""
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            onError={(e) => {
              e.currentTarget.style.display = 'none'
            }}
            className="card-thumb size-[4.5rem] shrink-0 rounded-lg bg-panel-raised object-cover sm:size-20"
          />
        )}
      </div>

      {/* Status and program pills, incentive badges and the program's end. */}
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {hasListings && (
          <span className="pill border-green/40 text-green">
            {/* A static dot: a whole page of pinging dots would distract.
                Not positioned, so it never sits above the card's overlay. */}
            <span className="size-2 shrink-0 rounded-full bg-green" aria-hidden="true" />
            Live pricing
          </span>
        )}
        <span className="pill text-muted">
          <span
            className="chip-dot"
            style={{ background: programColor(property.program) }}
            aria-hidden="true"
          />
          {programLabel(property.program)}
        </span>
        {incentives.map((b) => (
          <span key={b.key} className="badge">
            {b.label}
          </span>
        ))}
        {expiry.length > 0 && (
          <span className="text-xs text-muted">
            {expired ? 'Program ended ' : 'Program ends '}
            {expiry.map((e, i) => (
              <Fragment key={i}>
                {i > 0 && ', '}
                <Num>{e.year ?? e.text}</Num>
                {e.label && ` ${e.label}`}
              </Fragment>
            ))}
          </span>
        )}
      </div>
    </article>
  )
}
