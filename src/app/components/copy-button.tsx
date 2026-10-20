"use client";

import { useState } from "react";

/** Copia um texto para a área de transferência, com retorno acessível. */
export function CopyButton({ value, label = "Copiar link" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button className="button button-secondary button-small" type="button" onClick={copy}>
      <span aria-live="polite">{copied ? "Copiado!" : label}</span>
    </button>
  );
}
