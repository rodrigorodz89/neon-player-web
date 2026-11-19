/* Neon Player web — dados: a API do Neon (quem pode entrar), o servidor da
   lista (canais, filmes, séries) e o que fica guardado no aparelho. */
'use strict';

/* Rede com teto de tempo. */
function pedir(url, opcoes, tetoMs) {
  var ctl = new AbortController();
  var t = setTimeout(function () { ctl.abort(); }, tetoMs || 20000);
  var o = Object.assign({ cache: 'no-store', signal: ctl.signal, referrerPolicy: 'no-referrer' }, opcoes || {});
  return fetch(url, o).finally(function () { clearTimeout(t); });
}

/* ------------------------------------------------------------------ API do Neon */
var Api = (function () {
  // Em localhost (desenvolvimento) a API passa pelo repasse do servidor de teste,
  // porque ela só libera o endereço publicado do player.
  var LOCAL = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  var BASE = LOCAL ? '/api' : 'https://api.neontv.app';
  var CHAVE = 'ntv_hJ8S7WLgzx470a72ZYPhok0Y';   // a mesma chave pública dos apps (não é segredo)

  function json(r) {
    if (r.status === 429) { var e = new Error('freio'); e.freio = true; throw e; }
    if (!r.ok) throw new Error('http ' + r.status);
    return r.json();
  }

  // Entrar com o usuário e a senha da lista: só quem está cadastrado no painel.
  function entrar(usuario, senha) {
    return pedir(BASE + '/v2/web/entrar', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario: usuario, senha: senha, codigo: Aparelho.codigo(), plat: Aparelho.plataforma, v: VERSAO })
    }, 20000).then(json);
  }

  // O caminho de todo app da casa: o código deste aparelho já foi cadastrado?
  // Sem cadastro, a resposta é a demonstração (filmes abertos, por alguns dias).
  function ativar() {
    var s = Guarda.ler('np_segredo', '');
    var url = BASE + '/v2/activate?v=2&demo=1&k=' + encodeURIComponent(CHAVE) + '&mac=' + Aparelho.codigo() +
      '&plat=' + Aparelho.plataforma + (s ? '&s=' + encodeURIComponent(s) : '');
    return pedir(url, {}, 20000).then(json).then(function (j) {
      if (j && j.secret) Guarda.gravar('np_segredo', j.secret);   // vem uma vez só
      return j;
    });
  }

  return { entrar: entrar, ativar: ativar, local: LOCAL };
})();

