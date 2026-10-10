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
  "checker": {
    "title": "Clean a list of international phone numbers",
    "steps": [
      "Paste one number per line, including its international country code. Spaces, brackets, plus signs and dashes are cleaned.",
      "Validate the list and review the valid and invalid format groups. Correct malformed entries before copying links.",
      "Copy valid wa.me links and verify the intended contacts separately. A valid format does not establish WhatsApp registration or permission to contact a person."
    ],
    "note": "Example: +44 7700 900123 becomes 447700900123. Letters or too few digits are marked invalid. Your account allowance is shown above the input.",
    "related": [
      "link",
      "bulk"
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
      "follow-up",
      "rotator"
    ]
  },
  "vcard": {
    "title": "Create a contact card and WhatsApp QR",
    "steps": [
      "Enter your name, company, job title and contact information. Choose the country code and check the phone number.",
      "Preview the card and QR code. Add only details you intend to share publicly; a photo is optional.",
      "Download the .vcf contact file or QR image. Open the contact file on a phone and scan the printed QR before distributing it."
    ],
    "note": "The .vcf file saves contact details; the QR opens a WhatsApp conversation. They serve different purposes. Keep a clear margin around the QR and verify its readability at the final print size.",
    "related": [
      "qr",
      "link"
    ]
  },
  "linktree": {
    "title": "Let visitors choose a WhatsApp contact",
    "steps": [
      "Sign in, choose a page URL and add a title and short explanation of who the page is for.",
      "Label each number by person, department or language. Use the selected country code for the numbers you enter.",
      "Publish the page and check each destination. Share the page URL where visitors need to choose the right contact."
    ],
    "note": "Example: Sales and Support can be separate choices on one page. Visitors choose a destination themselves. If everyone handles the same enquiry and you want alternating handoffs, use the link rotator instead.",
    "related": [
      "rotator",
      "shortlink"
    ]
  },
  "bulk": {
    "title": "Prepare a consent-based contact queue",
    "steps": [
      "Paste or import a CSV/TXT list of contacts who agreed to the relevant communication. Use an international number in the final column.",
      "Review the parsed contacts, malformed entries and personalized message. Remove people who opted out before continuing.",
      "Open one prepared chat at a time, review it in WhatsApp and choose whether to send. An opened chat is not a delivery confirmation."
    ],
    "note": "Example row: Example customer,447700900123. Import and preparation are distinct from sending. This queue does not automatically message contacts or give permission to contact an imported list.",
    "related": [
      "templates",
      "checker",
      "follow-up"
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
      "vcard",
      "link"
    ]
  },
  "transcript": {
    "title": "Turn a WhatsApp export into a readable transcript",
    "steps": [
      "Export the chat from WhatsApp without media and save the .txt file. Menu wording varies by device.",
      "Upload or paste the text, parse it and choose your name to align the message bubbles. Review participant names and message counts.",
      "Use Print / Save PDF to open the browser print dialog. Choose Save as PDF where available and review the result before sharing it."
    ],
    "note": "Message parsing happens in your browser. The tool does not recover deleted messages or missing media. Treat the transcript as a readable copy of the supplied text, not proof that the export is complete or independently authenticated.",
    "related": [
      "chat-insights",
      "formatter"
    ]
  },
  "templates": {
    "title": "Personalize a WhatsApp message template",
    "steps": [
      "Choose a category that matches the conversation, such as sales follow-up or customer support.",
      "Fill in the contact name, your name and company. Review any remaining placeholders and replace factual details before copying.",
      "Paste the draft into WhatsApp, check the recipient and send only when the communication is appropriate and permitted."
    ],
    "note": "These are copy-and-paste drafts, not Meta-approved WhatsApp Business Platform templates. Do not promise a resolution, discount or response time unless your business can deliver it.",
    "related": [
      "reply-generator",
      "formatter",
      "message-scheduler"
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
  "catalog": {
    "title": "Publish a WhatsApp catalog and enquiry page",
    "steps": [
      "Sign in, name the catalog and choose its URL and WhatsApp destination.",
      "Add products or services with clear names, price text and descriptions. Review what is included and avoid ambiguous prices.",
      "Publish and inspect the public page on a phone. Check the prepared order message and follow up on genuine customer enquiries."
    ],
    "note": "An order button prepares a WhatsApp enquiry. It is not a completed payment, confirmed delivery or collected sale. Keep catalog prices and availability current and confirm the customer’s requirements before accepting an order.",
    "related": [
      "follow-up",
      "templates",
      "shortlink"
    ]
  },
  "follow-up": {
    "title": "Keep the next sales action visible",
    "steps": [
      "Sign in and add a lead with the contact details, source and campaign you actually know.",
      "Set an owner, status, estimated value and next follow-up date. Review the due queue before starting conversations.",
      "Record the outcome and update the next action. Mark a deal won only when your business has evidence of that outcome."
    ],
    "note": "Estimated pipeline value is not collected revenue. A campaign click is not automatically a qualified lead. Use notes and activity history to keep attribution and follow-up decisions understandable.",
    "related": [
      "ad-builder",
      "message-scheduler",
      "templates"
    ]
  },
  "chat-insights": {
    "title": "Analyze a WhatsApp text export privately",
    "steps": [
      "Export a chat without media, then paste the .txt content or choose the file.",
      "Choose the export’s date order, analyze the chat and check the recognized message count and participants.",
      "Review message share, word totals and the busiest hour. Compare the results with the supplied export before using them in a report."
    ],
    "note": "iPhone bracketed timestamps and Android dash-separated timestamps are supported. Multiline message text is included. Activity counts describe the supplied text, not response quality, customer satisfaction or revenue.",
    "related": [
      "transcript",
      "follow-up"
    ]
  },
  "reply-generator": {
    "title": "Prepare a customer reply for review",
    "steps": [
      "Paste the customer’s question, state what the reply should help with and choose a tone.",
      "Optionally add the customer’s name, generate the draft and read it before copying.",
      "Replace generic wording with accurate details, check any promises and paste it into the correct conversation."
    ],
    "note": "This tool assembles a draft in your browser. It does not look up product facts, resolve a support issue or send a message. Review the suggested wording and verify details yourself.",
    "related": [
      "templates",
      "formatter",
      "follow-up"
    ]
  },
  "message-scheduler": {
    "title": "Create a WhatsApp reminder you control",
    "steps": [
      "Enter the full international recipient number and prepare your message.",
      "Choose a future date and time in your device’s local time zone. Download the .ics calendar reminder.",
      "Import the reminder into your calendar and enable its notifications. At the chosen time, open the prepared chat, review and send manually."
    ],
    "note": "The download contains the message and destination, so keep it private. Wazap does not auto-send or guarantee that your calendar will display a notification. Calendar applications control import and reminders.",
    "related": [
      "templates",
      "follow-up",
      "link"
    ]
  }
};
