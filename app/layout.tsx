import type { Metadata, Viewport } from "next";
import { siteDescription, siteTitle, siteUrl } from "@/lib/site";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: siteTitle,
  description: siteDescription,
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: siteTitle,
    description: siteDescription,
    url: "/",
    siteName: "MAGI SYSTEM",
    type: "website",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "MAGI SYSTEM — 三つの知性が、一つの結論へ",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: siteTitle,
    description: siteDescription,
    images: ["/og-image.png"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const basePath = process.env.NEXT_PUBLIC_MAGI_BASE_PATH || "";

  return (
    <html lang="ja">
      <head>
        <style>{`
          @font-face {
            font-family: "TsukuhouShogoMin";
            src: url("${basePath}/fonts/TsukuhouShogoMin.woff2") format("woff2");
            font-weight: 900;
            font-style: normal;
            font-display: swap;
          }
          @font-face {
            font-family: "MAGI Reference Labels";
            src: url("${basePath}/fonts/MagiReferenceLabels.woff") format("woff");
            font-weight: 900;
            font-style: normal;
            font-display: swap;
          }
        `}</style>
      </head>
      <body>{children}</body>
    </html>
  );
}
