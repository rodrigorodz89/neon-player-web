/* Neon Player web — base: utilidades, guarda local, textos, controle dos pais. */
'use strict';

var VERSAO = '0.1.5';

function $(id) { return document.getElementById(id); }
function el(tag, attrs, filhos) {
  var e = document.createElement(tag), k;
  if (attrs) for (k in attrs) {
    if (!Object.prototype.hasOwnProperty.call(attrs, k) || attrs[k] == null || attrs[k] === false) continue;
    if (k === 'class') e.className = attrs[k];
    else if (k === 'text') e.textContent = attrs[k];
    else if (k === 'html') e.innerHTML = attrs[k];
    else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), attrs[k]);
    else e.setAttribute(k, attrs[k]);
  }
  (filhos || []).forEach(function (f) { if (f) e.appendChild(typeof f === 'string' ? document.createTextNode(f) : f); });
  return e;
}
function limpar(no) { while (no.firstChild) no.removeChild(no.firstChild); }

/* localStorage pode faltar (modo privado antigo) ou lotar: nunca derruba o app. */
var Guarda = {
  ler: function (k, padrao) {
    try { var v = localStorage.getItem(k); return v == null ? padrao : JSON.parse(v); } catch (e) { return padrao; }
  },
  gravar: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
  apagar: function (k) { try { localStorage.removeItem(k); } catch (e) {} }
};

