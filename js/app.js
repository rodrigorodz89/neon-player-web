/* Neon Player web — abertura e fluxo.

   1. Tem usuário e senha guardados? Confere na API do Neon (só entra quem está
      cadastrado no painel) e abre a lista.
   2. Não tem? Pergunta se o CÓDIGO deste aparelho foi cadastrado (o caminho de
      todo app da casa). Cadastrado, entra direto; senão, tela de Entrar.
   3. O servidor da lista nunca é digitado nem mostrado: vem do cadastro. */
'use strict';

/* O vídeo dos servidores de lista só sai em http, direto para o aparelho. Página
   em https não consegue tocar (o navegador barra), então o player mora num
   endereço http. Quem chegar por https é levado para lá. */
var CASA_HTTP = 'player.duollab.com';
(function () {
  if (location.protocol !== 'https:' || Api.local) return;
  var host = /(^|\.)neontv\.app$|\.pages\.dev$/.test(location.hostname) ? CASA_HTTP : location.hostname;
  location.replace('http://' + host + '/');
})();

var App = (function () {
  var entrando = false;

  function aviso(selo, titulo, texto, opcoes) {
    opcoes = opcoes || {};
    $('aviso-selo').textContent = selo; $('aviso-titulo').textContent = titulo; $('aviso-texto').textContent = texto;
    $('aviso-sair').hidden = opcoes.semSair === true;
    $('aviso-sair').textContent = Guarda.ler('np_login', null) ? 'Entrar com outro usuário' : 'Entrar com usuário e senha';
    Tela.mostrar('aviso');
  }
  function irParaEntrar(erro, comDemo) {
    Nav.zerar(); AoVivo.parar();
    $('entrar-erro').textContent = erro || '';
    $('btn-demo').hidden = !comDemo;
    $('btn-entrar').disabled = false; $('btn-entrar').textContent = 'Entrar';
    var l = Guarda.ler('np_login', null);
    if (l && l.u && !$('in-usuario').value) $('in-usuario').value = l.u;
    Tela.mostrar('entrar');
  }

  // Resposta da API (login ou código): decide a tela.
  function tratar(r, viaLogin, loginUsado) {
    var st = r && r.status;
    if (st === 'active' || st === 'demo') {
      var fonte = (r.sources && r.sources[0]) || r.source;
      if (!fonte || fonte.type !== 'xtream' || !fonte.dns) {
        aviso('lista', 'Lista não compatível', 'Esta lista usa um formato que o player do navegador ainda não abre. Use o aplicativo Neon Player na TV ou no computador.');
        return;
      }
      if (viaLogin && loginUsado) Guarda.gravar('np_login', loginUsado);
      Sessao.status = st; Sessao.viaLogin = !!viaLogin; Sessao.cliente = r.label || null; Sessao.listaNome = fonte.nome || null;
      Sessao.demo = st === 'demo' ? (r.demo || { dias: 1 }) : null;
      Sessao.suporte = st === 'active' && r.support ? (r.support.whatsapp || null) : null;
      Pais.aplicarResetRemoto(r.parental_reset_at);
      Lista.usar(fonte);
      abrirLista();
      return;
    }
    if (st === 'blocked') { aviso('bloqueado', 'Acesso bloqueado', Textos.bloqueado); return; }
    if (st === 'expired') { aviso('vencido', 'Acesso vencido', Textos.vencido); return; }
    // sem cadastro
    if (viaLogin) { irParaEntrar((r && r.message) || Textos.naoConfere, false); return; }
    irParaEntrar('', false);
  }

  function abrirLista() {
    Tela.mostrar('carga'); Tela.status(Textos.carregandoConta);
    Catalogo.limpar(); Inicio.zerar(); Tv.zerar(); Vod.zerar(); Pag.esquecer();
    Lista.conta().then(function (c) {
      if (!c.aceita) { aviso('lista', 'Lista com problema', Textos.listaProblema); return; }
      Sessao.vence = c.vence;
      return Catalogo.carregar(Tela.status).then(function () {
        Tela.mostrar('casca');
        Pag.ir('inicio');
        Instalar.oferecer();
      });
    }).catch(function (e) {
      console.error(e);
      aviso('sem resposta', 'O servidor não respondeu', navigator.onLine === false ? Textos.semConexao : Textos.servidorMudo);
    });
  }

  function carregar() {
    Tela.mostrar('carga'); Tela.status('Abrindo…');
    var login = Guarda.ler('np_login', null);
    if (login && login.u && login.s) {
      Api.entrar(login.u, login.s).then(function (r) { tratar(r, true, login); }).catch(function (e) {
        aviso('sem conexão', 'Sem conexão', e && e.freio ? Textos.muitasTentativas : Textos.semConexao);
      });
      return;
    }
    Api.ativar().then(function (r) {
      if (r && r.status === 'active') { tratar(r, false); return; }
      if (r && (r.status === 'blocked' || r.status === 'expired')) { tratar(r, false); return; }
      // sem cadastro pelo código: a porta é o usuário e a senha; a demonstração fica a um toque
      App._demo = r && r.status === 'demo' ? r : null;
      irParaEntrar('', !!App._demo);
    }).catch(function () { App._demo = null; irParaEntrar('', false); });
  }

  function enviarLogin(ev) {
    if (ev) ev.preventDefault();
    if (entrando) return;
    var u = $('in-usuario').value.trim(), s = $('in-senha').value;
    if (!u || !s) { $('entrar-erro').textContent = 'Digite o usuário e a senha.'; return; }
    entrando = true; $('entrar-erro').textContent = ''; $('btn-entrar').disabled = true; $('btn-entrar').textContent = 'Entrando…';
    document.activeElement && document.activeElement.blur && document.activeElement.blur();
    Api.entrar(u, s).then(function (r) {
      entrando = false; $('btn-entrar').disabled = false; $('btn-entrar').textContent = 'Entrar';
      if (r && (r.status === 'active' || r.status === 'blocked' || r.status === 'expired')) $('in-senha').value = '';
      tratar(r, true, { u: u, s: s });
    }).catch(function (e) {
      entrando = false; $('btn-entrar').disabled = false; $('btn-entrar').textContent = 'Entrar';
      $('entrar-erro').textContent = e && e.freio ? Textos.muitasTentativas : Textos.semConexao;
    });
  }

  function sair() {
    Guarda.apagar('np_login');
    Catalogo.limpar(); Lista.usar(null);
    $('in-usuario').value = ''; $('in-senha').value = '';
    carregar();
  }

  function iniciar() {
    Busca.iniciar(); Inicio.iniciar(); Tv.iniciar(); Vod.iniciar(); Ficha.iniciar(); Cinema.iniciar();
    [].forEach.call(document.querySelectorAll('#guias button, #abas button'), function (b) {
      b.addEventListener('click', function () { Pag.ir(b.getAttribute('data-pag')); });
    });
    $('btn-config').addEventListener('click', function () { Pag.ir('config'); });
    $('btn-atualizar').addEventListener('click', function () { recarregar(); });
    document.querySelector('#barra .logo').addEventListener('click', function () { Pag.ir('inicio'); });
    $('form-entrar').addEventListener('submit', enviarLogin);
    $('in-usuario').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); $('in-senha').focus(); } });
    $('ver-senha').addEventListener('click', function () { var i = $('in-senha'); i.type = i.type === 'password' ? 'text' : 'password'; });
    $('btn-demo').addEventListener('click', function () { if (App._demo) tratar(App._demo, false); });
    $('aviso-tentar').addEventListener('click', carregar);
    $('aviso-sair').addEventListener('click', function () { Guarda.apagar('np_login'); irParaEntrar('', false); });
    // nada de menu de contexto nem de arrastar imagem: é um app, não uma página
    document.addEventListener('contextmenu', function (e) { if (!/^(INPUT|TEXTAREA)$/.test(e.target.tagName)) e.preventDefault(); });
    document.addEventListener('dragstart', function (e) { e.preventDefault(); });
    carregar();
  }
  function recarregar() { Nav.zerar(); AoVivo.parar(); carregar(); }

  return { iniciar: iniciar, recarregar: recarregar, sair: sair, irParaEntrar: irParaEntrar, _demo: null };
})();

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', App.iniciar); else App.iniciar();
