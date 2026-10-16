export type ToolGuide = { title: string; steps: string[]; note: string; related: string[] };

export const TOOL_GUIDES: Record<string, ToolGuide> = {
  "link": {
    "title": "How to build a WhatsApp link",
    "steps": [
      "Choose the country code, then enter the rest of the number without its national leading zero. Do not enter the country code twice.",
      "Add a short optional message. Review the generated wa.me URL, then copy the link, HTML button or Markdown version.",
      "Test the destination on a phone and a computer before sharing it. Opening WhatsApp prepares a conversation; the visitor still chooses whether to send."
    ],
    "note": "Example: choose +44 and enter 7700900123 to produce https://wa.me/447700900123. This is an illustrative UK number, not a business contact.",
    "related": [
      "qr",
      "widget",
      "rotator"
    ]
  },
  "widget": {
    "title": "Add a WhatsApp button to your website",
    "steps": [
      "Choose your country code and phone number, then set a greeting, button colour, size and corner position.",
      "Preview the button and copy the HTML. Add it to a custom HTML area or your website template before the closing body tag.",
      "Check that the floating button does not cover checkout, cookie controls or navigation on a small screen. Test the WhatsApp destination before publishing."
    ],
    "note": "The generator prepares a click-to-chat button. It does not install the code for you, confirm that a chat was sent, or create an API inbox. Copy allowances depend on your account.",
    "related": [
      "link",
      "qr"
    ]
  },
  "ad-builder": {
    "title": "Build a tracked WhatsApp campaign link",
    "steps": [
      "Sign in and name the campaign so you can recognize it later. Choose the country code and destination number.",
      "Add an optional prepared message and source, medium and campaign labels. Keep personal details out of campaign labels.",
      "Create the link, copy its tracked URL and compare recorded clicks with received conversations in your own sales workflow."
    ],
    "note": "Use a descriptive campaign label such as autumn-enquiries rather than a customer name. Click totals can include repeat opens and tests; they are not confirmed messages or sales. Ad-platform destination requirements still apply.",
    "related": [
      "shortlink",
      "rotator"
    ]
  },
  "qr": {
    "title": "Check your WhatsApp QR before sharing it",
    "steps": [
      "Choose the country code and number, then optionally prepare a short message.",
      "Preview the QR and download the PNG. Use strong foreground/background contrast and leave a clear margin.",
      "Scan the final image on a phone, including at the intended print size. Check that it opens the correct number and message."
    ],
    "note": "A direct WhatsApp QR encodes a destination, not a login code. Changing the number requires a new QR image. A scan or opened chat does not prove a message was sent.",
    "related": [
      "link",
      "widget"
    ]
  },
  "shortlink": {
    "title": "Create a memorable tracked WhatsApp link",
    "steps": [
      "Sign in and add a descriptive link name, country code, number and optional message.",
      "Choose an available custom slug if you need one, or use the generated URL. Review the destination before sharing.",
      "Copy the branded link and compare recorded clicks over time. Confirm actual enquiries separately in your customer workflow."
    ],
    "note": "A tracked /w/ link differs from a direct wa.me link because Wazap records opens before the handoff. Repeat visits and test opens can affect counts. Plan allowances and slug availability apply.",
    "related": [
      "ad-builder",
      "link",
      "qr"
    ]
  },
};
