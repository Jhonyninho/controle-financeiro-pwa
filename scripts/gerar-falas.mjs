// Grava as saudações do assistente com a voz neural do Gemini (uma vez só) em public/falas/*.mp3.
//
// Uso (PowerShell; "node" direto funciona mesmo com a execução de scripts .ps1 bloqueada):
//   $env:GEMINI_API_KEY="sua-chave"; node scripts/gerar-falas.mjs
// Opções (variáveis de ambiente):
//   VOZ=Charon            voz do Gemini (Charon, Orus, Iapetus, Algenib, Fenrir, Kore, Sulafat, Aoede)
//   TRATAMENTOS=senhor    grava só esses tratamentos (senhor, senhora, neutro), para gastar menos cota
//   FORCAR=1              regrava tudo (por exemplo, para ouvir outra interpretação)
//
// A cota grátis de voz é de ~10 pedidos por dia. Para poupar, várias frases vão num pedido só,
// com pausas longas entre elas; o áudio é cortado nos silêncios. Se a cota do dia acabar, rode
// de novo no dia seguinte: o que já foi gravado fica e o script continua de onde parou.
// A chave só é usada aqui, no seu PC; nada dela vai para o repositório.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { todasAsFalas } from '../src/lib/saudacoes.js';
import { MODELOS_TTS, VOZES_GEMINI } from '../src/servicos/voz.js';
import { codificarMp3, dividirPorSilencio, pcm16ParaFloat, recortar } from './audio-falas.mjs';

const CHAVE = process.env.GEMINI_API_KEY || '';
const VOZ = process.env.VOZ || 'Charon';
const FORCAR = process.env.FORCAR === '1';
const TRATAMENTOS = (process.env.TRATAMENTOS || 'senhor,senhora,neutro').split(',').map((t) => t.trim());
const POR_PEDIDO = 8;
const DIR = new URL('../public/falas/', import.meta.url);
const INDICE = new URL('indice.json', DIR);

if (!CHAVE) {
  console.error('Defina a chave antes:  $env:GEMINI_API_KEY="sua-chave"; node scripts/gerar-falas.mjs');
  process.exit(1);
}
if (!VOZES_GEMINI.some((v) => v.id === VOZ)) {
  console.error(`Voz desconhecida: ${VOZ}. Opções: ${VOZES_GEMINI.map((v) => v.id).join(', ')}`);
  process.exit(1);
}
mkdirSync(DIR, { recursive: true });

// índice: versão (muda a URL dos áudios para o navegador não usar os antigos), voz e falas prontas
let indice = existsSync(INDICE) ? JSON.parse(readFileSync(INDICE, 'utf8')) : { v: 0, voz: VOZ, ids: [] };
if (FORCAR || indice.voz !== VOZ || !indice.ids.length) indice = { v: (indice.v || 0) + 1, voz: VOZ, ids: [] };
const feitas = new Set(indice.ids);
const salvarIndice = () => writeFileSync(INDICE, `${JSON.stringify({ ...indice, ids: [...feitas].sort() }, null, 2)}\n`);

const tratamentoDoId = (id) => id.split('-')[2];
const prioridade = (id) => (id.startsWith('a-') ? 0 : id.startsWith('c-geral-') ? 1 : 2);
const pendentes = todasAsFalas()
  .filter((f) => !feitas.has(f.id) && (!f.id.startsWith('a-') || TRATAMENTOS.includes(tratamentoDoId(f.id))))
  .sort((a, b) => prioridade(a.id) - prioridade(b.id));
console.log(`Voz ${VOZ}: ${feitas.size} falas já gravadas, ${pendentes.length} a gravar.`);

class SemCotaHoje extends Error {}
const espera = (ms) => new Promise((ok) => setTimeout(ok, ms));

