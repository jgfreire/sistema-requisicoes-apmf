const $app = document.getElementById('app');
let usuario = null;

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const msg = (txt, tipo = 'ok') => `<div class="msg ${tipo}">${esc(txt)}</div>`;

async function api(url, opts = {}) {
  const init = { method: opts.method || 'GET', headers: {}, body: opts.formData };
  if (opts.body !== undefined) { init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(opts.body); }
  const r = await fetch(url, init);
  if (opts.resposta) return r;
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.erro || 'Erro.');
  return d;
}

async function iniciar() {
  const s = await api('/api/sessao');
  usuario = s.usuario;
  document.getElementById('usuario').hidden = !usuario;
  document.getElementById('nome-usuario').textContent = usuario ? `Olá, ${usuario.nome}` : '';
  document.getElementById('link-usuarios').hidden = !(usuario && usuario.admin);
  if (!usuario) return telaLogin(s.primeiroAcesso);
  telaPrincipal();
}
document.getElementById('sair').onclick = async () => { await api('/api/logout', { method: 'POST' }); iniciar(); };

function telaLogin(primeiro) {
  $app.innerHTML = `<div class="cartao"><h2 style="margin-top:0">${primeiro ? 'Primeiro acesso: criar administrador' : 'Entrar'}</h2>
    <label>Usuário</label><input id="u" autofocus><label>Senha</label><input id="s" type="password">
    <p><button id="ok">${primeiro ? 'Criar administrador' : 'Entrar'}</button></p><div id="m"></div></div>`;
  const enviar = async () => {
    const m = document.getElementById('m');
    const nome = u.value; const senha = s.value;
    try {
      if (primeiro) await api('/api/primeiro-acesso', { method: 'POST', body: { nome, senha } });
      await api('/api/login', { method: 'POST', body: { nome, senha } });
      iniciar();
    } catch (e) { m.innerHTML = msg(e.message, 'erro'); }
  };
  document.getElementById('ok').onclick = enviar;
  $app.onkeydown = (e) => { if (e.key === 'Enter') enviar(); };
}

// Tela única: escolher os PDFs e baixar a planilha.
function telaPrincipal() {
  $app.onkeydown = null;
  $app.innerHTML = `
    <div class="cartao" style="max-width:640px">
      <label>Escolha as requisições (PDF)</label>
      <input id="arq" type="file" multiple accept=".pdf">
      <p><button id="gerar">Gerar planilha</button></p>
    </div>
    <div id="aviso"></div>`;
  document.getElementById('gerar').onclick = gerar;
}

async function gerar() {
  const files = document.getElementById('arq').files;
  const aviso = document.getElementById('aviso');
  if (!files.length) return (aviso.innerHTML = msg('Escolha ao menos um PDF.', 'aviso'));
  aviso.innerHTML = msg('Lendo as requisições, aguarde...', 'aviso');
  const fd = new FormData();
  [...files].forEach((f) => fd.append('arquivos', f));
  try {
    const r = await api('/api/gerar', { method: 'POST', formData: fd, resposta: true });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).erro || 'Erro ao gerar a planilha.');
    const avisos = JSON.parse(decodeURIComponent(r.headers.get('X-Avisos') || '[]'));
    const blob = await r.blob();
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'requisicoes_apmf.xlsx' });
    a.click(); URL.revokeObjectURL(a.href);
    aviso.innerHTML = msg(`Planilha gerada com ${r.headers.get('X-Linhas')} linha(s). Confira o arquivo baixado.`) +
      avisos.map((t) => msg(t, 'aviso')).join('');
    document.getElementById('arq').value = '';
  } catch (e) { aviso.innerHTML = msg(e.message, 'erro'); }
}


iniciar();
