import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getUserWA } from "@/lib/wa-manager";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }
  const userId = (session.user as any).id as string;
  const wa = getUserWA(userId);

  // Trigger connection attempt for THIS user (no-op if already connected/connecting)
  wa.connect().catch(console.error);

  let unsub: (() => void) | null = null;
  let pingInterval: NodeJS.Timeout | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const enc = new TextEncoder();

      const send = (event: string, data: string) => {
        try {
          controller.enqueue(enc.encode(`event: ${event}\ndata: ${data}\n\n`));
        } catch {
          // Client disconnected — will be cleaned up by cancel()
        }
      };

      unsub = wa.subscribe(send);

      // Keep-alive ping every 15s so the connection doesn't time out
      pingInterval = setInterval(() => {
        try {
          controller.enqueue(enc.encode(": ping\n\n"));
        } catch {
          if (pingInterval) clearInterval(pingInterval);
        }
      }, 15000);
    },
    cancel() {
      if (unsub) unsub();
      if (pingInterval) clearInterval(pingInterval);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no", // disable nginx buffering so events arrive immediately
    },
  });
}
