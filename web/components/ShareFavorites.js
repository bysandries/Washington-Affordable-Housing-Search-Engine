'use client'

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { buildShareUrl } from '@/lib/favorites'
import { trackEvent } from '@/lib/analytics'
import { Icon } from '@/lib/theme'

// Layout effects must not run during server rendering.
const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect

const POPOVER_WIDTH = 360 // px; narrow screens get the viewport minus gutters
const GUTTER = 8

// Why the chip is unavailable: its description while nothing is saved, and
// what the popover says when it is pressed anyway (keyboard and touch users
// never see a tooltip).
const EMPTY_HINT = 'Save a place with its heart button first, then share your list from here.'

// Copy feedback for the role=status line. 'pending' renders nothing, so every
// result arrives as a change to an already-mounted live region and is
// announced, including a repeat copy.
const STATUS = {
  pending: null,
  copied: { icon: 'check', tone: 'text-green', text: 'Link copied to your clipboard.' },
  blocked: {
    icon: 'info',
    tone: 'text-accent',
    text: 'Automatic copy was blocked. Copy the link below.',
  },
}

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'

/**
 * Copies a link that carries the saved list inside the URL itself, so a
 * recipient needs no account and nothing is stored server-side.
 *
 * Clicking always does both: the link is copied automatically AND shown in a
 * popover for manual copying, so the user can verify what was copied, and the
 * flow still works where the Clipboard API is blocked (insecure context,
 * denied permission).
 *
 * The popover is a small modal dialog: focus moves into it and returns to the
 * chip on close, Tab stays inside, and Escape or a click outside closes it.
 *
 * With nothing saved the chip stays focusable but aria-disabled (dimmed), is
 * described by EMPTY_HINT, and pressing it opens the same popover with that
 * explanation instead of a link.
 */
