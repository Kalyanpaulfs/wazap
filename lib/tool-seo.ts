// Per-tool SEO data: FAQs (rendered visibly + as FAQPage schema) and the
// SoftwareApplication descriptor. Powers <ToolSeo/> at the bottom of each tool.
export interface ToolSeoData {
  name: string;
  href: string;
  appDesc: string;
  faqs: { q: string; a: string }[];
}

export const TOOL_SEO: Record<string, ToolSeoData> = {
"bulk": {"name": "Consent-Based WhatsApp Bulk Queue", "href": "/tools/bulk", "appDesc": "Prepare personalized WhatsApp chats for manual review and sending.", "faqs": [{"q": "Does Wazap send the messages automatically?", "a": "No. It prepares a queue and opens chats one at a time. You review and send inside WhatsApp. Only use contacts with permission for the communication."}]},"follow-up": {"name": "WhatsApp Lead Follow-Up Tracker", "href": "/tools/follow-up", "appDesc": "Track leads, source labels, estimated values and next follow-up dates.", "faqs": [{"q": "Does a recorded lead value mean revenue was collected?", "a": "No. Estimated value and lead status are workflow records. Collected sales need separate business evidence."}]},"chat-insights": {"name": "WhatsApp Chat Insights", "href": "/tools/chat-insights", "appDesc": "Analyze message activity in an exported WhatsApp text chat in your browser.", "faqs": [{"q": "Does my chat file leave my browser?", "a": "The text is parsed in your browser. Wazap records tool-use activity for allowances; chat contents are not included in that activity request."}, {"q": "Which export date formats are supported?", "a": "Android dash-separated and iPhone bracketed timestamps are supported. Choose day/month or month/day to match the supplied export."}]},"reply-generator": {"name": "WhatsApp Customer Reply Generator", "href": "/tools/reply-generator", "appDesc": "Prepare and review a structured customer-reply draft in your browser.", "faqs": [{"q": "Is the reply sent automatically?", "a": "No. Generate a draft, review its facts and copy it yourself. Nothing is sent to the customer by this tool."}]},"message-scheduler": {"name": "WhatsApp Message Reminder", "href": "/tools/message-scheduler", "appDesc": "Download a calendar reminder containing a prepared WhatsApp message link.", "faqs": [{"q": "Will Wazap send at the scheduled time?", "a": "No. Import the calendar reminder and configure notifications in your calendar. You open the chat and send manually."}]},
  widget: {
    name: "WhatsApp Widget Generator", href: "/tools/widget",
    appDesc: "Prepare an embeddable floating WhatsApp click-to-chat button for your website.",
    faqs: [
      { q: "How do I add a WhatsApp chat button to my website?", a: "Enter your number, customise the colour, position and greeting, then copy the one line of HTML the generator gives you and paste it just before the closing </body> tag of your site. It works on WordPress, Shopify, Wix, Webflow and plain HTML." },
      { q: "Is the WhatsApp widget free?", a: "You can preview the widget and try copying it within your account allowance. Paid plans increase usage. Review the generated code and its Wazap attribution before adding it to your site." },
      { q: "Do I need the WhatsApp Business API?", a: "No. The widget uses WhatsApp's official click-to-chat links, so it works with any normal WhatsApp or WhatsApp Business number — no API approval needed." },
    ],
  },
  checker: {
    name: "WhatsApp Number Formatter", href: "/tools/checker",
    appDesc: "Clean and format up to 500 phone numbers and generate direct wa.me links.",
    faqs: [
      { q: "How do I format WhatsApp numbers in bulk?", a: "Paste phone numbers one per line, with country code, within your account allowance. The tool checks phone-number format, flags malformed entries, and generates a clickable wa.me link for every valid format. It does not confirm whether a number is registered on WhatsApp." },
      { q: "Does it confirm a number has WhatsApp?", a: "No. It validates international phone-number format and builds wa.me links in your browser; it does not query WhatsApp account registration." },
      { q: "What format should the numbers be in?", a: "Include the country code, e.g. 971501234567 or +44 7700 900123. The tool cleans spaces, dashes and brackets automatically." },
    ],
  },
  "ad-builder": {
    name: "Click-to-WhatsApp Ad Builder", href: "/tools/ad-builder",
    appDesc: "Create UTM-tracked WhatsApp links for Facebook and Google ads with click analytics.",
    faqs: [
      { q: "How do I track WhatsApp clicks from my ads?", a: "Create an ad link with your number, message and UTM tags (source, medium, campaign). Share that tracked link where the advertising platform permits it and compare recorded click activity. Received messages and sales need separate verification." },
      { q: "What are UTM parameters for?", a: "UTM tags label acquisition links by source, medium and campaign. Verify the attribution path separately; tags alone do not confirm a received WhatsApp message or a sale." },
      { q: "Can I use these links in Meta ads?", a: "Check the current destination and campaign rules of the advertising platform before using a tracked WhatsApp link. The link builder does not publish ads or certify ad approval." },
    ],
  },
  vcard: {
    name: "WhatsApp vCard + QR Generator", href: "/tools/vcard",
    appDesc: "Create a digital business card (.vcf) and a WhatsApp QR code from your details.",
    faqs: [
      { q: "How do I make a digital business card?", a: "Fill in your name, company, title, phone, email and photo, and download a .vcf contact file plus a scannable QR code that opens a WhatsApp chat with you." },
      { q: "What is a vCard?", a: "A vCard (.vcf) is the standard digital contact-card file. Anyone who opens it can save all your details to their phone in one tap." },
      { q: "Can I put the QR code on printed materials?", a: "Yes — download the QR as an image and add it to business cards, flyers, packaging or a storefront so people can scan and message you instantly." },
    ],
  },
  linktree: {
    name: "WhatsApp Linktree", href: "/tools/linktree",
    appDesc: "Build one shareable page listing multiple WhatsApp numbers for your team.",
    faqs: [
      { q: "How do I share multiple WhatsApp numbers on one link?", a: "Create a linktree page, add each team member or department with their number and label, and share the single public link. Visitors pick who to message and open a chat instantly." },
      { q: "What is a WhatsApp linktree used for?", a: "It's perfect for sales teams, multi-language support, or different departments — one branded link that routes people to the right person on WhatsApp." },
      { q: "Can I customise the page?", a: "Yes — set the title, bio and brand colour. Paid plans unlock more pages." },
    ],
  },
  rotator: {
    name: "WhatsApp Link Rotator", href: "/tools/rotator",
    appDesc: "One trackable link that rotates click-to-chat handoffs across configured WhatsApp team numbers.",
    faqs: [
      { q: "How does a WhatsApp link rotator work?", a: "Add configured team numbers and create one public link. Sequential handoffs rotate across destinations. Agent availability and exact ordering under concurrent requests are not guaranteed." },
      { q: "Why use a rotator instead of one number?", a: "Use one entry point for a team handling the same type of enquiry. Sequential handoffs take turns across the configured numbers; received messages and sales are measured separately." },
      { q: "Can I add a predefined WhatsApp message?", a: "Yes. Add an optional message when creating the router, or edit it on a saved router. The same text is prepared for each destination; the visitor can edit it and chooses whether to send it." },
      { q: "How much routing is free?", a: "The first 25 routed handoffs are free per account across all rotators. This lifetime allowance does not reset daily. Paid routing starts at $9/month; the 14-day workspace trial is separate." },
      { q: "Can I see how many clicks each agent gets?", a: "Yes. Wazap shows total routed handoff activity and the last 30 days by destination. A handoff is not proof of a sent message or a unique customer." },
    ],
  },
  transcript: {
    name: "WhatsApp Transcript Exporter", href: "/tools/transcript",
    appDesc: "Turn a WhatsApp chat export (.txt) into a clean, printable transcript or PDF.",
    faqs: [
      { q: "How do I save a WhatsApp chat as a PDF?", a: "In WhatsApp open the chat, tap the menu, choose Export Chat → Without Media, then upload or paste the .txt file here. You'll get a clean, readable transcript you can print or save as PDF." },
      { q: "Does it work with iPhone and Android exports?", a: "Yes — the parser reads both the iPhone (bracketed date) and Android (dash) export formats." },
      { q: "Is my chat data private?", a: "The transcript is built in your browser — your messages aren't stored on our servers." },
    ],
  },
  qr: {
    name: "WhatsApp QR Code Generator", href: "/qr",
    appDesc: "Create a custom WhatsApp QR code for any number, with a pre-filled message.",
    faqs: [
      { q: "How do I create a WhatsApp QR code?", a: "Enter your number and an optional pre-filled message, pick a colour, and download the QR as a PNG. Anyone who scans it opens a WhatsApp chat with you instantly — no need to save your number." },
      { q: "Where can I use the QR code?", a: "Put it on business cards, flyers, packaging, table tents, shop windows or your website so customers can scan and message you in seconds." },
      { q: "Is the QR code free?", a: "Yes — generate and download WhatsApp QR codes for free, no account required." },
      { q: "Does a WhatsApp QR code expire?", a: "The QR code generated here contains a direct click-to-chat link rather than a temporary login code. It keeps working while the encoded WhatsApp number remains available. Test it again if you change the number." },
      { q: "Can I download the WhatsApp QR code as a PNG?", a: "Yes. Preview your customized code and download it as a PNG image for your website, business card, sign, menu, packaging or other materials." },
      { q: "Does it work with WhatsApp Business?", a: "Yes. Use the full international number connected to your WhatsApp Business account. Customers who scan the code can open a chat without saving the number first." },
      { q: "How do customers scan the QR code?", a: "They can point their phone camera or QR scanner at the code and tap the link that appears. It opens the conversation in WhatsApp with your optional message ready to send." },
    ],
  },
  link: {
    name: "WhatsApp Click-to-Chat Link Builder", href: "/tools/link",
    appDesc: "Turn any number into a wa.me link with a pre-filled message, plus a ready-made button.",
    faqs: [
      { q: "How do I create a WhatsApp click-to-chat link?", a: "Enter the number and an optional pre-filled message, and the builder gives you a wa.me link that opens a WhatsApp chat instantly — plus a ready-made 'Chat on WhatsApp' button in HTML and Markdown for your website, email or bio." },
      { q: "What is a wa.me link?", a: "wa.me is WhatsApp's official click-to-chat format. It lets anyone message you without saving your number first — works on mobile and desktop." },
      { q: "Can I pre-fill the message?", a: "Yes — add any text and it appears typed and ready to send when someone opens the chat." },
    ],
  },
  templates: {
    name: "WhatsApp Message Templates", href: "/tools/templates",
    appDesc: "Ready-to-use WhatsApp message templates for sales, support, real estate and e-commerce.",
    faqs: [
      { q: "Where can I find good WhatsApp message templates?", a: "This tool has ready-to-use templates for sales outreach, follow-ups, customer support, real estate and e-commerce. Fill in the blanks (name, company), copy, and paste into WhatsApp." },
      { q: "Are the templates free?", a: "Yes — browse and copy the templates for free. Nothing is sent automatically; you paste and send them yourself." },
      { q: "Can I personalise them?", a: "Yes — enter a contact name, your name and company once and every template updates instantly with those details." },
    ],
  },
  shortlink: {
    name: "WhatsApp Branded Short Links", href: "/tools/shortlink",
    appDesc: "Branded short links that open a WhatsApp chat, with live click analytics.",
    faqs: [
      { q: "How do I make a short WhatsApp link with tracking?", a: "Create a branded link like wazap.lt/w/yourname that opens a WhatsApp chat with a pre-filled message, and see exactly how many clicks it gets — ideal for Instagram bios, ads and campaigns." },
      { q: "Why use a branded short link?", a: "It's memorable, looks professional, and — unlike a raw wa.me link — tells you how many people actually clicked, so you can measure what's working." },
      { q: "Can I choose the custom slug?", a: "Yes — pick your own /w/name slug (subject to availability) on any paid plan; try one free first." },
    ],
  },
  catalog: {
    name: "WhatsApp Catalog & Order Page", href: "/tools/catalog",
    appDesc: "A shareable catalog/order page where each item opens a WhatsApp order.",
    faqs: [
      { q: "How do I take WhatsApp orders without a website?", a: "Build a catalog page listing your products or services with prices. Each item has an 'Order on WhatsApp' button that opens a chat with a pre-filled order — perfect for small shops, restaurants and home businesses." },
      { q: "Do customers need an app to order?", a: "No — they just open your catalog link, tap an item, and it starts a WhatsApp chat with the order pre-written. They only need WhatsApp." },
      { q: "Can I track how many people view it?", a: "Yes — each catalog page counts its views so you can see how much interest it's getting." },
    ],
  },
  formatter: {
    name: "WhatsApp Text Formatter", href: "/tools/formatter",
    appDesc: "Format WhatsApp messages with bold, italic, strikethrough and monospace.",
    faqs: [
      { q: "How do I make bold or italic text in WhatsApp?", a: "Type your message, select the words, and tap Bold, Italic, Strikethrough or Monospace — the tool adds the right symbols (*bold*, _italic_, ~strike~) and shows a live preview. Copy it and paste into WhatsApp." },
      { q: "What are the WhatsApp formatting symbols?", a: "*text* for bold, _text_ for italic, ~text~ for strikethrough, and ```text``` for monospace. This tool adds them for you so you don't have to remember." },
      { q: "Does Wazap send or upload my message?", a: "Formatting and preview happen in your browser. Copying does not send the message; you paste it into WhatsApp and choose whether to send it." },
      { q: "Is the formatter free?", a: "You can edit and preview text, with one free copy in this browser. A paid Wazap plan unlocks further copies." },
      { q: "Why does my formatting not appear?", a: "Check the opening and closing symbols and avoid spaces immediately inside them. Try one style on a short phrase and review the pasted result in WhatsApp. Wazap’s preview is illustrative." },
    ],
  },
};
