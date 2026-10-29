import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Subswarm | One world. Many minds.",
  description: "Discover and use Bittensor services in one workspace, or explore them in a living pixel village. Search, create and keep your results.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
