// X (Twitter) cards read twitter:image, so they get the same card as Open
// Graph. `runtime` must stay a string literal in this file: Next.js only
// detects the segment runtime statically and ignores a re-exported one, and
// the card's bundled fonts load only on the edge runtime.
export const runtime = 'edge'
export { default, alt, size, contentType } from './opengraph-image'
