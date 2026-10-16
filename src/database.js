const path = require('path');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');

// O banco guarda apenas os usuários do sistema.
const db = new DatabaseSync(path.join(__dirname, '..', 'apmf.db'));
db.exec(`
  PRAGMA journal_mode = DELETE;
  CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY, nome TEXT UNIQUE NOT NULL, salt TEXT NOT NULL, hash TEXT NOT NULL,
    admin INTEGER NOT NULL DEFAULT 0, ativo INTEGER NOT NULL DEFAULT 1);
`);

const hash = (senha, salt) => crypto.scryptSync(senha, salt, 64).toString('hex');

const usuarios = {
  count: () => db.prepare('SELECT COUNT(*) n FROM usuarios').get().n,
  criar(nome, senha, admin = false) {
    const salt = crypto.randomBytes(16).toString('hex');
    db.prepare('INSERT INTO usuarios (nome, salt, hash, admin) VALUES (?,?,?,?)')
      .run(nome.trim(), salt, hash(senha, salt), admin ? 1 : 0);
  },
  autenticar(nome, senha) {
    const u = db.prepare('SELECT * FROM usuarios WHERE nome = ? AND ativo = 1').get(String(nome).trim());
    if (!u) return null;
    const a = Buffer.from(u.hash, 'hex');
    const b = Buffer.from(hash(String(senha), u.salt), 'hex');
    return crypto.timingSafeEqual(a, b) ? { id: u.id, nome: u.nome, admin: !!u.admin } : null;
  },
  listar: () => db.prepare('SELECT id, nome, admin, ativo FROM usuarios ORDER BY nome').all(),
  definirAtivo: (id, ativo) => db.prepare('UPDATE usuarios SET ativo = ? WHERE id = ? AND admin = 0').run(ativo ? 1 : 0, id),
};

module.exports = { usuarios };
