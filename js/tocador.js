/* Neon Player web — vídeo.
   iPhone/iPad: o próprio Safari toca HLS (canal ao vivo) e MP4 (filme, série).
   Android/PC: canal ao vivo pelo hls.js; filme e série direto no <video>.
   O vídeo sai DIRETO do servidor da lista para o aparelho (por isso a página é http):
   nada passa por servidor nosso, e o servidor vê o IP do próprio cliente. */
'use strict';

function Motor(video) {
  this.v = video; this.hls = null; this.url = null;
}
Motor.ehHls = function (url) { return /\.m3u8(\?|$)/i.test(url); };
Motor.prototype.abrir = function (url) {
  var v = this.v, eu = this;
  this.soltar();
  this.url = url;
  var nativo = v.canPlayType('application/vnd.apple.mpegurl') !== '';
  if (Motor.ehHls(url) && !(Aparelho.ios && nativo) && window.Hls && Hls.isSupported()) {
    var h = new Hls({ enableWorker: true, lowLatencyMode: false, backBufferLength: 30, maxBufferLength: 20, manifestLoadingTimeOut: 15000, fragLoadingTimeOut: 25000 });
    this.hls = h;
    h.on(Hls.Events.ERROR, function (ev, d) {
      if (!d || !d.fatal || eu.hls !== h) return;
      if (d.type === Hls.ErrorTypes.MEDIA_ERROR && !eu._recuperou) { eu._recuperou = true; try { h.recoverMediaError(); return; } catch (e) {} }
      // o hls.js desistiu: avisa como o <video> avisaria
      v.dispatchEvent(new CustomEvent('falha'));
    });
    h.loadSource(url); h.attachMedia(v);
  } else {
    v.src = url; v.load();
  }
  this._recuperou = false;
  var p = v.play(); if (p && p.catch) p.catch(function () {});
};
Motor.prototype.soltar = function () {
  var v = this.v;
  if (this.hls) { try { this.hls.destroy(); } catch (e) {} this.hls = null; }
  try { v.pause(); } catch (e) {}
  if (v.getAttribute('src')) { v.removeAttribute('src'); try { v.load(); } catch (e) {} }
  this.url = null;
};

/* ------------------------------------------------------------------ canal ao vivo (a "caixinha" da TV ao Vivo) */
var AoVivo = (function () {
  var motor = null, canal = null, tentativas = 0, vigia = null, ultimoAndar = 0, aoMudar = null;

  function v() { return $('v-tv'); }
  function sobre(texto, rodando) {
    var s = $('tv-sobre');
    limpar(s);
    if (texto == null) { s.hidden = true; return; }
    s.hidden = false;
    if (rodando) s.appendChild(el('div', { class: 'rodando', style: 'margin:0' }));
    if (texto) s.appendChild(el('div', { text: texto }));
  }
  function iniciar(aoMudarEstado) {
    aoMudar = aoMudarEstado;
    motor = new Motor(v());
    var video = v();
    video.addEventListener('playing', function () { tentativas = 0; ultimoAndar = Date.now(); sobre(null); });
    video.addEventListener('timeupdate', function () { ultimoAndar = Date.now(); });
    video.addEventListener('waiting', function () { if (canal) sobre('', true); });
    video.addEventListener('error', function () { if (canal && video.getAttribute('src')) falhou(); });
    video.addEventListener('falha', function () { if (canal) falhou(); });
    // dois toques na imagem = tela cheia
    video.addEventListener('dblclick', telaCheia);
    document.addEventListener('visibilitychange', function () {
      // voltou para o app e o canal estava parado: religa (o iPhone pausa o vídeo fora da tela)
      if (!document.hidden && canal && $('t-tv').classList.contains('ativa') && !Nav.tem('player') && video.paused) reabrir();
    });
  }
  function falhou() {
    if (!canal) return;
    if (tentativas < 2) { tentativas++; sobre('', true); setTimeout(reabrir, 1500 * tentativas); return; }
    sobre(Textos.canalFora);
  }
  function reabrir() { if (canal) { motor.abrir(Lista.urlCanal(canal.id)); ultimoAndar = Date.now(); } }
  function abrir(c) {
    canal = c; tentativas = 0;
    sobre('', true);
    $('tv-cheia').hidden = false;
    motor.abrir(Lista.urlCanal(c.id));
    ultimoAndar = Date.now();
    Favoritos.visto(c.id);
    clearInterval(vigia);
    // canal parado há 25 s sem erro: religa (servidor que para de mandar sem avisar)
    vigia = setInterval(function () {
      if (!canal || document.hidden || v().paused) { ultimoAndar = Date.now(); return; }
      if (Date.now() - ultimoAndar > 25000) { ultimoAndar = Date.now(); if (tentativas < 4) { tentativas++; reabrir(); } }
    }, 5000);
    if (aoMudar) aoMudar(c);
  }
  function parar() {
    clearInterval(vigia); vigia = null;
    if (motor) motor.soltar();
    canal = null;
    $('tv-cheia').hidden = true;
    sobre('Escolha um canal');
    if (aoMudar) aoMudar(null);
  }
  // pausa sem esquecer o canal (ao abrir um filme: muita lista só permite uma conexão)
  function suspender() { if (motor && canal) { clearInterval(vigia); vigia = null; motor.soltar(); sobre('Toque no canal para voltar a assistir'); } }
  function telaCheia() {
    var video = v();
    if (!canal) return;
    try {
      if (video.webkitEnterFullscreen && (Aparelho.ios || !video.requestFullscreen)) { video.webkitEnterFullscreen(); return; }
      var caixa = $('tv-previa');
      var p = (caixa.requestFullscreen || caixa.webkitRequestFullscreen).call(caixa);
      if (p && p.then) p.then(function () { try { screen.orientation.lock('landscape').catch(function () {}); } catch (e) {} }).catch(function () {});
    } catch (e) {}
  }
  return { iniciar: iniciar, abrir: abrir, parar: parar, suspender: suspender, telaCheia: telaCheia, atual: function () { return canal; } };
})();