export default function ShareFavorites({ state, disabled }) {
  const [open, setOpen] = useState(false)
  const [empty, setEmpty] = useState(false) // the popover explains instead of sharing
  const [copyState, setCopyState] = useState('pending') // 'pending' | 'copied' | 'blocked'
  const [live, setLive] = useState(false) // status region mounted and ready to announce
  const [url, setUrl] = useState('')
  const [pos, setPos] = useState({ left: GUTTER, top: 0, width: POPOVER_WIDTH, maxHeight: null })
  const btnRef = useRef(null)
  const popRef = useRef(null)
  const inputRef = useRef(null)
  const uid = useId()
  const titleId = `${uid}title`
  const noteId = `${uid}note`
  const linkId = `${uid}link`
  const hintId = `${uid}hint`

  // Fixed coordinates under the chip. The popover renders in a portal on
  // <body>, so the scrolling chip strip can never clip it. Once it has
  // rendered and its height is known, it flips above the chip when there is
  // no room below, or is pinned inside the viewport (short or zoomed
  // screens), and never grows taller than the viewport: it scrolls instead.
  const place = useCallback(() => {
    const rect = btnRef.current?.getBoundingClientRect()
    if (!rect) return
    const viewport = document.documentElement.clientWidth || window.innerWidth
    const viewportH = window.innerHeight
    const width = Math.min(POPOVER_WIDTH, viewport - GUTTER * 2)
    const maxHeight = Math.max(0, viewportH - GUTTER * 2)
    const height = Math.min(popRef.current?.offsetHeight || 0, maxHeight)
    let top = rect.bottom + GUTTER
    if (height && top + height > viewportH - GUTTER) {
      const above = rect.top - GUTTER - height
      top = above >= GUTTER ? above : Math.max(GUTTER, viewportH - GUTTER - height)
    }
    setPos({
      width,
      left: Math.max(GUTTER, Math.min(rect.left, viewport - width - GUTTER)),
      top,
      maxHeight,
    })
  }, [])

  // Re-measure before paint whenever the popover opens or its content (and so
  // its height) changes.
  useIsoLayoutEffect(() => {
    if (open) place()
  }, [open, empty, copyState, live, place])

  const close = useCallback(() => {
    setOpen(false)
    // Back to the control that opened it (the WAI-ARIA dialog pattern).
    btnRef.current?.focus()
  }, [])

  // Escape closes the popover and only the popover. A capture-phase listener
  // on window runs before the details panel's own Escape handler, and
  // stopping the key here means one press never closes two layers.
  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopPropagation()
      close()
    }
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('resize', place)
    // On short screens the page itself scrolls (globals.css): the popover
    // follows its chip.
    window.addEventListener('scroll', place, { passive: true })
    return () => {
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place)
    }
  }, [open, close, place])

  // Move focus into the popover, onto the pre-selected link, so a manual
  // copy is one Cmd+C / Ctrl+C away.
  useEffect(() => {
    if (!open) return
    const input = inputRef.current
    if (input) {
      input.focus({ preventScroll: true })
      input.select()
    }
    // Some mobile browsers refuse to focus a field outside a user gesture; the
    // dialog itself takes focus then, so the keyboard still starts inside.
    if (popRef.current && !popRef.current.contains(document.activeElement)) {
      popRef.current.focus({ preventScroll: true })
    }
  }, [open])

  // Mount the status line empty for one frame before showing any message. A
  // live region that is inserted already holding text is not announced.
  useEffect(() => {
    if (!open) return undefined
    const frame = requestAnimationFrame(() => setLive(true))
    return () => {
      cancelAnimationFrame(frame)
      setLive(false)
    }
  }, [open])

  const tryCopy = async (link) => {
    try {
      await navigator.clipboard.writeText(link)
      return true
    } catch {
      // Clipboard API needs a secure context and permission; fall back to the
      // selection-based path before giving up. The field must hold focus for
      // execCommand to copy its selection.
      try {
        const input = inputRef.current
        if (!input) return false
        input.focus({ preventScroll: true })
        input.select()
        return document.execCommand('copy')
      } catch {
        return false
      }
    }
  }

  const share = async () => {
    if (disabled) {
      // Nothing to share yet: explain how, in the same popover.
      setEmpty(true)
      setCopyState('pending')
      place()
      setOpen(true)
      return
    }
    setEmpty(false)
    const link = await buildShareUrl(state)
    setUrl(link)
    place()
    setCopyState('pending')
    setOpen(true)
    // Clipboard API only here: the popover's input has not rendered yet, so
    // the selection-based fallback has nothing to select. If this is blocked,
    // the popover says so and the Copy button takes the fallback path.
    try {
      await navigator.clipboard.writeText(link)
      setCopyState('copied')
      trackEvent('share_list', { auto_copied: true })
    } catch {
      setCopyState('blocked')
      trackEvent('share_list', { auto_copied: false })
    }
  }

  const copyManually = async () => {
    setCopyState('pending')
    setCopyState((await tryCopy(url)) ? 'copied' : 'blocked')
  }

  // Keep Tab inside the dialog while it is open (it is modal: the scrim
  // blocks everything behind it).
  const trapTab = (e) => {
    if (e.key !== 'Tab' || !popRef.current) return
    const items = Array.from(popRef.current.querySelectorAll(FOCUSABLE))
    if (!items.length) return
    const first = items[0]
    const last = items[items.length - 1]
    const active = document.activeElement
    if (e.shiftKey && (active === first || active === popRef.current)) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && active === last) {
      e.preventDefault()
      first.focus()
    }
  }

  const status = live ? STATUS[copyState] : null

  return (
    <>
      {/* Never `disabled`: a disabled button cannot take focus, so keyboard
          and touch users could not learn why it is unavailable. */}
      <button
        ref={btnRef}
        type="button"
        onClick={share}
        aria-disabled={disabled || undefined}
        aria-describedby={disabled ? hintId : undefined}
        title={disabled ? EMPTY_HINT : 'Copy a link to your saved list'}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={`chip ${open && !disabled ? 'chip-active' : ''}`}
      >
        <Icon name={open && !empty && copyState === 'copied' ? 'check' : 'share'} size={14} />
        Share list
      </button>
      <span id={hintId} hidden>
        {EMPTY_HINT}
      </span>

      {open &&
        createPortal(
          <>
            {/* Click-catcher: an outside click closes the popover without
                also activating whatever sits underneath. preventDefault on
                mousedown keeps focus where it is until close() returns it. */}
            <div
              className="fixed inset-0 z-scrim"
              aria-hidden="true"
              onMouseDown={(e) => e.preventDefault()}
              onClick={close}
            />
            <div
              ref={popRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              aria-describedby={noteId}
              tabIndex={-1}
              onKeyDown={trapTab}
              style={{
                left: pos.left,
                top: pos.top,
                width: pos.width,
                ...(pos.maxHeight != null && { maxHeight: pos.maxHeight }),
              }}
              className="card scrollbar-thin fixed z-popover overflow-y-auto p-4 shadow-popover"
            >
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <h2 id={titleId} className="text-sm font-semibold tracking-tight text-ink">
                    Share your saved list
                  </h2>
                  {empty ? (
                    <p id={noteId} className="mt-1 text-13 leading-relaxed text-muted">
                      {EMPTY_HINT}
                    </p>
                  ) : (
                    <p role="status" className={`mt-1 flex min-h-5 items-start gap-1.5 text-13 ${status ? status.tone : ''}`}>
                      {status && (
                        <>
                          <Icon name={status.icon} size={14} className="mt-[3px] shrink-0" />
                          <span>{status.text}</span>
                        </>
                      )}
                    </p>
                  )}
                </div>
                <button type="button" onClick={close} aria-label="Close" className="btn-icon btn-icon-sm -mr-1.5 -mt-1.5">
                  <Icon name="close" />
                </button>
              </div>

              {!empty && (
                <>
                  <div className="mt-3 flex items-center gap-2">
                    <label htmlFor={linkId} className="sr-only">
                      Shareable link
                    </label>
                    <input
                      id={linkId}
                      ref={inputRef}
                      type="text"
                      readOnly
                      value={url}
                      onFocus={(e) => e.target.select()}
                      spellCheck={false}
                      // 44px tall on touch layouts, like the Copy button.
                      className="field min-w-0 flex-1 bg-canvas font-mono coarse:h-11"
                    />
                    <button type="button" onClick={copyManually} className="btn btn-primary h-10 coarse:h-11">
                      <Icon name="copy" size={14} />
                      Copy
                    </button>
                  </div>

                  <p id={noteId} className="mt-3 text-xs leading-relaxed text-muted">
                    The list travels inside the link itself. Nothing is stored on a server.
                  </p>
                </>
              )}
            </div>
          </>,
          document.body
        )}
    </>
  )
}
