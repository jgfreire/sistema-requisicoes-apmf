// Leitura local de PDF (pdfjs-dist). Só lê PDF com texto selecionável.
// Layout principal: "REQUISIÇÃO DE MATERIAL E SERVIÇOS" da APMF (categoria marcada com X,
// JUSTIFICATIVA em texto corrido e tabela Item | Tipo | Número | Fornecedor/Prestador | Valor).
const DINHEIRO = /(?:R\$\s*)?(\d{1,3}(?:\.\d{3})*,\d{2})/g;
const paraNumero = (t) => Number(String(t).replace(/\./g, '').replace(',', '.'));

async function textoDoPdf(buffer) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer), useSystemFonts: true }).promise;
  const linhas = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const { items } = await (await doc.getPage(p)).getTextContent();
    let y = null; let atual = '';
    for (const it of items) {
      const yy = Math.round(it.transform[5]);
      if (y !== null && Math.abs(yy - y) > 2) { linhas.push(atual); atual = ''; }
      y = yy;
      if (it.str.trim()) atual += (atual ? ' ' : '') + it.str.trim();
    }
    if (atual) linhas.push(atual);
  }
  return linhas.map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
}

// Categoria marcada: "(X)7-Despesas Diversas" (as demais aparecem como "( )1-Alimentação").
function categoriaMarcada(linhas) {
  const ini = linhas.findIndex((l) => /^CATEGORIA:/i.test(l));
  if (ini < 0) return '';
  const bloco = linhas.slice(ini + 1, ini + 5).join(' ');
  const re = /\(\s*([Xx]?)\s*\)\s*\d\s*-\s*(.+?)(?=\s*\(\s*[Xx]?\s*\)\s*\d|DISCRIMINA|$)/g;
  for (const m of bloco.matchAll(re)) if (m[1]) return m[2].trim();
  return '';
}

// Texto entre "DISCRIMINAÇÃO:" e "JUSTIFICATIVA:".
function discriminacao(linhas) {
  const ini = linhas.findIndex((l) => /^DISCRIMINA/i.test(l));
  if (ini < 0) return '';
  const partes = [];
  for (const l of linhas.slice(ini + 1)) {
    if (/^JUSTIFICATIVA:/i.test(l)) break;
    partes.push(l);
  }
  return partes.join(' ').trim();
}

function justificativa(linhas) {
  const ini = linhas.findIndex((l) => /^JUSTIFICATIVA:/i.test(l));
  if (ini < 0) return '';
  const partes = [];
  for (const l of linhas.slice(ini + 1)) {
    if (/^[^,]+\/[A-Z]{2},\s*\d{1,2} de /i.test(l) || /^Requisitado em/i.test(l)) break;
    partes.push(l);
  }
  return partes.join(' ').trim();
}

// Linhas da tabela: "1 Nf. 189 FERNANDO XAVIER RODRIGUES R$ 156,00"
function linhasDaTabela(linhas) {
  const ini = linhas.findIndex((l) => /^Item Tipo N[úu]mero/i.test(l));
  if (ini < 0) return [];
  const rows = [];
  for (const l of linhas.slice(ini + 1)) {
    const m = l.match(/^\d+\s+(\S+)\s+(\S+)\s+(.+?)\s+R\$\s*(\d{1,3}(?:\.\d{3})*,\d{2})$/);
    if (m) rows.push({ tipo: m[1], numero: m[2], fornecedor: m[3].trim(), valor: paraNumero(m[4]) });
  }
  return rows;
}

function lerGenerico(linhas) {
  const m = linhas.join('\n').match(/(?:n[º°o]\.?|número)\s*[:\-]?\s*(\d+)/i);
  const itens = [];
  for (const linha of linhas) {
    const achados = [...linha.matchAll(DINHEIRO)];
    if (!achados.length) continue;
    itens.push({
      categoria: '', tipo: '', numero: m ? m[1] : '', fornecedor: '', discriminacao: '', generico: true,
      valor: paraNumero(achados[achados.length - 1][1]),
      justificativa: linha.replace(DINHEIRO, '').replace(/^[\s\-:R$]+|[\s\-:R$]+$/g, ''),
    });
  }
  return itens;
}

async function ler(buffer) {
  const linhas = await textoDoPdf(buffer);
  const rows = linhasDaTabela(linhas);
  let itens;
  if (rows.length) {
    const categoria = categoriaMarcada(linhas);
    const disc = discriminacao(linhas);
    const just = justificativa(linhas);
    itens = rows.map((r) => ({ categoria, tipo: r.tipo, numero: r.numero, fornecedor: r.fornecedor, valor: r.valor, discriminacao: disc, justificativa: just }));
  } else {
    itens = lerGenerico(linhas);
  }
  if (!itens.length) throw new Error('nenhum item identificado');
  return itens;
}

module.exports = { ler };
