/* 📡 Rádio do Rosimar — tela, voz e envio para a planilha. Criado por Kevin Paulo · @Arkev.arq */
(function () {
  'use strict';
  var P = window.RadioParser;
  var VERSAO = 25, VERSAO_DATA = '28/11/2026 08:15'; // atualizado a cada publicação
  var $ = function (id) { return document.getElementById(id); };
  var LS = {
    get: function (k, padrao) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : padrao; } catch (e) { return padrao; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
  };

  // ---------- Fila de registros (IndexedDB: cabem centenas de áudios; cai no localStorage se não der) ----------
  var filaMem = [];
  var filaDB = null;
  var filaPronta = new Promise(function (pronto) {
    try {
      var req = indexedDB.open('radio', 1);
      req.onupgradeneeded = function () { req.result.createObjectStore('dados'); };
      req.onerror = function () { filaMem = LS.get('radio_fila', []); pronto(); };
      req.onsuccess = function () {
        filaDB = req.result;
        var tx = filaDB.transaction('dados', 'readonly').objectStore('dados').get('fila');
        tx.onsuccess = function () {
          filaMem = Array.isArray(tx.result) ? tx.result : [];
          var antiga = LS.get('radio_fila', []); // migra a fila antiga do localStorage
          if (antiga.length) {
            var ids = {}; filaMem.forEach(function (r) { ids[r.id] = true; });
            antiga.forEach(function (r) { if (!ids[r.id]) filaMem.push(r); });
            filaSalvar(filaMem).then(function () { try { localStorage.removeItem('radio_fila'); } catch (e) { /* nada */ } });
          }
          pronto();
        };
        tx.onerror = function () { pronto(); };
      };
    } catch (e) { filaMem = LS.get('radio_fila', []); pronto(); }
  });
  function filaSalvar(arr) {
    filaMem = arr;
    return new Promise(function (ok) {
      if (!filaDB) { ok(LS.set('radio_fila', arr)); return; }
      try {
        var tx = filaDB.transaction('dados', 'readwrite');
        tx.objectStore('dados').put(arr, 'fila');
        tx.oncomplete = function () { ok(true); };
        tx.onerror = tx.onabort = function () { ok(false); };
      } catch (e) { ok(false); }
    });
  }

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
      LS.set('radio_sem_audio', false);
      LS.set('radio_mudo_seguidos', 0);
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
    document.body.classList.toggle('so-texto', !!cfg && modo() === 'texto');
    Array.prototype.forEach.call(document.querySelectorAll('.tela'), function (t) { t.classList.remove('ativa'); });
    $('tela-' + nome).classList.add('ativa');
    tela = nome;
  }
  var tela = '';

  function atualizarRodape() {
    if (!cfg) { $('situacao').textContent = ''; return; }
    var fila = filaMem;
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
      var fim = function () { if (!feito) { feito = true; resolve(); } };
      u.onend = fim; u.onerror = fim;
      setTimeout(fim, 1500 + texto.length * 90); // se o aparelho não avisar o fim
      speechSynthesis.speak(u);
    });
  }

  // ---------- Bip: avisa quando o microfone abre e fecha ----------
  var ctxBip = null;
  function bip(tipo) {
    try {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return Promise.resolve();
      if (!ctxBip) ctxBip = new Ctx();
      if (ctxBip.state === 'suspended') ctxBip.resume();
      var t = ctxBip.currentTime;
      // início: dois toques subindo; fim: um toque descendo. Onda quadrada suave = mais alto no alto-falante do celular.
      var notas = tipo === 'inicio' ? [[880, 0], [1320, 0.13]] : [[700, 0], [440, 0.12]];
      notas.forEach(function (n) {
        var o = ctxBip.createOscillator(), g = ctxBip.createGain();
        o.type = 'square';
        o.frequency.setValueAtTime(n[0], t + n[1]);
        g.gain.setValueAtTime(0.0001, t + n[1]);
        g.gain.exponentialRampToValueAtTime(0.6, t + n[1] + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + n[1] + 0.12);
        o.connect(g); g.connect(ctxBip.destination);
        o.start(t + n[1]); o.stop(t + n[1] + 0.13);
      });
    } catch (e) { /* sem som: segue */ }
    return new Promise(function (r) { setTimeout(r, tipo === 'inicio' ? 280 : 0); });
  }

  // ---------- Voz: ouvir ----------
  var Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
  var recAtual = null;

  // ---------- Configurações deste celular ----------
  var CAMPOS = {
    cliente: { rotulo: 'Cliente', pergunta: 'Qual é o cliente?', fala: 'Cliente?' },
    servico: { rotulo: 'Serviço', pergunta: 'Qual foi o serviço?', fala: 'Serviço?' },
    dia: { rotulo: 'Dia', pergunta: 'Que dia? (e a hora, se tiver)', fala: 'Que dia?' },
    valor: { rotulo: 'Valor', pergunta: 'Qual é o valor?', fala: 'Valor?' },
    endereco: { rotulo: 'Endereço', pergunta: 'Endereço? (ou diga “pula”)', fala: 'Endereço?' }
  };
  var ORDEM_PADRAO = ['cliente', 'servico', 'dia', 'valor', 'endereco'];
  function ajustes() {
    var teste = !!(cfg && /teste/i.test(cfg.quem));
    var a = LS.get('radio_ajustes', {}) || {};
    var ordem = Array.isArray(a.ordem) ? a.ordem.filter(function (c) { return CAMPOS[c]; }) : [];
    ORDEM_PADRAO.forEach(function (c) { if (ordem.indexOf(c) < 0) ordem.push(c); });
    return {
      modo: ['voz', 'texto', 'ambos', 'ia', 'frase'].indexOf(a.modo) >= 0 ? a.modo : (teste ? 'ambos' : 'voz'),
      ordem: ordem,
      endereco: ['sempre', 'novo', 'nunca'].indexOf(a.endereco) >= 0 ? a.endereco : 'novo',
      gravarJunto: a.gravarJunto === true // experimental: no Android pode ocupar o microfone e o reconhecimento não ouve
    };
  }
  function salvarAjustes(a) { LS.set('radio_ajustes', a); }
  function modo() { return ajustes().modo; }

  // ---------- Resposta digitada (modos "só texto" e "voz e texto") ----------
  var digitando = null; // { resolve }
  var algumDigitado = false;
  function mostrarCaixa(ligada) {
    var box = $('respostaDigitada');
    var soTexto = modo() === 'texto';
    if (ligada) {
      var secao = document.querySelector('#tela-' + tela);
      if (soTexto) { // só texto: logo abaixo da pergunta, já com o teclado aberto
        var titulo = secao && secao.querySelector('.grande');
        if (titulo && titulo.nextSibling !== box) titulo.parentNode.insertBefore(box, titulo.nextSibling);
      } else if (secao && box.parentNode !== secao) { // voz e texto: no fim da tela, sem abrir o teclado
        secao.appendChild(box);
      }
      $('campoResposta').value = '';
      $('campoResposta').placeholder = soTexto ? 'Digite a resposta' : 'Ou toque aqui para digitar';
    }
    box.style.display = ligada ? 'flex' : 'none';
    if (ligada && soTexto) setTimeout(function () { try { $('campoResposta').focus(); } catch (e) { /* nada */ } }, 50);
  }
  function entregarDigitado(texto) {
    var d = digitando; digitando = null;
    mostrarCaixa(false);
    if (d) d.resolve(String(texto || '').trim(), true);
  }

  function ouvir(opcoes) {
    opcoes = opcoes || {};
    var m = modo();
    if (m === 'ia' || m === 'frase') m = 'voz'; // nos modos com IA, as perguntas do fim usam o reconhecimento normal (a gravação já parou)
    if (m === 'texto') {
      return new Promise(function (resolve) {
        digitando = { resolve: function (t) { if (t) algumDigitado = true; resolve(t); } };
        mostrarCaixa(true);
      });
    }
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
      var fim = function (t) { if (acabou) return; acabou = true; clearTimeout(limite); mostrarCaixa(false); digitando = null; bip('fim'); resolve(t); };
      if (m === 'ambos') {
        // pode falar ou digitar: o que vier primeiro vale
        digitando = { resolve: function (t) {
          if (t) algumDigitado = true;
          if (recAtual === rec) { recAtual = null; try { rec.abort(); } catch (e) { /* nada */ } }
          fim(t);
        } };
        mostrarCaixa(true);
      }
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
        var erroFatal = { 'not-allowed': 'microfone-negado', 'service-not-allowed': 'microfone-negado', network: 'sem-internet-voz', 'audio-capture': 'mic-ocupado' }[ev.error];
        if (erroFatal && !acabou) { acabou = true; clearTimeout(limite); mostrarCaixa(false); digitando = null; reject(new Error(erroFatal)); }
        // no-speech / aborted: termina no onend
      };
      rec.onend = function () {
        if (recAtual === rec) recAtual = null;
        fim((final || parcial).trim());
      };
      var trilha = grav && grav.stream && grav.stream.getAudioTracks()[0];
      bip('inicio').then(function () {
        if (acabou) return;
        var foi = false;
        if (trilha) { try { rec.start(trilha); foi = true; grav.compartilhado = true; } catch (e) { /* Chrome antigo: não aceita */ } }
        if (!foi) { try { rec.start(); } catch (e) { clearTimeout(limite); reject(e); } }
      });
    });
  }
  function pararDeOuvir() {
    if (digitando) return entregarDigitado($('campoResposta').value);
    if (recAtual) { try { recAtual.stop(); } catch (e) { /* nada */ } }
  }
  // ---------- Gravação do áudio (para o Kevin conferir depois) ----------
  var grav = null;
  async function iniciarGravacao() {
    descartarGravacao();
    // No modo digitado não há reconhecimento disputando o microfone: grava sempre (para testar o áudio).
    var aj = ajustes();
    // voz: só grava se o experimental estiver ligado e este celular não tiver falhado antes
    if (aj.modo === 'ia' || aj.modo === 'frase' || frasesAtiva) return; // os modos com IA têm gravação própria (WAV)
    if (aj.modo !== 'texto' && (!aj.gravarJunto || LS.get('radio_sem_audio', false))) return;
    if (!window.MediaRecorder || !navigator.mediaDevices) return;
    try {
      // Sem cancelamento de eco: no Android ele coloca o celular em "modo ligação" e a voz do app fica baixa ou some.
      var stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      var tipos = ['audio/mp4;codecs=mp4a.40.2', 'audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];
      var mime = tipos.filter(function (t) { return MediaRecorder.isTypeSupported(t); })[0] || '';
      var rec = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 32000 } : undefined);
      var g = { rec: rec, stream: stream, chunks: [], nivel: 0, mediu: false, inicio: Date.now(),
        mime: (rec.mimeType || mime || 'audio/webm').split(';')[0] };
      rec.ondataavailable = function (e) { if (e.data && e.data.size) g.chunks.push(e.data); };
      rec.start(1000);
      try { // mede o volume para saber se gravou de verdade ou saiu mudo
        var Ctx = window.AudioContext || window.webkitAudioContext;
        g.ctx = new Ctx();
        var an = g.ctx.createAnalyser(); an.fftSize = 512;
        g.ctx.createMediaStreamSource(stream).connect(an);
        var buf = new Uint8Array(an.fftSize);
        g.timer = setInterval(function () {
          if (g.ctx.state !== 'running') { g.ctx.resume().catch(function () {}); return; }
          an.getByteTimeDomainData(buf);
          var m = 0; for (var i = 0; i < buf.length; i++) { var d = Math.abs(buf[i] - 128); if (d > m) m = d; }
          g.mediu = true; if (m > g.nivel) g.nivel = m;
        }, 150);
      } catch (e) { /* sem medidor: grava assim mesmo */ }
      grav = g;
    } catch (e) { grav = null; }
  }
  function fecharGravacao(g) {
    clearInterval(g.timer);
    try { g.stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) { /* nada */ }
    try { if (g.ctx) g.ctx.close(); } catch (e) { /* nada */ }
  }
  function descartarGravacao() {
    var g = grav; grav = null;
    if (!g) return;
    try { g.rec.onstop = null; g.rec.stop(); } catch (e) { /* nada */ }
    fecharGravacao(g);
  }
  function pararGravacao() {
    return new Promise(function (resolve) {
      var g = grav; grav = null;
      if (!g) return resolve(null);
      var pronto = false;
      var fim = function () {
        if (pronto) return; pronto = true;
        fecharGravacao(g);
        var blob = new Blob(g.chunks, { type: g.mime });
        resolve({ blob: blob, mime: g.mime, silencioso: g.mediu && g.nivel < 4, segundos: Math.round((Date.now() - g.inicio) / 1000) });
      };
      g.rec.onstop = fim;
      setTimeout(fim, 2500);
      try { g.rec.stop(); } catch (e) { fim(); }
    });
  }
  function paraBase64(blob) {
    return new Promise(function (res) {
      var fr = new FileReader();
      fr.onload = function () { res(String(fr.result).split(',')[1] || ''); };
      fr.onerror = function () { res(''); };
      fr.readAsDataURL(blob);
    });
  }

  function cancelarTudo() {
    descartarGravacao();
    if (ia && ia.parar) ia.parar();
    fecharMicrofoneIA();
    if (digitando) entregarDigitado('');
    fluxo++;
    if (recAtual) { try { recAtual.abort(); } catch (e) { /* nada */ } recAtual = null; }
    if ('speechSynthesis' in window) { try { speechSynthesis.cancel(); } catch (e) { /* nada */ } }
  }

  // ---------- Fluxo de um registro ----------
  var fluxo = 0;
  var atual = null; // registro em confirmação
  var falas = [];

  // ---------- Barra de progresso ----------
  function valorDoCampo(r, c) {
    if (c === 'cliente') return r.cliente ? r.cliente + (r.clienteBase ? '' : ' (novo)') : '';
    if (c === 'servico') return r.tipo || '';
    if (c === 'dia') return r.diaOk ? P.dataTela(r.dataServico) + (r.hora ? ' às ' + r.hora : '') : '';
    if (c === 'valor') return r.valor ? P.valorTela(r.valor) : (r.valorPulado ? 'pulado' : '');
    if (c === 'endereco') return r.endereco || (r.enderecoPulado ? (r.clienteBase ? 'da Base' : 'pulado') : '');
    return '';
  }
  function desenharProgresso(r, atualCampo, ordem) {
    var box = $('progresso');
    box.innerHTML = '';
    ordem.forEach(function (c) {
      var v = valorDoCampo(r, c);
      var li = document.createElement('div');
      li.className = 'passo' + (c === atualCampo ? ' agora' : v ? ' feito' : '');
      var ic = document.createElement('span'); ic.className = 'ic';
      ic.textContent = c === atualCampo ? '▸' : v ? '✔' : '○';
      var nome = document.createElement('span'); nome.className = 'nome'; nome.textContent = CAMPOS[c].rotulo;
      var val = document.createElement('b'); val.textContent = v;
      li.appendChild(ic); li.appendChild(nome); li.appendChild(val);
      box.appendChild(li);
    });
  }

  async function perguntarNaTela(pergunta, r, campo, ordem, fala) {
    mostrar('ouvindo');
    $('tituloOuvindo').textContent = pergunta;
    $('parcial').textContent = '';
    desenharProgresso(r, campo, ordem);
    await falar(fala || pergunta);
  }
  async function ouvirNaTela() {
    $('parcial').textContent = '';
    return ouvir({ aoParcial: function (t) { $('parcial').textContent = t; } });
  }

  var PULAR = /^(pula|pular|pulo|passa|nao sei|não sei|depois|nenhum|nada|sem|tanto faz)\b/i;

  /** Junta o que a resposta trouxe sem apagar o que já foi dito. */
  function juntar(r, novo, campo) {
    if (!r.tipo && novo.tipo) r.tipo = novo.tipo;
    if (!r.valor && novo.valor) r.valor = novo.valor;
    if (!r.diaOk && (novo.dataFalada || novo.hora)) { r.dataServico = novo.dataServico; r.diaOk = true; }
    if (!r.hora && novo.hora) r.hora = novo.hora;
    if (novo.situacao && !r.situacao) r.situacao = novo.situacao;
    // cliente: só se foi a pergunta do cliente, ou se a resposta trouxe um cliente da Base
    if (!r.cliente && novo.cliente && (campo === 'cliente' || novo.clienteBase)) {
      r.cliente = novo.cliente; r.clienteBase = novo.clienteBase; r.clienteNota = novo.clienteNota;
    }
  }

  /** Coloca no registro o que uma resposta trouxe (serve para voz, texto e IA). */
  function aplicarResposta(r, campo, resp, clientes) {
    if (PULAR.test(resp.trim())) {
      if (campo === 'valor') r.valorPulado = true;
      if (campo === 'endereco') r.enderecoPulado = true;
      if (campo === 'dia') r.diaOk = true; // fica hoje
      return;
    }
    var novo = P.entender(resp, { clientes: clientes });
    if (campo === 'cliente' && !novo.clienteBase) {
      var c = P.entenderCliente(resp, clientes);
      // se a resposta trouxe mais coisas (serviço, valor), o nome é o que sobrou; senão é a frase inteira
      if (!(novo.tipo || novo.valor || novo.dataFalada)) { novo.cliente = c.cliente; novo.clienteBase = c.clienteBase; }
      var achado = P.acharCliente(resp, clientes);
      novo.clienteNota = achado ? achado.nota : 0;
    }
    if (campo === 'servico' && !novo.tipo) novo.tipo = P.entenderTipo(resp);
    if (campo === 'valor' && !novo.valor) novo.valor = P.entenderValor(resp);
    if (campo === 'endereco') { r.endereco = resp.trim().slice(0, 200); return; }
    juntar(r, novo, campo);
    if (campo === 'dia' && !r.diaOk) r.diaOk = true; // respondeu algo que não é data: fica hoje
  }
  function fecharRegistro(r, hoje) {
    // situação: o que foi dito em qualquer resposta ("marcado", "já pagou"...) ou data futura
    var tudo = P.entender(falas.join(' . '), { clientes: [] });
    if (!r.situacao && tudo.situacao) r.situacao = tudo.situacao;
    if (!r.situacao && (r.hora || r.dataServico > hoje)) r.situacao = 'A fazer';
    r.texto = falas.join(' | ');
  }
  function registroVazio(hoje) {
    return { cliente: '', clienteBase: false, tipo: '', valor: null, dataServico: hoje, diaOk: false, hora: '',
      situacao: '', endereco: '', enderecoPulado: false, valorPulado: false };
  }
  function precisaPerguntar(r, campo, aj) {
    if (campo === 'cliente') return !r.cliente;
    if (campo === 'servico') return !r.tipo;
    if (campo === 'dia') return !r.diaOk;
    if (campo === 'valor') return !r.valor && !r.valorPulado;
    if (campo === 'endereco') {
      if (aj.endereco === 'nunca' || r.endereco) return false;
      if (aj.endereco === 'novo' && (r.clienteBase || !r.cliente)) { r.enderecoPulado = true; return false; }
      return true;
    }
    return false;
  }

  // ---------- Modo "Voz com áudio (IA)": grava cada resposta em WAV e a IA transcreve ----------
  var ia = null; // { ctx, stream, fonte, proc, taxa }
  async function abrirMicrofoneIA() {
    var stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: true, autoGainControl: true } });
    var Ctx = window.AudioContext || window.webkitAudioContext;
    var ctx = new Ctx();
    if (ctx.state === 'suspended') { try { await ctx.resume(); } catch (e) { /* nada */ } }
    ia = { ctx: ctx, stream: stream, fonte: ctx.createMediaStreamSource(stream), taxa: ctx.sampleRate };
  }
  function fecharMicrofoneIA() {
    if (!ia) return;
    try { ia.stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) { /* nada */ }
    try { ia.ctx.close(); } catch (e) { /* nada */ }
    ia = null;
  }
  /** Grava uma resposta: começa quando ouve voz, para depois de ~1,3 s de silêncio (ou 7 s sem ninguém falar). */
  function gravarClipe(op) {
    op = op || {};
    var SILENCIO = op.silencio || 1300, MAXIMO = op.maximo || 20000;
    return new Promise(function (resolve) {
      if (!ia) return resolve(null);
      var proc = ia.ctx.createScriptProcessor(4096, 1, 1);
      var pedacos = [], inicio = Date.now(), falou = false, ultimoSom = 0, ruido = null, amostrasRuido = [];
      var acabou = false;
      var fim = function () {
        if (acabou) return; acabou = true;
        try { ia.fonte.disconnect(proc); proc.disconnect(); } catch (e) { /* nada */ }
        resolve({ pedacos: pedacos, taxa: ia ? ia.taxa : 48000, falou: falou });
      };
      ia.parar = fim;
      proc.onaudioprocess = function (ev) {
        var d = ev.inputBuffer.getChannelData(0);
        pedacos.push(new Float32Array(d));
        var soma = 0; for (var i = 0; i < d.length; i++) soma += d[i] * d[i];
        var rms = Math.sqrt(soma / d.length), agora = Date.now();
        if (agora - inicio < 300) amostrasRuido.push(rms);
        else if (ruido === null) ruido = amostrasRuido.length ? Math.min.apply(null, amostrasRuido) : 0.005; // o mais baixo = fundo
        // limite de "voz": acima do fundo, mas nunca alto demais (se ele já começou a falar logo no bip)
        var limiar = Math.min(0.06, Math.max(0.015, (ruido === null ? 0.005 : ruido) * 3));
        if (rms > limiar) { falou = true; ultimoSom = agora; }
        if (falou && agora - ultimoSom > SILENCIO) fim();
        else if (!falou && agora - inicio > 7000) fim();
        else if (agora - inicio > MAXIMO) fim();
      };
      ia.fonte.connect(proc); proc.connect(ia.ctx.destination);
    });
  }
  /** Junta pedaços, reduz para 16 kHz e devolve os bytes de um WAV mono 16 bits. */
  function paraWav(clipes) {
    var alvo = 16000, amostras = [];
    clipes.forEach(function (c, n) {
      if (!c) return;
      var passo = c.taxa / alvo, total = 0;
      c.pedacos.forEach(function (p) { total += p.length; });
      var tudo = new Float32Array(total), pos = 0;
      c.pedacos.forEach(function (p) { tudo.set(p, pos); pos += p.length; });
      for (var i = 0; i < tudo.length; i += passo) {
        var a = Math.floor(i), b = Math.min(tudo.length, Math.floor(i + passo)), soma = 0;
        for (var j = a; j < b; j++) soma += tudo[j];
        amostras.push(b > a ? soma / (b - a) : 0);
      }
      if (n < clipes.length - 1) for (var k = 0; k < alvo * 0.35; k++) amostras.push(0); // pausa entre respostas
    });
    var buf = new ArrayBuffer(44 + amostras.length * 2), v = new DataView(buf);
    var escreve = function (o, t) { for (var i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i)); };
    escreve(0, 'RIFF'); v.setUint32(4, 36 + amostras.length * 2, true); escreve(8, 'WAVE'); escreve(12, 'fmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, alvo, true);
    v.setUint32(28, alvo * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); escreve(36, 'data');
    v.setUint32(40, amostras.length * 2, true);
    for (var i = 0; i < amostras.length; i++) {
      var x = Math.max(-1, Math.min(1, amostras[i]));
      v.setInt16(44 + i * 2, x < 0 ? x * 0x8000 : x * 0x7fff, true);
    }
    return new Blob([buf], { type: 'audio/wav' });
  }
  async function transcrever(clipes, clientes) {
    var audios = [];
    for (var i = 0; i < clipes.length; i++) audios.push({ mime: 'audio/wav', b64: await paraBase64(paraWav([clipes[i]])) });
    var resp = await fetch(cfg.url, { method: 'POST', body: JSON.stringify({ chave: cfg.chave, acao: 'transcrever', audios: audios,
      nomes: clientes.map(function (c) { return c.nome; }) }) });
    var json = await resp.json();
    if (!json.ok) { if (json.erro === 'chave') chaveRevogada(); throw new Error(json.erro === 'sem-chave-gemini' ? 'sem-chave-gemini' : 'ia-falhou'); }
    return json.textos || [];
  }

  async function registrarIA() {
    cancelarTudo();
    var meu = fluxo;
    falas = [];
    audioAtual = null;
    algumDigitado = false;
    var aj = ajustes();
    var clientes = LS.get('radio_clientes', []);
    var hoje = P.entender('', {}).dataServico;
    var r = registroVazio(hoje);
    var clipes = [];            // { campo, clipe }
    var primeira = null;        // transcrição do 1º áudio, em segundo plano
    var falhaIA = '';
    try {
      await abrirMicrofoneIA();
      for (var i = 0; i < aj.ordem.length; i++) {
        var campo = aj.ordem[i];
        if (meu !== fluxo) return fecharMicrofoneIA();
        if (campo === 'endereco' && aj.endereco === 'novo' && primeira) { // precisa saber se o cliente é novo
          mostrar('ouvindo'); $('tituloOuvindo').textContent = 'Um instante…'; desenharProgresso(r, campo, aj.ordem);
          await primeira.catch(function () {});
        }
        if (!precisaPerguntar(r, campo, aj)) continue;
        await perguntarNaTela(CAMPOS[campo].pergunta, r, campo, aj.ordem, CAMPOS[campo].fala);
        if (meu !== fluxo) return fecharMicrofoneIA();
        await bip('inicio');
        var clipe = await gravarClipe();
        bip('fim');
        if (meu !== fluxo) return fecharMicrofoneIA();
        if (!clipe || !clipe.falou) {
          if (i === 0 && !clipes.length) { fecharMicrofoneIA(); mostrar('inicio'); await falar('Não ouvi. Aperte de novo.'); return; }
          continue;
        }
        clipes.push({ campo: campo, clipe: clipe });
        if (!primeira) { // manda o 1º áudio para a IA já, enquanto faz as outras perguntas
          primeira = transcrever([clipe], clientes).then(function (t) {
            clipes[0].texto = t[0] || '';
            if (clipes[0].texto) aplicarResposta(r, clipes[0].campo, clipes[0].texto, clientes);
          }).catch(function (e) { falhaIA = e.message; });
        }
      }
      fecharMicrofoneIA();
      // o resto vai junto, de uma vez
      mostrar('ouvindo'); $('tituloOuvindo').textContent = 'Entendendo…'; $('parcial').textContent = '';
      desenharProgresso(r, '', aj.ordem);
      if (primeira) await primeira;
      var resto = clipes.slice(1);
      if (resto.length && !falhaIA) {
        try {
          var textos = await transcrever(resto.map(function (c) { return c.clipe; }), clientes);
          resto.forEach(function (c, k) { c.texto = textos[k] || ''; });
        } catch (e) { falhaIA = e.message; }
      }
      if (meu !== fluxo) return;
      clipes.forEach(function (c, k) {
        if (!c.texto) return;
        falas.push(c.texto);
        if (k > 0) aplicarResposta(r, c.campo, c.texto, clientes);
      });
      fecharRegistro(r, hoje);
      r.falhaIA = falhaIA;
      audioAtual = clipes.length ? { blob: paraWav(clipes.map(function (c) { return c.clipe; })), mime: 'audio/wav', silencioso: false,
        segundos: Math.round(clipes.reduce(function (t, c) { return t + c.clipe.pedacos.length * 4096 / c.clipe.taxa; }, 0)) } : null;
      if (falhaIA) {
        await falar(falhaIA === 'sem-chave-gemini' ? 'IA sem chave. Grave pelo modo rápido.' : 'Não entendi agora. O áudio fica salvo.');
      }
      atual = r;
      await confirmar(meu);
    } catch (e) {
      fecharMicrofoneIA();
      if (meu !== fluxo) return;
      erro(e);
    }
  }

  // ---------- Modo "Uma frase + IA" (e plano B sem internet para todos os modos de voz) ----------
  var frasesAtiva = false;
  function checarInternet() {
    if (!navigator.onLine) return Promise.resolve(false);
    return Promise.race([
      fetch(cfg.url + '?acao=ping&chave=' + encodeURIComponent(cfg.chave), { cache: 'no-store' })
        .then(function (r) { return r.ok; }).catch(function () { return false; }),
      new Promise(function (ok) { setTimeout(function () { ok(false); }, 6000); })
    ]);
  }
  async function extrair(wav, quando) {
    var b64 = await paraBase64(wav);
    var resp;
    try {
      resp = await Promise.race([
        fetch(cfg.url, { method: 'POST', body: JSON.stringify({ chave: cfg.chave, acao: 'extrair', quando: quando, audio: { mime: 'audio/wav', b64: b64 } }) }),
        new Promise(function (_, nao) { setTimeout(function () { nao(new Error('rede')); }, 30000); })
      ]);
    } catch (e) { throw new Error('rede'); }
    var json;
    try { json = await resp.json(); } catch (e) { throw new Error('rede'); }
    if (!json.ok) { if (json.erro === 'chave') chaveRevogada(); throw new Error(json.erro || 'ia-falhou'); }
    return json.campos || {};
  }
  function segundosDe(clipe) { return Math.round(clipe.pedacos.length * 4096 / clipe.taxa); }

  /** Sem internet: guarda o áudio na fila; o script preenche com a IA quando o sinal voltar. */
  async function salvarPendente(wav, clipe, hoje) {
    var b64 = await paraBase64(wav);
    var reg = { id: novoId(), pendenteIA: true, gravadoEm: hoje, quem: cfg.quem, cliente: '', valor: '', tipo: '', situacao: '',
      texto: '', hora: '', endereco: '', alerta: '', audio: { mime: 'audio/wav', b64: b64, segundos: segundosDe(clipe) } };
    await filaPronta;
    var fila = filaMem.slice(); fila.push(reg);
    if (!(await filaSalvar(fila))) {
      mostrar('erro');
      $('msgErro').textContent = 'Memória do celular cheia';
      $('subErro').textContent = 'Não coube o áudio. Conecte na internet para enviar os registros guardados.';
      await falar('Memória cheia.');
      return;
    }
    var hist = LS.get('radio_hist', []); hist.push({ quando: Date.now(), cliente: '(sem internet)', valor: '' }); LS.set('radio_hist', hist.slice(-60));
    mostrar('gravado');
    $('msgErro').textContent = '';
    $('msgGravado').textContent = 'Gravado!';
    $('subGravado').textContent = 'Sem internet: vou preencher sozinho quando tiver sinal.';
    atualizarRodape();
    await falar('Sem internet. Gravei, preencho depois.');
    enviarFila();
  }

  async function registrarFrase(opcoes) {
    opcoes = opcoes || {};
    cancelarTudo();
    var meu = fluxo;
    frasesAtiva = true;
    falas = [];
    audioAtual = null;
    algumDigitado = false;
    var aj = ajustes();
    var clientes = LS.get('radio_clientes', []);
    var hoje = P.entender('', {}).dataServico;
    var r = registroVazio(hoje);
    var net = opcoes.offline ? Promise.resolve(false) : checarInternet(); // descobre enquanto ele fala
    try {
      await abrirMicrofoneIA();
      mostrar('ouvindo');
      $('tituloOuvindo').textContent = 'Fale tudo: cliente, serviço, dia e valor';
      $('parcial').textContent = '';
      $('progresso').innerHTML = '';
      await falar(opcoes.offline ? 'Sem internet. Fala tudo de uma vez.' : 'Pode falar.');
      if (meu !== fluxo) return fecharMicrofoneIA();
      await bip('inicio');
      var clipe = await gravarClipe({ silencio: 1800, maximo: 40000 });
      bip('fim');
      fecharMicrofoneIA();
      if (meu !== fluxo) return;
      if (!clipe || !clipe.falou) { mostrar('inicio'); await falar('Não ouvi. Aperte de novo.'); return; }
      var wav = paraWav([clipe]);
      $('tituloOuvindo').textContent = 'Entendendo…';
      var online = await net;
      var campos = null, falhaIA = '';
      if (online) {
        try { campos = await extrair(wav, hoje); }
        catch (e) { if (e.message === 'rede') online = false; else falhaIA = e.message; }
      }
      if (meu !== fluxo) return;
      if (!online) return salvarPendente(wav, clipe, hoje);

      if (campos) {
        var naBase = clientes.some(function (c) { return c.nome === campos.cliente; });
        r.cliente = campos.cliente || ''; r.clienteBase = !!(campos.cliente && (naBase || campos.clienteDaLista)); r.clienteNota = r.clienteBase ? 1 : 0;
        r.tipo = campos.servico || ''; r.valor = campos.valor || null; r.hora = campos.hora || '';
        r.dataServico = campos.data || hoje; r.situacao = campos.situacao || ''; r.endereco = campos.endereco || '';
        if (campos.texto) falas.push(campos.texto);
      }
      r.diaOk = true; // sem dia falado = hoje (não pergunta)
      r.falhaIA = falhaIA;
      if (falhaIA) await falar('Não entendi tudo. Vou perguntar.');
      // pergunta só o que faltou (pelo reconhecimento normal: a gravação já terminou)
      for (var i = 0; i < aj.ordem.length; i++) {
        var campo = aj.ordem[i];
        if (meu !== fluxo) return;
        if (!precisaPerguntar(r, campo, aj)) continue;
        await perguntarNaTela(CAMPOS[campo].pergunta, r, campo, aj.ordem, CAMPOS[campo].fala);
        if (meu !== fluxo) return;
        var resp = '';
        try { resp = await ouvirNaTela(); } catch (e) { break; } // sem reconhecimento agora: confirma com o que tem
        if (meu !== fluxo) return;
        if (!resp) continue;
        falas.push(resp);
        aplicarResposta(r, campo, resp, clientes);
      }
      fecharRegistro(r, hoje);
      audioAtual = { blob: wav, mime: 'audio/wav', silencioso: false, segundos: segundosDe(clipe) };
      atual = r;
      await confirmar(meu);
    } catch (e) {
      fecharMicrofoneIA();
      if (meu !== fluxo) return;
      erro(e);
    } finally {
      frasesAtiva = false;
    }
  }

  var audioAtual = null;
  async function registrar() {
    var m = modo();
    if (m === 'frase') return registrarFrase();
    if (m !== 'texto' && !navigator.onLine) return registrarFrase({ offline: true }); // sem internet: grava e preenche depois
    if (m === 'ia') return registrarIA();
    cancelarTudo();
    var meu = fluxo;
    falas = [];
    audioAtual = null;
    algumDigitado = false;
    var aj = ajustes();
    var clientes = LS.get('radio_clientes', []);
    var hoje = P.entender('', {}).dataServico;
    var r = registroVazio(hoje);
    var gravacaoTentada = false, gravando = false;
    try {
      for (var i = 0; i < aj.ordem.length; i++) {
        var campo = aj.ordem[i];
        if (meu !== fluxo) return;
        // pula o que já foi respondido
        if (campo === 'cliente' && r.cliente) continue;
        if (campo === 'servico' && r.tipo) continue;
        if (campo === 'dia' && r.diaOk) continue;
        if (campo === 'valor' && r.valor) continue;
        if (campo === 'endereco') {
          if (aj.endereco === 'nunca' || r.endereco) continue;
          if (aj.endereco === 'novo' && (r.clienteBase || !r.cliente)) { r.enderecoPulado = true; continue; }
        }
        var resp = '';
        for (var tentativa = 0; tentativa < 2 && !resp; tentativa++) {
          await perguntarNaTela(tentativa ? 'Não ouvi. ' + CAMPOS[campo].pergunta : CAMPOS[campo].pergunta, r, campo, aj.ordem,
            tentativa ? 'De novo. ' + CAMPOS[campo].fala : CAMPOS[campo].fala);
          if (meu !== fluxo) return;
          if (!gravacaoTentada) { // grava a partir da primeira resposta (depois da pergunta, para a voz sair normal)
            gravacaoTentada = true;
            await iniciarGravacao();
            if (meu !== fluxo) { descartarGravacao(); return; }
            gravando = !!grav;
          }
          try { resp = await ouvirNaTela(); }
          catch (e) {
            if (!(gravando && e.message === 'mic-ocupado')) throw e;
            resp = '';
          }
          if (meu !== fluxo) return;
          if (!resp && gravando && modo() !== 'texto') {
            // Alguns celulares não deixam gravar e reconhecer ao mesmo tempo: segue sem gravar.
            var houveSom = !!(grav && grav.mediu && grav.nivel >= 10);
            descartarGravacao(); gravando = false;
            if (houveSom) LS.set('radio_sem_audio', true);
          }
        }
        if (!resp) {
          if (campo === 'cliente' && i === 0 && !r.cliente) {
            descartarGravacao();
            mostrar('inicio');
            await falar(modo() === 'texto' ? 'Nada digitado.' : 'Não ouvi. Aperte de novo.');
            return;
          }
          continue; // segue para a próxima pergunta; o que faltar aparece na confirmação
        }
        falas.push(resp);
        aplicarResposta(r, campo, resp, clientes);
      }
      fecharRegistro(r, hoje);
      audioAtual = await pararGravacao();
      if (meu !== fluxo) return;
      atual = r;
      await confirmar(meu);
    } catch (e) {
      if (meu !== fluxo) return;
      if (e && e.message === 'sem-internet-voz') return registrarFrase({ offline: true }); // caiu a internet: grava e preenche depois
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
    c.appendChild(linhaCartao('Dia', P.dataTela(r.dataServico) + (r.hora ? ' às ' + r.hora : ''),
      r.situacao === 'A fazer' ? 'vai para a agenda' : ''));
    if (r.situacao) c.appendChild(linhaCartao('Situação', r.situacao));
    if (r.endereco) c.appendChild(linhaCartao('Endereço', r.endereco));
    var ouvi = document.createElement('div');
    ouvi.className = 'linha';
    ouvi.style.fontSize = '16px'; ouvi.style.color = '#666';
    ouvi.textContent = 'Ouvi: “' + falas.join(' … ') + '”';
    c.appendChild(ouvi);
    mostrar('confirmar');

    var frase = r.cliente ? P.fraseConfirmacao(r) : 'Sem cliente. Certo?';
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
      if (t === 0 && resp) await falar('Sim ou não?');
    }
  }

  async function falarDeNovo() {
    cancelarTudo();
    atual = null;
    await falar('Tá bom, de novo.');
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
    if (r.falhaIA) alertas.push(r.falhaIA === 'sem-chave-gemini' ? 'IA sem chave: ouvir o áudio' : 'IA não transcreveu: ouvir o áudio');
    var audio = audioAtual;
    audioAtual = null;
    var audioB64 = '';
    var teste = algumDigitado;
    if (teste) alertas.push('Digitado');
    if (audio && audio.blob.size && (teste || !audio.silencioso) && audio.blob.size < 3000000) {
      audioB64 = await paraBase64(audio.blob);
      if (!teste) LS.set('radio_mudo_seguidos', 0);
    } else if (teste && modo() === 'texto') {
      alertas.push('Sem áudio (microfone não liberou)');
    } else if (audio && audio.silencioso) {
      alertas.push('Áudio saiu mudo');
      var mudos = LS.get('radio_mudo_seguidos', 0) + 1;
      LS.set('radio_mudo_seguidos', mudos);
      if (mudos >= 2) LS.set('radio_sem_audio', true); // este celular não grava junto com o reconhecimento
    } else if (ajustes().gravarJunto && LS.get('radio_sem_audio', false)) {
      alertas.push('Sem áudio (este celular não grava junto)');
    }
    var reg = {
      id: novoId(),
      dataServico: r.dataServico,
      hora: r.hora || '',
      endereco: r.endereco || '',
      cliente: r.cliente || '',
      valor: r.valor || '',
      tipo: r.tipo || '',
      situacao: r.situacao || '',
      texto: falas.join(' | '),
      quem: cfg.quem,
      alerta: alertas.join(' · ')
    };
    if (audioB64) reg.audio = { mime: audio.mime, b64: audioB64, segundos: audio.segundos };
    await filaPronta;
    var fila = filaMem.slice();
    fila.push(reg);
    if (!(await filaSalvar(fila))) {
      // memória cheia: guarda o registro sem o áudio
      delete reg.audio;
      reg.alerta = (reg.alerta ? reg.alerta + ' · ' : '') + 'Áudio não coube no celular';
      await filaSalvar(fila);
    }
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
    if (!enviou && meu === fluxo) await falar('Sem internet. Envio depois.');
  }

  // Chave trocada pelo Kevin: apaga a lista de clientes e a configuração deste celular.
  // A fila de registros não enviados fica guardada e sai quando o link novo for aberto.
  function chaveRevogada() {
    try { localStorage.removeItem('radio_clientes'); localStorage.removeItem('radio_cfg'); localStorage.removeItem('radio_hist'); } catch (e) { /* nada */ }
    cfg = null;
    LS.set('radio_cfg_erro', 'Este link foi desativado. Peça ao Kevin o link novo.');
    cancelarTudo();
    $('quem').textContent = '';
    $('erroConfig').textContent = '⚠ Este link foi desativado. Peça ao Kevin o link novo.';
    mostrar('config');
  }

  // ---------- Envio para a planilha ----------
  var enviando = null;
  function enviarFila() {
    if (enviando) return enviando;
    enviando = (async function () {
      try {
        await filaPronta;
        for (var volta = 0; volta < 40; volta++) {
          var fila = filaMem;
          if (!fila.length || !cfg) return true;
          var lote = [], peso = 0, pendentes = 0;
          for (var i = 0; i < fila.length && lote.length < 20; i++) {
            var p = fila[i].audio ? fila[i].audio.b64.length : 500;
            if (lote.length && peso + p > 4000000) break;
            if (fila[i].pendenteIA && ++pendentes > 3) break; // cada um passa pela IA no script: poucos por vez
            lote.push(fila[i]); peso += p;
          }
          var resp = await fetch(cfg.url, { method: 'POST', body: JSON.stringify({ chave: cfg.chave, registros: lote }) });
          var json = await resp.json();
          if (!json.ok) { if (json.erro === 'chave') chaveRevogada(); return false; }
          var ok = {};
          (json.gravados || []).forEach(function (id) { ok[id] = true; });
          if (!Object.keys(ok).length) return false;
          await filaSalvar(filaMem.filter(function (r) { return !ok[r.id]; }));
        }
        return filaMem.length === 0;
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
      if (!json.ok && json.erro === 'chave') { chaveRevogada(); return; }
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
      falar('Sem internet.');
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
  $('btnResposta').addEventListener('click', function () { entregarDigitado($('campoResposta').value); });
  $('campoResposta').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); entregarDigitado($('campoResposta').value); }
  });
  // ---------- Tela de configurações ----------
  var voltarPara = 'inicio';
  function abrirAjustes() {
    cancelarTudo();
    voltarPara = cfg ? 'inicio' : 'config';
    desenharAjustes();
    mostrar('ajustes');
  }
  function desenharAjustes() {
    var a = ajustes();
    Array.prototype.forEach.call(document.querySelectorAll('[data-modo]'), function (b) {
      b.classList.toggle('marcado', b.getAttribute('data-modo') === a.modo);
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-end]'), function (b) {
      b.classList.toggle('marcado', b.getAttribute('data-end') === a.endereco);
    });
    $('optGravar').classList.toggle('marcado', a.gravarJunto);
    $('optGravar').textContent = a.gravarJunto ? '🔴 Gravar o áudio junto: LIGADO' : '⚪ Gravar o áudio junto: desligado';
    var lista = $('listaOrdem');
    lista.innerHTML = '';
    a.ordem.forEach(function (c, i) {
      var li = document.createElement('div'); li.className = 'ordem-item';
      var n = document.createElement('span'); n.className = 'nome'; n.textContent = (i + 1) + '. ' + CAMPOS[c].rotulo;
      var sobe = document.createElement('button'); sobe.textContent = '▲'; sobe.disabled = i === 0;
      var desce = document.createElement('button'); desce.textContent = '▼'; desce.disabled = i === a.ordem.length - 1;
      sobe.addEventListener('click', function () { mover(i, -1); });
      desce.addEventListener('click', function () { mover(i, 1); });
      li.appendChild(n); li.appendChild(sobe); li.appendChild(desce);
      lista.appendChild(li);
    });
  }
  function mover(i, d) {
    var a = ajustes();
    var t = a.ordem[i]; a.ordem[i] = a.ordem[i + d]; a.ordem[i + d] = t;
    salvarAjustes(a); desenharAjustes();
  }
  Array.prototype.forEach.call(document.querySelectorAll('[data-modo]'), function (b) {
    b.addEventListener('click', function () { var a = ajustes(); a.modo = b.getAttribute('data-modo'); salvarAjustes(a); desenharAjustes(); });
  });
  Array.prototype.forEach.call(document.querySelectorAll('[data-end]'), function (b) {
    b.addEventListener('click', function () { var a = ajustes(); a.endereco = b.getAttribute('data-end'); salvarAjustes(a); desenharAjustes(); });
  });
  $('optGravar').addEventListener('click', function () {
    var a = ajustes(); a.gravarJunto = !a.gravarJunto; salvarAjustes(a);
    LS.set('radio_sem_audio', false); LS.set('radio_mudo_seguidos', 0);
    desenharAjustes();
  });
  $('btnOrdemPadrao').addEventListener('click', function () { var a = ajustes(); a.ordem = ORDEM_PADRAO.slice(); salvarAjustes(a); desenharAjustes(); });
  $('btnAjustes').addEventListener('click', abrirAjustes);
  $('btnFecharAjustes').addEventListener('click', function () { mostrar(voltarPara); atualizarDica(); });
  function atualizarDica() {
    var a = ajustes();
    var m = { voz: 'Aperte e responda falando.', texto: 'Aperte e responda digitando.', ambos: 'Aperte e responda falando ou digitando.',
      ia: 'Aperte e responda falando (com áudio).', frase: 'Aperte e fale tudo de uma vez.' }[a.modo];
    $('dica').textContent = m + ' Primeiro: ' + CAMPOS[a.ordem[0]].rotulo.toLowerCase() + '.';
  }

  // ---------- Instalar app ----------
  var pedidoInstalar = null;
  var instalado = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  if (!instalado) $('btnBaixar').style.display = 'inline-block';
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); pedidoInstalar = e; });
  $('btnBaixar').addEventListener('click', async function () {
    if (pedidoInstalar) { pedidoInstalar.prompt(); pedidoInstalar = null; return; }
    var a = $('ajudaBaixar'); a.style.display = a.style.display === 'block' ? 'none' : 'block';
  });
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(function () { /* nada */ });
    // guarda os arquivos desta versão para o app abrir sem internet
    if (window.caches) caches.open('radio-app').then(function (c) {
      return c.addAll(['./', 'index.html', 'parser.js?v=' + VERSAO, 'app.js?v=' + VERSAO, 'versao.json', 'manifest.webmanifest', 'icon-192.png']);
    }).catch(function () { /* sem espaço ou sem rede: tenta na próxima */ });
  }

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
    if (document.visibilityState === 'visible') { enviarFila(); atualizarClientes(); talvezComecarSozinho(); }
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
    atualizarDica();
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

  // ---------- Versão no rodapé (e aviso se já existe uma mais nova) ----------
  function mostrarVersao(nova) {
    var el = $('versaoApp');
    el.textContent = 'Versão ' + VERSAO + ' · ' + VERSAO_DATA;
    if (nova && nova.versao > VERSAO) {
      el.textContent += '  ·  nova versão ' + nova.versao + ' disponível: feche e abra o app';
      el.classList.add('alerta');
    } else if (nova) {
      el.textContent += ' ✓ atualizada';
      el.classList.remove('alerta');
    }
  }
  async function conferirVersao() {
    try {
      var r = await fetch('versao.json?t=' + Date.now(), { cache: 'no-store' });
      mostrarVersao(await r.json());
    } catch (e) { mostrarVersao(null); }
  }
  mostrarVersao(null);
  conferirVersao();
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') conferirVersao(); });

  // Para os testes automáticos
  window.__radio = { registrar: registrar, enviarFila: enviarFila, estado: function () { return tela; }, ajustes: ajustes, fila: function () { return filaMem; } };
})();
