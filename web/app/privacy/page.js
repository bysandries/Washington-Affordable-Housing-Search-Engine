import ContentPage, { SectionNumber as Num } from '@/components/ContentPage'
import { pageMetadata } from '@/lib/site'

export const metadata = pageMetadata({
  title: 'Privacy',
  description:
    'How this site minimizes data collection: no accounts, cookieless analytics, and saved lists that stay in your browser.',
  path: '/privacy',
})

export default function PrivacyPage() {
  return (
    <ContentPage
      current="/privacy"
      title="Privacy Policy"
      subtitle="No account and no cookies. Saved lists stay in your browser unless you share them."
      updated={{ iso: '2026-08-17', label: 'August 17, 2026' }}
    >
      <div className="content-prose mt-8">
        <p>
          This Privacy Policy explains how we collect, use, and disclose information about you when you access or use our website.
          As an educational and research project, we prioritize your privacy and minimize data collection.
        </p>

        <h2>
          <Num>1.</Num> Information We Collect
        </h2>
        <p>
          We do not require you to create an account or provide any personal information to use this website.
          We may automatically collect basic, non-identifying information such as your IP address, browser type, and operating system for server logging and security purposes, as is standard for internet hosting platforms like Vercel.
        </p>

        <h2>
          <Num>2.</Num> How We Use Information
        </h2>
        <p>
          Any automatically collected server data is used exclusively to maintain the security, reliability, and performance of the website. We do not use your data for advertising, profiling, or tracking across other websites.
        </p>

        <h2>
          <Num>3.</Num> Analytics — No Cookies, No Consent Banner Needed
        </h2>
        <p>
          To understand how the site is used and what to improve, we use <strong>Vercel Web Analytics</strong> and <strong>Vercel Speed Insights</strong>.
          These tools are <strong>cookieless</strong>: they set no cookies, store no identifiers on your device, do not fingerprint you, and cannot follow you
          across other websites. Visits are counted in aggregate only (for example: page views, country-level region, browser type, and page performance timings),
          and any temporary identifier is discarded so individual visitors cannot be re-identified. Because no cookies or similar tracking identifiers are used,
          EU ePrivacy and GDPR rules do not require a cookie consent banner for this measurement.
        </p>
        <p>
          We also record a small number of anonymous product events (such as &ldquo;a search was performed&rdquo;, &ldquo;a property was opened&rdquo;, or
          &ldquo;photos were enlarged&rdquo;). These events never include what you typed, which property you viewed, your saved lists, or anything else that
          could identify you — only that the feature was used.
        </p>

        <h2>
          <Num>4.</Num> Local Storage (Your Saved Lists and Theme)
        </h2>
        <p>
          Your saved favorites and your light/dark theme choice are stored only in your own browser&rsquo;s local storage, at your request, so the site works
          without an account. This data never leaves your device unless you explicitly create a share link — and even then, the list travels inside the link
          itself rather than being stored on a server. Functional storage of this kind does not require consent under EU ePrivacy rules because it is strictly
          necessary for a feature you asked for. Clearing your browser data removes it completely.
        </p>

        <h2>
          <Num>5.</Num> Data Sourcing
        </h2>
        <p>
          The property data (rent prices, availability, locations) displayed on this website is indexed from public web sources and the City of Seattle&rsquo;s open data portals, in the same way a search engine indexes public pages. We do not collect, index, or display any personal data regarding tenants or prospective renters.
        </p>

        <h2>
          <Num>6.</Num> Third-Party Links
        </h2>
        <p>
          This website contains links to third-party property management and leasing websites. We are not responsible for the privacy practices or the content of those third-party sites. We encourage you to review the privacy policies of those websites before submitting any personal information.
        </p>

        <h2>
          <Num>7.</Num> Contact Us
        </h2>
        <p>
          Since this is a non-commercial educational project, there is no formal support or contact team.
        </p>
      </div>
    </ContentPage>
  )
}
