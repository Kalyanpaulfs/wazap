export type GrowthArticle = { category: string; slug: string; reviewedAt?: string; title: string; description: string; sections: { heading: string; paragraphs: string[] }[]; related: string[]; sources: { label: string; url: string }[] };
export const growthArticles: GrowthArticle[] = [
  {
    "category": "solutions",
    "slug": "real-estate",
    "title": "WhatsApp Lead Routing for Real Estate Teams",
    "description": "Give property enquiries one WhatsApp entry point, distribute handoffs across agents, and measure the path from campaign to qualified viewing.",
    "sections": [
      {
        "heading": "One public number link for your property campaigns",
        "paragraphs": [
          "A listing, property brochure or social advertisement can send interested buyers to one routing link. Wazap rotates handoffs across the WhatsApp numbers you configure, so you can share a common entry point rather than maintain separate links for every agent.",
          "Use separate rotators for materially different teams, such as commercial leasing and residential sales. Keep the destination list limited to agents who can handle that campaign. Rotation does not check calendars, languages, property knowledge or whether an agent is online."
        ]
      },
      {
        "heading": "Set up an accountable enquiry workflow",
        "paragraphs": [
          "Start with one campaign and two or three agents who can handle that property type. In the creation form, choose their country code and enter each number without repeating it. For teams across countries, edit the saved number list with full international numbers, one per line. Add an optional predefined enquiry message; the visitor can change it and chooses whether to send it.",
          "Record a qualified viewing, appointment or deal in your CRM as a separate outcome. A routing event only shows a handoff attempt. It does not prove that a WhatsApp message was sent, that the contact was unique, or that an agent replied."
        ]
      },
      {
        "heading": "Example: a two-agent viewing campaign",
        "paragraphs": [
          "Name a router “Residential viewings” and add the two agents responsible for that campaign. Use an opening message such as “Hi, I’d like to arrange a viewing for the property in this campaign.” Copy the generated link to the campaign landing page or create a QR code for the brochure. This is an example workflow, not a customer result.",
          "Before sharing it, use a dedicated test link to check the destination and prepared message on a phone and desktop. These test handoffs count towards the account allowance. In a quiet sequential run, handoffs take turns; concurrent requests may not produce exact ordering.",
          "Agree who covers each destination and update the saved router when an agent is unavailable. A fallback number supports the routing recovery path; it is not an automatic check of whether an agent answers. Agents should record received enquiries, viewing requests and outcomes in their CRM."
        ]
      },
      {
        "heading": "Use a real estate scorecard",
        "paragraphs": [
          "Review campaign visits, routed handoffs, confirmed enquiries, qualified viewings and attributable commissions separately. Compare the share of handoffs reaching each agent with the share of confirmed enquiries and completed appointments.",
          "Measure response time from the actual received message using your operational process. If routing looks balanced but appointments are concentrated with one agent, review agent coverage, qualifications and follow-up before buying more traffic."
        ]
      },
      {
        "heading": "Run a small pilot before expanding",
        "paragraphs": [
          "Use your first 25 routed handoffs per account to validate the setup. The allowance spans all your rotators and does not reset daily. Public paid routing plans start at Solo $9/month; Growth is $19/month and Agency is $49/month.",
          "The 3-day Solo trial is a separate product entitlement. Simple link routing records a handoff attempt only; it does not read the content of the resulting WhatsApp messages."
        ]
      }
    ],
    "related": [
      "/tools/rotator",
      "/guides/one-whatsapp-link-multiple-numbers",
      "/guides/whatsapp-campaign-tracking"
    ],
    "sources": [],
    "reviewedAt": "2026-10-10"
  },
  {
    "category": "solutions",
    "slug": "agencies",
    "title": "WhatsApp Lead Routing for Marketing Agencies",
    "description": "Build a trackable click-to-WhatsApp handoff for client campaigns and report qualified outcomes separately from routing activity.",
    "sections": [
      {
        "heading": "A campaign link your client can keep using",
        "paragraphs": [
          "Create a routing link for an agreed destination team, then use it in the client’s landing page, QR material or campaign. Keep a clear record of the client, campaign, account owner and numbers responsible for enquiries.",
          "Changing the configured destination list can avoid replacing the public campaign URL. Test the updated list before publishing it and retain the previous configuration in your own change log."
        ]
      },
      {
        "heading": "Separate campaigns that need different handling",
        "paragraphs": [
          "Give different sales teams or offers distinct links when they need different destinations or reporting. Agree with the client who owns the Wazap account and which staff are allowed to change routing.",
          "Do not put access tokens, sensitive client information or personal customer details in UTM tags. Use stable campaign names in your web acquisition links. The router does not automatically turn URL tags into a received WhatsApp enquiry record."
        ]
      },
      {
        "heading": "Report performance the client can act on",
        "paragraphs": [
          "Show landing visits and routed handoffs as acquisition activity. Ask the client to reconcile received enquiries, qualified appointments and sales with their CRM or connected messaging workflow. These are separate stages, and the counts will not automatically match.",
          "A repeated click, preview or abandoned WhatsApp handoff can inflate routing totals. Your report should say which events were counted and which outcomes were confirmed. Optimize for cost per qualified appointment and retained paying client, rather than a high click total."
        ]
      },
      {
        "heading": "Choose a plan for the workflow you manage",
        "paragraphs": [
          "The public plans are Solo $9/month, Growth $19/month and Agency $49/month. Agency includes up to 25 rotators and a shared workspace for up to five members; confirm current details on the pricing page before proposing a package.",
          "The free router allowance is 25 handoffs per account across all rotators, for the lifetime of the allowance. The separate 3-day workspace trial does not grant unlimited router handoffs. Never promise a client autonomous message sending or delivery confirmation from a simple routing link."
        ]
      }
    ],
    "related": [
      "/guides/whatsapp-campaign-tracking",
      "/compare/linkly",
      "/compare/wasepje"
    ],
    "sources": []
  },
  {
    "category": "guides",
    "slug": "one-whatsapp-link-multiple-numbers",
    "title": "How to Use One WhatsApp Link for Multiple Numbers",
    "description": "Set up an automatically rotating WhatsApp link across your team, then test the handoff before publishing.",
    "sections": [
      {
        "heading": "Decide when rotation fits",
        "paragraphs": [
          "A direct wa.me link has one destination number. To offer several numbers, you need a router that rotates between configured destinations. Wazap’s Link Rotator chooses a configured destination for each handoff.",
          "Use rotation when the same enquiry can be handled by any member of a destination team — for example, a sales or support group where any available member can respond. A router cannot determine specialist suitability or real-time availability."
        ]
      },
      {
        "heading": "Create and test the shared link",
        "paragraphs": [
          "Sign in to Wazap and open the Link Rotator. Name the team, choose a country code and add at least two numbers without repeating that code. Add an optional predefined WhatsApp message, then create the router. For destinations in different countries, edit the saved number list with full international numbers. Copy the generated public URL rather than guessing a route or sending the dashboard address.",
          "Open a dedicated test link from a phone and desktop browser. Check the destination number and, if configured, the prepared message before sending anything. The visitor can edit the text and decides whether to send it. Repeat carefully across the destination list: test handoffs consume the account’s free routing allowance, and no message needs to be sent to inspect the handoff."
        ]
      },
      {
        "heading": "Publish it in the right places",
        "paragraphs": [
          "Use the verified public URL on the campaign landing page, business profile or printed QR code. Keep one person responsible for the destination list and test it after an agent leaves or a number changes.",
          "Do not use an automatic rotator for emergencies or enquiries that require a specific named adviser — route those through a direct link instead."
        ]
      },
      {
        "heading": "Know what the activity means",
        "paragraphs": [
          "A routed handoff is an attempt to open a destination in WhatsApp, not a confirmed sent message or customer response. Keep messaging and sales outcomes separate.",
          "Wazap provides 25 routed handoffs free per account across all rotators. Paid routing starts at $9/month. Simple routing does not require connecting a WhatsApp Business API channel."
        ]
      }
    ],
    "related": [
      "/tools/rotator",
      "/solutions/real-estate",
      "/guides/whatsapp-round-robin-routing"
    ],
    "sources": [],
    "reviewedAt": "2026-10-10"
  },
  {
    "category": "guides",
    "slug": "whatsapp-round-robin-routing",
    "title": "WhatsApp Round-Robin Routing: How It Works and What to Check",
    "description": "Understand rotation across configured WhatsApp numbers, its limits, and a practical validation checklist for your sales team.",
    "sections": [
      {
        "heading": "Rotation distributes handoff attempts",
        "paragraphs": [
          "A round-robin router cycles through a list of destination numbers. For example, sequential handoffs can visit Agent A, then B, then C before returning to A. This is useful when the team handles the same type of enquiry.",
          "Distribution of handoff attempts does not guarantee equal sales, equal workloads or equal received messages. Customers may abandon the handoff, click more than once, or choose not to send the prefilled message."
        ]
      },
      {
        "heading": "Configured is different from available",
        "paragraphs": [
          "Wazap’s link router selects from configured numbers. It does not inspect a WhatsApp agent’s online status, calendar or capacity. If an agent is unavailable, the team needs an operational process to update the destination list.",
          "Treat simultaneous traffic as a separate validation case. The current router does not offer a guarantee of strict ordering under concurrent requests. Test your actual peak traffic pattern before relying on exact equality in every short interval."
        ]
      },
      {
        "heading": "Validate a small controlled run",
        "paragraphs": [
          "Prepare a dedicated test rotator with numbers you control. Verify each number’s country code, note the initial destination order, and open the link sequentially without sending messages. Record the observed destinations rather than assuming the expected result.",
          "Next, check representative phone and desktop handoffs. Review the reported event count and your quota. Avoid testing a live customer link repeatedly because that changes its activity totals and can consume its allowance.",
          "Add an optional predefined message and verify that the same text is prepared for each destination. Edit the saved router to change its numbers, message or fallback without replacing the public URL. A fallback supports technical recovery; it does not detect whether an agent reads or replies to a message."
        ]
      },
      {
        "heading": "Use rotation inside a wider sales process",
        "paragraphs": [
          "Assign coverage hours, agree response expectations and record confirmed enquiries in a CRM. Use appointment and sales outcomes to judge the workflow.",
          "The free allowance is 25 handoffs per account, not per link or per day. The 3-day Solo trial is separate. Paid routing plans start at $9/month; see pricing for current limits."
        ]
      }
    ],
    "related": [
      "/tools/rotator",
      "/guides/one-whatsapp-link-multiple-numbers",
      "/guides/whatsapp-campaign-tracking"
    ],
    "sources": [],
    "reviewedAt": "2026-10-10"
  },
  {
    "category": "guides",
    "slug": "whatsapp-campaign-tracking",
    "title": "How to Track WhatsApp Campaigns Without Confusing Clicks with Leads",
    "description": "Build a practical measurement path from campaign visit to routed handoff, received enquiry, qualified appointment and sale.",
    "sections": [
      {
        "heading": "Give every campaign a stable identity",
        "paragraphs": [
          "Use a consistent source, medium and campaign naming convention on links that lead to your Wazap landing or signup journey. Wazap’s Ad Builder helps create campaign-tagged links. Keep names readable and avoid personal information in URL parameters.",
          "For a router campaign, use its optional predefined message to give the agent context, such as “I’m enquiring about the spring property campaign.” The same prepared text applies to each destination, but the visitor can edit or omit it. UTM tags on a web link do not automatically become a confirmed customer record inside a WhatsApp conversation."
        ]
      },
      {
        "heading": "Define the funnel before buying traffic",
        "paragraphs": [
          "Measure five stages separately: campaign visit, routed handoff, confirmed received enquiry, qualified appointment and sale. Use your CRM or a verified connected messaging workflow for the later stages.",
          "A routing count can include repeated or abandoned clicks. Referral labels are observed sources, not proof of unique people, a search ranking or incremental advertising impact. Document the exact counting rule in each report."
        ]
      },
      {
        "heading": "Test source persistence with one controlled journey",
        "paragraphs": [
          "Open a tagged campaign link in a new browser session, continue to signup and check the recorded acquisition source in the authorized reporting view. Test each signup method separately; email signup and Google signup may not preserve attribution in the same way.",
          "Then create a dedicated test routing link and confirm its destination and reported handoff. Do not label a purchase or subscription as confirmed until the payment provider evidence supports it. Redact personal data from any shared test record."
        ]
      },
      {
        "heading": "Make decisions from qualified outcomes",
        "paragraphs": [
          "Review cost per qualified appointment, activation rate, confirmed paid conversion and retained subscribers by source. Pause spend if acquisition produces handoffs without confirmed useful outcomes, or if setup and response issues prevent activation.",
          "For an initial Wazap growth experiment, define activation as creation of a rotator plus genuine non-test handoff activity. Track retained paid accounts separately. Use click counts as diagnostic information rather than the main commercial goal."
        ]
      }
    ],
    "related": [
      "/tools/rotator",
      "/solutions/agencies",
      "/solutions/real-estate",
      "/tools/ad-builder"
    ],
    "sources": [],
    "reviewedAt": "2026-10-10"
  },
  {
    "category": "compare",
    "slug": "linkly",
    "title": "Wazap vs Linkly for WhatsApp Lead Routing",
    "description": "Compare Wazap’s focused WhatsApp workflow with Linkly’s link-management approach, using vendor-documented routing behavior.",
    "sections": [
      {
        "heading": "Match the routing behavior to your requirement",
        "paragraphs": [
          "Linkly documents a WhatsApp rotator that distributes traffic proportionally and randomly, rather than strict sequential round robin. Wazap’s router cycles through configured WhatsApp numbers for sequential handoffs. Neither description alone proves equal completed conversations.",
          "Wazap does not guarantee exact ordering under concurrent requests or check agent availability. If exact distribution matters, run a controlled test at your expected traffic level before selecting either product."
        ]
      },
      {
        "heading": "Compare the workflow around the link",
        "paragraphs": [
          "Wazap combines a focused router with WhatsApp links, QR codes and optional workspace workflows. Simple routing does not require a connected WhatsApp Business API channel and does not read messages sent in WhatsApp.",
          "Linkly positions its product as a broader link-management service. Review its current documentation and plan page for the link features you need, especially branding, reporting, limits and routing controls."
        ]
      },
      {
        "heading": "Compare total cost using the same assumptions",
        "paragraphs": [
          "Wazap’s public monthly plans are Solo $9, Growth $19 and Agency $49. The free router allowance is 25 lifetime handoffs per account. The separate 3-day Solo trial raises this to 100 routed leads while it lasts; it does not make routing unlimited.",
          "Calculate the cost for your actual number of links, destinations, traffic and collaborators. This page does not reproduce a changing Linkly price table; open the vendor’s current pricing before deciding."
        ]
      },
      {
        "heading": "Use a short evaluation checklist",
        "paragraphs": [
          "Test phone and desktop handoffs, the expected distribution method, destination changes, campaign reporting and what happens at your traffic limit. Confirm account ownership and who can edit a client’s links.",
          "Choose based on the tested workflow and confirmed outcomes. Wazap is an independent product; this comparison does not imply a partnership with or endorsement by Linkly. Vendor facts were reviewed on 7 October 2026."
        ]
      }
    ],
    "related": [
      "/guides/whatsapp-round-robin-routing",
      "/solutions/agencies",
      "/compare/wasepje"
    ],
    "sources": [
      {
        "label": "Linkly WhatsApp rotator documentation",
        "url": "https://linkly.so/support/whatsapp-rotator"
      },
      {
        "label": "Linkly pricing",
        "url": "https://linkly.so/pricing"
      }
    ]
  },
  {
    "category": "compare",
    "slug": "wasepje",
    "title": "Wazap vs WasepJe for WhatsApp Routing",
    "description": "Compare free routing allowances, paid plans and the workflow you need before choosing a WhatsApp link rotator.",
    "sections": [
      {
        "heading": "Start with the free allowance",
        "paragraphs": [
          "WasepJe advertises a free tier with unlimited phone numbers, number weightage and a link click count. Wazap’s free router allowance is 25 routed handoffs per account across all rotators, for the lifetime of the allowance. If unrestricted free routing is your main criterion, this is a material difference.",
          "Verify current vendor terms before selecting a plan. A generous routing allowance does not establish how many enquiries are received or which workflow produces more qualified appointments."
        ]
      },
      {
        "heading": "Compare paid plans and the operational workflow",
        "paragraphs": [
          "At review, WasepJe advertised Pro at $7.50 per month when billed annually at $90. Wazap’s public monthly plans are Solo $9, Growth $19 and Agency $49. Compare billing intervals and cancellation terms rather than treating these headline prices as identical offers.",
          "For Wazap, evaluate the router alongside links, QR codes and optional workspace workflows. Agency includes up to 25 rotators and a shared workspace for up to five members. Choose additional features only when you need them."
        ]
      },
      {
        "heading": "Test behavior rather than assuming equivalence",
        "paragraphs": [
          "Confirm destination editing, distribution controls, mobile and desktop handoffs, reporting and limits on the plan you are evaluating. Record observed results from a dedicated test link.",
          "Wazap rotates sequential handoffs across configured numbers, does not check agent availability and does not promise strict ordering under concurrent requests. Its routing events are handoffs, not confirmed messages or unique leads."
        ]
      },
      {
        "heading": "Choose on evidence from your team",
        "paragraphs": [
          "Use a small campaign pilot to compare setup time, confirmed enquiries, appointment quality and the effort required to keep numbers current. A cheaper plan can be right when the routing workflow alone meets your needs.",
          "This is an independent comparison, not a claim that Wazap is better for every business. WasepJe’s public offer was reviewed on 7 October 2026 and can change; verify it on the vendor site."
        ]
      }
    ],
    "related": [
      "/compare/linkly",
      "/guides/whatsapp-campaign-tracking",
      "/solutions/agencies"
    ],
    "sources": [
      {
        "label": "WasepJe official site and plans",
        "url": "https://wasepje.com/"
      }
    ]
  }
];
export const growthPath = (article: GrowthArticle) => `/${article.category}/${article.slug}`;
