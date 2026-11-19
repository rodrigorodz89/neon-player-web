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
/* Tela cheia (19/11/2026, fila do Rodrigo): o MESMO <video> da caixinha cresce
   para a tela inteira (classe .cheio), com a barra do Android por cima. Antes o
   iPhone usava o player dele (webkitEnterFullscreen): controles que não são do
   Neon, barra de progresso num canal ao vivo, e — o defeito — ao sair dele o
   iPhone PAUSA o vídeo, e a caixinha não tinha botão para voltar a tocar. Agora
   o vídeo nunca sai da página, e canal parado sempre mostra o play. */
var AoVivo = (function () {
  var motor = null, canal = null, tentativas = 0, vigia = null, ultimoAndar = 0, aoMudar = null;
  var cheio = false, someBarra = null, pausadoEm = 0, relogio = null;
  var PROPORCOES = [['contain', 'Original'], ['cover', 'Preencher a tela'], ['fill', 'Esticar']];

  function v() { return $('v-tv'); }
  function sobre(texto, rodando) {
    var s = $('tv-sobre');
    limpar(s);
    if (texto == null) { s.hidden = true; return; }
    s.hidden = false;
    if (rodando) s.appendChild(el('div', { class: 'rodando', style: 'margin:0' }));
    if (texto) s.appendChild(el('div', { text: texto }));
  }
  var ICO_PAUSA = '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>';
  var ICO_PLAY = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
  var ICO_SOM = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5L6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/></svg>';
  var ICO_MUDO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5L6 9H3v6h3l5 4z"/><path d="M16 9l5 6M21 9l-5 6"/></svg>';

  // o play da caixinha e o botão de pausa da barra acompanham o vídeo
  function pintarEstado() {
    var video = v(), parado = !!canal && video.paused && !video.ended;
    $('tv-retomar').hidden = !parado || !$('tv-sobre').hidden && $('tv-sobre').textContent !== '';
    $('tb-pausa').innerHTML = video.paused ? ICO_PLAY : ICO_PAUSA;
    $('tb-som').innerHTML = video.muted ? ICO_MUDO : ICO_SOM;
    var fav = canal && Favoritos.tem(canal.id);
    $('tb-fav').classList.toggle('on', !!fav);
    $('tb-fav').querySelector('span').textContent = fav ? 'Remover dos favoritos' : 'Favoritar';
  }

  function iniciar(aoMudarEstado) {
    aoMudar = aoMudarEstado;
    motor = new Motor(v());
    var video = v();
    var prop = Guarda.ler('np_proporcao', 'contain');
    video.style.objectFit = PROPORCOES.some(function (p) { return p[0] === prop; }) ? prop : 'contain';
    video.addEventListener('playing', function () { tentativas = 0; ultimoAndar = Date.now(); sobre(null); pintarEstado(); });
    video.addEventListener('play', pintarEstado);
    video.addEventListener('pause', function () { pausadoEm = Date.now(); pintarEstado(); mostrarBarra(); });
    video.addEventListener('volumechange', pintarEstado);
    video.addEventListener('timeupdate', function () { ultimoAndar = Date.now(); });
    video.addEventListener('waiting', function () { if (canal && !video.paused) sobre('', true); });
    video.addEventListener('error', function () { if (canal && video.getAttribute('src')) falhou(); });
    video.addEventListener('falha', function () { if (canal) falhou(); });
    // Se mesmo assim o player do sistema abrir (gesto do iPhone, menu do Android) e
    // pausar ao fechar, volta a tocar: quem estava vendo um canal quer o canal.
    video.addEventListener('webkitendfullscreen', function () { setTimeout(continuar, 300); });
    // um toque: na caixinha abre a tela cheia; na tela cheia mostra/esconde a barra
    video.addEventListener('click', function () {
      if (!canal) return;
      if (!cheio) { entrarCheio(); return; }
      if ($('tv-barra').hidden) mostrarBarra(); else esconderBarra();
    });
    $('tv-retomar').addEventListener('click', function (e) { e.stopPropagation(); continuar(); });
    $('tb-voltar').addEventListener('click', function () { Nav.voltar(); });
    $('tb-pausa').addEventListener('click', function () { if (video.paused) continuar(); else video.pause(); mostrarBarra(); });
    $('tb-som').addEventListener('click', function () { video.muted = !video.muted; mostrarBarra(); });
    $('tb-prop').addEventListener('click', proporcao);
    $('tb-audio').addEventListener('click', faixas);
    $('tb-fav').addEventListener('click', function () {
      if (!canal) return;
      var agora = Favoritos.alternar(canal.id);
      Toast(agora ? 'Canal guardado nos favoritos' : 'Canal retirado dos favoritos');
      pintarEstado(); mostrarBarra();
      if (aoMudar) aoMudar(canal, true);
    });
    // Enviar para a TV: AirPlay no iPhone; Chromecast/TV pelo navegador onde ele souber
    var podeTv = !!(video.webkitShowPlaybackTargetPicker || (video.remote && video.remote.prompt));
    $('tb-tv').hidden = !podeTv;
    $('tb-tv').addEventListener('click', function () {
      try { if (video.webkitShowPlaybackTargetPicker) video.webkitShowPlaybackTargetPicker(); else video.remote.prompt().catch(function () {}); } catch (e) {}
      mostrarBarra();
    });
    $('tv-barra').addEventListener('click', function (e) { if (e.target === $('tv-barra')) esconderBarra(); });
    document.addEventListener('visibilitychange', function () {
      // voltou para o app e o canal estava parado: religa (o iPhone pausa o vídeo fora da tela)
      if (!document.hidden && canal && $('t-tv').classList.contains('ativa') && !Nav.tem('player') && video.paused) reabrir();
    });
    pintarEstado();
  }
  // Voltar a tocar. Ao vivo pausado por mais de 20 s volta ao AGORA (recarrega o canal);
  // pausa curta só continua de onde estava.
  function continuar() {
    if (!canal) return;
    var video = v();
    if (!video.getAttribute('src') && !motor.hls) { reabrir(); return; }
    if (pausadoEm && Date.now() - pausadoEm > 20000) { reabrir(); return; }
    var p = video.play(); if (p && p.catch) p.catch(function () { reabrir(); });
  }
  function falhou() {
    if (!canal) return;
    if (tentativas < 2) { tentativas++; sobre('', true); setTimeout(reabrir, 1500 * tentativas); return; }
    sobre(Textos.canalFora);
    pintarEstado();
  }
  function reabrir() { if (canal) { pausadoEm = 0; motor.abrir(Lista.urlCanal(canal.id)); ultimoAndar = Date.now(); sobre('', true); } }
  function abrir(c) {
    canal = c; tentativas = 0; pausadoEm = 0;
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
    $('tb-nome').textContent = c.nome;
    $('tb-agora').textContent = '';
    pintarEstado();
    if (aoMudar) aoMudar(c);
  }
  function parar() {
    if (cheio) sairCheio(true);
    clearInterval(vigia); vigia = null;
    if (motor) motor.soltar();
    canal = null;
    $('tv-cheia').hidden = true;
    sobre('Escolha um canal');
    pintarEstado();
    if (aoMudar) aoMudar(null);
  }
  // pausa sem esquecer o canal (ao abrir um filme: muita lista só permite uma conexão)
  function suspender() {
    if (motor && canal) { if (cheio) sairCheio(true); clearInterval(vigia); vigia = null; motor.soltar(); sobre('Toque no canal para voltar a assistir'); pintarEstado(); }
  }

  /* ---- tela cheia do Neon ---- */
  function entrarCheio() {
    if (!canal || cheio) return;
    cheio = true;
    $('tv-previa').classList.add('cheio');
    document.documentElement.classList.add('tv-cheia');
    Nav.camada('tvcheia', function () { sairCheio(true); });
    // Android e computador: tela cheia de verdade e deitado; o iPhone não deixa
    // um elemento ocupar a tela (só o player dele), então lá a página já basta.
    var caixa = $('tv-previa'), pedir = caixa.requestFullscreen || caixa.webkitRequestFullscreen;
    if (pedir && !Aparelho.ios) {
      try {
        var p = pedir.call(caixa);
        if (p && p.then) p.then(function () { try { screen.orientation.lock('landscape').catch(function () {}); } catch (e) {} }).catch(function () {});
      } catch (e) {}
    }
    relogio = setInterval(pintarRelogio, 15000); pintarRelogio();
    mostrarBarra();
    continuar();
  }
  function sairCheio(peloVoltar) {
    if (!cheio) return;
    cheio = false;
    $('tv-previa').classList.remove('cheio');
    document.documentElement.classList.remove('tv-cheia');
    clearInterval(relogio); clearTimeout(someBarra);
    $('tv-barra').hidden = true;
    try { if (document.fullscreenElement) document.exitFullscreen(); else if (document.webkitFullscreenElement) document.webkitExitFullscreen(); } catch (e) {}
    try { screen.orientation.unlock(); } catch (e) {}
    // sair da tela cheia nunca deixa o canal parado
    setTimeout(function () { if (canal && v().paused) continuar(); }, 250);
  }
  // saiu da tela cheia pelo próprio navegador (Esc, gesto do Android): fecha a camada também
  document.addEventListener('fullscreenchange', function () { if (cheio && !document.fullscreenElement && Nav.tem('tvcheia')) Nav.voltar(); });
  function telaCheia() { if (cheio) Nav.voltar(); else entrarCheio(); }
  function pintarRelogio() { var d = new Date(); $('tb-relogio').textContent = ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); }
  function mostrarBarra() {
    if (!cheio) return;
    $('tv-barra').hidden = false;
    clearTimeout(someBarra);
    // some sozinha com o canal tocando; parado, fica (é onde está o play)
    someBarra = setTimeout(function () { if (!v().paused && !Nav.tem('folha')) esconderBarra(); }, 4000);
  }
  function esconderBarra() { clearTimeout(someBarra); $('tv-barra').hidden = true; }
  function proporcao() {
    var video = v(), atual = video.style.objectFit || 'contain', i = 0;
    PROPORCOES.forEach(function (p, n) { if (p[0] === atual) i = n; });
    var prox = PROPORCOES[(i + 1) % PROPORCOES.length];
    video.style.objectFit = prox[0]; Guarda.gravar('np_proporcao', prox[0]);
    Toast(prox[1]); mostrarBarra();
  }
  // Áudio e legendas: as faixas que o canal tiver (hls.js ou o próprio Safari)
  function faixas() {
    var video = v(), h = motor.hls, itens = [];
    if (h && h.audioTracks && h.audioTracks.length > 1) {
      h.audioTracks.forEach(function (t, n) { itens.push({ rotulo: 'Áudio: ' + (t.name || t.lang || ('Faixa ' + (n + 1))), valor: function () { h.audioTrack = n; }, sel: h.audioTrack === n }); });
    } else if (video.audioTracks && video.audioTracks.length > 1) {
      for (var a = 0; a < video.audioTracks.length; a++) (function (n) {
        var t = video.audioTracks[n];
        itens.push({ rotulo: 'Áudio: ' + (t.label || t.language || ('Faixa ' + (n + 1))), sel: t.enabled,
          valor: function () { for (var k = 0; k < video.audioTracks.length; k++) video.audioTracks[k].enabled = (k === n); } });
      })(a);
    }
    var legs = [];
    if (h && h.subtitleTracks && h.subtitleTracks.length) {
      h.subtitleTracks.forEach(function (t, n) { legs.push({ rotulo: 'Legenda: ' + (t.name || t.lang || ('Faixa ' + (n + 1))), valor: function () { h.subtitleTrack = n; h.subtitleDisplay = true; }, sel: h.subtitleTrack === n }); });
      legs.unshift({ rotulo: 'Sem legenda', valor: function () { h.subtitleTrack = -1; }, sel: h.subtitleTrack === -1 });
    } else if (video.textTracks && video.textTracks.length) {
      var lista = [];
      for (var b = 0; b < video.textTracks.length; b++) if (/subtitles|captions/.test(video.textTracks[b].kind)) lista.push(video.textTracks[b]);
      if (lista.length) {
        legs.push({ rotulo: 'Sem legenda', valor: function () { lista.forEach(function (t) { t.mode = 'disabled'; }); }, sel: lista.every(function (t) { return t.mode !== 'showing'; }) });
        lista.forEach(function (t, n) { legs.push({ rotulo: 'Legenda: ' + (t.label || t.language || ('Faixa ' + (n + 1))), sel: t.mode === 'showing',
          valor: function () { lista.forEach(function (x) { x.mode = x === t ? 'showing' : 'disabled'; }); } }); });
      }
    }
    itens = itens.concat(legs);
    if (!itens.length) { Toast('Este canal tem um áudio só e não tem legenda.'); mostrarBarra(); return; }
    Folha.lista('Áudio e legendas', itens, function (f) { f(); Toast('Pronto'); });
  }
  function guia(texto) { $('tb-agora').textContent = texto || ''; }
  return { iniciar: iniciar, abrir: abrir, parar: parar, suspender: suspender, telaCheia: telaCheia, guia: guia,
    cheio: function () { return cheio; }, atual: function () { return canal; } };
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
