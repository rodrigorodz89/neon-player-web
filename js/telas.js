/* Neon Player web — as telas. O desenho é o do app Android: Início com a arte
   do título ao fundo e fileiras; TV ao Vivo com categorias, canais e a caixinha
   do vídeo; Filmes e Séries com categorias e grade; ficha; Configurações. */
'use strict';

var Sessao = { status: null, cliente: null, listaNome: null, vence: null, demo: null, suporte: null, viaLogin: false };

var Tela = {
  mostrar: function (qual) {
    ['t-carga', 't-entrar', 't-aviso'].forEach(function (id) { $(id).classList.toggle('ativa', id === 't-' + qual); });
    $('casca').hidden = qual !== 'casca';
  },
  status: function (t) { $('carga-status').textContent = t; }
};

/* ---------- peças comuns ---------- */
function imagemSegura(url) { return url && /^https?:\/\//i.test(url) ? url : null; }

function cartaz(item, aoTocar, fracao) {
  var img = el('div', { class: 'img' });
  var u = imagemSegura(item.poster);
  function semImagem() { limpar(img); img.appendChild(el('div', { class: 'sem', text: item.nome })); }
  if (u) {
    var i = el('img', { loading: 'lazy', decoding: 'async', referrerpolicy: 'no-referrer', alt: '' });
    i.addEventListener('error', semImagem);
    i.src = u; img.appendChild(i);
  } else semImagem();
  if (fracao > 0) img.appendChild(el('div', { class: 'barra-p' }, [el('i', { style: 'width:' + Math.min(100, Math.round(fracao * 100)) + '%' })]));
  return el('button', { class: 'cartaz', onclick: function () { aoTocar(item); } }, [img, el('div', { class: 'nome', text: item.nome })]);
}

/* Desenha uma lista grande aos poucos: o primeiro lote na hora, o resto quando
   a pessoa chega perto do fim (24 mil filmes de uma vez travariam o celular). */
var Lotes = (function () {
  var obs = {};
  function montar(chave, caixa, rolagem, itens, fazer, lote) {
    if (obs[chave]) { obs[chave].disconnect(); delete obs[chave]; }
    limpar(caixa);
    var pos = 0, fim = el('div', { style: 'height:1px' });
    function mais() {
      var frag = document.createDocumentFragment(), ate = Math.min(itens.length, pos + lote);
      for (; pos < ate; pos++) frag.appendChild(fazer(itens[pos], pos));
      caixa.insertBefore(frag, fim.parentNode === caixa ? fim : null);
      if (pos >= itens.length && obs[chave]) { obs[chave].disconnect(); delete obs[chave]; if (fim.parentNode) fim.parentNode.removeChild(fim); }
    }
    caixa.appendChild(fim);
    mais();
    if (pos < itens.length && 'IntersectionObserver' in window) {
      obs[chave] = new IntersectionObserver(function (es) { if (es.some(function (e) { return e.isIntersecting; })) mais(); }, { root: rolagem, rootMargin: '900px 0px' });
      obs[chave].observe(fim);
    } else if (pos < itens.length) { while (pos < itens.length) mais(); }
  }
  return { montar: montar };
})();

function linhaCategoria(c, sel, aoTocar) {
  return el('button', { class: 'linha' + (sel ? ' sel' : ''), onclick: function () { aoTocar(c); } }, [
    el('span', { class: 't', text: c.nome }),
    c.cadeado ? Icones.cadeado() : null,
    c.qtd != null ? el('span', { class: 'q', text: String(c.qtd) }) : null
  ]);
}

/* Categoria adulta com o controle dos pais ligado: pede a senha no toque. */
function comSenhaSeAdulta(c, seguir) {
  if (c.adulta && Pais.travado()) {
    Folha.senha('Controle dos pais', 'Conteúdo adulto pede senha.', function (s) { if (!Pais.conferir(s)) return false; setTimeout(seguir, 60); });
  } else seguir();
}

/* ------------------------------------------------------------------ páginas e abas */
var Pag = (function () {
  var atual = null, telas = { inicio: 't-inicio', tv: 't-tv', filmes: 't-vod', series: 't-vod', config: 't-config' };
  function ir(qual) {
    if (qual === atual && qual !== 'config') { rolarTopo(qual); return; }
    if (atual === 'tv' && qual !== 'tv') AoVivo.parar();
    Busca.fechar();
    atual = qual;
    Object.keys(telas).forEach(function (k) { $(telas[k]).classList.toggle('ativa', telas[k] === telas[qual]); });
    [].forEach.call(document.querySelectorAll('#guias button, #abas button'), function (b) { b.classList.toggle('ativa', b.getAttribute('data-pag') === qual); });
    $('barra').classList.toggle('solida', qual !== 'inicio');
    $('btn-busca').hidden = !(qual === 'tv' || qual === 'filmes' || qual === 'series');
    if (qual === 'inicio') Inicio.mostrar(); else Inicio.pausar();
    if (qual === 'tv') Tv.mostrar();
    if (qual === 'filmes' || qual === 'series') Vod.mostrar(qual);
    if (qual === 'config') Config.mostrar();
  }
  function rolarTopo(qual) { var p = $(telas[qual]); if (p && p.scrollTo) p.scrollTo({ top: 0, behavior: 'smooth' }); }
  return { ir: ir, atual: function () { return atual; }, esquecer: function () { atual = null; } };
})();

var Busca = (function () {
  var t = null;
  function abrir() { $('busca').classList.add('aberta'); $('btn-busca').hidden = true; $('guias').style.display = 'none'; $('barra-espaco').hidden = true; $('in-busca').focus(); }
  function fechar() {
    if (!$('busca').classList.contains('aberta')) return;
    $('busca').classList.remove('aberta'); $('guias').style.display = ''; $('barra-espaco').hidden = false;
    var tinha = $('in-busca').value; $('in-busca').value = ''; $('in-busca').blur();
    var p = Pag.atual(); $('btn-busca').hidden = !(p === 'tv' || p === 'filmes' || p === 'series');
    if (tinha) aplicar('');
  }
  function aplicar(q) { var p = Pag.atual(); if (p === 'tv') Tv.buscar(q); else if (p === 'filmes' || p === 'series') Vod.buscar(q); }
  function iniciar() {
    $('btn-busca').addEventListener('click', abrir);
    $('in-busca').addEventListener('input', function () { clearTimeout(t); var q = this.value; t = setTimeout(function () { aplicar(q.trim()); }, 260); });
    $('in-busca').addEventListener('keydown', function (e) { if (e.key === 'Escape') fechar(); if (e.key === 'Enter') this.blur(); });
    $('in-busca').addEventListener('blur', function () { if (!this.value) setTimeout(fechar, 120); });
  }
  return { iniciar: iniciar, fechar: fechar };
})();

/* ------------------------------------------------------------------ Início */
var Inicio = (function () {
  var dados = null, capaI = 0, naTela = null, relogio = null, camada = 0, artes = {}, seguraAte = 0, assinatura = '';

  function calcular() {
    var c = Catalogo.get();
    dados = Destaques.montar(c.filmes, c.catsFilmes, c.series, c.catsSeries, null, null);
  }
  // A arte deitada só vem na ficha: uma chamada por título, guardada.
  function arteDe(x) {
    var ch = (x.ehSerie ? 's' : 'f') + x.item.id;
    if (artes[ch]) return artes[ch];
    artes[ch] = (x.ehSerie ? Lista.infoSerie(x.item.id) : Lista.infoFilme(x.item.id)).then(function (j) {
      var info = (j && j.info) || {}, b = info.backdrop_path;
      if (Array.isArray(b)) b = b[0];
      b = imagemSegura(b);
      // a arte 'original' do TMDB passa de 1 MB: no celular vai a de 1280, que abre na hora
      return b ? b.split('image.tmdb.org/t/p/original/').join('image.tmdb.org/t/p/w1280/') : null;
    }).catch(function () { return null; });
    return artes[ch];
  }
  // O título e a arte trocam JUNTOS: o texto só muda quando a imagem nova está
  // carregada (ou depois de 2,5 s, se ela não vier). `naTela` é o que os botões
  // Assistir e Detalhes abrem: sempre o título que a pessoa está vendo.
  function pintarCapa(x) {
    var vez = ++camada, poster = imagemSegura(x.item.poster), feito = false;
    function texto() {
      if (feito || vez !== camada) return;
      feito = true; naTela = x;
      $('capa-titulo').textContent = x.item.nome;
      $('capa-meta').textContent = Destaques.metaDe(x.ehSerie, x.item);
    }
    if (!naTela) texto();            // primeira capa: o título aparece já
    setTimeout(texto, 2500);
    // Em pé a capa é alta: a arte deitada (16:9) viraria uma tira estreita e
    // ampliada. Ali vai o pôster, que já é vertical; deitado, a arte deitada.
    if (emPe() && poster) { trocarArte(poster, false, vez, texto); arteDe(x); return; }
    arteDe(x).then(function (url) {
      if (vez !== camada) return;
      if (!url && !poster) { texto(); return; }
      trocarArte(url || poster, !url && !emPe(), vez, texto);
    });
  }
  function emPe() { return window.matchMedia('(orientation: portrait)').matches && window.innerWidth < 820; }
  // Troca com dissolve: a imagem nova só entra depois de carregada.
  function trocarArte(url, borrao, vez, aoEntrar) {
    var im = new Image();
    im.referrerPolicy = 'no-referrer';
    im.onload = function () {
      if (vez !== camada) return;
      var a = $('arte-a'), b = $('arte-b'), entra = a.classList.contains('vis') ? b : a, sai = entra === a ? b : a;
      entra.style.backgroundImage = 'url("' + url.replace(/"/g, '%22') + '")';
      entra.classList.toggle('borrao', borrao);
      // imagem deitada numa capa em pé (título sem pôster): inteira no alto, sem ampliar
      entra.classList.toggle('deitada', emPe() && im.naturalWidth > im.naturalHeight * 1.15);
      entra.classList.add('vis'); sai.classList.remove('vis');
      aoEntrar();
    };
    im.onerror = aoEntrar;
    im.src = url;
  }
  function repintar() { if (dados && dados.capa.length && Pag.atual() === 'inicio') pintarCapa(dados.capa[capaI]); }
  function girar() {
    if (!dados || !dados.capa.length) return;
    if (Date.now() < seguraAte || document.hidden || Nav.tem('ficha') || Nav.tem('player') || Nav.tem('folha')) return;
    capaI = (capaI + 1) % dados.capa.length;
    pintarCapa(dados.capa[capaI]);
    // já busca a arte do próximo, para a troca não esperar a rede
    arteDe(dados.capa[(capaI + 1) % dados.capa.length]);
  }
  function fileira(titulo, itens, aoTocar, fracaoDe) {
    if (!itens.length) return null;
    var trilho = el('div', { class: 'trilho' });
    itens.forEach(function (it) { trilho.appendChild(cartaz(it, aoTocar, fracaoDe ? fracaoDe(it) : 0)); });
    return el('div', { class: 'fileira' }, [el('h3', { text: titulo }), trilho]);
  }
  function montarFileiras() {
    var c = Catalogo.get(), cx = $('fileiras');
    var pend = Progresso.filmesPendentes();
    var cont = Destaques.continuarDe(pend, c.filmes, c.catsFilmes, 12, null);
    var ass = cont.map(function (m) { return m.id; }).join(',') + '|' + (dados ? dados.filmes.length + ',' + dados.series.length : '');
    if (ass === assinatura && cx.firstChild) return;   // nada mudou: não redesenha (a rolagem não pula)
    assinatura = ass;
    limpar(cx);
    var fr = {}; pend.forEach(function (p) { fr[p.filmeId] = p.d ? p.t / p.d : 0; });
    [fileira(Textos.continuar, cont, function (m) { Ficha.filme(m); }, function (m) { return fr[m.id] || 0; }),
     fileira(Textos.filmesAdicionados, dados ? dados.filmes : [], function (m) { Ficha.filme(m); }),
     fileira(Textos.seriesAdicionadas, dados ? dados.series : [], function (s) { Ficha.serie(s); })
    ].forEach(function (f) { if (f) cx.appendChild(f); });
  }
  function mostrar() {
    if (!dados) calcular();
    var tem = dados.capa.length > 0;
    $('capa').hidden = !tem;
    $('t-inicio').style.paddingTop = tem ? '0' : '';
    if (tem && !$('capa-titulo').textContent) { capaI = 0; pintarCapa(dados.capa[0]); }
    montarFileiras();
    var fx = $('faixa-demo');
    if (Sessao.demo) {
      limpar(fx); fx.hidden = false;
      fx.appendChild(document.createTextNode('MODO DEMONSTRAÇÃO · ' + Sessao.demo.dias + (Sessao.demo.dias === 1 ? ' DIA RESTANTE' : ' DIAS RESTANTES')));
      fx.appendChild(el('span', { text: 'Código do aparelho:' })); fx.appendChild(el('b', { text: Aparelho.codigoBonito() }));
      fx.appendChild(el('button', { class: 'link', text: 'Copiar', onclick: function () { copiar(Aparelho.codigoBonito(), 'Código copiado'); } }));
    } else fx.hidden = true;
    $('rodape').textContent = Textos.app + ' ' + VERSAO + ' · Código do aparelho: ' + Aparelho.codigoBonito();
    clearInterval(relogio); relogio = setInterval(girar, 6000);
  }
  function pausar() { clearInterval(relogio); relogio = null; }
  function iniciar() {
    $('capa-assistir').addEventListener('click', function () {
      var x = naTela; if (!x) return;
      if (x.ehSerie) Ficha.serie(x.item); else Ficha.tocarFilme(x.item, true);
    });
    $('capa-detalhes').addEventListener('click', function () {
      var x = naTela; if (!x) return;
      if (x.ehSerie) Ficha.serie(x.item); else Ficha.filme(x.item);
    });
    // girou o celular: a capa troca de arte (pôster em pé, arte deitada deitado)
    var mq = window.matchMedia('(orientation: portrait)');
    if (mq.addEventListener) mq.addEventListener('change', repintar); else if (mq.addListener) mq.addListener(repintar);
    // mexeu na tela: segura a troca por 6 s, para o título não mudar debaixo do dedo
    $('t-inicio').addEventListener('touchstart', function () { seguraAte = Date.now() + 6000; }, { passive: true });
  }
  function zerar() { dados = null; artes = {}; assinatura = ''; capaI = 0; naTela = null; camada++; $('capa-titulo').textContent = ''; limpar($('fileiras')); ['arte-a', 'arte-b'].forEach(function (i) { $(i).classList.remove('vis'); $(i).style.backgroundImage = ''; }); }
  return { iniciar: iniciar, mostrar: mostrar, pausar: pausar, zerar: zerar };
})();

/* ------------------------------------------------------------------ TV ao Vivo */
var Tv = (function () {
  var catSel = '*', busca = '', porId = null, pedidoGuia = 0;

  function mapa() {
    if (!porId) { porId = {}; Catalogo.get().canais.forEach(function (c) { porId[c.id] = c; }); }
    return porId;
  }
  function adultas() { return Catalogo.adultas(Catalogo.get().catsTv); }
  function visiveis() { var ad = adultas(), trava = Pais.travado(); return Catalogo.get().canais.filter(function (c) { return !(trava && ad[c.categoria]) && !ad[c.categoria]; }); }
  function categorias() {
    var c = Catalogo.get(), conta = {}, m = mapa();
    c.canais.forEach(function (x) { conta[x.categoria] = (conta[x.categoria] || 0) + 1; });
    var fav = Favoritos.favoritos().filter(function (id) { return m[id]; }), rec = Favoritos.recentes().filter(function (id) { return m[id]; });
    var l = [];
    if (rec.length) l.push({ id: '@rec', nome: Textos.recentes, qtd: rec.length });
    l.push({ id: '*', nome: Textos.todosCanais, qtd: visiveis().length });
    l.push({ id: '@fav', nome: Textos.favoritos, qtd: fav.length });
    c.catsTv.forEach(function (x) { if (conta[x.id]) l.push({ id: x.id, nome: x.nome, qtd: conta[x.id], adulta: x.adulta, cadeado: x.adulta && Pais.travado() }); });
    return l;
  }
  function canaisDe(cat) {
    var c = Catalogo.get(), m = mapa(), ad = adultas();
    if (busca) { var q = semAcento(busca); return visiveis().filter(function (x) { return semAcento(x.nome).indexOf(q) >= 0; }); }
    if (cat === '*') return visiveis();
    if (cat === '@fav') return Favoritos.favoritos().map(function (id) { return m[id]; }).filter(function (x) { return x && !ad[x.categoria]; });
    if (cat === '@rec') return Favoritos.recentes().map(function (id) { return m[id]; }).filter(function (x) { return x && !ad[x.categoria]; });
    return c.canais.filter(function (x) { return x.categoria === cat; });
  }
  function nomeCat(id) { var a = categorias().filter(function (x) { return x.id === id; })[0]; return a ? a.nome : Textos.todosCanais; }
  function escolherCat(c) {
    comSenhaSeAdulta(c, function () { catSel = c.id; busca = ''; desenhar(); $('tv-canais').scrollTop = 0; });
  }
  function desenharCats() {
    var cx = $('tv-cats'); limpar(cx);
    categorias().forEach(function (c) { cx.appendChild(linhaCategoria(c, c.id === catSel && !busca, escolherCat)); });
    $('tv-cat-nome').textContent = busca ? 'Busca: ' + busca : nomeCat(catSel);
  }
  function linhaCanal(c, i) {
    var atual = AoVivo.atual();
    var logo = imagemSegura(c.logo)
      ? el('img', { class: 'logo-c', loading: 'lazy', decoding: 'async', referrerpolicy: 'no-referrer', alt: '', src: c.logo })
      : el('span', { class: 'logo-c vazio' });
    if (logo.tagName === 'IMG') logo.addEventListener('error', function () { var s = el('span', { class: 'logo-c vazio' }); if (logo.parentNode) logo.parentNode.replaceChild(s, logo); });
    return el('button', { class: 'linha' + (atual && atual.id === c.id ? ' sel' : ''), 'data-id': c.id, onclick: function () { tocar(c); } }, [
      el('span', { class: 'n', text: String(i + 1) }), logo, el('span', { class: 't', text: c.nome })
    ]);
  }
  function desenhar() {
    desenharCats();
    var l = canaisDe(catSel), cx = $('tv-canais');
    if (!l.length) { limpar(cx); cx.appendChild(el('div', { class: 'vazio-msg', text: busca ? 'Nenhum canal com esse nome.' : (catSel === '@fav' ? 'Toque na estrela de um canal para guardá-lo aqui.' : 'Nenhum canal nesta categoria.') })); return; }
    Lotes.montar('tv', cx, cx, l, linhaCanal, 120);
  }
  // Regra da casa: um toque abre na caixinha; outro toque no mesmo canal, tela cheia.
  function tocar(c) {
    var atual = AoVivo.atual();
    if (atual && atual.id === c.id) { AoVivo.telaCheia(); return; }
    AoVivo.abrir(c);
  }
  function aoMudarCanal(c) {
    [].forEach.call($('tv-canais').querySelectorAll('.linha.sel'), function (n) { n.classList.remove('sel'); });
    $('tv-canal').textContent = c ? c.nome : Textos.tv;
    $('tv-agora').textContent = '';
    limpar($('tv-epg'));
    $('tv-fav').hidden = !c;
    if (!c) return;
    var n = $('tv-canais').querySelector('.linha[data-id="' + String(c.id).replace(/"/g, '') + '"]'); if (n) n.classList.add('sel');
    $('tv-fav').classList.toggle('on', Favoritos.tem(c.id));
    guia(c);
  }
  function b64(s) { try { return decodeURIComponent(escape(atob(String(s || '')))); } catch (e) { return ''; } }
  function hora(ts) { var d = new Date(Number(ts) * 1000); return isNaN(d.getTime()) ? '' : ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); }
  function guia(c) {
    var vez = ++pedidoGuia;
    Lista.guia(c.id).then(function (j) {
      if (vez !== pedidoGuia) return;
      var l = (j && j.epg_listings) || [], agora = Date.now() / 1000, cx = $('tv-epg');
      l = l.filter(function (p) { return Number(p.stop_timestamp) > agora; }).slice(0, 4);
      if (!l.length) return;
      $('tv-agora').textContent = 'Agora: ' + b64(l[0].title);
      limpar(cx);
      l.forEach(function (p) { cx.appendChild(el('div', { class: 'prog' }, [el('b', { text: hora(p.start_timestamp) }), b64(p.title)])); });
    }).catch(function () {});
  }
  function mostrar() {
    porId = null;
    if (catSel !== '*' && catSel.charAt(0) !== '@' && !Catalogo.get().catsTv.some(function (x) { return x.id === catSel; })) catSel = '*';
    desenhar();
  }
  function iniciar() {
    AoVivo.iniciar(aoMudarCanal);
    $('tv-cheia').addEventListener('click', AoVivo.telaCheia);
    $('tv-fav').addEventListener('click', function () {
      var c = AoVivo.atual(); if (!c) return;
      var agora = Favoritos.alternar(c.id);
      this.classList.toggle('on', agora); Toast(agora ? 'Canal guardado nos favoritos' : 'Canal retirado dos favoritos');
      desenharCats();
    });
    $('tv-cat-btn').addEventListener('click', function () {
      Folha.lista('Categorias', categorias().map(function (c) { return { rotulo: c.nome, extra: c.qtd, valor: c, sel: c.id === catSel, cadeado: c.cadeado }; }), escolherCat);
    });
  }
  return { iniciar: iniciar, mostrar: mostrar, buscar: function (q) { busca = q; desenhar(); $('tv-canais').scrollTop = 0; }, zerar: function () { catSel = '*'; busca = ''; porId = null; } };
})();

/* ------------------------------------------------------------------ Filmes e Séries */
var Vod = (function () {
  var modo = 'filmes', sel = { filmes: '*', series: '*' }, busca = '';

  function base() { var c = Catalogo.get(); return modo === 'filmes' ? { itens: c.filmes, cats: c.catsFilmes } : { itens: c.series, cats: c.catsSeries }; }
  function categorias() {
    var b = base(), conta = {}, ad = Catalogo.adultas(b.cats), semAdulto = 0;
    b.itens.forEach(function (x) { conta[x.categoria] = (conta[x.categoria] || 0) + 1; if (!ad[x.categoria]) semAdulto++; });
    var l = [], cont = continuar();
    if (cont.length) l.push({ id: '@cont', nome: Textos.continuar, qtd: cont.length });
    l.push({ id: '*', nome: Textos.tudo, qtd: semAdulto });
    b.cats.forEach(function (x) { if (conta[x.id]) l.push({ id: x.id, nome: x.nome, qtd: conta[x.id], adulta: x.adulta, cadeado: x.adulta && Pais.travado() }); });
    return l;
  }
  function continuar() {
    var c = Catalogo.get();
    if (modo === 'filmes') return Destaques.continuarDe(Progresso.filmesPendentes(), c.filmes, c.catsFilmes, 60, null);
    var m = {}, ad = Catalogo.adultas(c.catsSeries); c.series.forEach(function (s) { m[s.id] = s; });
    return Progresso.seriesRecentes().map(function (id) { return m[id]; }).filter(function (s) { return s && !ad[s.categoria]; }).slice(0, 60);
  }
  function itensDe(cat) {
    var b = base(), ad = Catalogo.adultas(b.cats);
    if (busca) {
      var q = semAcento(busca);
      return b.itens.filter(function (x) { return !ad[x.categoria] && semAcento(x.nome).indexOf(q) >= 0; }).slice(0, 600);
    }
    if (cat === '@cont') return continuar();
    var l = cat === '*' ? b.itens.filter(function (x) { return !ad[x.categoria]; }) : b.itens.filter(function (x) { return x.categoria === cat; });
    // do que entrou por último no servidor para trás, como no Início
    return l.slice().sort(function (a, c2) { return (c2.added || 0) - (a.added || 0); });
  }
  function escolherCat(c) { comSenhaSeAdulta(c, function () { sel[modo] = c.id; busca = ''; desenhar(); $('vod-grade-rol').scrollTop = 0; }); }
  function desenhar() {
    var cats = categorias(), cx = $('vod-cats'); limpar(cx);
    if (!cats.some(function (c) { return c.id === sel[modo]; })) sel[modo] = '*';
    cats.forEach(function (c) { cx.appendChild(linhaCategoria(c, c.id === sel[modo] && !busca, escolherCat)); });
    var atual = cats.filter(function (c) { return c.id === sel[modo]; })[0];
    $('vod-cat-nome').textContent = busca ? 'Busca: ' + busca : (atual ? atual.nome : Textos.tudo);
    var l = itensDe(sel[modo]), grade = $('vod-grade');
    $('vod-conta').textContent = l.length ? l.length + (modo === 'filmes' ? (l.length === 1 ? ' filme' : ' filmes') : (l.length === 1 ? ' série' : ' séries')) : '';
    if (!l.length) {
      limpar(grade);
      var pronto = Catalogo.get().vodPronto;
      grade.appendChild(el('div', { class: 'vazio-msg', style: 'grid-column:1/-1', text: !pronto ? Textos.carregandoConteudo : (busca ? 'Nada encontrado com esse nome.' : 'Nada por aqui ainda.') }));
      return;
    }
    var prog = {};
    if (modo === 'filmes' && sel[modo] === '@cont') Progresso.filmesPendentes().forEach(function (p) { prog[p.filmeId] = p.d ? p.t / p.d : 0; });
    Lotes.montar('vod', grade, $('vod-grade-rol'), l, function (it) {
      return cartaz(it, function (x) { if (modo === 'filmes') Ficha.filme(x); else Ficha.serie(x); }, prog[it.id] || 0);
    }, 48);
  }
  function mostrar(qual) { modo = qual; busca = ''; desenhar(); $('vod-grade-rol').scrollTop = 0; }
  function iniciar() {
    $('vod-cat-btn').addEventListener('click', function () {
      Folha.lista('Categorias', categorias().map(function (c) { return { rotulo: c.nome, extra: c.qtd, valor: c, sel: c.id === sel[modo], cadeado: c.cadeado }; }), escolherCat);
    });
  }
  return { iniciar: iniciar, mostrar: mostrar, buscar: function (q) { busca = q; desenhar(); $('vod-grade-rol').scrollTop = 0; },
    redesenhar: function () { if (Pag.atual() === 'filmes' || Pag.atual() === 'series') desenhar(); }, zerar: function () { sel = { filmes: '*', series: '*' }; busca = ''; } };
})();

/* ------------------------------------------------------------------ ficha do filme e da série */
var Ficha = (function () {
  var pedido = 0;

  function abrirBase(item, tipo) {
    $('ficha-titulo').textContent = item.nome;
    var meta = [tipo === 's' ? Textos.serie : Textos.filme], ano = Destaques.anoDe(item.ano), n = parseFloat(String(item.nota || '').replace(',', '.'));
    if (ano > 0) meta.push(String(ano)); if (!isNaN(n) && n > 0) meta.push('★ ' + n.toFixed(1));
    $('ficha-meta').textContent = meta.join(' · ');
    var p = $('ficha-poster'), u = imagemSegura(item.poster);
    p.style.visibility = u ? '' : 'hidden'; if (u) p.src = u; else p.removeAttribute('src');
    $('ficha-arte').style.backgroundImage = u ? 'url("' + u.replace(/"/g, '%22') + '")' : '';
    $('ficha-sinopse').textContent = item.sinopse || '';
    limpar($('ficha-dados')); limpar($('ficha-acoes')); limpar($('episodios')); limpar($('temporadas')); $('temporadas').hidden = true;
    if (!$('t-ficha').classList.contains('ativa')) {
      $('t-ficha').classList.add('ativa'); $('t-ficha').scrollTop = 0;
      Nav.camada('ficha', function () { pedido++; $('t-ficha').classList.remove('ativa'); if (Pag.atual() === 'inicio') Inicio.mostrar(); else Vod.redesenhar(); });
    } else $('t-ficha').scrollTop = 0;
    return ++pedido;
  }
  function dado(rotulo, valor) { if (valor) $('ficha-dados').appendChild(el('div', { class: 'dado' }, [el('b', { text: rotulo + ': ' }), String(valor)])); }
  function arte(info) {
    var b = info && info.backdrop_path; if (Array.isArray(b)) b = b[0];
    if (imagemSegura(b)) $('ficha-arte').style.backgroundImage = 'url("' + b.replace(/"/g, '%22') + '")';
  }

  /* ---- filme ---- */
  function tocarFilme(m, continuar) {
    var p = Progresso.de('f', m.id);
    Cinema.abrir({ tipo: 'f', id: m.id, url: Lista.urlFilme(m.id, m.ext), titulo: m.nome, ext: m.ext, inicio: continuar && p ? p.t : 0,
      aoFechar: function () { if ($('t-ficha').classList.contains('ativa')) botoesFilme(m); } });
  }
  function botoesFilme(m) {
    var cx = $('ficha-acoes'), p = Progresso.de('f', m.id); limpar(cx);
    if (p) {
      cx.appendChild(el('button', { class: 'btn p', onclick: function () { tocarFilme(m, true); } }, [Icones.play(), 'Continuar de ' + tempoBonito(p.t)]));
      cx.appendChild(el('button', { class: 'btn s', text: 'Do início', onclick: function () { tocarFilme(m, false); } }));
    } else cx.appendChild(el('button', { class: 'btn p', onclick: function () { tocarFilme(m, false); } }, [Icones.play(), 'Assistir']));
  }
  function filme(m) {
    var vez = abrirBase(m, 'f');
    botoesFilme(m);
    Lista.infoFilme(m.id).then(function (j) {
      if (vez !== pedido) return;
      var i = (j && j.info) || {};
      arte(i);
      if (i.plot || i.description) $('ficha-sinopse').textContent = i.plot || i.description;
      // a extensão de verdade vem na ficha (a da lista às vezes está errada)
      var ext = j && j.movie_data && j.movie_data.container_extension; if (ext) m.ext = ext;
      dado('Duração', i.duration); dado('Gênero', i.genre); dado('Direção', i.director); dado('Elenco', i.cast || i.actors);
    }).catch(function () {});
  }

  /* ---- série ---- */
  function serie(s) {
    var vez = abrirBase(s, 's');
    $('ficha-acoes').appendChild(el('div', { class: 'rodando', style: 'margin:6px 0' }));
    Lista.infoSerie(s.id).then(function (j) {
      if (vez !== pedido) return;
      var i = (j && j.info) || {};
      arte(i);
      if (i.plot) $('ficha-sinopse').textContent = i.plot;
      dado('Gênero', i.genre); dado('Elenco', i.cast);
      var temps = Lista.temporadasDe(j);
      limpar($('ficha-acoes'));
      if (!temps.length) { $('episodios').appendChild(el('div', { class: 'vazio-msg', text: 'Esta série ainda não tem episódios.' })); return; }
      var ult = Progresso.ultimoDaSerie(s.id), tSel = 0;
      if (ult) temps.forEach(function (t, n) { if (String(t.num) === String(ult.temporada)) tSel = n; });
      function tocar(ep, continuar) {
        var todos = [].concat.apply([], temps.map(function (t) { return t.episodios; }));
        function itemDe(e, cont) {
          var pos = todos.indexOf(e), prox = todos[pos + 1], p = Progresso.de('e', e.id);
          Progresso.ultimoDaSerie(s.id, { ep: e.id, temporada: e.temporada, num: e.num });
          return { tipo: 'e', id: e.id, url: Lista.urlEpisodio(e.id, e.ext), ext: e.ext, titulo: s.nome + ' · T' + e.temporada + ' E' + e.num,
            inicio: cont && p ? p.t : 0, extra: { serie: s.id }, proximo: prox ? function () { return itemDe(prox, false); } : null,
            aoFechar: function () { if ($('t-ficha').classList.contains('ativa') && vez === pedido) { ult = Progresso.ultimoDaSerie(s.id); desenhar(); } } };
        }
        Cinema.abrir(itemDe(ep, continuar));
      }
      function desenhar() {
        var ac = $('ficha-acoes'); limpar(ac);
        if (ult) {
          var todos = [].concat.apply([], temps.map(function (t) { return t.episodios; }));
          var e = todos.filter(function (x) { return x.id === ult.ep; })[0];
          if (e) { var p = Progresso.de('e', e.id);
            ac.appendChild(el('button', { class: 'btn p', onclick: function () { tocar(e, true); } }, [Icones.play(), 'Continuar: T' + e.temporada + ' E' + e.num + (p ? ' · ' + tempoBonito(p.t) : '')])); }
        }
        if (!ac.firstChild) ac.appendChild(el('button', { class: 'btn p', onclick: function () { tocar(temps[0].episodios[0], false); } }, [Icones.play(), 'Assistir']));
        var tx = $('temporadas'); limpar(tx); tx.hidden = temps.length < 2;
        temps.forEach(function (t, n) { tx.appendChild(el('button', { class: n === tSel ? 'ativa' : '', text: 'Temporada ' + t.num, onclick: function () { tSel = n; desenhar(); } })); });
        var ex = $('episodios'); limpar(ex);
        temps[tSel].episodios.forEach(function (e2) {
          var p2 = Progresso.de('e', e2.id);
          ex.appendChild(el('button', { class: 'ep', onclick: function () { tocar(e2, !!p2); } }, [
            el('span', { class: 'num', text: String(e2.num) }),
            el('span', { class: 't' }, [el('b', { text: e2.titulo || ('Episódio ' + e2.num) }), el('span', { text: p2 ? 'Parou em ' + tempoBonito(p2.t) : (e2.duracao || '') })]),
            Icones.play()
          ]));
        });
      }
      desenhar();
    }).catch(function () {
      if (vez !== pedido) return;
      limpar($('ficha-acoes')); $('episodios').appendChild(el('div', { class: 'vazio-msg', text: Textos.servidorMudo }));
    });
  }
  function iniciar() { $('ficha-voltar').addEventListener('click', function () { Nav.voltar(); }); }
  return { iniciar: iniciar, filme: filme, serie: serie, tocarFilme: tocarFilme };
})();

/* ------------------------------------------------------------------ Configurações */
var Config = (function () {
  function li(rotulo, valor) { return el('div', { class: 'li' }, [el('span', { class: 'r', text: rotulo }), el('span', { class: 'v', text: valor || '—' })]); }
  function acao(icone, rotulo, aoTocar, classe) {
    return el('button', { class: 'li' + (classe ? ' ' + classe : ''), onclick: aoTocar }, [Icones.svg(icone), el('span', { text: rotulo }), Icones.seta()]);
  }
  function mostrar() {
    var cx = $('config-dentro'); limpar(cx);
    cx.appendChild(el('h2', { text: 'Configurações' }));
    cx.appendChild(el('div', { class: 'cartao' }, [
      li('Situação', Sessao.demo ? 'Demonstração' : 'Ativo'),
      Sessao.cliente ? li('Cliente', Sessao.cliente) : null,
      li('Lista em uso', Sessao.demo ? 'Demonstração' : (Sessao.listaNome || 'Lista do seu cadastro')),
      Sessao.vence ? li('Vencimento', Sessao.vence) : null,
      // O código saiu da tela de entrar (19/11/2026: gerava dúvida, "só libera pelo código?").
      // Fica aqui, para quem cadastra pelo código como nas outras plataformas; tocar copia.
      el('button', { class: 'li', onclick: function () { copiar(Aparelho.codigoBonito(), 'Código copiado'); } },
        [el('span', { class: 'r', text: 'Código do aparelho' }), el('span', { class: 'v', text: Aparelho.codigoBonito() })]),
      li('Versão', VERSAO)
    ]));
    var itens = [
      acao(['M20 11a8 8 0 0 0-14.3-4.9L4 8', 'M4 4v4h4', 'M4 13a8 8 0 0 0 14.3 4.9L20 16', 'M20 20v-4h-4'], 'Atualizar o conteúdo', function () { App.recarregar(); }),
      acao(['M6 11h12v9H6z', 'M8.500 11V8a3.500 3.500 0 0 1 7 0v3'], 'Controle dos pais: ' + (Pais.ligado() ? 'ligado' : 'desligado'), pais),
      acao(['M3 6h18', 'M8 6V4h8v2', 'M6 6l1 14h10l1-14'], 'Limpar histórico', function () {
        Folha.confirmar('Limpar histórico?', 'Sai o "Continuar assistindo" e os canais vistos recentemente. Os favoritos ficam.', 'Limpar', function () {
          Progresso.limparTudo(); Favoritos.limparRecentes(); Toast('Histórico limpo');
        });
      })
    ];
    if (Aparelho.ios && !Aparelho.instalado) itens.push(acao(['M12 3v12', 'M8 7l4-4 4 4', 'M5 13v6h14v-6'], 'Instalar na tela de início', Instalar.abrir));
    if (Sessao.suporte && !Sessao.demo) itens.push(acao(['M21 12a8 8 0 0 1-11.800 7L4 20l1.200-4.600A8 8 0 1 1 21 12z'], 'Falar com o suporte', function () {
      window.open('https://wa.me/' + String(Sessao.suporte).replace(/\D/g, ''), '_blank', 'noopener');
    }));
    cx.appendChild(el('div', { class: 'cartao' }, itens));
    cx.appendChild(el('div', { class: 'cartao' }, [
      acao(['M15 4h4v16h-4', 'M10 8l-4 4 4 4', 'M6 12h10'], Sessao.viaLogin ? 'Sair da conta' : 'Entrar com usuário e senha', function () {
        if (!Sessao.viaLogin) { App.irParaEntrar(''); return; }
        Folha.confirmar('Sair da conta?', 'Para voltar você digita o usuário e a senha de novo.', 'Sair', function () { App.sair(); });
      }, 'perigo')
    ]));
  }
  function pais() {
    Folha.senha('Controle dos pais', 'Digite a senha para alterar. A senha de fábrica é 0000.', function (s) {
      if (!Pais.conferir(s)) return false;
      setTimeout(function () {
        Folha.abrir(function (c) {
          c.appendChild(el('h3', { text: 'Controle dos pais' }));
          c.appendChild(el('div', { class: 'texto', text: 'Conteúdo adulto pede senha. Esqueceu a senha? Peça a quem configurou o seu acesso o reset para a senha padrão 0000.' }));
          c.appendChild(el('div', { class: 'botoes' }, [
            el('button', { class: 'btn s', text: Pais.ligado() ? 'Desligar' : 'Ligar', onclick: function () { Pais.ligar(!Pais.ligado()); Folha.fechar(); Toast('Controle dos pais ' + (Pais.ligado() ? 'ligado' : 'desligado')); mostrar(); } }),
            el('button', { class: 'btn p', text: 'Trocar a senha', onclick: function () {
              Folha.fechar();
              setTimeout(function () { Folha.senha('Nova senha', 'Quatro números.', function (n) { if (!/^\d{4}$/.test(n)) return false; Pais.trocarSenha(n); Toast('Senha alterada'); }); }, 80);
            } })
          ]));
        });
      }, 80);
    });
  }
  return { mostrar: mostrar };
})();

/* ------------------------------------------------------------------ instalar na tela de início (iPhone) */
var Instalar = (function () {
  function abrir() {
    Folha.abrir(function (c) {
      c.appendChild(el('h3', { text: 'Instalar na tela de início' }));
      var corpo = el('div', { class: 'corpo' });
      function passo(n, html) { corpo.appendChild(el('div', { class: 'passo' }, [el('div', { class: 'b', text: String(n) }), el('p', { html: html })])); }
      var compart = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="M8 7l4-4 4 4"/><path d="M5 13v6h14v-6"/></svg>';
      passo(1, 'Toque no botão <b>Compartilhar</b> ' + compart + ' na barra do Safari.');
      passo(2, 'Role e toque em <b>Adicionar à Tela de Início</b>.');
      passo(3, 'Confirme em <b>Adicionar</b>. O ícone do Neon Player aparece junto dos seus aplicativos.');
      c.appendChild(corpo);
      c.appendChild(el('div', { class: 'botoes' }, [el('button', { class: 'btn p', text: 'Entendi', onclick: Folha.fechar })]));
    });
  }
  // uma vez por aparelho, na primeira entrada pelo Safari do iPhone
  function oferecer() {
    if (!Aparelho.ios || Aparelho.instalado || Guarda.ler('np_instalar_visto', false)) return;
    Guarda.gravar('np_instalar_visto', true);
    setTimeout(abrir, 1200);
  }
  return { abrir: abrir, oferecer: oferecer };
})();
