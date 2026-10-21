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
function nomeOficial(lida) {
  const nome = normalizar(semNumero(String(lida || '')));
  return CATEGORIAS.find((c) => normalizar(semNumero(c)) === nome) || lida;
}

async function lerRequisicao(nomeArquivo, buffer) {
  try {
    const itens = (await local.ler(buffer)).map(({ generico, ...i }) => (generico
      ? { ...i, tipo: detectarTipo(i.justificativa), categoria: detectarCategoria(i.justificativa) }
      : { ...i, categoria: nomeOficial(i.categoria) }));
    return { itens, aviso: '' };
  } catch {
    return {
      itens: [{ data: '', tipo: '', numero: '', fornecedor: '', discriminacao: `NÃO LIDO: ${nomeArquivo}`, justificativa: '', categoria: '', valor: null }],
      aviso: 'não foi possível ler o arquivo (precisa ser PDF com texto); a linha dele ficou sinalizada na planilha.',
    };
  }
}

module.exports = { lerRequisicao };
