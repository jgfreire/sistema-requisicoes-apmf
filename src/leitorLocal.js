// Leitura local de PDF (pdfjs-dist). Só lê PDF com texto selecionável.
// Layout principal: "REQUISIÇÃO DE MATERIAL E SERVIÇOS" da APMF (categoria marcada com X,
// DISCRIMINAÇÃO e JUSTIFICATIVA em texto corrido e tabela Item | Tipo | Número | Fornecedor/Prestador | Valor).
//
// Cada PDF é lido de forma totalmente independente: nada é guardado entre um arquivo e outro.
const DINHEIRO = /(?:R\$\s*)?(\d{1,3}(?:\.\d{3})*,\d{2})/g;
const paraNumero = (t) => Number(String(t).replace(/\./g, '').replace(',', '.'));
const semAcento = (t) => String(t).normalize('NFD').replace(/[̀-ͯ]/g, '');

const RE_CABECALHO_TABELA = /^\W*Item\W+Tipo\b/i;
const RE_CATEGORIA = /^CATEGORIA\s*:?/i;
const RE_DISCRIMINACAO = /^DISCRIMINA[CÇ][AÃ]O\s*:?/i;
const RE_JUSTIFICATIVA = /^JUSTIFICATIVA\s*:?/i;
const RE_DATA_EXTENSO = /\b(\d{1,2})\s+de\s+([A-Za-zçÇ]+)\s+de\s+(\d{4})/i;
const RE_REQUISITADO = /Requisitado\s+em\s*:?\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/i;

// Lê o PDF e devolve as linhas de texto, na ordem de leitura (de cima para baixo, da esquerda para a direita).
// A posição de cada pedaço de texto é que manda: a ordem em que o PDF guardou o texto não é confiável.
// Campos preenchíveis do formulário (anotações) também entram, pois não fazem parte do texto da página.
async function textoDoPdf(buffer) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const tarefa = pdfjs.getDocument({ data: new Uint8Array(buffer), useSystemFonts: true });
  const doc = await tarefa.promise;
  const paginasLinhas = []; // uma lista de linhas por página
  let porOcr = false;
  try {
    for (let p = 1; p <= doc.numPages; p++) {
      const pagina = await doc.getPage(p);
      const dela = [];
      paginasLinhas.push(dela);
      const pedacos = [];
      const { items } = await pagina.getTextContent();
      for (const it of items) {
        const str = String(it.str || '').replace(/\s+/g, ' ').trim();
        if (str) pedacos.push({ x: it.transform[4], y: it.transform[5], str });
      }
      let anotacoes = [];
      try { anotacoes = await pagina.getAnnotations(); } catch { /* sem anotações */ }
      for (const a of anotacoes) {
        const valor = Array.isArray(a.fieldValue) ? a.fieldValue.join(' ') : a.fieldValue;
        const str = String(valor ?? '').replace(/\s+/g, ' ').trim();
        if (a.subtype === 'Widget' && str && !a.checkBox && !a.radioButton && Array.isArray(a.rect)) {
          pedacos.push({ x: a.rect[0], y: a.rect[3] - 8, str });
        }
      }
      if (!pedacos.length) {
        // Página sem texto (PDF impresso como imagem/vetor): lê por OCR.
        porOcr = true;
        dela.push(...(await require('./ocr').linhasDaPagina(pagina)));
        pagina.cleanup();
        continue;
      }
      pagina.cleanup();

      pedacos.sort((a, b) => b.y - a.y || a.x - b.x);
      const grupos = [];
      for (const pc of pedacos) {
        const g = grupos[grupos.length - 1];
        if (g && Math.abs(g.y - pc.y) <= 3) g.itens.push(pc);
        else grupos.push({ y: pc.y, itens: [pc] });
      }
      for (const g of grupos) {
        g.itens.sort((a, b) => a.x - b.x);
        dela.push(g.itens.map((i) => i.str).join(' '));
      }
    }
  } finally {
    await tarefa.destroy();
  }
  const limpa = (ls) => ls.map((l) => l.normalize('NFC').replace(/\s+/g, ' ').trim()).filter(Boolean);
  const paginas = paginasLinhas.map(limpa);
  const todas = paginas.flat();
  todas.paginas = paginas;
  todas.ocr = porOcr;
  return todas;
}