/* ------------------------------------------------------------------ filme e episódio (tela inteira) */
var Cinema = (function () {
  var motor = null, item = null, ultimoSalvo = 0, somTopo = null, pronto = false;

  function v() { return $('v-pl'); }
  function msg(texto, botao) {
    var m = $('pl-msg'); limpar(m);
    if (texto == null) { m.hidden = true; return; }
    m.hidden = false;
    m.appendChild(el('div', { text: texto }));
    if (botao) m.appendChild(el('button', { class: 'btn s', text: 'Voltar', onclick: function () { Nav.voltar(); } }));
  }
  function carregando() { var m = $('pl-msg'); limpar(m); m.hidden = false; m.appendChild(el('div', { class: 'rodando', style: 'margin:0' })); }
  function topo(mostrar) {
    clearTimeout(somTopo);
    $('pl-topo').classList.toggle('some', !mostrar);
    if (mostrar && !v().paused) somTopo = setTimeout(function () { $('pl-topo').classList.add('some'); }, 3200);
  }
  function salvar(forcar) {
    var video = v();
    if (!item || !pronto) return;
    if (!forcar && Date.now() - ultimoSalvo < 10000) return;
    ultimoSalvo = Date.now();
    Progresso.salvar(item.tipo, item.id, video.currentTime, video.duration, item.extra);
  }
  function iniciar() {
    var video = v();
    motor = new Motor(video);
    video.addEventListener('loadedmetadata', function () {
      if (item && item.inicio > 0 && isFinite(video.duration) && item.inicio < video.duration - 20) {
        try { video.currentTime = item.inicio; } catch (e) {}
      }
    });
    video.addEventListener('playing', function () { pronto = true; msg(null); topo(true); });
    video.addEventListener('waiting', function () { if (item && !pronto) carregando(); });
    video.addEventListener('pause', function () { salvar(true); topo(true); });
    video.addEventListener('timeupdate', function () { salvar(false); });
    video.addEventListener('ended', function () {
      if (!item) return;
      Progresso.apagar(item.tipo, item.id);
      if (item.proximo) $('pl-prox').hidden = false; else Nav.voltar();
    });
    function erro() {
      if (!item) return;
      var formato = Aparelho.ios && /^(mkv|avi|wmv|flv)$/i.test(item.ext || '');
      msg(formato ? Textos.videoFormato : Textos.videoFora, true);
      topo(true);
    }
    video.addEventListener('error', function () { if (video.getAttribute('src')) erro(); });
    video.addEventListener('falha', erro);
    $('t-player').addEventListener('touchstart', function () { topo(true); }, { passive: true, capture: true });
    $('t-player').addEventListener('mousemove', function () { topo(true); });
    $('pl-voltar').addEventListener('click', function () { Nav.voltar(); });
    $('pl-prox').addEventListener('click', function () { var p = item && item.proximo; if (p) trocar(p()); });
    window.addEventListener('pagehide', function () { salvar(true); });
    document.addEventListener('visibilitychange', function () { if (document.hidden) salvar(true); });
  }
  function tocar(novo) {
    item = novo; pronto = false; ultimoSalvo = 0;
    $('pl-titulo').textContent = novo.titulo || '';
    $('pl-prox').hidden = true;
    carregando(); topo(true);
    motor.abrir(novo.url);
  }
  // item: { tipo:'f'|'e', id, url, titulo, ext, inicio, extra, proximo: fn -> item | null, aoFechar }
  function abrir(novo) {
    AoVivo.suspender();
    $('t-player').classList.add('ativa');
    Nav.camada('player', fechar);
    tocar(novo);
  }
  function trocar(novo) { if (!novo) { Nav.voltar(); return; } salvar(true); tocar(novo); }
  function fechar() {
    salvar(true);
    var f = item && item.aoFechar;
    item = null;
    motor.soltar();
    try { if (document.fullscreenElement) document.exitFullscreen(); } catch (e) {}
    $('t-player').classList.remove('ativa');
    msg(null);
    if (f) f();
  }
  return { iniciar: iniciar, abrir: abrir };
})();
