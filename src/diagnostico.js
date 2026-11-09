// Uso: node src/diagnostico.js caminho\do\arquivo.pdf
// Mostra o texto que o sistema enxerga no PDF e o que ele extraiu. Não altera nada.
const fs = require('fs');
const { textoDoPdf, ler } = require('./leitorLocal');

(async () => {
  const arq = process.argv[2];
  if (!arq) return console.log('Uso: node src/diagnostico.js arquivo.pdf');
  const buf = fs.readFileSync(arq);
  console.log('=== TEXTO LIDO (uma linha por linha do PDF) ===');
  (await textoDoPdf(buf)).forEach((l, i) => console.log(String(i + 1).padStart(3), '|', l));
  console.log('\n=== EXTRAÍDO ===');
  try { console.log(JSON.stringify(await ler(buf), null, 2)); } catch (e) { console.log('ERRO:', e.message); }
  await require('./ocr').encerrar();
})();
