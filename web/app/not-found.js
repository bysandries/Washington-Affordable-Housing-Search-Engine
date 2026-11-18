import ContentPage from '@/components/ContentPage'

// Completed by the layout's title template: "Page not found — Washington
// Affordable Housing Search".
export const metadata = {
  title: 'Page not found',
}

/**
 * Unknown URLs. Built on the content-page shell, so it keeps the app bar,
 * the theme, and a way back to the search instead of a dead end.
 */
export default function NotFound() {
  return (
    // One sentence: the back link at the top is enough, so the footer keeps
    // only the sibling pages.
    <ContentPage title="Page not found" footerBack={false}>
      <div className="content-prose mt-6">
        <p>This address doesn’t match a page here. It may have moved, or a character may be missing.</p>
      </div>
    </ContentPage>
  )
}
