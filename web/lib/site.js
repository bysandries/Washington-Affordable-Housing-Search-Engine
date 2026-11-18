/**
 * Site-wide names and the metadata helper for content pages. The root layout
 * (app/layout.js) and every content page read these, so the product name and
 * description are written once.
 */

export const SITE_NAME = 'Washington Affordable Housing Search'

export const SITE_DESCRIPTION =
  'Search 2,800+ affordable and income-restricted apartments across Washington State, with live pricing, availability, and a map. An independent educational project.'

/** "About" -> "About — Washington Affordable Housing Search" (the title template). */
export const fullTitle = (title) => `${title} — ${SITE_NAME}`

// The link-preview card drawn by app/opengraph-image.js (and re-exported by
// app/twitter-image.js). Keep the alt text and size in step with that file.
const PREVIEW_IMAGE = {
  width: 1200,
  height: 630,
  type: 'image/png',
  alt: `${SITE_NAME} — affordable housing search for Washington State with live pricing, availability, and a map`,
}

/**
 * Metadata for a content page: its title (completed by the layout's
 * template), description, and its own Open Graph / Twitter title and URL, so
 * a shared link to /about previews and resolves as About, not the home page.
 *
 * Next.js replaces a parent's openGraph and twitter objects instead of
 * merging them, and the root's image files only attach at the root segment,
 * so the shared fields and the preview images are restated here (the image
 * routes themselves are app/opengraph-image.js and app/twitter-image.js).
 *
 *   export const metadata = pageMetadata({ title: 'About', description: '…', path: '/about' })
 */
export function pageMetadata({ title, description, path }) {
  return {
    title,
    description,
    openGraph: {
      title: fullTitle(title),
      description,
      url: path,
      siteName: SITE_NAME,
      type: 'website',
      locale: 'en_US',
      images: [{ url: '/opengraph-image', ...PREVIEW_IMAGE }],
    },
    twitter: {
      card: 'summary_large_image',
      title: fullTitle(title),
      description,
      images: [{ url: '/twitter-image', ...PREVIEW_IMAGE }],
    },
  }
}
