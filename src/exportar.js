const ExcelJS = require('exceljs');

const COLUNAS = [
  ['Tipo', 'tipo', 12], ['Número', 'numero', 12], ['Fornecedor/Prestador', 'fornecedor', 34],
  ['Discriminação', 'discriminacao', 45], ['Justificativa', 'justificativa', 50],
  ['Categoria', 'categoria', 28], ['Valor', 'valor', 14],
];
const REAL = '"R$" #,##0.00';

async function gerarXlsx(itens) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Requisições APMF', { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = COLUNAS.map(([header, key, width]) => ({ header, key, width }));
  ws.getRow(1).eachCell((c) => {
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF8B7765' } };
  });
  itens.forEach((it) => ws.addRow(it));
  ws.getColumn('valor').numFmt = REAL;
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
