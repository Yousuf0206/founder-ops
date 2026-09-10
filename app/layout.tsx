import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Founder Ops",
  description: "Internal operations workspace — team only.",
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
