#!/usr/bin/env node
// Regenerates the game's sound effects as WAV files for the Rust client.
//
// The `.strudel` files are the source of truth and live in `lib/music/`. They are rendered
// here with superdough — the same audio engine the Strudel REPL uses — to 16-bit stereo PCM,
// and written to `lib/content/sounds/<name>.wav`, which `lib/scripts/build-web.sh` copies
// into the deployed site and the native bundle ships as a resource.
//
// Usage: npm ci && npm run render
//
// One-shots and loops all play at one cycle per second (String.SOUND_CPS), and
// the game only plays what starts in the first cycle, so one cycle is the
// natural render length — except `dance`, whose groove is `.slow(1.8)` and
// therefore needs 1.8 cycles to be a seamless loop.
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderPattern } from './src/offline.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SOURCE_DIR = path.join(ROOT, 'lib/music');
const OUT_DIR = path.join(ROOT, 'lib/content/sounds');

const CPS = 1;
const SAMPLE_RATE = 48000;
const MIN_PEAK = 0.001; // anything quieter is almost certainly an evaluation failure

/** [file-name-without-extension, cycles to render] */
const SOUNDS = [
  // One-shots: their notes live in the first octave of the cycle.
  ['jump', 1],
  ['air-jump', 1],
  ['land', 1],
  ['reject', 1],
  ['skid', 1],
  ['climb', 1],
  // Loops: exactly one cycle, so the game can loop the file seamlessly.
  ['walk', 1],
  ['run', 1],
  ['jetpack', 1],
  // The dance groove is `.slow(1.8)`: 1.8 cycles = 1.8 s, seamless.
  ['dance', 1.8],
];

function encodeWav({ left, right, sampleRate }) {
  const numChannels = 2;
  const frames = Math.min(left.length, right.length);
  const dataBytes = frames * numChannels * 2;
  const buffer = Buffer.alloc(44 + dataBytes);
  buffer.write('RIFF', 0, 'ascii');
  buffer.writeUInt32LE(36 + dataBytes, 4);
  buffer.write('WAVE', 8, 'ascii');
  buffer.write('fmt ', 12, 'ascii');
  buffer.writeUInt32LE(16, 16); // PCM chunk size
  buffer.writeUInt16LE(1, 20); // PCM format
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * numChannels * 2, 28); // byte rate
  buffer.writeUInt16LE(numChannels * 2, 32); // block align
  buffer.writeUInt16LE(16, 34); // bits per sample
  buffer.write('data', 36, 'ascii');
  buffer.writeUInt32LE(dataBytes, 40);
  let offset = 44;
  for (let i = 0; i < frames; i++) {
    for (const channel of [left, right]) {
      const s = Math.max(-1, Math.min(1, channel[i]));
      buffer.writeInt16LE(s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7fff), offset);
      offset += 2;
    }
  }
  return buffer;
}

const failures = [];

await mkdir(OUT_DIR, { recursive: true });

for (const [name, cycles] of SOUNDS) {
  const source = path.join(SOURCE_DIR, `${name}.strudel`);
  let code;
  try {
    code = await readFile(source, 'utf8');
  } catch {
    failures.push(`${name}: source file not found: ${source}`);
    continue;
  }
  const duration = cycles / CPS;
  try {
    const { left, right, sampleRate } = await renderPattern(code, { duration, cps: CPS, sampleRate: SAMPLE_RATE });
    let peak = 0;
    for (let i = 0; i < left.length; i++) {
      const a = Math.abs(left[i]);
      if (a > peak) peak = a;
      const b = Math.abs(right[i]);
      if (b > peak) peak = b;
    }
    if (!(peak > MIN_PEAK)) {
      failures.push(`${name}: rendered essentially silent (peak ${peak}); the pattern was not understood?`);
      continue;
    }
    const wav = encodeWav({ left, right, sampleRate });
    const out = path.join(OUT_DIR, `${name}.wav`);
    await writeFile(out, wav);
    console.log(`${name}.wav\t${(wav.length / 1024).toFixed(1)} kB\tpeak ${(20 * Math.log10(peak)).toFixed(1)} dB`);
  } catch (err) {
    failures.push(`${name}: ${err.message}`);
  }
}

if (failures.length > 0) {
  console.error('\nFailed to render:');
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

// Note stale files left in the output directory by earlier exports.
const expected = new Set(SOUNDS.map(([name]) => `${name}.wav`));
for (const entry of await readdir(OUT_DIR)) {
  if (entry.endsWith('.wav') && !expected.has(entry)) {
    console.warn(`note: stale file kept in ${OUT_DIR}: ${entry}`);
  }
}