var Aparelho = (function () {
  var ua = navigator.userAgent || '';
  var ipad = /iPad/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var iphone = /iPhone|iPod/.test(ua);
  var ios = iphone || ipad;
  // aberto pelo ícone da tela de início (sem a barra do navegador)
  var instalado = window.navigator.standalone === true ||
    (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
  // o que o painel mostra na coluna Aparelho
  var plataforma = iphone ? 'iphone' : (ipad ? 'ipad' : 'web');

  // Código do aparelho: 12 hex sorteados uma vez e guardados, como no app de TV
  // quando roda num navegador. É o que o parceiro cadastra no painel, se quiser
  // liberar pelo código em vez do usuário e senha.
  function codigo() {
    var c = Guarda.ler('np_codigo', '');
    if (!/^[0-9a-f]{12}$/.test(c)) {
      var b = new Uint8Array(6), i;
      if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(b);
      else for (i = 0; i < 6; i++) b[i] = Math.floor(Math.random() * 256);
      c = Array.prototype.map.call(b, function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
      Guarda.gravar('np_codigo', c);
    }
    return c;
  }
  function codigoBonito() { return codigo().toUpperCase().replace(/(..)(?=.)/g, '$1:'); }

  return { ios: ios, iphone: iphone, ipad: ipad, instalado: instalado, plataforma: plataforma, codigo: codigo, codigoBonito: codigoBonito };
})();

/* Todo texto de tela mora aqui. Neutro: sem nome de servidor, sem endereço. */
var Textos = {
  app: 'Neon Player',
  filme: 'Filme', serie: 'Série',
  inicio: 'Início', tv: 'TV ao Vivo', filmes: 'Filmes', series: 'Séries',
  carregandoConta: 'Conferindo o acesso…',
  carregandoCanais: 'Carregando canais…',
  carregandoConteudo: 'Carregando conteúdo…',
  semConexao: 'Sem conexão com a internet. Confira o Wi-Fi ou os dados móveis.',
  servidorMudo: 'O servidor da lista não respondeu. Pode estar fora do ar.',
  listaProblema: 'Há um problema com a sua lista de reprodução.',
  naoConfere: 'Usuário ou senha não conferem com nenhum cadastro. Fale com quem configurou o seu acesso.',
  muitasTentativas: 'Muitas tentativas. Aguarde alguns minutos e tente de novo.',
  bloqueado: 'Este acesso está bloqueado. Fale com quem configurou o seu acesso.',
  vencido: 'Este acesso venceu. Fale com quem configurou o seu acesso para renovar.',
  canalFora: 'Não foi possível abrir este canal agora.',
  videoFora: 'Não foi possível reproduzir este vídeo.',
  videoFormato: 'Este vídeo está num formato que o navegador do celular não reproduz.',
  todosCanais: 'Todos os canais', favoritos: 'Favoritos', recentes: 'Vistos recentemente',
  tudo: 'Tudo', continuar: 'Continuar assistindo',
  filmesAdicionados: 'Filmes adicionados', seriesAdicionadas: 'Séries adicionadas'
};

/* Controle dos Pais: ligado de fábrica, senha 0000 (regra da casa). Categoria
   adulta aparece com cadeado e some de "Tudo", da busca e do Início. */
var Pais = (function () {
  var ADULTO = /(\+18|18\+|adult|xxx|porn|erot|onlyfans|sexy|hentai)/i;
  var liberadoAgora = false;   // vale até fechar o app
  function ehAdulta(nome) { return ADULTO.test(nome || ''); }
  function ligado() { return Guarda.ler('np_pais_ligado', true) !== false; }
  function senha() { return String(Guarda.ler('np_pais_senha', '0000')); }
  function travado() { return ligado() && !liberadoAgora; }
  function conferir(s) { if (String(s) === senha()) { liberadoAgora = true; return true; } return false; }
  function trocarSenha(nova) { Guarda.gravar('np_pais_senha', String(nova)); }
  function ligar(sim) { Guarda.gravar('np_pais_ligado', !!sim); if (sim) liberadoAgora = false; }
  // o parceiro pediu no painel para voltar à senha de fábrica: aplica uma vez
  function aplicarResetRemoto(ts) {
    ts = Number(ts) || 0;
    if (ts <= 0 || ts <= Number(Guarda.ler('np_pais_reset', 0))) return false;
    Guarda.gravar('np_pais_reset', ts); Guarda.gravar('np_pais_senha', '0000'); Guarda.gravar('np_pais_ligado', true);
    liberadoAgora = false;
    return true;
  }
  return { ehAdulta: ehAdulta, ligado: ligado, travado: travado, conferir: conferir, trocarSenha: trocarSenha, ligar: ligar, aplicarResetRemoto: aplicarResetRemoto };
})();

/* "FILMES | TERROR" -> "TERROR"; sem emoji decorativo no nome. */
function nomeLimpo(nome) {
  var s = String(nome || '').replace(/\s+/g, ' ').trim();
  var i = s.lastIndexOf('|');
  if (i >= 0 && i < s.length - 1) s = s.slice(i + 1).trim();
  return s;
}

function tempoBonito(seg) {
  seg = Math.max(0, Math.floor(seg || 0));
  var h = Math.floor(seg / 3600), m = Math.floor((seg % 3600) / 60), s = seg % 60;
  return (h ? h + ':' + ('0' + m).slice(-2) : m) + ':' + ('0' + s).slice(-2);
}

function semAcento(s) {
  s = String(s || '').toLowerCase();
  return s.normalize ? s.normalize('NFD').replace(/[̀-ͯ]/g, '') : s;
}

var Toast = (function () {
  var t = null;
  return function (msg, ms) {
    var no = $('toast'); no.textContent = msg; no.classList.add('vis');
    clearTimeout(t); t = setTimeout(function () { no.classList.remove('vis'); }, ms || 2600);
  };
})();

function copiar(texto, aviso) {
  function ok() { Toast(aviso || 'Copiado'); }
  function reserva() {
    var a = el('textarea', { style: 'position:fixed;opacity:0' }); a.value = texto; document.body.appendChild(a);
    a.select(); try { document.execCommand('copy'); ok(); } catch (e) {} document.body.removeChild(a);
  }
  // em página http não existe navigator.clipboard (contexto não seguro): cai na reserva
  if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(texto).then(ok, reserva); else reserva();
}

/* Folha que sobe de baixo: lista de categorias, confirmação, senha, instalar. */
var Folha = (function () {
  var aoFechar = null;
  function abrir(montar, depoisDeFechar) {
    var caixa = $('folha-caixa'); limpar(caixa);
    caixa.style.transform = '';
    caixa.appendChild(el('div', { class: 'pega' }));
    // sair sem escolher nada (19/11/2026: a folha de categorias prendia a pessoa):
    // o X, tocar fora e arrastar para baixo fecham
    caixa.appendChild(el('button', { class: 'folha-x', type: 'button', 'aria-label': 'Fechar', onclick: fechar },
      [Icones.svg(['M6 6l12 12', 'M18 6L6 18'])]));
    montar(caixa);
    aoFechar = depoisDeFechar || null;
    $('folha').classList.add('aberta');
    Nav.camada('folha', fecharSemVoltar);
  }
  function fecharSemVoltar() {
    $('folha').classList.remove('aberta');
    var f = aoFechar; aoFechar = null; if (f) f();
  }
  function fechar() { if ($('folha').classList.contains('aberta')) Nav.voltar(); }
  // ⚠️ No iPhone o "click" não dispara em <div> comum sem cursor:pointer (o CSS de #folha tem):
  // era por isso que tocar fora da folha não fechava nada.
  document.addEventListener('click', function (e) { if (e.target === $('folha')) fechar(); });

  // Arrastar para baixo fecha: pela alça e pelo título sempre; pela lista, só quando ela
  // já está no topo (senão o gesto é rolar a lista).
  (function () {
    var y0 = null, dy = 0, caixa = null, peloCorpo = false;
    document.addEventListener('touchstart', function (e) {
      caixa = $('folha-caixa');
      if (!$('folha').classList.contains('aberta') || !caixa.contains(e.target) || e.touches.length !== 1) { y0 = null; return; }
      if (e.target.closest('button,input,select,a')) {
        var corpo0 = e.target.closest('.corpo');
        if (!corpo0) { y0 = null; return; }   // botões fora da lista: deixa o toque ser toque
      }
      var corpo = e.target.closest('.corpo');
      peloCorpo = !!corpo;
      if (corpo && corpo.scrollTop > 0) { y0 = null; return; }
      y0 = e.touches[0].clientY; dy = 0;
    }, { passive: true });
    document.addEventListener('touchmove', function (e) {
      if (y0 == null) return;
      dy = e.touches[0].clientY - y0;
      if (dy <= 0) { if (peloCorpo) { y0 = null; caixa.style.transform = ''; } return; }
      if (e.cancelable) e.preventDefault();
      caixa.style.transition = 'none';
      caixa.style.transform = 'translateY(' + dy + 'px)';
    }, { passive: false });
    document.addEventListener('touchend', function () {
      if (y0 == null) return;
      y0 = null;
      caixa.style.transition = 'transform .18s ease';
      if (dy > 90) { caixa.style.transform = 'translateY(100%)'; setTimeout(function () { fechar(); caixa.style.transform = ''; caixa.style.transition = ''; }, 170); }
      else { caixa.style.transform = ''; setTimeout(function () { caixa.style.transition = ''; }, 200); }
      dy = 0;
    });
  })();

  // itens: [{ rotulo, extra, valor, sel, cadeado }]
  function lista(titulo, itens, aoEscolher) {
    abrir(function (c) {
      c.appendChild(el('h3', { text: titulo }));
      var corpo = el('div', { class: 'corpo' });
      itens.forEach(function (it) {
        corpo.appendChild(el('button', { class: 'linha' + (it.sel ? ' sel' : ''), onclick: function () { fechar(); setTimeout(function () { aoEscolher(it.valor); }, 30); } }, [
          el('span', { class: 't', text: it.rotulo }),
          it.cadeado ? Icones.cadeado() : null,
          it.extra != null ? el('span', { class: 'q', text: String(it.extra) }) : null
        ]));
      });
      c.appendChild(corpo);
      var sel = corpo.querySelector('.sel'); if (sel) setTimeout(function () { sel.scrollIntoView({ block: 'center' }); }, 0);
    });
  }
  function confirmar(titulo, texto, rotuloSim, aoSim, rotuloNao) {
    abrir(function (c) {
      c.appendChild(el('h3', { text: titulo }));
      if (texto) c.appendChild(el('div', { class: 'texto', text: texto }));
      c.appendChild(el('div', { class: 'botoes' }, [
        el('button', { class: 'btn s', text: rotuloNao || 'Cancelar', onclick: fechar }),
        el('button', { class: 'btn p', text: rotuloSim || 'Sim', onclick: function () { fechar(); setTimeout(aoSim, 30); } })
      ]));
    });
  }
  function senha(titulo, texto, aoDigitar) {
    abrir(function (c) {
      c.appendChild(el('h3', { text: titulo }));
      if (texto) c.appendChild(el('div', { class: 'texto', text: texto }));
      var inp = el('input', { type: 'password', inputmode: 'numeric', pattern: '[0-9]*', maxlength: '4', autocomplete: 'off' });
      c.appendChild(el('div', { class: 'pin' }, [inp]));
      function tentar() { var v = inp.value; if (v.length < 4) return; if (aoDigitar(v) === false) { inp.value = ''; Toast('Senha incorreta'); } else fechar(); }
      inp.addEventListener('input', tentar);
      c.appendChild(el('div', { class: 'botoes' }, [el('button', { class: 'btn s', text: 'Cancelar', onclick: fechar })]));
      setTimeout(function () { inp.focus(); }, 60);
    });
  }
  return { abrir: abrir, fechar: fechar, lista: lista, confirmar: confirmar, senha: senha };
})();

var Icones = {
  svg: function (d, classe) {
    var s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor');
    s.setAttribute('stroke-width', '2'); s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round');
    if (classe) s.setAttribute('class', classe);
    d.forEach(function (p) { var n = document.createElementNS('http://www.w3.org/2000/svg', 'path'); n.setAttribute('d', p); s.appendChild(n); });
    return s;
  },
  cadeado: function () { return Icones.svg(['M6 11h12v9H6z', 'M8.500 11V8a3.500 3.500 0 0 1 7 0v3'], 'cad'); },
  seta: function () { return Icones.svg(['M9 6l6 6-6 6'], 'seta'); },
  play: function () { return Icones.svg(['M8 5v14l11-7z']); }
};

/* Voltar (gesto do iPhone, botão do Android, seta do navegador) fecha a camada
   de cima: folha, player, ficha. Cada camada aberta empilha um estado. */
var Nav = (function () {
  var pilha = [];
  function camada(nome, aoVoltar) {
    pilha.push({ nome: nome, f: aoVoltar });
    try { history.pushState({ np: pilha.length }, ''); } catch (e) {}
  }
  function voltar() { if (pilha.length) { try { history.back(); } catch (e) { desempilhar(); } } }
  function desempilhar() { var c = pilha.pop(); if (c) { try { c.f(); } catch (e) { console.error(e); } } }
  window.addEventListener('popstate', desempilhar);
  function tem(nome) { return pilha.some(function (c) { return c.nome === nome; }); }
  // fecha tudo sem animação (ao sair da conta ou recarregar)
  function zerar() { while (pilha.length) { var c = pilha.pop(); try { c.f(); } catch (e) {} } }
  return { camada: camada, voltar: voltar, tem: tem, zerar: zerar };
})();
