"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

type SubmitButtonProps = {
  children: ReactNode;
  pendingLabel: string;
  className?: string;
  name?: string;
  value?: string;
};

/** Botão de envio que se desabilita durante o processamento, evitando envios duplicados. */
export function SubmitButton({ children, pendingLabel, className = "button button-primary", name, value }: SubmitButtonProps) {
  const { pending, data } = useFormStatus();
  // Com vários botões no mesmo formulário, só o acionado mostra o rótulo de espera.
  const isThisButton = pending && (!name || data?.get(name) === value);

  return (
    <button className={className} type="submit" name={name} value={value} disabled={pending} aria-disabled={pending}>
      {isThisButton ? <span role="status">{pendingLabel}</span> : children}
    </button>
  );
}
