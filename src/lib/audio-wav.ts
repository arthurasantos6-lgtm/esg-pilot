/** Áudio de voz em WAV PCM de 16 bits, formato aceito sem conversão pelos provedores. Módulo puro. */

export const TRANSCRIPTION_SAMPLE_RATE = 16_000;
export const MAX_RECORDING_SECONDS = 120;
/** 2 minutos a 16 kHz, 16 bits e mono, mais o cabeçalho; abaixo do limite de 4,5 MB da Vercel. */
export const MAX_WAV_BYTES = 44 + MAX_RECORDING_SECONDS * TRANSCRIPTION_SAMPLE_RATE * 2;

export function encodeWav(samples: Float32Array, sampleRate: number): Uint8Array {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeText = (offset: number, text: string) => {
    for (let index = 0; index < text.length; index += 1) view.setUint8(offset + index, text.charCodeAt(index));
  };
  writeText(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeText(8, "WAVE");
  writeText(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeText(36, "data");
  view.setUint32(40, samples.length * 2, true);
  samples.forEach((sample, index) => {
    const clamped = Math.max(-1, Math.min(1, sample));
    view.setInt16(44 + index * 2, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
  });
  return new Uint8Array(buffer);
}

export function isWav(bytes: Uint8Array): boolean {
  const text = (start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end));
  return bytes.length > 44 && text(0, 4) === "RIFF" && text(8, 12) === "WAVE";
}
