/* O que o Início mostra: os lançamentos da lista do cliente. Porta direta de
   Destaques.kt (Android) e Destaques.cs (Windows).

   Duas regras valem para TUDO que aparece aqui, capa e fileiras:
   1. Conteúdo adulto NUNCA entra — nem com o Controle dos Pais desligado.
      Esta função nem pergunta se o controle está ligado, de propósito.
   2. O mesmo título dublado e legendado aparece uma vez só, dublado (Titulos).

   "Novo" é o que o painel publicou por último (`added`), NÃO o ano do filme:
   o painel publica o lançamento antes de preencher o ano, e ordenar pelo ano
   jogava o filme de 2026 (sem ano) para o fim, atrás de 1968. O ano só
   desempata. A marca de idioma só é procurada numa janela do topo, nunca nos
   16 mil: as duas versões do mesmo filme chegam juntas no servidor.

   Miolo puro: recebe listas, devolve listas. Testado em tv/testar.mjs. */

var Destaques = (function () {
  var POR_FILEIRA = 10; // curto: é o que dá para navegar com o controle
  var NA_CAPA = 10;
  var JANELA = 40;

  function anoDe(texto) {
    var n = parseInt(String(texto || '').replace(/^\s+/, '').slice(0, 4), 10);
    return isNaN(n) ? 0 : n;
  }

  // As categorias que o Início não mostra: as adultas, sempre, e as que a
  // pessoa ocultou (`ocultas`, { id: true }), como o Destaques.kt do Android.
  function foraDoInicio(categorias, ocultas) {
    var fora = {}, i, k;
    if (ocultas) for (k in ocultas) if (ocultas.hasOwnProperty(k)) fora[String(k)] = true;
    for (i = 0; i < (categorias || []).length; i++) {
      var c = categorias[i];
      if (Pais.ehAdulta(c.nome || c.category_name)) fora[String(c.id || c.category_id)] = true;
    }
    return fora;
  }

  function permitidos(itens, fora) {
    var out = [], i;
    for (i = 0; i < (itens || []).length; i++) if (!fora[String(itens[i].categoria)]) out.push(itens[i]);
    return out;
  }

  // Seis candidatos por vaga dá folga para as repetições e continua barato.
  function janelaPara(quantos) { return Math.max(quantos * 6, 60); }

  // Do que entrou por último no servidor para o que entrou primeiro, sem o
  // mesmo título duas vezes. Vale para filmes e séries (os dois têm
  // nome/ano/added).
  function ordenar(itens, quantos) {
    quantos = quantos || POR_FILEIRA;
    var com = [], i;
    for (i = 0; i < itens.length; i++) com.push({ item: itens[i], ano: anoDe(itens[i].ano), added: Number(itens[i].added) || 0, pos: i });
    com.sort(function (a, b) {
      if (b.added !== a.added) return b.added - a.added;
      if (b.ano !== a.ano) return b.ano - a.ano;
      return a.pos - b.pos; // ordenação estável também no WebKit velho
    });
    var topo = [];
    for (i = 0; i < com.length && i < janelaPara(quantos); i++) topo.push(com[i].item);
    return Titulos.semRepetidos(topo, function (x) { return x.nome; }, function (x) { return x.ano; }).slice(0, quantos);
  }

  // O que aparece na capa: os últimos filmes e as últimas séries que entraram
  // no servidor, intercalados (filme, série, filme, série…). Sem séries, só
  // filmes; e vice-versa.
  function escolherCapa(filmes, series, quantos) {
    quantos = quantos || NA_CAPA;
    var saida = [], i = 0;
    while (saida.length < quantos && (i < filmes.length || i < series.length)) {
      if (i < filmes.length) saida.push({ ehSerie: false, item: filmes[i] });
      if (saida.length < quantos && i < series.length) saida.push({ ehSerie: true, item: series[i] });
      i++;
    }
    return saida;
  }

  // Tudo de uma vez, a partir do catálogo: as duas fileiras já ordenadas e a
  // capa. Guardado por carga (o chamador só recalcula quando o catálogo muda).
  function montar(filmes, catsFilmes, series, catsSeries, ocultasFilmes, ocultasSeries) {
    var f = ordenar(permitidos(filmes, foraDoInicio(catsFilmes, ocultasFilmes)), JANELA);
    var s = ordenar(permitidos(series, foraDoInicio(catsSeries, ocultasSeries)), JANELA);
    return {
      filmes: f.slice(0, POR_FILEIRA),
      series: s.slice(0, POR_FILEIRA),
      capa: escolherCapa(f, s, NA_CAPA)
    };
  }

  // "Continuar assistindo": os filmes que o cliente deixou pela metade, do
  // mais recente para trás, passando pelo mesmo filtro da capa (filme adulto
  // não volta para o Início nem pela metade). `pendentes` vem do Progresso:
  // [{ filmeId, t }] já ordenado do mais recente ao mais antigo.
  function continuarDe(pendentes, filmes, catsFilmes, quantos, ocultasFilmes) {
    quantos = quantos || POR_FILEIRA;
    if (!pendentes || !pendentes.length) return [];
    var fora = foraDoInicio(catsFilmes, ocultasFilmes), porId = {}, i, out = [];
    for (i = 0; i < pendentes.length; i++) porId[String(pendentes[i].filmeId)] = true;
    var achados = {};
    for (i = 0; i < filmes.length; i++) {
      var m = filmes[i];
      if (porId[String(m.id)] && !fora[String(m.categoria)]) achados[String(m.id)] = m;
    }
    for (i = 0; i < pendentes.length && out.length < quantos; i++) {
      var m2 = achados[String(pendentes[i].filmeId)];
      if (m2) out.push(m2);
    }
    return out;
  }

  // "Filme · 2026 · ★ 7.5" — a linha de baixo do título na capa.
  function metaDe(ehSerie, item) {
    var partes = [ehSerie ? Textos.serie : Textos.filme];
    var ano = anoDe(item.ano);
    if (ano > 0) partes.push(String(ano));
    var nota = String(item.nota || '').replace(/^\s+|\s+$/g, '');
    // uma casa, como a ficha do filme (o servidor manda "7.829")
    var n = parseFloat(nota.replace(',', '.'));
    if (!isNaN(n) && n > 0) partes.push('★ ' + n.toFixed(1));
    return partes.join(' · ');
  }

  return {
    POR_FILEIRA: POR_FILEIRA,
    NA_CAPA: NA_CAPA,
    anoDe: anoDe,
    foraDoInicio: foraDoInicio,
    permitidos: permitidos,
    ordenar: ordenar,
    escolherCapa: escolherCapa,
    montar: montar,
    continuarDe: continuarDe,
    metaDe: metaDe
  };
})();
