"use client";

import { useEffect, useRef, type ReactNode } from "react";

const DIALOG_ID = "decision-dialog";

/**
 * Janela de decisão da gestão. Abre pelo botão "Decidir" e também sozinha quando
 * a página volta com #decision (por exemplo, após um erro ao registrar).
 */
export function DecisionDialog({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (window.location.hash === "#decision") ref.current?.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      id={DIALOG_ID}
      className="decision-dialog"
      aria-labelledby="decision-title"
      // Clique no fundo escurecido fecha a janela.
      onClick={(event) => {
        if (event.target === ref.current) ref.current?.close();
      }}
      onClose={() => {
        if (window.location.hash === "#decision") history.replaceState(null, "", window.location.pathname + window.location.search);
      }}
    >
      <button type="button" className="dialog-close" aria-label="Fechar" onClick={() => ref.current?.close()}>
        ×
      </button>
      {children}
    </dialog>
  );
}

export function OpenDecisionButton({ className, children }: { className: string; children: ReactNode }) {
  return (
    <button
      type="button"
      className={className}
      aria-haspopup="dialog"
      onClick={() => (document.getElementById(DIALOG_ID) as HTMLDialogElement | null)?.showModal()}
    >
      {children}
    </button>
  );
}
