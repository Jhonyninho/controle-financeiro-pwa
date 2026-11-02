// Funções de áudio do gerador de falas (scripts/gerar-falas.mjs). Separadas para teste.

import { Mp3Encoder } from '@breezystack/lamejs';

export const TAXA = 24000; // o Gemini TTS devolve PCM 16 bits, 24 kHz, mono

/** PCM 16 bits little-endian → Float32. */
export function pcm16ParaFloat(bytes) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out = new Float32Array(bytes.byteLength >> 1);
  for (let i = 0; i < out.length; i++) out[i] = v.getInt16(2 * i, true) / 0x8000;
  return out;
}

/** Recorta, normaliza o volume (pico) e suaviza as pontas para não estalar. */
export function recortar(pcm, ini = 0, fim = pcm.length) {
  const out = pcm.slice(ini, fim);
  let pico = 0;
  for (const v of out) pico = Math.max(pico, Math.abs(v));
  const ganho = pico > 0 ? 0.89 / pico : 1;
  const fade = Math.round(TAXA * 0.012);
  for (let i = 0; i < out.length; i++) {
    const env = Math.min(1, i / fade, (out.length - 1 - i) / fade);
    out[i] *= ganho * env;
  }
  return out;
}

/**
 * Corta o áudio em `textos.length` falas pelos silêncios entre elas. Tenta vários limiares de
 * silêncio e tamanhos de pausa; só aceita quando acha exatamente o número de falas e a duração
 * de cada uma combina com o tamanho do texto. Devolve null se não der com segurança.
 */
export function dividirPorSilencio(pcm, textos) {
  const n = textos.length;
  const passo = Math.round(TAXA * 0.01); // quadros de 10 ms
  const rms = [];
  for (let i = 0; i + passo <= pcm.length; i += passo) {
    let s = 0;
    for (let k = i; k < i + passo; k++) s += pcm[k] * pcm[k];
    rms.push(Math.sqrt(s / passo));
  }
  for (const limiar of [0.006, 0.012, 0.02, 0.035]) {
    for (const pausa of [1.2, 0.9, 0.7, 0.55, 0.42]) {
      const minQuadros = Math.round(pausa * 100);
      const trechos = [];
      let ini = -1;
      let ultimo = -1;
      for (let q = 0; q < rms.length; q++) {
        if (rms[q] < limiar) continue;
        if (ini < 0) ini = q;
        else if (q - ultimo > minQuadros) {
          trechos.push([ini, ultimo]);
          ini = q;
        }
        ultimo = q;
      }
      if (ini >= 0) trechos.push([ini, ultimo]);
      const validos = trechos.filter(([a, b]) => b - a >= 25); // ≥ 0,25 s
      if (validos.length !== n) continue;
      if (!coerente(validos)) continue;
      return cortar(validos);
    }
  }
  // Plano B (poupa cota): quando o modelo faz pausas internas parecidas com as pausas entre
  // frases, nenhum limiar acerta a contagem. Aí corta nas n−1 maiores pausas (cada uma ≥ 0,35 s)
  // e só aceita se a duração de cada fala combinar com o texto.
  if (n > 1) {
    for (const limiar of [0.012, 0.006, 0.02]) {
      const fala = [];
      let ini = -1;
      let ultimo = -1;
      for (let q = 0; q < rms.length; q++) {
        if (rms[q] < limiar) continue;
        if (ini < 0) ini = q;
        else if (q - ultimo > 15) {
          fala.push([ini, ultimo]);
          ini = q;
        }
        ultimo = q;
      }
      if (ini >= 0) fala.push([ini, ultimo]);
      if (fala.length <= n) continue;
      const pausas = fala.slice(1).map(([a], i) => ({ i, tam: a - fala[i][1] }));
      const maiores = [...pausas].sort((x, y) => y.tam - x.tam).slice(0, n - 1);
      if (maiores[maiores.length - 1].tam < 35) continue;
      const corte = new Set(maiores.map((p) => p.i));
      const grupos = [];
      let inicio = fala[0][0];
      fala.forEach(([, b], i) => {
        if (!corte.has(i) && i < fala.length - 1) return;
        grupos.push([inicio, b]);
        if (i + 1 < fala.length) inicio = fala[i + 1][0];
      });
      if (coerente(grupos)) return cortar(grupos);
    }
  }
  return null;

  function coerente(trechos) {
    return trechos.every(([a, b], i) => {
      const sPorLetra = (b - a) / 100 / textos[i].length;
      return sPorLetra > 0.03 && sPorLetra < 0.16;
    });
  }
  function cortar(trechos) {
    return trechos.map(([a, b]) => recortar(pcm, Math.max(0, (a - 6) * passo), Math.min(pcm.length, (b + 15) * passo)));
  }
}

/** Float32 → MP3 mono 48 kbps (Buffer). */
export function codificarMp3(pcm) {
  const enc = new Mp3Encoder(1, TAXA, 48);
  const int16 = new Int16Array(pcm.length);
  for (let i = 0; i < pcm.length; i++) int16[i] = Math.max(-32768, Math.min(32767, Math.round(pcm[i] * 32767)));
  const partes = [];
  for (let i = 0; i < int16.length; i += 1152) partes.push(enc.encodeBuffer(int16.subarray(i, i + 1152)));
  partes.push(enc.flush());
  return Buffer.concat(partes.map((p) => Buffer.from(p.buffer, p.byteOffset, p.length)));
}
