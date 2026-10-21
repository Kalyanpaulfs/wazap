// Shared skeleton shown while any workspace page loads: sits in the same
// frame (gutter, max width) as real pages so nothing shifts when content lands.
export default function WorkspaceLoading() {
  return (
    <div className="wp-skel-page" role="status" aria-busy="true" aria-label="Loading">
      <div className="wp-skel h-8 w-56 max-w-full" />
      <div className="wp-skel mt-3 h-4 w-96 max-w-full" />
      <div className="mt-8 grid gap-5 sm:grid-cols-3">
        {[1, 2, 3].map(i => <div key={i} className="wp-skel h-28 !rounded-2xl" />)}
      </div>
      <div className="wp-skel mt-6 h-64 !rounded-2xl" />
      <span className="sr-only">Loading…</span>
    </div>
  );
}
