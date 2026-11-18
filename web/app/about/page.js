import ContentPage from '@/components/ContentPage'
import { getCounties } from '@/lib/db'
import { pageMetadata } from '@/lib/site'

export const metadata = pageMetadata({
  title: 'About',
  description:
    'How Washington Affordable Housing Search works: an independent educational project that combines public housing data with pricing and availability from property websites across Washington State.',
  path: '/about',
})

// Washington's 39 counties. The Coverage row counts the ones the indexed
// data has places in (read from the database when the page is built), and
// only these, whatever else a row's county field might hold.
const WA_COUNTIES = new Set([
  'Adams', 'Asotin', 'Benton', 'Chelan', 'Clallam', 'Clark', 'Columbia', 'Cowlitz',
  'Douglas', 'Ferry', 'Franklin', 'Garfield', 'Grant', 'Grays Harbor', 'Island',
  'Jefferson', 'King', 'Kitsap', 'Kittitas', 'Klickitat', 'Lewis', 'Lincoln', 'Mason',
  'Okanogan', 'Pacific', 'Pend Oreille', 'Pierce', 'San Juan', 'Skagit', 'Skamania',
  'Snohomish', 'Spokane', 'Stevens', 'Thurston', 'Wahkiakum', 'Walla Walla', 'Whatcom',
  'Whitman', 'Yakima',
])

async function countiesCovered() {
  try {
    const counties = await getCounties()
    return new Set(counties.filter((c) => WA_COUNTIES.has(c))).size || null
  } catch {
    return null // An unreadable database drops the number, not the page.
  }
}

// Every value below is stated in the page copy.
const SOURCES = [
  'City of Seattle open data (ArcGIS)',
  'WSHFC tax-credit (LIHTC) list',
  'HUD Resource Locator',
  'Public property websites',
]

export default async function AboutPage() {
  const covered = await countiesCovered()
  return (
    <ContentPage
      current="/about"
      title="About Washington Affordable Housing Search"
      subtitle="A statewide search engine for affordable housing, built as an independent educational project."
    >
      <div className="mt-8 grid gap-10 md:grid-cols-[minmax(0,1fr)_15rem]">
        <div className="content-prose">
          <p>
            This project is a specialized search engine, created as an educational and research tool to better understand the affordable housing landscape across Washington State. Finding affordable housing—particularly units that are income-restricted (like LIHTC, MFTE and MHA units)—is notoriously difficult due to decentralized waitlists, hidden pricing, and outdated public databases.
          </p>

          <h2>How it works</h2>
          <p>
            We combine several public datasets: the City of Seattle’s ArcGIS open data portal, the Washington State Housing Finance Commission’s list of active tax-credit (LIHTC) properties covering all 39 counties, and HUD’s Resource Locator for the coordinates behind them. Our search engine then automatically crawls and indexes the public websites of property management companies — the same way general web search engines do — to surface real-time availability and pricing information.
          </p>

          <h2>Educational & Research Purposes Only</h2>
          <p>
            This website is built <strong>strictly for educational and research purposes</strong>. The information presented here is gathered automatically and may not be 100% accurate or up to date. Property management companies frequently change their pricing, fees, and availability without warning.
          </p>
          <p>
            We do not verify this data manually. You should <strong>always contact the property or leasing office directly</strong> to confirm actual rents, income restrictions (AMI limits), and unit availability before making any housing decisions.
          </p>
        </div>

        {/* The reference "Quick facts" card. */}
        <section aria-labelledby="at-a-glance" className="card self-start">
          <h2 id="at-a-glance" className="section-label">
            At a glance
          </h2>
          <dl className="mt-4 space-y-4">
            <div>
              <dt className="text-xs text-muted">Coverage</dt>
              <dd className="mt-0.5 text-13 text-ink">
                {covered ? (
                  <>
                    Places in <span className="font-mono">{covered}</span> of Washington’s{' '}
                    <span className="font-mono">{WA_COUNTIES.size}</span> counties
                  </>
                ) : (
                  'Places across Washington State'
                )}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Properties</dt>
              <dd className="mt-0.5 text-13 text-ink">
                <span className="font-mono">2,800+</span> indexed
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Programs include</dt>
              <dd className="mt-1.5 flex flex-wrap gap-1.5">
                <span className="badge">LIHTC</span>
                <span className="badge">MFTE</span>
                <span className="badge">MHA</span>
                <span className="badge">IZ</span>
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Sources</dt>
              {SOURCES.map((source) => (
                <dd key={source} className="mt-0.5 text-13 text-ink">
                  {source}
                </dd>
              ))}
            </div>
            <div>
              <dt className="text-xs text-muted">Verification</dt>
              <dd className="mt-0.5 text-13 text-ink">
                Automated, not checked by hand. Confirm with the property.
              </dd>
            </div>
          </dl>
        </section>
      </div>
    </ContentPage>
  )
}
