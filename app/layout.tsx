import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Lumo-Ops",
  description: "Growth operations for your apps — research, content, leads, and campaigns.",
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
