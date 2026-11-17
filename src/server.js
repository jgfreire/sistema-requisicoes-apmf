const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const session = require('express-session');
const multer = require('multer');

const { usuarios } = require('./database');
const { lerRequisicao } = require('./leitura');
const { gerarXlsx } = require('./exportar');

const PORTA = Number(process.env.PORTA) || 4200;
const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// O segredo de sessão fica em arquivo local, fora do banco.
const arquivoSegredo = path.join(__dirname, '..', '.sessao');
if (!fs.existsSync(arquivoSegredo)) fs.writeFileSync(arquivoSegredo, crypto.randomBytes(32).toString('hex'));

app.use(express.json({ limit: '2mb' }));
app.use(session({
  secret: fs.readFileSync(arquivoSegredo, 'utf8'),
  resave: false, saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', maxAge: 12 * 3600 * 1000 },
}));

const logado = (req, res, next) => (req.session.usuario ? next() : res.status(401).json({ erro: 'Faça login.' }));
const admin = (req, res, next) => (req.session.usuario?.admin ? next() : res.status(403).json({ erro: 'Apenas o administrador.' }));
const handle = (fn) => (req, res) => Promise.resolve(fn(req, res)).catch(() => res.status(500).json({ erro: 'Erro interno.' }));

// --- autenticação ---
app.get('/api/sessao', (req, res) => res.json({ usuario: req.session.usuario || null, primeiroAcesso: usuarios.count() === 0 }));

app.post('/api/primeiro-acesso', (req, res) => {
  const { nome, senha } = req.body || {};
  if (usuarios.count() > 0) return res.status(403).json({ erro: 'Já existe administrador.' });
  if (!nome?.trim() || !senha || senha.length < 6) return res.status(400).json({ erro: 'Informe nome e senha (mínimo 6 caracteres).' });
  usuarios.criar(nome, senha, true);
  res.json({ ok: true });
});

app.post('/api/login', (req, res) => {
  const u = usuarios.autenticar(req.body?.nome, req.body?.senha);
  if (!u) return res.status(401).json({ erro: 'Usuário ou senha incorretos.' });
  req.session.usuario = u;
  res.json({ usuario: u });
});
app.post('/api/logout', (req, res) => req.session.destroy(() => res.json({ ok: true })));

// --- PDFs -> planilha, direto ---
app.post('/api/gerar', logado, upload.array('arquivos', 100), handle(async (req, res) => {
  const itens = [];
  const avisos = [];
  for (const f of req.files || []) {
    const nome = Buffer.from(f.originalname, 'latin1').toString('utf8');
    if (!nome.toLowerCase().endsWith('.pdf')) { avisos.push(`${nome}: apenas PDF é aceito, arquivo ignorado.`); continue; }
    const r = await lerRequisicao(nome, f.buffer);
    itens.push(...r.itens);
    if (r.aviso) avisos.push(`${nome}: ${r.aviso}`);
  }
  if (!itens.length) return res.status(400).json({ erro: 'Nenhum PDF válido foi enviado.' });
  res.set({
    'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Disposition': 'attachment; filename="requisicoes_apmf.xlsx"',
    'X-Avisos': encodeURIComponent(JSON.stringify(avisos)),
    'X-Linhas': String(itens.length),
    'Access-Control-Expose-Headers': 'X-Avisos, X-Linhas',
  });
  res.send(Buffer.from(await gerarXlsx(itens)));
}));

// --- usuários (administrador) ---
app.get('/api/admin/usuarios', logado, admin, (req, res) => res.json(usuarios.listar()));
app.post('/api/admin/usuarios', logado, admin, (req, res) => {
  const { nome, senha } = req.body || {};
  if (!nome?.trim() || !senha || senha.length < 6) return res.status(400).json({ erro: 'Informe nome e senha (mínimo 6 caracteres).' });
  try { usuarios.criar(nome, senha); res.json({ ok: true }); } catch { res.status(409).json({ erro: 'Já existe um usuário com esse nome.' }); }
});
app.put('/api/admin/usuarios/:id/ativo', logado, admin, (req, res) => { usuarios.definirAtivo(Number(req.params.id), !!req.body?.ativo); res.json({ ok: true }); });

app.use(express.static(path.join(__dirname, '..', 'public')));

// Erros de envio (arquivos demais, arquivo grande demais) viram mensagens que a tela consegue mostrar.
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    const texto = {
      LIMIT_UNEXPECTED_FILE: 'Você enviou arquivos demais. Envie no máximo 100 PDFs por vez.',
      LIMIT_FILE_SIZE: 'Um dos arquivos passa de 20 MB.',
    }[err.code] || 'Não foi possível receber os arquivos.';
    return res.status(400).json({ erro: texto });
  }
  res.status(500).json({ erro: 'Erro interno.' });
});

// Escuta em 0.0.0.0 (todas as interfaces) de propósito: o sistema roda na rede e outros computadores precisam acessá-lo.
app.listen(PORTA, '0.0.0.0', () => console.log(`Sistema APMF em http://localhost:${PORTA} (acessível na rede pela porta ${PORTA})`));
