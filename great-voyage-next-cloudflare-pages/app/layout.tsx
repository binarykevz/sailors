import type { Metadata } from "next";
import { Cinzel, IM_Fell_English, Uncial_Antiqua } from "next/font/google";
import "./globals.css";

const cinzel = Cinzel({
  subsets: ["latin"],
  variable: "--font-cinzel",
  display: "swap"
});

const fell = IM_Fell_English({
  subsets: ["latin"],
  style: ["normal", "italic"],
  variable: "--font-fell",
  display: "swap"
});

const uncial = Uncial_Antiqua({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-uncial",
  display: "swap"
});

export const metadata: Metadata = {
  title: "The Great Voyage — Expedition Journal",
  description: "An ancient sci-fi adventurer's world map and expedition journal."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${cinzel.variable} ${fell.variable} ${uncial.variable}`}>
        {children}
      </body>
    </html>
  );
}
