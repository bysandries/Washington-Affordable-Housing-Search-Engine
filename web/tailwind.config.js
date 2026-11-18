/** @type {import('tailwindcss').Config} */

// Design tokens: every colour is a CSS custom property holding space-separated
// RGB channels, defined in app/globals.css (:root = light, .dark = dark; the
// dark values are the luis.sandries.com palette). Routing them through
// rgb(var(--x) / <alpha-value>) keeps opacity modifiers working
// (border-edge/60, bg-accent/10) and lets ONE class serve both appearances,
// so components never need dark: pairs.
const token = (name) => `rgb(var(--${name}) / <alpha-value>)`

module.exports = {
  content: ['./app/**/*.{js,jsx}', './components/**/*.{js,jsx}', './lib/**/*.{js,jsx}'],
  darkMode: 'class',
  future: {
    // hover: utilities apply only where hover exists (a mouse or trackpad),
    // so a control tapped on a touch screen does not keep its hover look.
    // The recipes in app/globals.css follow the same rule.
    hoverOnlyWhenSupported: true,
  },
  theme: {
    // Tailwind's breakpoints in em rather than px. At the default 16px text
    // size they are identical (sm 640, md 768, lg 1024, xl 1280); with a
    // larger default text size (a browser or OS setting) they move with it,
    // as full-page zoom does, so the layout reflows instead of squeezing
    // enlarged text into columns sized for the default. app/page.js and
    // app/globals.css use the same em values.
    screens: {
      sm: '40em',
      md: '48em',
      lg: '64em',
      xl: '80em',
      '2xl': '96em',
    },
    // The palette is replaced, not extended: only the semantic tokens (plus
    // white/black for photo scrims) exist, so an off-system colour such as
    // text-gray-500 simply does not compile.
    colors: {
      transparent: 'transparent',
      current: 'currentColor',
      inherit: 'inherit',
      white: '#ffffff',
      black: '#000000',

      canvas: token('canvas'), // page background
      panel: {
        DEFAULT: token('panel'), // cards, header, side panel
        raised: token('panel-raised'), // selected rows, wells, skeletons
      },
      edge: token('edge'), // DECORATIVE borders and dividers only
      'control-edge': token('control-edge'), // form-field boundaries (3:1)
      ink: token('ink'), // primary text and icons
      muted: token('muted'), // secondary text (4.5:1 on every surface)
      accent: {
        DEFAULT: token('accent'), // gold FILL: bg-accent, border-accent
        hover: token('accent-hover'), // gold fill, hovered
        ink: token('accent-ink'), // text and icons ON a gold fill
        text: token('accent-text'), // gold used AS text (= text-accent)
        soft: token('accent-soft'), // softer gold text (subtitles, pills)
        strong: token('accent-strong'), // gold for thin indicators (3:1)
      },
      green: {
        DEFAULT: token('green'), // live pricing, available now
        hover: token('green-hover'),
      },
      saved: token('saved'), // hearts and saved highlights
      focus: token('focus'), // focus rings (same value as accent-strong)
    },
    extend: {
      // The one split in the system: as TEXT, "accent" means the accessible
      // gold (light #7a5800, dark #f4c430). bg-accent / border-accent stay the
      // #f4c430 fill. Text sitting ON a gold fill uses text-accent-ink.
      textColor: { accent: { DEFAULT: token('accent-text') } },
      textDecorationColor: { accent: { DEFAULT: token('accent-text') } },
      caretColor: { accent: { DEFAULT: token('accent-text') } },
      // Bare `ring` / `ring-offset` must never fall back to Tailwind's blue
      // and white defaults. Prefer explicit ring-focus anyway.
      ringColor: {
        DEFAULT: ({ opacityValue }) =>
          opacityValue === undefined ? 'rgb(var(--focus))' : `rgb(var(--focus) / ${opacityValue})`,
      },
      ringOffsetColor: { DEFAULT: 'rgb(var(--panel))' },
      // A bare `border` gets the decorative edge colour, never currentColor.
      borderColor: { DEFAULT: 'rgb(var(--edge))' },

      fontFamily: {
        // Variables are set on <html> by next/font in app/layout.js.
        sans: ['var(--font-geist-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['var(--font-geist-mono)', 'ui-monospace', 'Menlo', 'Consolas', 'monospace'],
        pixel: ['var(--font-silkscreen)', 'ui-monospace', 'monospace'], // wordmark only
      },
      // rem, so the user's browser font size still scales the UI.
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }], // 11px: labels, pills, badges
        13: ['0.8125rem', { lineHeight: '1.25rem' }], // 13px: chips, meta lines
        15: ['0.9375rem', { lineHeight: '1.6rem' }], // 15px: long-form body copy
      },
      // md 6px buttons · lg 10px fields, segmented, neo-inset · xl 12px cards.
      borderRadius: {
        lg: '0.625rem',
      },
      boxShadow: {
        header: 'var(--shadow-header)', // the reference header drop shadow
        card: 'var(--shadow-card)', // resting cards, map controls, legend
        popover: 'var(--shadow-popover)', // popovers, floating buttons
        neo: 'var(--neo-shadow)', // the .neo-inset recess
      },
      transitionDuration: {
        DEFAULT: '180ms',
        250: '250ms',
      },
      transitionTimingFunction: {
        DEFAULT: 'cubic-bezier(0.2, 0.8, 0.2, 1)', // ease-out
        out: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
      },
      // Named layers for the app's overlays. Leaflet's own panes (200-1000)
      // stay inside the map because .leaflet-container isolates them.
      zIndex: {
        header: '20',
        float: '1100', // phone List/Map switch
        panel: '1200', // property panel overlay
        scrim: '1400', // popover click-catcher
        popover: '1500', // share popover
        dialog: '3000', // lightbox
      },
    },
  },
  plugins: [
    // coarse: / fine: for touch-specific sizing, e.g. `coarse:h-11`.
    function ({ addVariant }) {
      addVariant('coarse', '@media (pointer: coarse)')
      addVariant('fine', '@media (pointer: fine)')
      // short: / tall: for the short-screen mode (app/globals.css, "Short
      // screens"): a viewport under 30em tall, as at 400% zoom, on a phone in
      // landscape or with a large text size. The page then scrolls as one
      // document. In em, so the browser's text size moves it like zoom does;
      // app/page.js adds .short-screen to <html> for the same height in rem,
      // which also catches text enlarged on the root element alone.
      // `tall:` is its opposite, e.g. `lg:tall:w-1/3` for the three columns.
      addVariant('short', ['@media (max-height: 30em)', '.short-screen &'])
      addVariant('tall', '@media not all and (max-height: 30em) { html:not(.short-screen) & }')
    },
  ],
}
