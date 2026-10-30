import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import type { ReactNode } from "react";
import { ReadPageButton } from "@/app/components/read-aloud";
import { ThemeToggle } from "@/app/components/theme-toggle";
import "./globals.css";

const font = Plus_Jakarta_Sans({ subsets: ["latin"] });

// Roda antes da primeira pintura para a página não piscar no tema errado.
const applyTheme = `(function(){var t;try{t=localStorage.getItem("theme")}catch(e){}if(t!=="light"&&t!=="dark"){t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}document.documentElement.dataset.theme=t})()`;

export const metadata: Metadata = {
  title: {
    default: "NUEVO ESG",
    template: "%s | NUEVO ESG",
  },
  description: "Transforme ideias em iniciativas ESG acompanháveis.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" className={font.className} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: applyTheme }} />
      </head>
      <body>
        <div className="display-controls">
          <ReadPageButton />
          <ThemeToggle />
        </div>
        {children}
      </body>
    </html>
  );
}
