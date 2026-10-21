const ExcelJS = require('exceljs');

const COLUNAS = [
  ['Tipo', 'tipo', 12], ['Número', 'numero', 12], ['Fornecedor/Prestador', 'fornecedor', 34],
  ['Discriminação', 'discriminacao', 45], ['Justificativa', 'justificativa', 50],
  ['Categoria', 'categoria', 36], ['Valor', 'valor', 14], ['Data', 'data', 13],
];
const REAL = '"R$" #,##0.00';

// "11/08/2026" -> data de verdade do Excel (para ordenar e filtrar); se não der, mantém o texto.
function paraData(txt) {
  const m = String(txt || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? new Date(Date.UTC(+m[3], +m[2] - 1, +m[1])) : (txt || null);
}

async function gerarXlsx(itens) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Requisições APMF', { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = COLUNAS.map(([header, key, width]) => ({ header, key, width }));
  ws.getRow(1).eachCell((c) => {
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF8B7765' } };
  });
  itens.forEach((it) => ws.addRow({ ...it, data: paraData(it.data) }));
  ws.getColumn('valor').numFmt = REAL;
  ws.getColumn('data').numFmt = 'dd/mm/yyyy';
  for (const k of ['discriminacao', 'justificativa', 'fornecedor']) ws.getColumn(k).alignment = { wrapText: true, vertical: 'top' };
  const ultima = ws.rowCount;
  if (ultima > 1) {
    const col = ws.getColumn('valor').letter;
    const t = ws.addRow({ categoria: 'Total', valor: { formula: `SUM(${col}2:${col}${ultima})` } });
    t.font = { bold: true };
    t.getCell('valor').numFmt = REAL;
  }
  return wb.xlsx.writeBuffer();
}

module.exports = { gerarXlsx };
