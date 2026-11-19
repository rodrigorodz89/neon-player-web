/* Guarda contra automação, página emoldurada e ferramentas de desenvolvedor
   (19/11/2026). Mesmo desenho da guarda do Ultra Gestor, com os cuidados que
   aquela guarda ensinou: nesta guarda um falso positivo FECHA A PORTA para um
   cliente pagante, então só entra o que é certo de não pegar gente.

   - página dentro de iframe de outro site (alguém "embrulhando" o player): sai do iframe;
   - navegador controlado por script (webdriver, headless, Playwright, Puppeteer,
     Selenium, navegador embutido de assistente de IA): vai para /bloqueado/;
   - DevTools/Web Inspector ligado (`debugger` que para): vai para /bloqueado/.
   FICOU DE FORA, de propósito: o teste da "janela 0×0" (o iPhone abre o
   aplicativo instalado em segundo plano e pode medir a janela antes de mostrá-la)
   e o teste do console (o Chrome monta a prévia sozinho; barrava todo visitante
   no Ultra Gestor em 17/09).

   Isto é deterrente de tela. A segurança de verdade é a API: só entra login
   cadastrado no painel, com freio por IP e por usuário.

   Duas exceções: localhost/127.0.0.1 (os testes) e a chave do dono
   (?dev=<chave> uma vez grava no navegador; aqui só o SHA-256 dela; a chave
   fica com o dono).

   Roda ANTES de qualquer outro script da página. */
(function () {
  // 1. ninguém embrulha o player num site de terceiro
  try { if (window.top !== window.self) { window.top.location = window.self.location.href; return; } } catch (e) {
    document.documentElement.style.display = 'none'; return;
  }

  var host = location.hostname;
  if (host === 'localhost' || host === '127.0.0.1') return;

  var HASH_DEV = '877cbc8d366edf5d464dc78ef15810b0b3c955deeb6e06529ce8e79a0874a0fb';
  var chave = null;
  try {
    var q = new URLSearchParams(location.search);
    if (q.get('dev')) {
      localStorage.setItem('np_dev', q.get('dev'));
      q.delete('dev');
      history.replaceState(null, '', location.pathname + (q.toString() ? '?' + q.toString() : '') + location.hash);
    }
    chave = localStorage.getItem('np_dev');
  } catch (e) {}

  var liberado = null;
  var conferindo = Promise.resolve(false);
  // ⚠️ crypto.subtle só existe em página segura (https); o player é http. Sem ele,
  // a chave é conferida pelo SHA-256 escrito à mão abaixo.
  if (chave) conferindo = Promise.resolve(sha256(chave) === HASH_DEV);
  conferindo.then(function (ok) { liberado = !!ok; });

  var bloqueado = false;
  function bloquear(motivo) {
    if (bloqueado) return;
    bloqueado = true;
    conferindo.then(function (ok) {
      if (ok) { bloqueado = false; return; }
      try { window.stop(); } catch (e) {}
      location.replace('/bloqueado/?m=' + motivo);
    });
  }

  // 2. navegador controlado por script
  if (navigator.webdriver) return bloquear('a');
  var ua = navigator.userAgent || '';
  if (/HeadlessChrome|PhantomJS|Puppeteer|Playwright|SlimerJS|Electron\/|Claude\//i.test(ua)) return bloquear('h');
  try {
    var nomes = Object.getOwnPropertyNames(window);
    for (var i = 0; i < nomes.length; i++) {
      if (/^(__playwright|__pw_|__puppeteer|cdc_|_phantom|callPhantom|__nightmare|__selenium|_Selenium_IDE|domAutomation|__webdriver)/.test(nomes[i])) return bloquear('w');
    }
    if (document.documentElement.getAttribute('webdriver') || document.documentElement.getAttribute('selenium')) return bloquear('c');
  } catch (e) {}

  // 3. DevTools ligado: `debugger` só para quando há um depurador conectado.
  // Só com a página à vista: em segundo plano o navegador pode congelar o timer
  // e a conta de tempo mentiria.
  function checar() {
    if (liberado === true || bloqueado || document.visibilityState !== 'visible') return;
    var t = performance.now();
    debugger;
    if (performance.now() - t > 150) bloquear('d');
  }
  setTimeout(checar, 1200);
  setInterval(checar, 2000);

  // 4. atalhos do DevTools (no computador). Campo de texto continua normal.
  document.addEventListener('keydown', function (e) {
    if (liberado === true) return;
    var k = String(e.key || '').toUpperCase();
    var devtools = e.key === 'F12'
      || (e.ctrlKey && e.shiftKey && (k === 'I' || k === 'J' || k === 'C' || k === 'K'))
      || (e.ctrlKey && !e.shiftKey && (k === 'U' || k === 'S'))
      || (e.metaKey && e.altKey && (k === 'I' || k === 'J' || k === 'C' || k === 'U'));
    if (devtools) { e.preventDefault(); e.stopPropagation(); }
  }, true);

  // SHA-256 pequeno (página http não tem crypto.subtle)
  function sha256(texto) {
    var b = unescape(encodeURIComponent(texto)), K = [], H = [], p = [], i, j;
    function primo(n) { for (var d = 2; d * d <= n; d++) if (n % d === 0) return false; return true; }
    for (var n = 2, c = 0; c < 64; n++) if (primo(n)) {
      if (c < 8) H[c] = (Math.pow(n, 1 / 2) * 4294967296) | 0;
      K[c++] = (Math.pow(n, 1 / 3) * 4294967296) | 0;
    }
    var l = b.length * 8;
    b += '\x80';
    while (b.length % 64 - 56) b += '\x00';
    for (i = 0; i < b.length; i++) p[i >> 2] |= b.charCodeAt(i) << ((3 - i) % 4) * 8;
    p[p.length] = (l / 4294967296) | 0;
    p[p.length] = l;
    for (j = 0; j < p.length; j += 16) {
      var w = p.slice(j, j + 16), a = H.slice(0, 8);
      for (i = 0; i < 64; i++) {
        var w15 = w[i - 15], w2 = w[i - 2];
        if (i >= 16) w[i] = (w[i - 16] + (((w15 >>> 7) | (w15 << 25)) ^ ((w15 >>> 18) | (w15 << 14)) ^ (w15 >>> 3)) + w[i - 7] +
          (((w2 >>> 17) | (w2 << 15)) ^ ((w2 >>> 19) | (w2 << 13)) ^ (w2 >>> 10))) | 0;
        var e2 = a[4], a0 = a[0];
        var t1 = a[7] + (((e2 >>> 6) | (e2 << 26)) ^ ((e2 >>> 11) | (e2 << 21)) ^ ((e2 >>> 25) | (e2 << 7))) + ((e2 & a[5]) ^ (~e2 & a[6])) + K[i] + (w[i] | 0);
        var t2 = (((a0 >>> 2) | (a0 << 30)) ^ ((a0 >>> 13) | (a0 << 19)) ^ ((a0 >>> 22) | (a0 << 10))) + ((a0 & a[1]) ^ (a0 & a[2]) ^ (a[1] & a[2]));
        a = [(t1 + t2) | 0].concat(a); a[4] = (a[4] + t1) | 0; a.pop();
      }
      for (i = 0; i < 8; i++) H[i] = (H[i] + a[i]) | 0;
    }
    var hex = '';
    for (i = 0; i < 8; i++) for (j = 3; j >= 0; j--) { var x = (H[i] >> (j * 8)) & 255; hex += (x < 16 ? '0' : '') + x.toString(16); }
    return hex;
  }
})();
