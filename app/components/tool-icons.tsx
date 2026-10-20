import { Users, MessageCircle, Fingerprint, Megaphone, QrCode, Globe2, type LucideIcon } from "lucide-react";
import type { ToolIconKey } from "@/lib/tool-catalog";

// Maps lib/tool-catalog.ts's string iconKey to an actual lucide icon -
// kept out of the catalog itself so that file stays server-safe (no React
// components). Add a mapping here for every new ToolIconKey.
export const TOOL_ICONS: Record<ToolIconKey, LucideIcon> = {
  users: Users,
  "message-circle": MessageCircle,
  fingerprint: Fingerprint,
  megaphone: Megaphone,
  "qr-code": QrCode,
  globe: Globe2,
};
