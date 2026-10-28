import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Subswarm | A world of intelligence",
  description: "Explore a living pixel village of Bittensor subnets. Give real AI providers a quest and collect the results.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