// Categoria marcada: "(X)7-Despesas Diversas" (as demais aparecem como "( )1-Alimentação").
// No OCR a marca pode sair como "O", "0" ou sem o parêntese final; o que importa é haver algo dentro da caixa.
function categoriaMarcada(linhas) {
  const ini = linhas.findIndex((l) => RE_CATEGORIA.test(l));
  const resto = linhas.slice(ini < 0 ? 0 : ini + 1);
  const fim = resto.findIndex((l) => RE_DISCRIMINACAO.test(l));
  const bloco = resto.slice(0, fim < 0 ? 8 : fim).join(' ');
  // "(X)3-", "( )3-" ou, no OCR, a marca solta sem parêntese ("00 3-").
  const opcoes = [...bloco.matchAll(/(?:[\(\[]\s*([^\s()\[\]]{0,3})\s*[\)\]]?|\s([^\s()\[\]]{1,3}))\s*([1-7])\s*-\s*/g)];
  for (let i = 0; i < opcoes.length; i++) {
    const o = opcoes[i];
    if (!(o[1] || o[2])) continue;
    const fimNome = i + 1 < opcoes.length ? opcoes[i + 1].index : bloco.length;
    const nome = bloco.slice(o.index + o[0].length, fimNome).trim();
    return `${o[3]}-${nome}`;
  }
  return '';
}

// Data da requisição, em dd/mm/aaaa: "Requisitado em 11/08/2026" ou, se faltar, "Anápolis/GO, 11 de agosto de 2026".
const MESES = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const doisDigitos = (n) => String(n).padStart(2, '0');
function dataRequisicao(linhas) {
  for (const l of linhas) {
    const m = l.match(RE_REQUISITADO);
    if (m) return `${doisDigitos(m[1])}/${doisDigitos(m[2])}/${m[3]}`;
  }
  for (const l of linhas) {
    const m = semAcento(l).match(RE_DATA_EXTENSO);
    const mes = m ? MESES.indexOf(m[2].toLowerCase()) : -1;
    if (m && mes >= 0) return `${doisDigitos(m[1])}/${doisDigitos(mes + 1)}/${m[3]}`;
  }
  return '';
}

const RE_LINHA_ITEM = /^\d+\s+\S+\s+\S+\s+.+\s+R\$\s*\d/;
const ehFimDeSecao = (l) => RE_CABECALHO_TABELA.test(l) || RE_LINHA_ITEM.test(l) || /^TOTAL GERAL/i.test(l) || RE_CATEGORIA.test(l) || RE_DISCRIMINACAO.test(l) || RE_JUSTIFICATIVA.test(l)
  || RE_REQUISITADO.test(l) || /^[^,]+\/[A-Z]{2},\s*\d{1,2}\s+de\s/i.test(semAcento(l));

// Texto que vem depois do rótulo (na mesma linha ou nas seguintes), até o próximo rótulo do formulário.
function secao(linhas, reRotulo) {
  const ini = linhas.findIndex((l) => reRotulo.test(l));
  if (ini < 0) return '';
  // O que vem depois do rótulo na mesma linha é a dica do formulário, ex.: "(Nome do produto a ser adquirido...)".
  const partes = [linhas[ini].replace(reRotulo, '').replace(/^\s*\([^)]*\)/, '').trim()];
  for (const l of linhas.slice(ini + 1)) {
    if (ehFimDeSecao(l)) break;
    partes.push(l);
  }
  return partes.filter(Boolean).join(' ').trim();
}

