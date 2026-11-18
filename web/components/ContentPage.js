import Link from 'next/link'
import ThemeToggle from '@/components/ThemeToggle'
import Wordmark from '@/components/Wordmark'
import { Icon } from '@/lib/theme'

/* The project-information pages, in footer order. */
const PAGES = [
  ['/about', 'About'],
  ['/privacy', 'Privacy'],
  ['/terms', 'Terms'],
  ['/disclaimer', 'Disclaimer'],
]

/**
 * A standalone gold link back to the search. The invisible ::before grows
 * the target to 44px tall without moving anything.
 */
function BackToSearch() {
  return (
    <Link
      href="/"
      className="link relative inline-flex items-center gap-1.5 text-sm font-medium before:absolute before:-inset-x-2 before:-inset-y-3"
    >
      <Icon name="arrowLeft" size={14} />
      Back to search
    </Link>
  )
}

/* A second way back at the end of long pages (`back`), plus the sibling
   pages. A short page, such as the 404, keeps only the link at the top. */
function PageFooter({ current, back = true }) {
  return (
    <footer
      className={`mt-16 flex flex-col items-start gap-8 border-t border-edge pt-8 sm:flex-row sm:items-center ${
        back ? 'sm:justify-between' : 'sm:justify-end'
      }`}
    >
      {back && <BackToSearch />}
      <nav aria-label="Project information">
        <ul className="flex flex-wrap gap-x-5 gap-y-3 text-13">
          {PAGES.map(([href, label]) => (
            <li key={href}>
              <Link
                href={href}
                aria-current={href === current ? 'page' : undefined}
                className="relative inline-flex text-muted transition-colors before:absolute before:-inset-x-2 before:-inset-y-3 hover:text-ink aria-[current=page]:font-medium aria-[current=page]:text-accent"
              >
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </footer>
  )
}

/** Section numbers in headings: mono digits in gold text, so the list scans like data. */
export function SectionNumber({ children }) {
  return <span className="font-mono text-accent">{children}</span>
}

/**
 * The slim app bar of the content pages, as on the reference About page: the
 * pixel wordmark (home) and the appearance toggle. It scrolls away with the
 * page, so it never eats into short or zoomed viewports.
 */
function ContentHeader() {
  return (
    <header className="app-bar relative z-header flex h-12 items-center justify-between px-4">
      <Link
        href="/"
        aria-label="WA Housing — Washington Affordable Housing Search, home"
        className="relative -mx-1 flex h-10 items-center rounded-md px-1 before:absolute before:-inset-y-0.5 before:inset-x-0"
      >
        <Wordmark />
      </Link>
      <ThemeToggle />
    </header>
  )
}

/**
 * The shared shell of the content pages (about, privacy, terms, disclaimer,
 * and the 404 page): the app bar, then the reference content-page recipe on
 * the canvas grid, with a back link, the page's one h1, an accent-soft
 * subtitle, an optional fixed "Last updated" date, the page body, and a
 * footer with the sibling pages.
 *
 *   <ContentPage current="/terms" title="Terms of Service" subtitle="…"
 *     updated={{ iso: '2026-11-17', label: 'November 17, 2026' }}>
 *     <div className="content-prose mt-8">…</div>
 *   </ContentPage>
 *
 * `updated` is a fixed date on purpose: rendering today's date would claim
 * an update that never happened. `footerBack={false}` drops the second "Back
 * to search" from the footer, for a page too short to need it (the 404).
 */
export default function ContentPage({ current, title, subtitle, updated, footerBack = true, children }) {
  return (
    // Its own scroller, except on short screens, where the page itself
    // scrolls (globals.css, "Short screens").
    <div className="h-full overflow-y-auto scrollbar-thin bg-canvas bg-grid short:h-auto short:overflow-visible">
      <ContentHeader />
      <main className="mx-auto max-w-3xl px-6 py-12">
        <BackToSearch />

        <header className="mt-6">
          <h1 className="text-balance text-2xl font-bold tracking-tight text-ink">{title}</h1>
          {subtitle && <p className="mt-3 text-balance text-base text-accent-soft">{subtitle}</p>}
          {updated && (
            <p className="mt-4 text-13 text-muted">
              Last updated{' '}
              <time dateTime={updated.iso} className="font-mono">
                {updated.label}
              </time>
            </p>
          )}
        </header>

        {children}

        <PageFooter current={current} back={footerBack} />
      </main>
    </div>
  )
}
