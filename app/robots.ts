import { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/tools/", "/qr", "/pricing"],
        disallow: ["/api/"],
      },
    ],
    sitemap: "https://wazap.lt/sitemap.xml",
    host: "https://wazap.lt",
  };
}
