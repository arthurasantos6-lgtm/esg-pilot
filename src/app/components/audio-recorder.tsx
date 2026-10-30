"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { WhisperResponse } from "@/app/components/whisper.worker";
import {
  encodeWav,
  MAX_RECORDING_SECONDS,
  MIN_AUDIBLE_PEAK,
  normalizeVolume,
  peakLevel,
  TRANSCRIPTION_SAMPLE_RATE,
} from "@/lib/audio-wav";

const subscribe = () => () => {};

/** Modelo menor em aparelhos com pouca memória, onde o maior pode não abrir. */
function chooseModel() {
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  return memory !== undefined && memory < 4 ? "onnx-community/whisper-tiny" : "onnx-community/whisper-base";
}

function canRecord() {
  return typeof MediaRecorder !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia);
}

/** Áudio mono de 16 kHz, o formato usado pelo modelo; `null` se o microfone não captou som. */
async function toSamples(recording: Blob) {
  const decoder = new AudioContext();
  try {
    const decoded = await decoder.decodeAudioData(await recording.arrayBuffer());
    const offline = new OfflineAudioContext(1, Math.ceil(decoded.duration * TRANSCRIPTION_SAMPLE_RATE), TRANSCRIPTION_SAMPLE_RATE);
    const source = offline.createBufferSource();
    source.buffer = decoded;
    source.connect(offline.destination);
    source.start();
    const samples = (await offline.startRendering()).getChannelData(0);
    return peakLevel(samples) < MIN_AUDIBLE_PEAK ? null : normalizeVolume(samples);
  } finally {
    await decoder.close();
  }
}

type Status = "idle" | "requesting_permission" | "recording" | "paused" | "recorded" | "loading_model" | "transcribing" | "review" | "error";

