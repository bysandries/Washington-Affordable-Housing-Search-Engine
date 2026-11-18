import { ImageResponse } from 'next/og'
import { ICONS, TOKENS } from '@/lib/theme'

// The link-preview card shown when the site's URL is shared (iMessage, Slack,
// LinkedIn, X...). Generated at request time from the design tokens, so it
// always matches the app: navy canvas with the faint 8px grid, the pixel
// wordmark, and the header's search field and List | Map control.

export const runtime = 'edge'
export const alt =
  'Washington Affordable Housing Search — affordable housing search for Washington State with live pricing, availability, and a map'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

const C = TOKENS.dark

// The reference grid is #eef7fd at 4/255 alpha. It is lifted slightly here so
// the texture survives PNG compression and downscaled previews.
const GRID = 'rgba(238, 247, 253, 0.035)'

// The fonts ship inside the edge function: `new URL(..., import.meta.url)` is
// the documented Next 14 pattern for local assets. satori reads TTF, OTF and
// WOFF but not WOFF2, hence the .woff copy of Silkscreen in app/fonts and
// Geist's TTF files.
async function loadFont(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`font request failed with ${res.status}`)
  return res.arrayBuffer()
}

async function loadFonts() {
  try {
    const [pixel, regular, semibold] = await Promise.all([
      loadFont(new URL('./fonts/silkscreen-latin-400-normal.woff', import.meta.url)),
      loadFont(
        new URL('../node_modules/geist/dist/fonts/geist-sans/Geist-Regular.ttf', import.meta.url)
      ),
      loadFont(
        new URL('../node_modules/geist/dist/fonts/geist-sans/Geist-SemiBold.ttf', import.meta.url)
      ),
    ])
    return [
      { name: 'Silkscreen', data: pixel, weight: 400, style: 'normal' },
      { name: 'Geist', data: regular, weight: 400, style: 'normal' },
      { name: 'Geist', data: semibold, weight: 600, style: 'normal' },
    ]
  } catch (error) {
    // Never fail the preview over a font: undefined makes the renderer fall
    // back to its bundled sans face.
    console.error('opengraph-image: custom fonts unavailable', error)
    return undefined
  }
}

function Glyph({ name, size, color, strokeWidth = 2 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={ICONS[name]} />
    </svg>
  )
}

// Even word spacing. satori sizes each word by summing unkerned per-letter
// advances but draws it kerned, so a tightly kerned word ("Wa", "ff") leaves
// a loose gap after it ("Affordable  housing"). Words are therefore laid out
// one by one: the gap is Geist's space (0.236em SemiBold, 0.25em Regular,
// less any tracking), and each word is pulled left by its kerning deficit.
// Deficits are px (unkerned minus kerned width), measured with Chrome's
// shaper for the exact size, weight and tracking used. A word that is not
// listed gets no correction; re-measure if the copy or type changes.
const KERN_HEADLINE = {
  // 68px SemiBold, -2px tracking
  Affordable: 14.5,
  housing: 3.4,
  search: 4.4,
  for: 3.4,
  Washington: 9,
  State: 6.1,
}
const KERN_FIELD = { rent: 2.9, seattle: 4.9 } // 32px Regular
const KERN_TAGLINE = { Live: 2.4, pricing: 1.8, availability: 4.2, map: 0.4 } // 28px Regular
const KERN_SEGMENT = { List: 2.1, Map: 0.3 } // 28px SemiBold

function Words({ text, gap = 0, kern = {}, style }) {
  return (
    <div style={{ display: 'flex', gap, ...style }}>
      {text.split(' ').map((word, i) => (
        <span key={i} style={{ marginRight: -(kern[word] ?? 0) }}>
          {word}
        </span>
      ))}
    </div>
  )
}

function Segment({ icon, label, active = false, kern }) {
  const color = active ? C.accentInk : C.muted
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        height: '100%',
        padding: '0 26px',
        borderRadius: 12,
        backgroundColor: active ? C.accent : 'transparent',
        color,
        fontSize: 28,
        fontWeight: 600,
      }}
    >
      <Glyph name={icon} size={26} color={color} strokeWidth={2.25} />
      <Words text={label} kern={kern} />
    </div>
  )
}

export default async function OpenGraphImage() {
  const fonts = await loadFonts()
  // The kerning corrections are measured for Geist; skip them on the fallback.
  const kern = (table) => (fonts ? table : undefined)

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '64px 80px 60px',
          backgroundColor: C.canvas,
          // Explicit directions: satori's gradient parser rejects a leading
          // rgba() stop without one.
          backgroundImage: `linear-gradient(to bottom, ${GRID} 1px, transparent 1px), linear-gradient(to right, ${GRID} 1px, transparent 1px)`,
          backgroundSize: '8px 8px',
          color: C.ink,
          fontFamily: 'Geist',
        }}
      >
        {/* Pixel wordmark: WA in ink, HOUSING in gold, in Silkscreen Regular
            like the app (the bold cut draws the W as a solid block). 48px
            keeps its 8-pixel em on whole pixels (6px per font pixel); the gap
            is the font's own 24px space. No negative tracking here, since it
            would push the glyphs off that pixel grid and blur them. */}
        <div
          style={{
            display: 'flex',
            fontFamily: 'Silkscreen',
            fontSize: 48,
            fontWeight: 400,
            lineHeight: 1,
          }}
        >
          <span style={{ color: C.ink }}>WA</span>
          <span style={{ color: C.accentText, marginLeft: 24 }}>HOUSING</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              fontSize: 68,
              fontWeight: 600,
              lineHeight: 1.08,
              letterSpacing: -2,
            }}
          >
            <Words text="Affordable housing search" gap={14} kern={kern(KERN_HEADLINE)} />
            <Words text="for Washington State" gap={14} kern={kern(KERN_HEADLINE)} />
          </div>

          {/* The header's search field (recessed panel, gold magnifier) and
              the List | Map segmented control with List selected. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginTop: 52 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                flexGrow: 1,
                height: 84,
                padding: '0 30px',
                borderRadius: 20,
                border: `2px solid ${C.edge}`,
                backgroundColor: C.panel,
                boxShadow:
                  'inset 10px 10px 20px rgba(2, 9, 16, 0.55), inset -8px -8px 18px rgba(94, 156, 198, 0.06)',
              }}
            >
              <Glyph name="search" size={36} color={C.accent} strokeWidth={2.25} />
              <Words
                text="rent in seattle"
                gap={8}
                kern={kern(KERN_FIELD)}
                style={{ marginLeft: 20, fontSize: 32, color: C.ink }}
              />
              <div
                style={{
                  width: 3,
                  height: 38,
                  marginLeft: 8,
                  borderRadius: 2,
                  backgroundColor: C.accent,
                }}
              />
            </div>

            <div
              style={{
                display: 'flex',
                height: 84,
                padding: 6,
                gap: 4,
                borderRadius: 20,
                border: `2px solid ${C.edge}`,
                backgroundColor: C.canvas,
              }}
            >
              <Segment icon="list" label="List" active kern={kern(KERN_SEGMENT)} />
              <Segment icon="map" label="Map" kern={kern(KERN_SEGMENT)} />
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', fontSize: 28, color: C.muted }}>
          <div
            style={{
              width: 14,
              height: 14,
              marginRight: 16,
              borderRadius: 7,
              backgroundColor: C.green,
            }}
          />
          <Words text="Live pricing · availability · map" gap={7} kern={kern(KERN_TAGLINE)} />
        </div>
      </div>
    ),
    { ...size, fonts }
  )
}
