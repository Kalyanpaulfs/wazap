// Per-tool SEO data: the name, href and SoftwareApplication descriptor used to
// build structured data. Powers <ToolSeo/> at the bottom of each tool.
export interface ToolSeoData {
  name: string;
  href: string;
  appDesc: string;
}

export const TOOL_SEO: Record<string, ToolSeoData> = {
  widget: {
    name: "WhatsApp Widget Generator", href: "/tools/widget",
    appDesc: "Prepare an embeddable floating WhatsApp click-to-chat button for your website.",
  },
  "ad-builder": {
    name: "Click-to-WhatsApp Ad Builder", href: "/tools/ad-builder",
    appDesc: "Create UTM-tracked WhatsApp links for Facebook and Google ads with click analytics.",
  },
  rotator: {
    name: "WhatsApp Link Rotator", href: "/tools/rotator",
    appDesc: "One trackable link that rotates click-to-chat handoffs across configured WhatsApp team numbers.",
  },
  formatter: {
    name: "WhatsApp Text Formatter", href: "/tools/formatter",
    appDesc: "Format WhatsApp messages with bold, italic, strikethrough and monospace.",
  },
  qr: {
    name: "WhatsApp QR Code Generator", href: "/qr",
    appDesc: "Create a custom WhatsApp QR code for any number, with a pre-filled message.",
  },
  link: {
    name: "WhatsApp Click-to-Chat Link Builder", href: "/tools/link",
    appDesc: "Turn any number into a wa.me link with a pre-filled message, plus a ready-made button.",
  },
  shortlink: {
    name: "WhatsApp Branded Short Links", href: "/tools/shortlink",
    appDesc: "Branded short links that open a WhatsApp chat, with live click analytics.",
  },
  "link-shortener": {
    name: "Link Shortener", href: "/tools/link-shortener",
    appDesc: "Shorten any website link, with a QR code and click counts. Free and unlimited.",
  },
};
