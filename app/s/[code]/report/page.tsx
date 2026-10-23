import ReportForm from "./ReportForm";

export const metadata = { title: "Report this link", robots: { index: false, follow: false } };

// Public "Report this link" page (TOOL-FREE-2, audit item 4e) - reachable
// from the link-shortener tool page's FAQ and from the disabled-link page
// (app/s/unavailable/page.tsx). No sign-in needed.
export default async function ReportShortUrlPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <ReportForm code={code} />;
}
