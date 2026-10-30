import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";

const font = Plus_Jakarta_Sans({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: {
    default: "Copiloto ESG",
    template: "%s | Copiloto ESG",
  },
  description: "Transforme ideias em iniciativas ESG acompanháveis.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" className={font.className}>
      <body>{children}</body>
    </html>
  );
}
