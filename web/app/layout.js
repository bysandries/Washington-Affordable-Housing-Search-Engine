import './globals.css'
import localFont from 'next/font/local'
import { GeistSans } from 'geist/font/sans'
import { GeistMono } from 'geist/font/mono'
import { Analytics } from '@vercel/analytics/next'
import { SpeedInsights } from '@vercel/speed-insights/next'
import { getLastIndexedAt } from '@/lib/db'
import { SITE_DESCRIPTION, SITE_NAME } from '@/lib/site'
import { TOKENS } from '@/lib/theme'

// The pixel face, used only by the wordmark (components/Wordmark.js). Self
// hosted from app/fonts (copied from @fontsource/silkscreen), never fetched
// from a font CDN. Regular 400: the bold cut draws the W as a solid block.
const silkscreen = localFont({
  src: './fonts/silkscreen-latin-400-normal.woff2',
  weight: '400',
  style: 'normal',
  variable: '--font-silkscreen',
  display: 'swap',
  fallback: ['ui-monospace', 'monospace'],
  adjustFontFallback: false,
})

const DESCRIPTION = SITE_DESCRIPTION

export const metadata = {
  // Absolute base for og:image / og:url when a link is shared. This is the
  // production URL the portfolio (luis.sandries.com) links to.
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL || 'https://washington-affordable-housing-search.vercel.app'
  ),
  // Pages export just `title: 'About'`; the template completes it.
  title: {
    default: SITE_NAME,
    template: `%s — ${SITE_NAME}`,
  },
  description: DESCRIPTION,
  applicationName: SITE_NAME,
  openGraph: {
    title: SITE_NAME,
    description: DESCRIPTION,
    url: '/',
    siteName: SITE_NAME,
    type: 'website',
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
    title: SITE_NAME,
    description: DESCRIPTION,
  },
}

export const viewport = {
  colorScheme: 'light dark',
  // No themeColor here: the browser's theme-color (its toolbar tint on
  // phones) is one meta that the script below adds and keeps on the canvas
  // of the appearance actually shown, so an explicit choice wins over the OS
  // there too. A server-rendered meta would be out of step with that choice
  // before hydration (and React would add a second one).
}

// Applied before paint so a dark-appearance visitor never sees a light
// flash. An explicit choice (localStorage 'theme') wins; otherwise the page
// follows the OS, including when the OS appearance changes while it is open.
// It also adds the theme-color meta and keeps it on the canvas shown
// (setTheme and syncThemeColor in lib/theme.js update it too). An OS switch, like
// the toggle (setTheme), turns transitions off for one frame
// (.theme-switching), so every surface changes at once.
const themeInit = `(function(){try{var d=document.documentElement,m=window.matchMedia('(prefers-color-scheme: dark)'),s=function(){try{return localStorage.getItem('theme')}catch(e){return null}},a=function(k){d.classList.toggle('dark',k);var c=document.querySelector('meta[name="theme-color"]');if(!c){c=document.createElement('meta');c.setAttribute('name','theme-color');document.head.appendChild(c)}c.setAttribute('content',k?'${TOKENS.dark.canvas}':'${TOKENS.light.canvas}')},t=s();a(t==='dark'||(!t&&m.matches));var f=function(e){if(s())return;d.classList.add('theme-switching');a(e.matches);void d.offsetWidth;requestAnimationFrame(function(){d.classList.remove('theme-switching')})};if(m.addEventListener)m.addEventListener('change',f);else if(m.addListener)m.addListener(f)}catch(e){}})()`

export default async function RootLayout({ children }) {
  // The real crawl date from the bundled database, not today's date, which
  // would overstate how fresh the pricing is.
  let lastIndexed = null
  let lastIndexedIso = null
  try {
    const at = await getLastIndexedAt()
    const date = at ? new Date(at) : null
    if (date && !Number.isNaN(date.getTime())) {
      lastIndexed = date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
      lastIndexedIso = date.toISOString()
    }
  } catch {
    // A missing or older database just drops the date from the banner.
  }

  return (
    <html
      lang="en"
      className={`${GeistSans.variable} ${GeistMono.variable} ${silkscreen.variable}`}
      suppressHydrationWarning
    >
      {/* html and body are the viewport's height (globals.css), and on short
          screens as tall as the page, which then scrolls as one document. */}
      <body className="flex flex-col bg-canvas font-sans text-ink antialiased">
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
        <aside
          aria-label="Disclaimer"
          className="shrink-0 border-b border-edge bg-canvas px-4 py-1.5 text-center text-2xs text-muted sm:text-xs"
        >
          {/* Phones and small tablets get the one-line version; the full
              sentence only fits on one line from md. */}
          <p className="md:hidden">Independent project · Confirm details with each property</p>
          <p className="hidden md:block">
            Independent educational project. Always confirm pricing and availability with the
            property.
            {lastIndexed && (
              <span className="whitespace-nowrap">
                {' '}
                Data indexed{' '}
                <time dateTime={lastIndexedIso} className="font-mono">
                  {lastIndexed}
                </time>
                .
              </span>
            )}
          </p>
        </aside>
        <div className="h-full min-h-0 flex-1 overflow-hidden short:h-auto short:overflow-visible">
          {children}
        </div>
        {/* Cookieless, aggregate-only visit and performance measurement: no
            cookies means no consent banner is required (see /privacy). */}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  )
}
