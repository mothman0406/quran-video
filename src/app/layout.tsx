import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Quran Video",
  description: "A Quran-first video caption editor",
  other: {
    google: "notranslate",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
