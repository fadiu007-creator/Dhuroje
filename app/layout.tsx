import type { Metadata } from "next";
import "./globals.css";
import "./vinted.css";
import "./dhuroje-modern.css";

export const metadata: Metadata = {
  title: "Dhuroje — Mos e hidh. Dhuroje.",
  description: "Give away unused food and items for free in your community."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="sq"><head><link rel="preconnect" href="https://fonts.googleapis.com" /><link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" /><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@600;700;800&family=Figtree:wght@400;500;600;700&display=swap" /></head><body>{children}</body></html>;
}
