import type { Metadata } from "next";
import "./globals.css";
import "./vinted.css";

const siteUrl = "https://dhuroje.pages.dev";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Dhuroje — Mos e hidh. Dhuroje.",
  description:
    "Dhuro gjërat që nuk i përdor dhe gjej falas gjëra që të nevojiten. Dhuroje lidh njerëzit dhe komunitetet përmes dhurimit.",
  openGraph: {
    type: "website",
    url: siteUrl,
    siteName: "Dhuroje",
    title: "Dhuroje — Mos e hidh. Dhuroje.",
    description:
      "Ajo që s’të duhet ty, i duhet dikujt tjetër.",
    images: [
      {
        url: "/dhuroje-social-preview.svg",
        width: 1200,
        height: 630,
        alt: "Dhuroje — Ajo që s’të duhet ty, i duhet dikujt tjetër.",
      },
    ],
    locale: "sq_XK",
  },
  twitter: {
    card: "summary_large_image",
    title: "Dhuroje — Mos e hidh. Dhuroje.",
    description:
      "Ajo që s’të duhet ty, i duhet dikujt tjetër.",
    images: ["/dhuroje-social-preview.svg"],
  },
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="sq">
      <body>{children}</body>
    </html>
  );
}
