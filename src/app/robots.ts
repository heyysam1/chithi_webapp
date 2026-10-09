import type { MetadataRoute } from "next";
import { env } from "@/lib/env";

export default function robots(): MetadataRoute.Robots {
  const appUrl = env.NEXT_PUBLIC_APP_URL;

  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/feed", "/bottle", "/about"],
        disallow: ["/inbox/", "/api/", "/profile", "/recover", "/admin"],
      },
    ],
    sitemap: `${appUrl}/sitemap.xml`,
  };
}
