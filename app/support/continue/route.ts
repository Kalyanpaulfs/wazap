import { NextResponse } from "next/server";
import { verifyContinueToken, createSupportTokenFor, SUPPORT_COOKIE, supportCookieOptions } from "@/lib/support-session";

export const runtime = "nodejs";

// Admin replies to a chat -> we email the customer a "Continue the chat"
// button linking here with a signed token (lib/support-session.ts
// createContinueToken/verifyContinueToken). This route verifies the token,
// re-establishes the visitor's support-ownership cookie for that
// conversation's visitorId, and redirects into /support so the widget picks
// the conversation back up.
//
// Contract with the chat widget (app/components/ChatWidget.tsx, owned by
// Agent B): the widget keeps its own visitorId in
// localStorage["wazap_support_visitor_id"] and reads it on load. This route
// cannot write to that localStorage key server-side, so instead it redirects
// to `/support?chat=open&visitor=<visitorId>` - the /support page (or the
// widget, on mount) should read the `visitor` query param and, if present,
// overwrite localStorage["wazap_support_visitor_id"] with it before opening
// the chat, so the restored cookie and the widget's stored id refer to the
// same conversation. The support-ownership cookie set below is what actually
// authorizes /api/support/tickets calls for that visitorId.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("t") || "";
  const visitorId = token ? verifyContinueToken(token) : null;
  if (!visitorId) return NextResponse.redirect(new URL("/support?chat=expired", req.url));

  const response = NextResponse.redirect(new URL(`/support?chat=open&visitor=${encodeURIComponent(visitorId)}`, req.url));
  response.cookies.set(SUPPORT_COOKIE, createSupportTokenFor(visitorId), supportCookieOptions);
  return response;
}
