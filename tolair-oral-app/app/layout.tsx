import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Reveal Oral Health | Tolair",
  description:
    "Free dental practice and DSO intelligence for 200,000+ U.S. providers",
};

function Header() {
  return (
    <header className="border-b border-border">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <a href="/" className="flex items-center gap-2">
          <span className="text-xl font-bold text-text-primary">Tolair</span>
          <span className="text-sm text-text-secondary">|</span>
          <span className="text-sm text-primary font-medium">
            Reveal Oral Health
          </span>
        </a>
        <nav className="hidden sm:flex items-center gap-6">
          <a
            href="https://reveal.tolair.org"
            className="text-sm text-text-secondary hover:text-text-primary transition-colors"
          >
            Reveal Health
          </a>
          <a
            href="https://gaming.tolair.org"
            className="text-sm text-text-secondary hover:text-text-primary transition-colors"
          >
            Reveal Gaming
          </a>
          <span className="text-sm text-primary font-medium border-b-2 border-primary pb-0.5">
            Reveal Oral Health
          </span>
        </nav>
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border mt-auto">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-center sm:text-left">
            <p className="text-sm text-text-secondary">
              Powered by{" "}
              <a
                href="https://tolair.org"
                className="text-primary hover:text-primary-hover transition-colors"
              >
                Tolair
              </a>{" "}
              — The Governance OS for Healthcare
            </p>
          </div>
          <div className="flex items-center gap-6">
            <a
              href="mailto:chadbrausen@tolair.org"
              className="text-sm text-text-secondary hover:text-text-primary transition-colors"
            >
              Contact
            </a>
            <a
              href="https://tolair.org"
              className="text-sm text-text-secondary hover:text-text-primary transition-colors"
            >
              tolair.org
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${inter.className} min-h-screen flex flex-col bg-navy`}>
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
