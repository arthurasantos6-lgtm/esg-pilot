"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

type RecognitionResultEvent = {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
};

type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: RecognitionResultEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type RecognitionConstructor = new () => Recognition;

function recognitionConstructor(): RecognitionConstructor | null {
  const speechWindow = window as unknown as {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  };
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition ?? null;
}

const subscribe = () => () => {};

/**
 * Ditado por voz: o navegador transcreve a fala e o texto entra no campo, onde
 * pode ser revisado antes do envio. O áudio não é gravado pela plataforma.
 */
export function DictationButton({ targetId }: { targetId: string }) {
  const supported = useSyncExternalStore(subscribe, () => recognitionConstructor() !== null, () => false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<Recognition | null>(null);

  useEffect(() => () => recognitionRef.current?.stop(), []);

  if (!supported) return null;

  function toggle() {
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const Constructor = recognitionConstructor();
    const field = document.getElementById(targetId);
    if (!Constructor || !(field instanceof HTMLTextAreaElement)) return;

    const recognition = new Constructor();
    recognition.lang = "pt-BR";
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        if (!result.isFinal) continue;
        const separator = field.value && !/\s$/.test(field.value) ? " " : "";
        field.value = `${field.value}${separator}${result[0].transcript.trim()}`;
      }
    };
    recognition.onerror = ({ error: code }) => {
      if (code === "aborted" || code === "no-speech") return;
      setError(
        code === "not-allowed" || code === "service-not-allowed"
          ? "Permita o uso do microfone no navegador para ditar."
          : "Não foi possível usar o ditado agora. Você pode digitar normalmente.",
      );
    };
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    setError(null);
    recognition.start();
    setListening(true);
  }

  return (
    <>
      <button
        className="button button-secondary"
        type="button"
        aria-pressed={listening}
        title="O áudio é transcrito pelo serviço de voz do navegador e não é gravado pela plataforma."
        onClick={toggle}
      >
        <span aria-hidden="true">{listening ? "■" : "🎤"}</span> {listening ? "Parar ditado" : "Ditar"}
      </button>
      {error && <p className="alert alert-error dictation-error" role="alert">{error}</p>}
      {listening && <span className="sr-only" role="status">Ouvindo. Fale sua ideia.</span>}
    </>
  );
}
