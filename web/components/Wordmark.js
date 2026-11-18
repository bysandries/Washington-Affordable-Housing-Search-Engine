/**
 * The pixel wordmark: "WA" in ink + "HOUSING" in gold-as-text, set in
 * Silkscreen Regular, uppercase and tight (the bold cut draws the W as a
 * solid block). It mirrors the portfolio's "LUIS SANDRIES" mark, so the app
 * reads as part of the same family.
 *
 * Purely presentational (aria-hidden). The parent link or heading supplies
 * the accessible name:
 *
 *   <a href="/" aria-label="WA Housing, home"><Wordmark /></a>
 *
 * 12px by default (the .wordmark recipe in globals.css; Silkscreen is crisp at
 * 12px on 2x screens and 16px / 24px everywhere). A Tailwind text-* class in
 * `className` overrides the size, e.g. <Wordmark className="text-base" />.
 * Server and client safe: no hooks, no state.
 */
export default function Wordmark({ className = '' }) {
  return (
    <span className={`wordmark ${className}`.trim()} aria-hidden="true">
      <span className="text-ink">WA</span> <span className="text-accent">HOUSING</span>
    </span>
  )
}
