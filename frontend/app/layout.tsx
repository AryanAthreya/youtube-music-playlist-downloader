import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "YT Downloader — Local YouTube Video & Playlist Downloader",
  description:
    "Download YouTube videos, audio, and playlists in your preferred quality. Runs locally via yt-dlp — no tracking, no cloud, no limits.",
  keywords: ["youtube downloader", "yt-dlp", "playlist downloader", "audio extractor"],
  robots: "noindex, nofollow", // Local tool — don't index
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.variable} font-sans antialiased`}>{children}</body>
    </html>
  );
}
