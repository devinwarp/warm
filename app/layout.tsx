import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Dial",
  description: "Paste a URL. Talk to the business.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
