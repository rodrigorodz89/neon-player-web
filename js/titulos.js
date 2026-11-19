/* O mesmo filme, duas vezes: o painel costuma publicar uma versão dublada e
   uma legendada, e marca a diferença colando algo no nome — "(L)", "LEG",
   "[LEGENDADO]", "DUB"... No Início isso vira o mesmo pôster duas vezes.
   Aqui os dois viram um título só, e fica o dublado. Porta direta de
   Titulos.kt (Android) e Titulos.cs (Windows).

   A regra é conservadora de propósito: dois nomes só são "o mesmo" quando o
   nome-base bate E pelo menos um dos dois carrega a marca de idioma. Dois
   homônimos sem marca (um remake) seguem os dois. */

var Titulos = (function () {
  // A marca vale em três lugares: entre parênteses/colchetes em qualquer
  // ponto; depois de um separador (traço, barra, dois-pontos, |); ou solta
  // no FIM do nome. Nunca no começo nem no meio sem separador — "Leg Day"
  // e "Dublin Murders" são nomes, não marcas. "L" e "D" sozinhas só dentro
  // de ( ) ou [ ].
  var LEGENDADO = /(?:[\[(]\s*(?:l|leg|legendado|legendada)\s*[\])])|(?:[\-–—|:\/]\s*(?:leg|legendado|legendada)\.?(?=$|[\s\-–—|:\/)\]]))|(?:\s(?:leg|legendado|legendada)\.?\s*$)/i;
  var DUBLADO = /(?:[\[(]\s*(?:d|dub|dublado|dublada)\s*[\])])|(?:[\-–—|:\/]\s*(?:dub|dublado|dublada)\.?(?=$|[\s\-–—|:\/)\]]))|(?:\s(?:dub|dublado|dublada)\.?\s*$)/i;
  var LEGENDADO_G = new RegExp(LEGENDADO.source, 'gi');
  var DUBLADO_G = new RegExp(DUBLADO.source, 'gi');

  // Sem String.normalize no WebKit de 2015: tabela das letras acentuadas
  // que aparecem em nome de filme (português, espanhol, francês).
  var ACENTOS = {
    'á': 'a', 'à': 'a', 'â': 'a', 'ã': 'a', 'ä': 'a', 'å': 'a',
    'é': 'e', 'è': 'e', 'ê': 'e', 'ë': 'e',
    'í': 'i', 'ì': 'i', 'î': 'i', 'ï': 'i',
    'ó': 'o', 'ò': 'o', 'ô': 'o', 'õ': 'o', 'ö': 'o',
    'ú': 'u', 'ù': 'u', 'û': 'u', 'ü': 'u',
    'ç': 'c', 'ñ': 'n', 'ý': 'y', 'ÿ': 'y'
  };
  var COM_ACENTO = /[áàâãäåéèêëíìîïóòôõöúùûüçñýÿ]/g;

  function semAcento(s) {
    return s.replace(COM_ACENTO, function (c) { return ACENTOS[c] || c; });
  }

  // 'dublado' | 'legendado' | null
  function idiomaDe(nome) {
    if (DUBLADO.test(nome)) return 'dublado';
    if (LEGENDADO.test(nome)) return 'legendado';
    return null;
  }

  // O nome sem a marca de idioma, sem acento, sem pontuação e em minúsculas:
  // é a chave que diz se dois títulos são o mesmo.
  function baseDe(nome) {
    var s = String(nome || '').replace(DUBLADO_G, ' ').replace(LEGENDADO_G, ' ');
    s = semAcento(s.toLowerCase());
    return s.replace(/[^a-z0-9]+/g, ' ').replace(/^\s+|\s+$/g, '');
  }

  // Dublado ganha do neutro, que ganha do legendado.
  function peso(idioma) { return idioma === 'dublado' ? 2 : (idioma === null ? 1 : 0); }

  // Tira as repetições de uma lista, preferindo o dublado. Mantém a ordem:
  // cada título fica na posição em que apareceu pela primeira vez.
  // nomeDe(item) e anoDe(item): como ler cada item (o ano entra na chave:
  // "Titanic" de 1997 e de 2023 são dois).
  function semRepetidos(itens, nomeDe, anoDe) {
    if (!itens || itens.length < 2) return itens || [];
    var vagas = {}, ordem = [], i;
    for (i = 0; i < itens.length; i++) {
      var item = itens[i], nome = nomeDe(item), idioma = idiomaDe(nome);
      var chave = baseDe(nome) + '|' + String(anoDe(item) || '').replace(/^\s+|\s+$/g, '');
      var vaga = vagas[chave];
      if (!vaga) {
        vaga = { posicao: i, escolhido: item, idioma: idioma, comMarca: idioma !== null };
        vagas[chave] = vaga; ordem.push(vaga);
        continue;
      }
      // Só é repetição se ao menos um dos dois anuncia o idioma.
      if (!vaga.comMarca && idioma === null) {
        var solta = { posicao: i, escolhido: item, idioma: null, comMarca: false };
        vagas[chave + '#' + i] = solta; ordem.push(solta);
        continue;
      }
      vaga.comMarca = true;
      if (peso(idioma) > peso(vaga.idioma)) { vaga.escolhido = item; vaga.idioma = idioma; }
    }
    ordem.sort(function (a, b) { return a.posicao - b.posicao; });
    var out = [];
    for (i = 0; i < ordem.length; i++) out.push(ordem[i].escolhido);
    return out;
  }

  return { idiomaDe: idiomaDe, baseDe: baseDe, semRepetidos: semRepetidos };
})();
