/* 📡 Rádio do Rosimar — tela, voz e envio para a planilha. Criado por Kevin Paulo · @Arkev.arq */
(function () {
  'use strict';
  var P = window.RadioParser;
  var $ = function (id) { return document.getElementById(id); };
  var LS = {
    get: function (k, padrao) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : padrao; } catch (e) { return padrao; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* sem espaço */ } }
  };

  // ---------- Configuração (vem do link #cfg=...) ----------
  function aplicarConfig(b64url) {
    try {
      var b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
      while (b64.length % 4) b64 += '=';
      var bin = atob(b64);
      var bytes = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      var c = JSON.parse(new TextDecoder().decode(bytes));
      if (typeof c.u === 'string' && /\/dev$/.test(c.u)) return 'Este link é antigo (endereço de teste). Peça ao Kevin o link novo.';
      if (typeof c.u !== 'string' || !/^https:\/\/script\.google\.com\/(a\/[\w.-]+\/)?macros\/s\/[\w-]+\/exec$/.test(c.u))
        return 'Endereço da planilha não reconhecido: ' + String(c.u || '(vazio)').slice(0, 90);
      if (typeof c.k !== 'string' || c.k.length < 20) return 'A chave veio incompleta.';
      LS.set('radio_cfg', { url: c.u, chave: c.k, quem: String(c.n || 'Rosimar').slice(0, 40) });
      LS.set('radio_clientes', []);
      return '';
    } catch (e) {
      return 'O link chegou cortado (' + b64url.length + ' letras). Copie de novo, inteiro.';
    }
  }
  /** Aceita o link inteiro, só o código, com espaços ou quebras de linha no meio. */
  function extrairCodigo(texto) {
    var limpo = String(texto || '').replace(/\s+/g, '');
    var m = /#cfg=([A-Za-z0-9_-]+)/.exec(limpo);
    if (m) return m[1];
    if (/^[A-Za-z0-9_-]{40,}$/.test(limpo)) return limpo;
    return '';
  }
  function lerConfigDoLink() {
    var m = /#cfg=([A-Za-z0-9_-]+)/.exec(location.hash);
    if (!m) return;
    var erro = aplicarConfig(m[1]);
    LS.set('radio_cfg_erro', erro);
    history.replaceState(null, '', location.pathname + location.search); // tira a chave da barra de endereço
  }
  lerConfigDoLink();
  var cfg = LS.get('radio_cfg', null);

  // ---------- Telas ----------
  function mostrar(nome) {
    Array.prototype.forEach.call(document.querySelectorAll('.tela'), function (t) { t.classList.remove('ativa'); });
    $('tela-' + nome).classList.add('ativa');
    tela = nome;
  }
  var tela = '';

  function atualizarRodape() {
    if (!cfg) { $('situacao').textContent = ''; return; }
    var fila = LS.get('radio_fila', []);
    var hoje = new Date().toDateString();
    var nHoje = LS.get('radio_hist', []).filter(function (h) { return new Date(h.quando).toDateString() === hoje; }).length;
    var el = $('situacao');
    if (fila.length) {
      el.textContent = '⏳ ' + fila.length + (fila.length === 1 ? ' registro aguardando' : ' registros aguardando') + ' internet para enviar';
      el.classList.add('alerta');
    } else {
      el.textContent = '✓ Tudo enviado' + (nHoje ? ' · ' + nHoje + ' hoje' : '');
      el.classList.remove('alerta');
    }
  }

  // ---------- Voz: falar ----------
  var vozPt = null;
  function escolherVoz() {
    if (!('speechSynthesis' in window)) return;
    var vozes = speechSynthesis.getVoices();
    vozPt = vozes.filter(function (v) { return /^pt[-_]BR/i.test(v.lang); })[0] ||
            vozes.filter(function (v) { return /^pt/i.test(v.lang); })[0] || null;
  }
  if ('speechSynthesis' in window) { escolherVoz(); speechSynthesis.onvoiceschanged = escolherVoz; }

  function falar(texto) {
    return new Promise(function (resolve) {
      if (!('speechSynthesis' in window)) return resolve();
      try { speechSynthesis.cancel(); } catch (e) { /* nada */ }
      var u = new SpeechSynthesisUtterance(texto);
      u.lang = 'pt-BR';
      if (vozPt) u.voice = vozPt;
      u.rate = 1.0;
      var feito = false;
      var fim = function () { if (!feito) { feito = true; setTimeout(resolve, 250); } };
      u.onend = fim; u.onerror = fim;
      setTimeout(fim, 1500 + texto.length * 90); // se o aparelho não avisar o fim
      speechSynthesis.speak(u);
    });
  }

  // ---------- Voz: ouvir ----------
  var Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
  var recAtual = null;

  function ouvir(opcoes) {
    opcoes = opcoes || {};
    return new Promise(function (resolve, reject) {
      if (!Rec) return reject(new Error('sem-reconhecimento'));
      var rec = new Rec();
      recAtual = rec;
      rec.lang = 'pt-BR';
      rec.interimResults = true;
      rec.continuous = false;
      rec.maxAlternatives = 1;
      var final = '', parcial = '', acabou = false;
      var limite = setTimeout(function () { try { rec.stop(); } catch (e) { /* nada */ } }, opcoes.limite || 20000);
      rec.onresult = function (ev) {
        parcial = '';
        for (var i = ev.resultIndex; i < ev.results.length; i++) {
          var txt = ev.results[i][0].transcript;
          if (ev.results[i].isFinal) final += (final ? ' ' : '') + txt.trim();
          else parcial += txt;
        }
        if (opcoes.aoParcial) opcoes.aoParcial((final + ' ' + parcial).trim());
      };
      rec.onerror = function (ev) {
        if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') { acabou = true; clearTimeout(limite); reject(new Error('microfone-negado')); }
        else if (ev.error === 'network') { acabou = true; clearTimeout(limite); reject(new Error('sem-internet-voz')); }
        // no-speech / aborted: termina no onend
      };
      rec.onend = function () {
        clearTimeout(limite);
        if (recAtual === rec) recAtual = null;
        if (!acabou) { acabou = true; resolve((final || parcial).trim()); }
      };
      try { rec.start(); } catch (e) { clearTimeout(limite); reject(e); }
    });
  }
  function pararDeOuvir() { if (recAtual) { try { recAtual.stop(); } catch (e) { /* nada */ } } }
  function cancelarTudo() {
    fluxo++;
    if (recAtual) { try { recAtual.abort(); } catch (e) { /* nada */ } recAtual = null; }
    if ('speechSynthesis' in window) { try { speechSynthesis.cancel(); } catch (e) { /* nada */ } }
  }

  // ---------- Fluxo de um registro ----------
  var fluxo = 0;
  var atual = null; // registro em confirmação
  var falas = [];

  async function ouvirNaTela(titulo) {
    mostrar('ouvindo');
    $('tituloOuvindo').textContent = titulo || 'Pode falar…';
    $('parcial').textContent = '';
    return ouvir({ aoParcial: function (t) { $('parcial').textContent = t; } });
  }

  async function registrar() {
    cancelarTudo();
    var meu = fluxo;
    falas = [];
    try {
      var texto = await ouvirNaTela('Pode falar…');
      if (meu !== fluxo) return;
      if (!texto) {
        mostrar('inicio');
        await falar('Não ouvi nada. Aperte o botão e fale de novo.');
        return;
      }
      falas.push(texto);
      var clientes = LS.get('radio_clientes', []);
      var r = P.entender(texto, { clientes: clientes });

      // Pergunta o que faltou (uma vez cada)
      var perguntas = { cliente: 'Qual é o cliente?', valor: 'Qual foi o valor?', tipo: 'Qual foi o serviço?' };
      for (var i = 0; i < r.faltando.length; i++) {
        var campo = r.faltando[i];
        if (meu !== fluxo) return;
        mostrar('ouvindo');
        $('tituloOuvindo').textContent = perguntas[campo];
        $('parcial').textContent = '';
        await falar(perguntas[campo]);
        if (meu !== fluxo) return;
        var resp = await ouvirNaTela(perguntas[campo]);
        if (meu !== fluxo) return;
        if (!resp) continue;
        falas.push(resp);
        if (campo === 'cliente') { var c = P.entenderCliente(resp, clientes); r.cliente = c.cliente; r.clienteBase = c.clienteBase; }
        if (campo === 'valor') r.valor = P.entenderValor(resp);
        if (campo === 'tipo') r.tipo = P.entenderTipo(resp);
      }
      atual = r;
      await confirmar(meu);
    } catch (e) {
      if (meu !== fluxo) return;
      erro(e);
    }
  }

  function linhaCartao(rotulo, valor, extra) {
    var div = document.createElement('div');
    div.className = 'linha';
    var a = document.createElement('span'); a.textContent = rotulo;
    var b = document.createElement('b'); b.textContent = valor;
    if (extra) { var s = document.createElement('span'); s.className = 'novo'; s.textContent = extra; b.appendChild(s); }
    div.appendChild(a); div.appendChild(b);
    return div;
  }

  async function confirmar(meu) {
    var r = atual;
    var c = $('cartao');
    c.innerHTML = '';
    c.appendChild(linhaCartao('Cliente', r.cliente || '— sem nome —', r.cliente && !r.clienteBase ? 'cliente novo' : ''));
    c.appendChild(linhaCartao('Valor', r.valor ? P.valorTela(r.valor) : '— sem valor —'));
    c.appendChild(linhaCartao('Serviço', r.tipo || '— não entendi —'));
    c.appendChild(linhaCartao('Dia', P.dataTela(r.dataServico)));
    if (r.situacao) c.appendChild(linhaCartao('Situação', r.situacao));
    var ouvi = document.createElement('div');
    ouvi.className = 'linha';
    ouvi.style.fontSize = '16px'; ouvi.style.color = '#666';
    ouvi.textContent = 'Ouvi: “' + falas.join(' … ') + '”';
    c.appendChild(ouvi);
    mostrar('confirmar');

    var frase = r.cliente ? P.fraseConfirmacao(r) : 'Não entendi o cliente. Está certo assim?';
    await falar(frase);
    // Escuta "sim" ou "não" (duas tentativas). Os botões funcionam a qualquer momento.
    for (var t = 0; t < 2; t++) {
      if (meu !== fluxo || tela !== 'confirmar') return;
      var resp;
      try { resp = await ouvir({ limite: 7000 }); } catch (e) { return; }
      if (meu !== fluxo || tela !== 'confirmar') return;
      var sn = P.simOuNao(resp);
      if (sn === 'sim') return salvar();
      if (sn === 'nao') return falarDeNovo();
      if (t === 0 && resp) await falar('Diga sim ou não.');
    }
  }

  async function falarDeNovo() {
    cancelarTudo();
    atual = null;
    await falar('Tudo bem. Fale de novo.');
    registrar();
  }

  function novoId() {
    var a = new Uint8Array(8);
    crypto.getRandomValues(a);
    return Date.now().toString(36) + '-' + Array.prototype.map.call(a, function (x) { return x.toString(16).padStart(2, '0'); }).join('');
  }

  async function salvar() {
    cancelarTudo();
    var r = atual;
    if (!r) return;
    atual = null;
    var alertas = [];
    if (!r.cliente) alertas.push('Sem cliente');
    else if (!r.clienteBase) alertas.push('Cliente novo: cadastrar na Base');
    else if (r.clienteNota && r.clienteNota < 0.85) alertas.push('Conferir o cliente');
    if (!r.valor) alertas.push('Sem valor');
    if (!r.tipo) alertas.push('Sem tipo de serviço');
    var reg = {
      id: novoId(),
      dataServico: r.dataServico,
      cliente: r.cliente || '',
      valor: r.valor || '',
      tipo: r.tipo || '',
      situacao: r.situacao || '',
      texto: falas.join(' | '),
      quem: cfg.quem,
      alerta: alertas.join(' · ')
    };
    var fila = LS.get('radio_fila', []);
    fila.push(reg);
    LS.set('radio_fila', fila);
    var hist = LS.get('radio_hist', []);
    hist.push({ quando: Date.now(), cliente: reg.cliente, valor: reg.valor });
    LS.set('radio_hist', hist.slice(-60));

    mostrar('gravado');
    $('msgGravado').textContent = 'Gravado!';
    $('subGravado').textContent = 'Enviando para a planilha…';
    atualizarRodape();
    var meu = fluxo;
    var falou = falar('Gravado.');
    var enviou = await enviarFila();
    if (meu !== fluxo) return;
    $('subGravado').textContent = enviou ? 'Já está na planilha ✓' : 'Sem internet agora. Vai enviar sozinho depois.';
    await falou;
    if (!enviou && meu === fluxo) await falar('Sem internet agora. Eu envio depois, sozinho.');
  }

  // ---------- Envio para a planilha ----------
  var enviando = null;
  function enviarFila() {
    if (enviando) return enviando;
    enviando = (async function () {
      var fila = LS.get('radio_fila', []);
      if (!fila.length || !cfg) return true;
      try {
        var resp = await fetch(cfg.url, { method: 'POST', body: JSON.stringify({ chave: cfg.chave, registros: fila.slice(0, 50) }) });
        var json = await resp.json();
        if (!json.ok) { console.warn('Planilha recusou:', json.erro); return false; }
        var ok = {};
        (json.gravados || []).forEach(function (id) { ok[id] = true; });
        LS.set('radio_fila', LS.get('radio_fila', []).filter(function (r) { return !ok[r.id]; }));
        return LS.get('radio_fila', []).length === 0;
      } catch (e) {
        return false;
      } finally {
        atualizarRodape();
      }
    })().finally(function () { enviando = null; });
    return enviando;
  }

  async function atualizarClientes() {
    if (!cfg) return;
    try {
      var resp = await fetch(cfg.url + '?acao=clientes&chave=' + encodeURIComponent(cfg.chave));
      var json = await resp.json();
      if (json.ok && Array.isArray(json.clientes)) {
        LS.set('radio_clientes', json.clientes.slice(0, 2000).map(function (c) {
          return { nome: String(c.nome || '').slice(0, 120), extrato: String(c.extrato || '').slice(0, 160),
            apelidos: String(c.apelidos || '').slice(0, 200), bairro: String(c.bairro || '').slice(0, 60) };
        }));
      }
    } catch (e) { /* sem internet: usa a lista guardada */ }
  }

  function erro(e) {
    var msg = String(e && e.message || e);
    mostrar('erro');
    if (msg === 'microfone-negado') {
      $('msgErro').textContent = 'O microfone está bloqueado';
      $('subErro').textContent = 'Toque no cadeado ao lado do endereço (ou em Configurações do app) e permita o microfone.';
    } else if (msg === 'sem-internet-voz') {
      $('msgErro').textContent = 'Sem internet para entender a voz';
      $('subErro').textContent = 'O reconhecimento de voz precisa de internet. Tente de novo em um lugar com sinal.';
      falar('Sem internet para entender a voz. Tente de novo daqui a pouco.');
    } else if (msg === 'sem-reconhecimento') {
      $('msgErro').textContent = 'Este navegador não entende voz';
      $('subErro').textContent = 'Abra este app pelo Google Chrome.';
    } else {
      $('msgErro').textContent = 'Não deu certo';
      $('subErro').textContent = 'Tente de novo. (' + msg.slice(0, 80) + ')';
    }
  }

  // ---------- Botões ----------
  $('btnFalar').addEventListener('click', function () { cancelarTudo(); registrar(); });
  $('btnParar').addEventListener('click', pararDeOuvir);
  $('btnSim').addEventListener('click', salvar);
  $('btnNao').addEventListener('click', falarDeNovo);
  $('btnOutro').addEventListener('click', function () { cancelarTudo(); registrar(); });
  $('btnVoltar').addEventListener('click', function () { cancelarTudo(); mostrar('inicio'); });

  // ---------- Instalar app ----------
  var pedidoInstalar = null;
  var instalado = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  if (!instalado) $('btnBaixar').style.display = 'inline-block';
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); pedidoInstalar = e; });
  $('btnBaixar').addEventListener('click', async function () {
    if (pedidoInstalar) { pedidoInstalar.prompt(); pedidoInstalar = null; return; }
    var a = $('ajudaBaixar'); a.style.display = a.style.display === 'block' ? 'none' : 'block';
  });
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(function () { /* nada */ });

  // ---------- Abrir já ouvindo ----------
  var ultimaAuto = 0;
  async function talvezComecarSozinho() {
    if (!cfg || tela !== 'inicio' || Date.now() - ultimaAuto < 4000) return;
    var permitido = false;
    try {
      var st = await navigator.permissions.query({ name: 'microphone' });
      permitido = st.state === 'granted';
    } catch (e) { permitido = false; }
    if (!permitido || tela !== 'inicio') return; // primeira vez: precisa tocar em FALAR para liberar o microfone
    ultimaAuto = Date.now();
    registrar();
  }

  window.addEventListener('online', function () { enviarFila(); });
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') { enviarFila(); talvezComecarSozinho(); }
    else if (tela === 'ouvindo' || tela === 'confirmar') { cancelarTudo(); mostrar('inicio'); }
  });

  // ---------- Início ----------
  if (!cfg) {
    mostrar('config');
    var errCfg = LS.get('radio_cfg_erro', '');
    if (errCfg) $('erroConfig').textContent = '⚠ ' + errCfg;
  }
  else {
    $('quem').textContent = cfg.quem;
    mostrar('inicio');
    atualizarRodape();
    enviarFila();
    atualizarClientes();
    if (!Rec) erro(new Error('sem-reconhecimento'));
    else talvezComecarSozinho();
  }

  $('btnColar').addEventListener('click', function () {
    var cod = extrairCodigo($('campoLink').value);
    if (!cod) { $('erroConfig').textContent = '⚠ Não achei o link aí. Cole o link inteiro que começa com https://kevinpaulor.github.io'; return; }
    var erro = aplicarConfig(cod);
    if (erro) { $('erroConfig').textContent = '⚠ ' + erro; return; }
    location.replace(location.pathname);
  });

  // Para os testes automáticos
  window.__radio = { registrar: registrar, enviarFila: enviarFila, estado: function () { return tela; } };
})();
