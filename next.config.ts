import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Gerador de PDF do relatório executivo: roda no Node, sem passar pelo empacotador.
  serverExternalPackages: ["@react-pdf/renderer"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
