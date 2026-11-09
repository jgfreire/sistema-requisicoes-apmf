// OCR local (offline) para PDFs sem texto, como os gerados pela impressora "Microsoft Print to PDF",
// que desenha as letras como formas em vez de gravar o texto. A página vira imagem e o Tesseract lê.
//
// Duas leituras por página:
//  1. a página inteira (texto corrido: categoria, discriminação, justificativa, datas);
//  2. só a faixa da tabela de itens, em resolução maior e em preto e branco, sem as bordas da tabela
//     (a letra pequena sobre fundo cinza e as linhas da tabela atrapalham a leitura da página inteira).
const path = require('path');
const { createCanvas } = require('@napi-rs/canvas');

const ESCALA = 3;        // página inteira
const ESCALA_TABELA = 4; // faixa da tabela
const RE_JUSTIFICATIVA = /^JUSTIFICATIVA/i;
const RE_DATA_EXTENSO = /An[aá]polis\s*\/\s*GO\s*,\s*\d/i;
const RE_LINHA_TABELA = /^\W*Item\b|^\d+\s+\S+\s+\S+\s+.+\s+R\$\s*\d/i;

let workerPromise = null;
let fila = Promise.resolve();

function obterWorker() {
  if (!workerPromise) {
    const { createWorker } = require('tesseract.js');
    const langPath = path.join(path.dirname(require.resolve('@tesseract.js-data/por/package.json')), '4.0.0_best_int');
    workerPromise = createWorker('por', 1, { langPath, gzip: true, cachePath: path.join(__dirname, '..', '.ocr-cache') })
      .catch((e) => { workerPromise = null; throw e; });
  }
  return workerPromise;
}

async function desenhar(pagina, escala) {
  const viewport = pagina.getViewport({ scale: escala });
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await pagina.render({ canvasContext: ctx, canvas, viewport }).promise;
  return canvas;
}

// Recorta a faixa [y0, y1), deixa em preto e branco e apaga as linhas longas (bordas da tabela).
function prepararFaixa(origem, y0, y1) {
  const W = origem.width; const H = Math.max(1, y1 - y0);
  const faixa = createCanvas(W, H);
  const ctx = faixa.getContext('2d');
  ctx.drawImage(origem, 0, y0, W, H, 0, 0, W, H);
  const img = ctx.getImageData(0, 0, W, H);
  const px = img.data;
  const escuro = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) escuro[i] = (0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2]) < 170 ? 1 : 0;

  const MIN_H = 250; const MIN_V = 70;
  for (let y = 0; y < H; y++) {
    let seq = 0;
    for (let x = 0; x <= W; x++) {
      if (x < W && escuro[y * W + x]) seq++;
      else { if (seq >= MIN_H) for (let k = x - seq; k < x; k++) escuro[y * W + k] = 0; seq = 0; }
    }
  }
  for (let x = 0; x < W; x++) {
    let seq = 0;
    for (let y = 0; y <= H; y++) {
      if (y < H && escuro[y * W + x]) seq++;
      else { if (seq >= MIN_V) for (let k = y - seq; k < y; k++) escuro[k * W + x] = 0; seq = 0; }
    }
  }
  for (let i = 0; i < W * H; i++) { const v = escuro[i] ? 0 : 255; px[i * 4] = px[i * 4 + 1] = px[i * 4 + 2] = v; px[i * 4 + 3] = 255; }
  ctx.putImageData(img, 0, 0);
  return faixa.toBuffer('image/png');
}

const limpar = (t) => String(t || '').replace(/[|¦]/g, ' ').replace(/\s+/g, ' ').trim();

async function lerPagina(pagina) {
  const worker = await obterWorker();
  const PSM_BLOCO = '6'; const PSM_AUTO = '3';

  await worker.setParameters({ tessedit_pageseg_mode: PSM_AUTO });
  const inteira = await desenhar(pagina, ESCALA);
  const { data } = await worker.recognize(inteira.toBuffer('image/png'), {}, { blocks: true });
  const linhas = [];
  for (const b of data.blocks || []) for (const p of b.paragraphs || []) for (const l of p.lines || []) {
    linhas.push({ texto: limpar(l.text), y0: l.bbox.y0, conf: l.confidence });
  }
  linhas.sort((a, b) => a.y0 - b.y0);

  const just = linhas.find((l) => RE_JUSTIFICATIVA.test(l.texto));
  const data_ = linhas.find((l) => RE_DATA_EXTENSO.test(l.texto));
  if (!just || !data_ || data_.y0 <= just.y0) return linhas.map((l) => l.texto).filter(Boolean);

  // Segunda leitura: da justificativa até a data, onde fica a tabela.
  const k = ESCALA_TABELA / ESCALA;
  const grande = await desenhar(pagina, ESCALA_TABELA);
  const buf = prepararFaixa(grande, Math.floor((just.y0 + 60) * k), Math.min(grande.height, Math.ceil(data_.y0 * k)));
  await worker.setParameters({ tessedit_pageseg_mode: PSM_BLOCO });
  const tab = await worker.recognize(buf);
  const linhasFaixa = String(tab.data.text || '').split(/\r?\n/).map(limpar).filter(Boolean);
  const iniTabela = linhasFaixa.findIndex((l) => RE_LINHA_TABELA.test(l));

  // Texto corrido da região fica com a leitura da página inteira (só as linhas confiáveis);
  // a tabela vem da leitura da faixa.
  const lixoDeTabela = /R\$\s*\d|Fornecedor|TOTAL GERAL/i; // pedaços da tabela que a leitura da página inteira pegou pela metade
  const antes = linhas.filter((l) => l.y0 <= just.y0 + 60 || (l.y0 < data_.y0 && l.conf >= 75 && !lixoDeTabela.test(l.texto)));
  const depois = linhas.filter((l) => l.y0 >= data_.y0);
  const tabela = iniTabela >= 0 ? linhasFaixa.slice(iniTabela) : [];
  return [...antes.map((l) => l.texto), ...tabela, ...depois.map((l) => l.texto)].filter(Boolean);
}

// Lê a página já carregada pelo pdfjs e devolve as linhas de texto reconhecidas.
// Um reconhecimento por vez: o worker é compartilhado e os PDFs não se misturam.
function linhasDaPagina(pagina) {
  const execucao = fila.then(() => lerPagina(pagina));
  fila = execucao.catch(() => {});
  return execucao;
}

async function encerrar() {
  if (!workerPromise) return;
  const w = await workerPromise.catch(() => null);
  workerPromise = null;
  if (w) await w.terminate();
}

module.exports = { linhasDaPagina, encerrar };
