"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { speak, stopSpeaking } from "@/lib/speech";

const subscribe = () => () => {};

/** `false` no servidor e em navegadores sem síntese de voz. */
function useSpeechSupported() {
  return useSyncExternalStore(subscribe, () => "speechSynthesis" in window, () => false);
}

/** Botão fixo que lê em voz alta o conteúdo principal da página atual. */
export function ReadPageButton() {
  const supported = useSpeechSupported();
  const [speaking, setSpeaking] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    if (supported) stopSpeaking();
  }, [pathname, supported]);

  if (!supported) return null;
  const label = speaking ? "Parar a leitura" : "Ler esta página em voz alta";

  return (
    <button
      className="display-button"
      type="button"
      aria-label={label}
      aria-pressed={speaking}
      title={label}
      onClick={() => {
        if (speaking) {
          stopSpeaking();
          setSpeaking(false);
          return;
        }
        const main = document.querySelector<HTMLElement>("main");
        if (!main) return;
        setSpeaking(true);
        speak(main.innerText, () => setSpeaking(false));
      }}
    >
      <span aria-hidden="true">{speaking ? "■" : "🔊"}</span>
    </button>
  );
}

/** Ouvir um único trecho, como uma resposta do copiloto. */
export function ListenButton({ text }: { text: string }) {
  const supported = useSpeechSupported();
  const [speaking, setSpeaking] = useState(false);

  if (!supported) return null;

  return (
    <button
      className="listen-button"
      type="button"
      aria-pressed={speaking}
      onClick={() => {
        if (speaking) {
          stopSpeaking();
          setSpeaking(false);
          return;
        }
        setSpeaking(true);
        speak(text, () => setSpeaking(false));
      }}
    >
      <span aria-hidden="true">{speaking ? "■" : "🔊"}</span> {speaking ? "Parar" : "Ouvir"}
    </button>
  );
}