// Linhas da tabela: "1 Nf. 189 FERNANDO XAVIER RODRIGUES R$ 156,00"
function linhasDaTabela(linhas) {
  const ini = linhas.findIndex((l) => RE_CABECALHO_TABELA.test(l));
  // Sem o cabeçalho (ex.: ruído de OCR), só aceita linhas com "R$", para não confundir com outros números.
  const reLinha = ini < 0
    ? /^\d+\s+(\S+)\s+(\S+)\s+(.+?)\s+R\$\s*(\d{1,3}(?:\.\d{3})*,\d{2})$/
    : /^\d+\s+(\S+)\s+(\S+)\s+(.+?)\s+(?:R\$\s*)?(\d{1,3}(?:\.\d{3})*,\d{2})$/;
  const rows = [];
  for (const l of linhas.slice(ini + 1)) {
    const m = l.match(reLinha);
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

// Um PDF pode trazer uma ou várias requisições (uma por página, várias na mesma página, ou uma que ocupa
// mais de uma página). Onde cada uma COMEÇA e TERMINA:
//  - começa no título "REQUISIÇÃO DE MATERIAL E SERVIÇOS" ou, se o título não foi lido (OCR), em um novo "CATEGORIA:";
//  - termina no bloco de assinaturas ("... Comandante / Gestor e fiscal"), o último item do formulário.
//    Depois do fim, qualquer página nova já é outra requisição, mesmo sem título.
// A página que continua a requisição anterior (ex.: tabela com muitos itens) ainda não passou das assinaturas.
const RE_TITULO = /REQUISI[CÇ][AÃ]O\s+DE\s+MATERIAL/i;
const RE_FIM = /Gestor\s+e\s+fiscal|Comandante\s*\/\s*Gestor/i;
function separarRequisicoes(paginas) {
  const blocos = [];
  let atual = null;
  const novo = () => { atual = { linhas: [], titulo: false, categoria: false, terminou: false }; blocos.push(atual); };
  for (const pg of paginas) {
    pg.forEach((l, i) => {
      const titulo = RE_TITULO.test(l);
      const categoria = !titulo && RE_CATEGORIA.test(l);
      if (!atual) novo();
      else if (titulo && (atual.titulo || atual.categoria || atual.terminou)) novo();
      else if (categoria && (atual.categoria || atual.terminou)) novo();
      else if (i === 0 && atual.terminou) novo();
      atual.linhas.push(l);
      if (titulo) atual.titulo = true;
      if (categoria) atual.categoria = true;
      if (RE_FIM.test(l)) atual.terminou = true;
    });
  }
  return blocos.map((x) => x.linhas).filter((x) => x.length);
}

const numeroDaRequisicao = (linhas) => {
  const t = linhas.find((l) => RE_TITULO.test(l));
  const m = t && t.match(/N[º°o]\.?\s*(\d+(?:\s*\/\s*\d{4})?)/i);
  return m ? m[1].replace(/\s+/g, '') : '';
};

function lerRequisicaoApmf(linhas) {
  const rows = linhasDaTabela(linhas);
  const faltando = [];
  if (!rows.length) {
    const itens = lerGenerico(linhas);
    if (itens.length) faltando.push('layout da APMF não reconhecido (categoria, discriminação, data)');
    return { itens, faltando };
  }
  const categoria = categoriaMarcada(linhas);
  const disc = secao(linhas, RE_DISCRIMINACAO);
  const just = secao(linhas, RE_JUSTIFICATIVA);
  const data = dataRequisicao(linhas);
  if (!categoria) faltando.push('categoria');
  if (!disc) faltando.push('discriminação');
  if (!just) faltando.push('justificativa');
  if (!data) faltando.push('data');
  const itens = rows.map((r) => ({ data, categoria, tipo: r.tipo, numero: r.numero, fornecedor: r.fornecedor, valor: r.valor, discriminacao: disc, justificativa: just }));
  return { itens, faltando };
}

// Devolve { itens, faltando, ocr, requisicoes }. "faltando" lista, por requisição, os campos não encontrados.
async function ler(buffer) {
  const todas = await textoDoPdf(buffer);
  const blocos = separarRequisicoes(todas.paginas && todas.paginas.length ? todas.paginas : [todas]);
  const itens = [];
  const faltando = [];
  for (const bloco of blocos) {
    const r = lerRequisicaoApmf(bloco);
    const nome = blocos.length > 1 ? `requisição ${numeroDaRequisicao(bloco) || '?'}: ` : '';
    if (!r.itens.length) faltando.push(`${nome}nenhum item identificado`);
    itens.push(...r.itens);
    faltando.push(...r.faltando.map((c) => nome + c));
  }
  if (!itens.length) {
    const erro = new Error(`nenhum item identificado (${todas.length} linhas lidas${todas.ocr ? ', por OCR' : ''}; a tabela de itens não foi reconhecida)`);
    erro.linhas = todas;
    throw erro;
  }
  return { itens, faltando, ocr: !!todas.ocr, requisicoes: blocos.length };
}

module.exports = { ler, textoDoPdf };
