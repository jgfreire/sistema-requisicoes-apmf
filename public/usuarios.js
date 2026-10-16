const $app = document.getElementById('app');
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const msg = (txt, tipo = 'ok') => `<div class="msg ${tipo}">${esc(txt)}</div>`;

async function api(url, opts = {}) {
  const init = { method: opts.method || 'GET', headers: {} };
  if (opts.body !== undefined) { init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(opts.body); }
  const r = await fetch(url, init);
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.erro || 'Erro.');
  return d;
}

async function iniciar() {
  const s = await api('/api/sessao');
  if (!s.usuario) return ($app.innerHTML = msg('Faça login na página inicial para continuar.', 'aviso') + '<p><a href="index.html">Ir para o login</a></p>');
  if (!s.usuario.admin) return ($app.innerHTML = msg('Apenas o administrador pode cadastrar usuários.', 'erro'));
  tela();
}

async function tela() {
  const us = await api('/api/admin/usuarios');
  $app.innerHTML = `
    <div class="cartao">
      <h2 style="margin-top:0">Novo usuário</h2>
      <label>Nome</label><input id="nn" autocomplete="off">
      <label>Senha (mínimo 6 caracteres)</label><input id="ns" type="password" autocomplete="new-password">
      <p><button id="cad">Cadastrar</button></p><div id="mu"></div>
    </div>
    <h2>Usuários cadastrados</h2>
    <table><thead><tr><th>Nome</th><th>Situação</th><th></th></tr></thead><tbody>
      ${us.map((x) => `<tr><td class="t">${esc(x.nome)}${x.admin ? ' (administrador)' : ''}</td><td class="t">${x.ativo ? 'Ativo' : 'Inativo'}</td>
        <td>${x.admin ? '' : `<button class="sec tg" data-id="${x.id}" data-a="${x.ativo ? 0 : 1}">${x.ativo ? 'Desativar' : 'Ativar'}</button>`}</td></tr>`).join('')}
    </tbody></table>`;
  const cadastrar = async () => {
    try {
      await api('/api/admin/usuarios', { method: 'POST', body: { nome: nn.value, senha: ns.value } });
      await tela();
      document.getElementById('mu').innerHTML = msg('Usuário cadastrado.');
    } catch (e) { document.getElementById('mu').innerHTML = msg(e.message, 'erro'); }
  };
  document.getElementById('cad').onclick = cadastrar;
  $app.onkeydown = (e) => { if (e.key === 'Enter') cadastrar(); };
  $app.querySelectorAll('.tg').forEach((b) => {
    b.onclick = async () => { await api(`/api/admin/usuarios/${b.dataset.id}/ativo`, { method: 'PUT', body: { ativo: b.dataset.a === '1' } }); tela(); };
  });
}

iniciar();
