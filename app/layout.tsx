import type { Metadata } from "next";
import Link from "next/link";
import ConvexClientProvider from "@/components/ConvexClientProvider";
import Nav from "@/components/Nav";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "LendLoop — Borrow what you need",
    template: "%s · LendLoop",
  },
  description:
    "Borrow what you need. Lend what you don't. A neighborhood tool-lending board that brings useful things a little closer.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <ConvexClientProvider>
          <a className="skip-link" href="#main-content">
            Skip to content
          </a>
          <Nav />
          <main id="main-content">{children}</main>
          <footer className="site-footer">
            <Link href="/" className="footer-brand">
              LendLoop.
            </Link>
            <p>Good tools. Better neighbors.</p>
            <span>A little less buying. A lot more sharing.</span>
          </footer>
        </ConvexClientProvider>
      </body>
    </html>
  );
}
