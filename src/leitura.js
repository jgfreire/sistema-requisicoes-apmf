// Leitura local da requisição (PDF). Se não conseguir ler, devolve uma linha sinalizada para conferência no Excel.
const local = require('./leitorLocal');

const CATEGORIAS = ['Alimentação', 'Bens Permanentes', 'Materiais de Consumo', 'Obras, Manutenções e Transportes',
  'Prestadores de Serviço e Encargos', 'Projetos e Eventos', 'Despesas Diversas'];

const normalizar = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const SERVICO = /\b(servic\w*|conserto|reparo|manutenc\w*|instalac\w*|mao de obra|prestac\w*|locac\w*|dedetizac\w*|limpeza de|pintura|frete|transporte)\b/;

// Só usados no formato genérico (fora do layout da APMF).
const detectarTipo = (texto) => (SERVICO.test(normalizar(texto)) ? 'Serviço' : 'Material');
function detectarCategoria(texto) {
  const t = normalizar(texto);
  return CATEGORIAS.find((c) => t.includes(normalizar(c))) || '';
}

// Categoria lida do PDF -> nome oficial da lista (ignora diferenças de acento e maiúsculas).
const nomeOficial = (lida) => CATEGORIAS.find((c) => normalizar(c) === normalizar(lida)) || lida;

async function lerRequisicao(nomeArquivo, buffer) {
  try {
    const itens = (await local.ler(buffer)).map(({ generico, ...i }) => (generico
      ? { ...i, tipo: detectarTipo(i.justificativa), categoria: detectarCategoria(i.justificativa) }
      : { ...i, categoria: nomeOficial(i.categoria) }));
    return { itens, aviso: '' };
  } catch {
    return {
      itens: [{ tipo: '', numero: '', fornecedor: '', discriminacao: `NÃO LIDO: ${nomeArquivo}`, justificativa: '', categoria: '', valor: null }],
      aviso: 'não foi possível ler o arquivo (precisa ser PDF com texto); a linha dele ficou sinalizada na planilha.',
    };
  }
}

module.exports = { lerRequisicao };