async function sintetizar(texto) {
  const corpo = {
    contents: [{ parts: [{ text: texto }] }],
    generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOZ } } } },
  };
  for (const modelo of MODELOS_TTS) {
    for (let tentativa = 0; tentativa < 3; tentativa++) {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': CHAVE },
        body: JSON.stringify(corpo),
      });
      if (r.ok) {
        const j = await r.json();
        const parte = j?.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
        if (parte) return pcm16ParaFloat(Buffer.from(parte.inlineData.data, 'base64'));
        // às vezes o modelo responde sem áudio (finishReason OTHER); quem chamou tenta com menos frases
        console.log(`  o Gemini respondeu sem áudio (${j?.candidates?.[0]?.finishReason || j?.promptFeedback?.blockReason || 'sem motivo'}).`);
        return null;
      }
      const detalhe = await r.text();
      if (r.status === 404) break; // modelo indisponível: tenta o próximo
      if (r.status === 400 || r.status === 401 || r.status === 403) throw new Error(`A chave foi recusada (${r.status}): ${detalhe.slice(0, 200)}`);
      if (r.status === 429) {
        if (/limit:\s*0\b/.test(detalhe)) break; // este modelo não tem cota grátis para a chave
        if (/PerDay|per day/i.test(detalhe)) throw new SemCotaHoje();
        const s = Number(detalhe.match(/"retryDelay":\s*"(\d+)/)?.[1] || 30);
        console.log(`  limite por minuto; aguardando ${s + 2}s…`);
        await espera((s + 2) * 1000);
        continue;
      }
      if (r.status >= 500) {
        await espera(5000);
        continue;
      }
      throw new Error(`Erro ${r.status}: ${detalhe.slice(0, 200)}`);
    }
  }
  throw new SemCotaHoje();
}

const gravar = (id, pcm) => {
  writeFileSync(new URL(`${id}.mp3`, DIR), codificarMp3(pcm));
  feitas.add(id);
};

// Instrução curta: textos longos de "papel" fazem o modelo de voz às vezes responder sem áudio.
const ESTILO = 'Leia em português do Brasil, com voz grave, serena e formal de assistente virtual, dicção impecável e ritmo pausado';
const prompt = (lote) => (lote.length === 1
  ? `${ESTILO}:\n\n${lote[0].texto}`
  : `${ESTILO}. Faça uma pausa de dois segundos entre as frases:\n\n${lote.map((f) => f.texto).join('\n\n')}`);

/** Grava um lote; se vier sem áudio ou não der para separar, divide o lote ao meio e tenta de novo. */
async function gravarLote(lote) {
  const pcm = await sintetizar(prompt(lote));
  const cortes = pcm && dividirPorSilencio(pcm, lote.map((f) => f.texto));
  if (cortes) {
    lote.forEach((f, k) => gravar(f.id, cortes[k]));
    return;
  }
  if (pcm && lote.length === 1) {
    gravar(lote[0].id, recortar(pcm)); // uma frase só: aproveita o áudio inteiro
    return;
  }
  if (lote.length === 1) throw new Error(`O Gemini não gerou áudio para: "${lote[0].texto}"`);
  if (pcm) console.log('  não consegui separar as frases; dividindo o lote…');
  const meio = Math.ceil(lote.length / 2);
  await gravarLote(lote.slice(0, meio));
  salvarIndice();
  await gravarLote(lote.slice(meio));
}

try {
  for (let i = 0; i < pendentes.length; i += POR_PEDIDO) {
    const lote = pendentes.slice(i, i + POR_PEDIDO);
    console.log(`Gravando ${i + 1} a ${i + lote.length} de ${pendentes.length}…`);
    await gravarLote(lote);
    salvarIndice();
  }
  salvarIndice();
  console.log(`Pronto: ${feitas.size} falas em public/falas. Agora é só publicar (commit + push).`);
} catch (e) {
  salvarIndice();
  if (e instanceof SemCotaHoje) {
    console.log(`A cota de voz do Gemini acabou por hoje (cerca de 10 pedidos por dia). ${feitas.size} falas gravadas até agora; rode de novo amanhã para continuar.`);
  } else {
    console.error(e.message);
    process.exitCode = 1;
  }
}
