import ContentPage, { SectionNumber as Num } from '@/components/ContentPage'
import { pageMetadata } from '@/lib/site'

export const metadata = pageMetadata({
  title: 'Terms',
  description:
    'The terms for using Washington Affordable Housing Search, an independent educational and research project.',
  path: '/terms',
})

export default function TermsPage() {
  return (
    <ContentPage
      current="/terms"
      title="Terms of Service"
      subtitle="This site is for education and research only. Verify every detail directly with the property."
      updated={{ iso: '2026-11-18', label: 'November 18, 2026' }}
    >
      <div className="content-prose mt-8">
        <p>
          By accessing or using this website, you agree to be bound by these Terms of Service. If you disagree with any part of the terms, you may not access the website.
        </p>

        <h2>
          <Num>1.</Num> Educational and Research Use
        </h2>
        <p>
          This website and its associated search-engine indexing tools are provided <strong>strictly for educational and research purposes</strong>. The information provided is for general informational purposes only and does not constitute housing, legal, or financial advice.
        </p>

        <h2>
          <Num>2.</Num> Disclaimer of Warranties
        </h2>
        <p>
          The materials on this website are provided on an ‘as is’ basis. We make no warranties, expressed or implied, and hereby disclaim and negate all other warranties including, without limitation, implied warranties or conditions of merchantability, fitness for a particular purpose, or non-infringement of intellectual property or other violation of rights.
        </p>
        <p>
          Further, we do not warrant or make any representations concerning the accuracy, likely results, or reliability of the use of the materials on this website or otherwise relating to such materials or on any sites linked to this site.{' '}
          <strong>Property pricing, availability, and income limits (AMI) change frequently and without notice. You must verify all information directly with the respective property management companies.</strong>
        </p>

        <h2>
          <Num>3.</Num> Limitations of Liability
        </h2>
        <p>
          In no event shall the creators of this educational project or its suppliers be liable for any damages (including, without limitation, damages for loss of data or profit, or due to business interruption) arising out of the use or inability to use the materials on this website, even if we have been notified orally or in writing of the possibility of such damage.
        </p>

        <h2>
          <Num>4.</Num> Revisions and Errata
        </h2>
        <p>
          The materials appearing on this website could include technical, typographical, or photographic errors. We do not warrant that any of the materials on the website are accurate, complete, or current. We may make changes to the materials contained on the website at any time without notice.
        </p>

        <h2>
          <Num>5.</Num> Links
        </h2>
        <p>
          We have not reviewed all of the sites linked to this website and are not responsible for the contents of any such linked site. The inclusion of any link does not imply endorsement by us of the site. Use of any such linked website is at the user’s own risk.
        </p>
      </div>
    </ContentPage>
  )
}
