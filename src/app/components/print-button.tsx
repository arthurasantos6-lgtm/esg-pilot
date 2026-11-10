"use client";

/** Abre a impressão do navegador (permite salvar o relatório em PDF). */
export function PrintButton({ label = "Imprimir ou salvar em PDF" }: { label?: string }) {
  return (
    <button type="button" className="button button-secondary no-print" onClick={() => window.print()}>
      {label}
    </button>
  );
}
