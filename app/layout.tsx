import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "Dhuroje — Mos e hidh. Dhuroje.", description: "Give away unused food and items for free in your community." };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="sq"><body>{children}</body></html>; }