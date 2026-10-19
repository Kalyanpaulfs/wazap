import { redirect } from "next/navigation";

// UX-1 step 5: Performance was merged into /results (Overview tab). Keep this
// route working for old links/bookmarks by redirecting straight there.
export default function PerformancePage() {
  redirect("/results");
}
