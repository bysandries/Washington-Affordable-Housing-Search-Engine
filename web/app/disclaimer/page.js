import ContentPage from '@/components/ContentPage'
import { pageMetadata } from '@/lib/site'

export const metadata = pageMetadata({
  title: 'Disclaimer',
  description:
    'Washington Affordable Housing Search is an independent educational project, not an official source. Data is gathered automatically, so confirm every detail with the property.',
  path: '/disclaimer',
})

export default function DisclaimerPage() {
  return (
    <ContentPage
      current="/disclaimer"
      title="Legal Disclaimer"
      subtitle="An independent educational project, not an official source. Always confirm details with the property."
      updated={{ iso: '2026-11-18', label: 'November 18, 2026' }}
    >
      <div className="content-prose mt-8">
        <h2>For Educational & Research Purposes Only</h2>
        <p>
          This website, including its data collection systems and frontend interfaces, was created exclusively as a non-commercial educational and research project. Its primary purpose is to explore techniques in web data aggregation, search-engine style crawling and indexing, and geographical mapping.
        </p>

        <h2>No Affiliation</h2>
        <p>
          We are not affiliated, associated, authorized, endorsed by, or in any way officially connected with the City of Seattle, the Seattle Office of Housing, or any property management companies listed on this site.
          All product and company names are trademarks™ or registered® trademarks of their respective holders. Use of them does not imply any affiliation with or endorsement by them.
        </p>

        <h2>Accuracy of Information</h2>
        <p>
          The information on this website is aggregated from public sources, including the City of Seattle’s ArcGIS open data portal and publicly accessible property listings. Because this data is collected via automated systems, it is highly subject to errors, omissions, formatting anomalies, and delays.
        </p>
        {/* The reference "Outcome" callout: the one sentence nobody should miss. */}
        <div className="callout bg-panel">
          <p className="section-label text-accent">Important</p>
          <p className="mt-2">
            <strong>Do not rely on this information for critical housing or financial decisions.</strong> Prices, availability dates, and income restrictions change rapidly. You must independently verify all details by contacting the property or leasing office directly.
          </p>
        </div>

        <h2>Ethical Crawling & Indexing</h2>
        <p>
          The automated crawler backing this search engine follows the same ethical practices as established web search engines. It respects{' '}
          <code>robots.txt</code>{' '}
          files, enforces strict concurrency limits, and utilizes generous request delays to prevent undue load on external servers. Furthermore, all automated form submission and contact functionalities have been strictly disabled to ensure compliance with anti-spam legislation and ethical guidelines.
        </p>
      </div>
    </ContentPage>
  )
}
