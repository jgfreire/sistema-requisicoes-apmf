// Leitura local da requisição (PDF). Se não conseguir ler, devolve uma linha sinalizada para conferência no Excel.
const local = require('./leitorLocal');

// Categorias do formulário da APMF, com o número que vem junto no documento.
const CATEGORIAS = ['1-Alimentação', '2-Bens Permanentes', '3-Materiais de Consumo', '4-Obras, Manutenções e Transportes',
  '5-Prestadores de Serviço e Encargos', '6-Projetos e Eventos', '7-Despesas Diversas'];

const normalizar = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const semNumero = (c) => c.replace(/^\d+\s*-\s*/, '');
const SERVICO = /\b(servic\w*|conserto|reparo|manutenc\w*|instalac\w*|mao de obra|prestac\w*|locac\w*|dedetizac\w*|limpeza de|pintura|frete|transporte)\b/;

// Só usados no formato genérico (fora do layout da APMF).
const detectarTipo = (texto) => (SERVICO.test(normalizar(texto)) ? 'Serviço' : 'Material');
function detectarCategoria(texto) {
  const t = normalizar(texto);
  return CATEGORIAS.find((c) => t.includes(normalizar(semNumero(c)))) || '';
}

// Categoria lida do PDF ("7-Despesas Diversas") -> forma oficial da lista, com número (ignora acento e maiúsculas).
// O número vale mais que o nome: se o nome veio truncado ou com erro de OCR, o número ainda indica a categoria certa.
function nomeOficial(lida) {
  const numero = String(lida || '').match(/^\s*([1-7])\s*-/);
  if (numero) return CATEGORIAS[Number(numero[1]) - 1];
  const nome = normalizar(semNumero(String(lida || '')));
  return CATEGORIAS.find((c) => normalizar(semNumero(c)) === nome) || lida;
}

async function lerRequisicao(nomeArquivo, buffer) {
  try {
    const { itens: lidos, faltando, ocr } = await local.ler(buffer);
    const itens = lidos.map(({ generico, ...i }) => (generico
      ? { ...i, tipo: detectarTipo(i.justificativa), categoria: detectarCategoria(i.justificativa) }
      : { ...i, categoria: nomeOficial(i.categoria) }));
    const avisos = [];
    if (ocr) avisos.push('o PDF não tem texto (foi impresso como desenho) e foi lido por OCR; confira os dados na planilha');
    if (faltando.length) avisos.push(`não encontrei: ${faltando.join(', ')}`);
    return { itens, aviso: avisos.join('; ') };
  } catch (e) {
    const motivo = e && e.message ? e.message : String(e);
    // Registra o motivo e o que o sistema conseguiu enxergar no PDF, para diagnóstico (arquivo local, fora do GitHub).
    try {
      const fs = require('fs'); const path = require('path');
      const texto = (e && e.linhas ? e.linhas.slice(0, 60).join('\n') : '(sem texto lido)');
      fs.appendFileSync(path.join(__dirname, '..', 'erros-leitura.log'),
        `\n===== ${new Date().toLocaleString('pt-BR')} | ${nomeArquivo}\nMotivo: ${motivo}\n${texto}\n`);
    } catch { /* o log é opcional */ }
    console.error(`[leitura] ${nomeArquivo}: ${motivo}`);
    return {
      itens: [{ data: '', tipo: '', numero: '', fornecedor: '', discriminacao: `NÃO LIDO: ${nomeArquivo} (${motivo})`, justificativa: '', categoria: '', valor: null }],
      aviso: `não foi possível ler o arquivo: ${motivo}. A linha dele ficou sinalizada na planilha.`,
    };
  }
}

module.exports = { lerRequisicao };
