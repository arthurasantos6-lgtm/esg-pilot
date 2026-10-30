"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { encodeWav, MAX_RECORDING_SECONDS, TRANSCRIPTION_SAMPLE_RATE } from "@/lib/audio-wav";

const subscribe = () => () => {};

function canRecord() {
  return typeof MediaRecorder !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia);
}

/** Converte a gravação do navegador para WAV mono de 16 kHz. */
async function toWav(recording: Blob) {
  const decoder = new AudioContext();
  try {
    const decoded = await decoder.decodeAudioData(await recording.arrayBuffer());
    const offline = new OfflineAudioContext(1, Math.ceil(decoded.duration * TRANSCRIPTION_SAMPLE_RATE), TRANSCRIPTION_SAMPLE_RATE);
    const source = offline.createBufferSource();
    source.buffer = decoded;
    source.connect(offline.destination);
    source.start();
    const rendered = await offline.startRendering();
    return encodeWav(rendered.getChannelData(0), TRANSCRIPTION_SAMPLE_RATE);
  } finally {
    await decoder.close();
  }
}

type Status = "idle" | "recording" | "transcribing";

/**
 * Grava a fala e coloca a transcrição no campo, onde a pessoa revisa antes de
 * enviar. O áudio só é usado para a transcrição e não fica guardado.
 */
export function AudioRecorder({ targetId }: { targetId: string }) {
  const supported = useSyncExternalStore(subscribe, canRecord, () => false);
  const [status, setStatus] = useState<Status>("idle");
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearInterval(timerRef.current);
      if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    },
    [],
  );

  if (!supported) return null;

  async function transcribe(recording: Blob) {
    setStatus("transcribing");
    try {
      const wav = await toWav(recording);
      const response = await fetch("/api/transcribe", {
        method: "POST",
        headers: { "Content-Type": "audio/wav" },
        body: new Blob([wav.slice().buffer], { type: "audio/wav" }),
      });
      const body = (await response.json().catch(() => null)) as { text?: string; error?: string } | null;
      if (!response.ok || !body?.text) {
        setError(body?.error ?? "Não foi possível transcrever o áudio. Você pode digitar a ideia.");
        return;
      }
      const field = document.getElementById(targetId);
      if (field instanceof HTMLTextAreaElement) {
        const separator = field.value && !/\s$/.test(field.value) ? " " : "";
        field.value = `${field.value}${separator}${body.text}`.slice(0, field.maxLength > 0 ? field.maxLength : undefined);
        field.focus();
      }
    } catch {
      setError("Não foi possível transcrever o áudio. Você pode digitar a ideia.");
    } finally {
      setStatus("idle");
    }
  }

  async function start() {
    setError(null);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError("Permita o uso do microfone no navegador para gravar.");
      return;
    }
    const chunks: Blob[] = [];
    const recorder = new MediaRecorder(stream);
    recorder.ondataavailable = (event) => chunks.push(event.data);
    recorder.onstop = () => {
      stream.getTracks().forEach((track) => track.stop());
      if (timerRef.current !== null) window.clearInterval(timerRef.current);
      timerRef.current = null;
      void transcribe(new Blob(chunks, { type: recorder.mimeType }));
    };
    recorderRef.current = recorder;
    recorder.start();
    setSeconds(0);
    setStatus("recording");
    let elapsed = 0;
    timerRef.current = window.setInterval(() => {
      elapsed += 1;
      setSeconds(elapsed);
      // Para um pouco antes do limite: o relógio não é exato e o servidor recusa áudio maior.
      if (elapsed >= MAX_RECORDING_SECONDS - 2 && recorder.state === "recording") recorder.stop();
    }, 1000);
  }

  const remaining = MAX_RECORDING_SECONDS - seconds;
  const clock = `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}`;

  return (
    <>
      <button
        className={`button button-secondary${status === "recording" ? " recording-button" : ""}`}
        type="button"
        aria-pressed={status === "recording"}
        disabled={status === "transcribing"}
        title="O áudio é enviado ao provedor de IA só para a transcrição e não fica guardado na plataforma."
        onClick={() => (status === "recording" ? recorderRef.current?.stop() : void start())}
      >
        <span aria-hidden="true">{status === "recording" ? "■" : "🎤"}</span>{" "}
        {status === "recording" ? `Parar (${clock})` : status === "transcribing" ? "Transcrevendo…" : "Gravar áudio"}
      </button>
      {error && <p className="alert alert-error dictation-error" role="alert">{error}</p>}
      {status !== "idle" && (
        <span className="sr-only" role="status">{status === "recording" ? "Gravando. Fale sua ideia." : "Transcrevendo o áudio."}</span>
      )}
    </>
  );
}