/* ------------------------------------------------------------------ servidor da lista */
var Lista = (function () {
  var f = null;   // { dns, user, pass, nome }
  var bases = [];

  // O endereço do cadastro é http. Quando o domínio fica atrás da Cloudflare, o
  // navegador (Chrome no PC, Safari) troca http por https sozinho, por causa de
  // um registro no DNS; se o https do servidor não responde, o pedido morre.
  // Por isso há dois candidatos, e fica valendo o que respondeu: http como está
  // no cadastro e o mesmo endereço em https. O vídeo usa o mesmo que o catálogo.
  function candidatos(dns) {
    var m = /^http:\/\/(.+)$/i.exec(dns);
    return m ? [dns, 'https://' + m[1]] : [dns];
  }
  function usar(fonte) {
    f = fonte ? { dns: String(fonte.dns || '').replace(/\/+$/, ''), user: fonte.username, pass: fonte.password, nome: fonte.nome || null } : null;
    bases = f ? candidatos(f.dns) : [];
    if (f) {
      var guardado = Guarda.ler('np_base_' + chave(), null);
      if (guardado && bases.indexOf(guardado) > 0) { bases.splice(bases.indexOf(guardado), 1); bases.unshift(guardado); }
      f.base = bases[0];
    }
  }
  function fonte() { return f; }
  // chave do que fica guardado por lista (progresso, favoritos): nunca o endereço em claro
  function chave() {
    var s = f ? f.dns + '|' + f.user : 'x', h = 5381, i;
    for (i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
    return h.toString(36);
  }
  function api(base, acao, extra) {
    return base + '/player_api.php?username=' + encodeURIComponent(f.user) + '&password=' + encodeURIComponent(f.pass) +
      (acao ? '&action=' + acao : '') + (extra || '');
  }
  function lerDe(base, acao, extra, teto) {
    return pedir(api(base, acao, extra), {}, teto || 45000).then(function (r) {
      if (!r.ok) throw new Error('http ' + r.status);
      return r.json();
    });
  }
  // Tenta o endereço que vale; se a REDE recusar (não o servidor), tenta o outro
  // candidato e, respondendo, ele passa a valer (guardado para a próxima abertura).
  function ler(acao, extra, teto) {
    var eu = f, base = eu.base;
    return lerDe(base, acao, extra, teto).catch(function (erro) {
      var outros = bases.filter(function (b) { return b !== base; });
      if (!outros.length || f !== eu || !(erro instanceof TypeError)) throw erro;
      return lerDe(outros[0], acao, extra, teto).then(function (j) {
        if (f === eu) { eu.base = outros[0]; Guarda.gravar('np_base_' + chave(), outros[0]); }
        return j;
      }, function () { throw erro; });
    });
  }
  // A conta vale no servidor? Devolve { aceita, vence } (vence = dd/mm/aaaa, a data real).
  function conta() {
    return ler('', '', 20000).then(function (j) {
      var u = j && j.user_info, st = String((u && u.status) || '').toLowerCase();
      var aceita = !!u && (u.auth === 1 || u.auth === '1') && st !== 'banned' && st !== 'disabled' && st !== 'expired';
      var vence = null;
      if (u && u.exp_date) {
        var d = new Date(parseInt(u.exp_date, 10) * 1000);
        if (!isNaN(d.getTime())) vence = ('0' + d.getDate()).slice(-2) + '/' + ('0' + (d.getMonth() + 1)).slice(-2) + '/' + d.getFullYear();
      }
      return { aceita: aceita, vence: vence, conexoes: u ? Number(u.max_connections) || 1 : 1 };
    });
  }
  function urlCanal(id) { return f.base + '/live/' + encodeURIComponent(f.user) + '/' + encodeURIComponent(f.pass) + '/' + id + '.m3u8'; }
  function urlFilme(id, ext) { return f.base + '/movie/' + encodeURIComponent(f.user) + '/' + encodeURIComponent(f.pass) + '/' + id + '.' + (ext || 'mp4'); }
  function urlEpisodio(id, ext) { return f.base + '/series/' + encodeURIComponent(f.user) + '/' + encodeURIComponent(f.pass) + '/' + id + '.' + (ext || 'mp4'); }

  function infoFilme(id) { return ler('get_vod_info', '&vod_id=' + encodeURIComponent(id), 20000); }
  function infoSerie(id) { return ler('get_series_info', '&series_id=' + encodeURIComponent(id), 25000); }
  function guia(id) { return ler('get_short_epg', '&stream_id=' + encodeURIComponent(id) + '&limit=4', 12000); }

  // Temporadas e episódios, já na ordem (as temporadas saem das chaves de "episodes").
  function temporadasDe(j) {
    var eps = (j && j.episodes) || {}, chaves = Object.keys(eps);
    chaves.sort(function (a, b) { var na = parseInt(a, 10), nb = parseInt(b, 10); return (isNaN(na) ? 1e9 : na) - (isNaN(nb) ? 1e9 : nb); });
    var out = [];
    chaves.forEach(function (k) {
      var arr = eps[k]; if (!arr || !arr.length) return;
      var lista = arr.map(function (o, n) {
        var det = (o && o.info) || {};
        return { id: String(o.id || ''), temporada: k, num: parseInt(o.episode_num, 10) || (n + 1), titulo: o.title || null,
          duracao: det.duration || null, ext: o.container_extension || 'mp4' };
      });
      lista.sort(function (a, b) { return a.num - b.num; });
      out.push({ num: k, episodios: lista });
    });
    return out;
  }

  return { usar: usar, fonte: fonte, chave: chave, ler: ler, conta: conta, urlCanal: urlCanal, urlFilme: urlFilme, urlEpisodio: urlEpisodio,
    infoFilme: infoFilme, infoSerie: infoSerie, guia: guia, temporadasDe: temporadasDe };
})();

/* ------------------------------------------------------------------ catálogo em memória */
var Catalogo = (function () {
  var c = vazio();
  function vazio() { return { catsTv: [], canais: [], catsFilmes: [], filmes: [], catsSeries: [], series: [], vodPronto: false }; }

  function categoria(x) { return { id: String(x.category_id), nome: nomeLimpo(x.category_name), adulta: Pais.ehAdulta(x.category_name) }; }
  function canal(r, i) { return { id: String(r.stream_id), nome: String(r.name || '').trim(), logo: r.stream_icon || null, categoria: String(r.category_id || ''), n: i + 1 }; }
  function filme(r) {
    return { id: String(r.stream_id), nome: r.name || r.title || '', categoria: String(r.category_id || ''), poster: r.stream_icon || null,
      ano: r.year || String(r.release_date || '').slice(0, 4) || null, nota: r.rating || null, ext: r.container_extension || 'mp4', added: Number(r.added) || 0 };
  }
  function serie(r) {
    return { id: String(r.series_id), nome: r.name || r.title || '', categoria: String(r.category_id || ''), poster: r.cover || null,
      ano: r.year || String(r.releaseDate || r.release_date || '').slice(0, 4) || null, nota: r.rating || null, sinopse: r.plot || null,
      genero: r.genre || null, added: Number(r.added) || Number(r.last_modified) || 0 };
  }
  function lista(x) { return Array.isArray(x) ? x : []; }

  // Canais primeiro (é o que abre mais rápido); filmes e séries logo atrás.
  // aoAndar(texto) atualiza a tela de carregamento.
  function carregar(aoAndar) {
    c = vazio();
    aoAndar(Textos.carregandoCanais);
    var tv = Promise.all([Lista.ler('get_live_categories'), Lista.ler('get_live_streams', '', 60000)]).then(function (r) {
      c.catsTv = lista(r[0]).map(categoria);
      c.canais = lista(r[1]).filter(Boolean).map(canal);
    });
    var vod = Promise.all([
      Lista.ler('get_vod_categories').catch(function () { return []; }),
      Lista.ler('get_vod_streams', '', 90000).catch(function () { return []; }),
      Lista.ler('get_series_categories').catch(function () { return []; }),
      Lista.ler('get_series', '', 90000).catch(function () { return []; })
    ]).then(function (r) {
      c.catsFilmes = lista(r[0]).map(categoria); c.filmes = lista(r[1]).filter(Boolean).map(filme);
      c.catsSeries = lista(r[2]).map(categoria); c.series = lista(r[3]).filter(Boolean).map(serie);
      c.vodPronto = true;
    });
    return tv.then(function () { aoAndar(Textos.carregandoConteudo); return vod; });
  }

  // ids das categorias adultas de cada seção (para tirar de "Tudo", busca e Início)
  function adultas(cats) { var m = {}; cats.forEach(function (x) { if (x.adulta) m[x.id] = true; }); return m; }

  return {
    carregar: carregar,
    get: function () { return c; },
    adultas: adultas,
    limpar: function () { c = vazio(); }
  };
})();

/* ------------------------------------------------------------------ onde parou, favoritos, recentes */
var Progresso = (function () {
  function k() { return 'np_prog_' + Lista.chave(); }
  function tudo() { return Guarda.ler(k(), {}) || {}; }
  function gravar(o) { Guarda.gravar(k(), o); }
  // tipo: 'f' (filme) ou 'e' (episódio). Menos de 30 s não conta; perto do fim, apaga.
  function salvar(tipo, id, t, d, extra) {
    var o = tudo(), ch = tipo + id;
    if (!d || t < 30) return;
    if (d - t < 90) { delete o[ch]; gravar(o); return; }
    o[ch] = Object.assign({ t: Math.floor(t), d: Math.floor(d), em: Date.now() }, extra || {});
    // teto: os 200 mais recentes
    var chaves = Object.keys(o);
    if (chaves.length > 220) {
      chaves.sort(function (a, b) { return (o[b].em || 0) - (o[a].em || 0); });
      chaves.slice(200).forEach(function (x) { delete o[x]; });
    }
    gravar(o);
  }
  function de(tipo, id) { return tudo()[tipo + id] || null; }
  function apagar(tipo, id) { var o = tudo(); delete o[tipo + id]; gravar(o); }
  // filmes pela metade, do mais recente ao mais antigo: [{ filmeId, t, d }]
  function filmesPendentes() {
    var o = tudo();
    return Object.keys(o).filter(function (x) { return x.charAt(0) === 'f'; })
      .sort(function (a, b) { return (o[b].em || 0) - (o[a].em || 0); })
      .map(function (x) { return { filmeId: x.slice(1), t: o[x].t, d: o[x].d }; });
  }
  // o último episódio visto de cada série: { serieId: { ep, temporada, num, em } }
  function ultimoDaSerie(serieId, v) {
    var m = Guarda.ler(k() + '_s', {}) || {};
    if (v === undefined) return m[serieId] || null;
    m[serieId] = Object.assign({ em: Date.now() }, v); Guarda.gravar(k() + '_s', m);
  }
  function seriesRecentes() {
    var m = Guarda.ler(k() + '_s', {}) || {};
    return Object.keys(m).sort(function (a, b) { return (m[b].em || 0) - (m[a].em || 0); });
  }
  function limparTudo() { Guarda.apagar(k()); Guarda.apagar(k() + '_s'); }
  return { salvar: salvar, de: de, apagar: apagar, filmesPendentes: filmesPendentes, ultimoDaSerie: ultimoDaSerie, seriesRecentes: seriesRecentes, limparTudo: limparTudo };
})();

var Favoritos = (function () {
  function k(tipo) { return 'np_' + tipo + '_' + Lista.chave(); }
  function ids(tipo) { return Guarda.ler(k(tipo), []) || []; }
  function tem(id) { return ids('fav').indexOf(String(id)) >= 0; }
  function alternar(id) {
    var l = ids('fav'), i = l.indexOf(String(id));
    if (i >= 0) l.splice(i, 1); else l.unshift(String(id));
    Guarda.gravar(k('fav'), l); return i < 0;
  }
  function visto(id) {
    var l = ids('rec').filter(function (x) { return x !== String(id); });
    l.unshift(String(id)); Guarda.gravar(k('rec'), l.slice(0, 30));
  }
  function limparRecentes() { Guarda.apagar(k('rec')); }
  return { favoritos: function () { return ids('fav'); }, recentes: function () { return ids('rec'); }, tem: tem, alternar: alternar, visto: visto, limparRecentes: limparRecentes };
})();
