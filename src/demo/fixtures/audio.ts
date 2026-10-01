/**
 * A recording that sounds like nothing and looks like a conversation: bursts of
 * low-passed noise shaped by a syllable rhythm, silent while the other side
 * talks. The player draws its waveform and speaker lane from it, and no voice
 * and no paid provider is involved.
 */
export function buildConversationWav(
  segments: Array<{ start: number; end: number; speaker: string }>,
  durationSeconds: number,
  sampleRate = 8000
): Blob {
  const total = Math.ceil(durationSeconds * sampleRate);
  const samples = new Int16Array(total);
  let seed = 0x9e3779b9;
  const noise = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296 - 0.5;
  };
  let low = 0;

  for (const segment of segments) {
    const from = Math.max(0, Math.floor(segment.start * sampleRate));
    const to = Math.min(total, Math.floor(segment.end * sampleRate));
    // The two voices get different syllable rates so their bursts read differently.
    const syllablesPerSecond = segment.speaker === "A" ? 3.6 : 4.4;
    const loudness = segment.speaker === "A" ? 0.62 : 0.5;
    for (let index = from; index < to; index += 1) {
      const t = index / sampleRate;
      const syllable = 0.5 + 0.5 * Math.sin(2 * Math.PI * syllablesPerSecond * t + Math.sin(t * 1.3) * 2);
      const phrase = 0.55 + 0.45 * Math.sin(2 * Math.PI * 0.35 * t + 1);
      const edge = Math.min(1, (t - segment.start) * 6, (segment.end - t) * 6);
      low = low * 0.82 + noise() * 0.18;
      samples[index] = Math.round(low * syllable * phrase * edge * loudness * 32767);
    }
  }

  const bytes = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(bytes);
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
  new Int16Array(bytes, 44).set(samples);

  return new Blob([bytes], { type: "audio/wav" });
}