const formatClock = (total: number) => `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;

/**
 * Grava, permite ouvir ou apagar e só então transcreve. Por padrão a
 * transcrição roda no aparelho; `serverTranscription` só existe quando a IA
 * externa foi habilitada pela plataforma. O áudio nunca é guardado.
 */
export function AudioRecorder({ targetId, serverTranscription = false }: { targetId: string; serverTranscription?: boolean }) {
  const supported = useSyncExternalStore(subscribe, canRecord, () => false);
  const [status, setStatus] = useState<Status>("idle");
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [download, setDownload] = useState<{ loaded: number; total: number } | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordingRef = useRef<Blob | null>(null);
  const timerRef = useRef<number | null>(null);
  const workerRef = useRef<Worker | null>(null);

  const stopTimer = () => {
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    timerRef.current = null;
  };

  useEffect(
    () => () => {
      stopTimer();
      workerRef.current?.terminate();
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== "inactive") recorder.stop();
    },
    [],
  );

  useEffect(() => () => {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
  }, [audioUrl]);

  if (!supported) return null;

  function fail(message: string) {
    setError(message);
    setStatus("error");
  }

  function startTimer(recorder: MediaRecorder) {
    timerRef.current = window.setInterval(() => {
      setSeconds((current) => {
        // Para antes do limite: gravações muito longas pesam em aparelhos simples.
        if (current + 1 >= MAX_RECORDING_SECONDS - 2 && recorder.state === "recording") recorder.stop();
        return current + 1;
      });
    }, 1000);
  }

  async function start() {
    setError(null);
    discard();
    setStatus("requesting_permission");
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      fail("Permita o uso do microfone no navegador para gravar, ou digite a ideia.");
      return;
    }
    const chunks: Blob[] = [];
    const recorder = new MediaRecorder(stream);
    recorder.ondataavailable = (event) => chunks.push(event.data);
    recorder.onstop = () => {
      stream.getTracks().forEach((track) => track.stop());
      stopTimer();
      const recording = new Blob(chunks, { type: recorder.mimeType });
      recordingRef.current = recording;
      setAudioUrl(URL.createObjectURL(recording));
      setStatus("recorded");
    };
    recorderRef.current = recorder;
    recorder.start();
    setSeconds(0);
    setStatus("recording");
    startTimer(recorder);
  }

  function togglePause() {
    const recorder = recorderRef.current;
    if (!recorder) return;
    if (recorder.state === "recording") {
      recorder.pause();
      stopTimer();
      setStatus("paused");
    } else if (recorder.state === "paused") {
      recorder.resume();
      startTimer(recorder);
      setStatus("recording");
    }
  }

  function discard() {
    recordingRef.current = null;
    setAudioUrl(null);
    setSeconds(0);
    setDownload(null);
    setStatus("idle");
  }

  function deliver(text: string) {
    if (!text) {
      fail("Não identificamos fala no áudio. Grave de novo ou digite a ideia.");
      return;
    }
    const field = document.getElementById(targetId);
    if (field instanceof HTMLTextAreaElement) {
      const separator = field.value && !/\s$/.test(field.value) ? " " : "";
      field.value = `${field.value}${separator}${text}`.slice(0, field.maxLength > 0 ? field.maxLength : undefined);
      field.focus();
    }
    recordingRef.current = null;
    setAudioUrl(null);
    setStatus("review");
  }

  async function transcribeOnServer(samples: Float32Array) {
    setStatus("transcribing");
    const wav = encodeWav(samples, TRANSCRIPTION_SAMPLE_RATE);
    const response = await fetch("/api/transcribe", {
      method: "POST",
      headers: { "Content-Type": "audio/wav" },
      body: new Blob([wav.slice().buffer], { type: "audio/wav" }),
    });
    const body = (await response.json().catch(() => null)) as { text?: string; error?: string } | null;
    if (!response.ok || !body?.text) {
      fail(body?.error ?? "Não foi possível transcrever o áudio. Você pode digitar a ideia.");
      return;
    }
    deliver(body.text);
  }

  function transcribeOnDevice(samples: Float32Array) {
    setStatus("loading_model");
    workerRef.current ??= new Worker(new URL("./whisper.worker.ts", import.meta.url), { type: "module" });
    const worker = workerRef.current;
    worker.onmessage = ({ data }: MessageEvent<WhisperResponse>) => {
      if (data.type === "download") setDownload({ loaded: data.loaded, total: data.total });
      if (data.type === "transcribing") setStatus("transcribing");
      if (data.type === "result") deliver(data.text);
      if (data.type === "error") fail("Não foi possível transcrever neste aparelho. Você pode digitar a ideia.");
    };
    worker.onerror = () => fail("Não foi possível transcrever neste aparelho. Você pode digitar a ideia.");
    worker.postMessage({ samples, modelId: chooseModel() }, [samples.buffer]);
  }

  async function transcribe() {
    const recording = recordingRef.current;
    if (!recording) return;
    setError(null);
    try {
      const samples = await toSamples(recording);
      if (!samples) {
        fail("O microfone não captou som. Confira se o microfone certo está selecionado e tente de novo.");
        return;
      }
      if (serverTranscription) await transcribeOnServer(samples);
      else transcribeOnDevice(samples);
    } catch {
      fail("Não foi possível transcrever o áudio. Você pode digitar a ideia.");
    }
  }

  const recording = status === "recording" || status === "paused";
  const busy = status === "loading_model" || status === "transcribing" || status === "requesting_permission";
  const percent = download && download.total ? Math.round((download.loaded / download.total) * 100) : null;

  return (
    <div className="recorder" aria-label="Gravação de áudio" role="group">
      {!recording && status !== "recorded" && !busy && (
        <button className="button button-secondary" type="button" onClick={() => void start()}>
          <span aria-hidden="true">🎤</span> {status === "review" || status === "error" ? "Gravar de novo" : "Gravar áudio"}
        </button>
      )}
      {status === "requesting_permission" && <p className="small-copy muted" role="status">Aguardando a permissão do microfone…</p>}

      {recording && (
        <>
          <span className="recorder-clock" role="status">
            {status === "paused" ? "Pausado" : "Gravando"} · {formatClock(seconds)} de {formatClock(MAX_RECORDING_SECONDS)}
          </span>
          {typeof MediaRecorder.prototype.pause === "function" && (
            <button className="button button-secondary" type="button" onClick={togglePause}>
              {status === "paused" ? "Continuar" : "Pausar"}
            </button>
          )}
          <button className="button button-secondary" type="button" onClick={() => recorderRef.current?.stop()}>
            <span aria-hidden="true">■</span> Parar
          </button>
        </>
      )}

      {status === "recorded" && audioUrl && (
        <>
          <audio className="recorder-audio" controls src={audioUrl}>Seu navegador não reproduz este áudio.</audio>
          <button className="button button-secondary" type="button" onClick={discard}>Apagar</button>
          <button className="button button-primary" type="button" onClick={() => void transcribe()}>Transcrever</button>
          {!serverTranscription && (
            <p className="small-copy muted recorder-note">
              A transcrição roda neste aparelho e o áudio não é enviado. Na primeira vez, baixa um modelo de cerca de 80 MB, então
              prefira usar Wi-Fi.
            </p>
          )}
        </>
      )}

      {status === "loading_model" && (
        <p className="small-copy muted recorder-note" role="status">
          Preparando a transcrição{percent !== null ? `: ${percent}% do modelo baixado` : "…"}
        </p>
      )}
      {status === "transcribing" && <p className="small-copy muted recorder-note" role="status">Transcrevendo o áudio…</p>}
      {status === "review" && (
        <p className="small-copy recorder-note" role="status">Transcrição pronta. Confira e corrija o texto no campo antes de enviar: ela pode ter erros.</p>
      )}
      {error && <p className="alert alert-error dictation-error" role="alert">{error}</p>}
    </div>
  );
}
