/**
 * 📡 Rádio do Rosimar — recebe os registros por voz e grava na planilha.
 * Criado por Kevin Paulo · @Arkev.arq
 *
 * Cole este arquivo como um arquivo NOVO (Radio.gs) no Apps Script da planilha
 * "[RÁDIO] K-AUTO Dedetização - Rosimar". Depois rode configurarRadio() uma vez.
 */

var RADIO = {
  // Cole aqui o "URL do app da Web" (Implantar → Gerenciar implantações). Termina em /exec.
  URL_APP: '',
  ABA: 'Lançamentos por voz',
  ABA_CLIENTES: 'Base de Clientes',
  SITE: 'https://kevinpaulor.github.io/radio-do-rosimar/',
  CABECALHO: ['Data do registro', 'Data do serviço', 'Cliente', 'Valor (R$)', 'Tipo de serviço',
              'Situação', 'Texto falado', 'Quem registrou', 'Status', 'Alerta', 'ID', 'Áudio', 'Hora', 'Agenda', 'Endereço'],
  PASTA_AUDIOS: 'Rádio do Rosimar — Áudios',
  AGENDA: 'Serviços do Rosimar',
  FUSO: 'America/Sao_Paulo',
  DURACAO_HORAS: 2,
  // IA que transcreve os áudios no modo "Voz com áudio (IA)". A chave fica em
  // Configurações do projeto → Propriedades do script → GEMINI_KEY (nunca no código).
  // Tenta na ordem; pula para o próximo se o modelo não existir mais (404) ou estiver sobrecarregado (503/429).
  GEMINI_MODELOS: ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-flash-latest', 'gemini-3.7-flash'],
  TIPOS: ['Dedetização', 'Descupinização', "Limpeza de caixa d'água", 'Desratização',
          'Impermeabilização', 'Documento/análise', 'Venda de produto', 'Conserto de bomba', 'Outro'],
  SITUACOES: ['Realizado', 'A fazer', 'Pago', 'A receber']
};

/** Rode UMA vez pelo editor (botão ▶ Executar). Cria a chave e mostra os links de configuração. */
function configurarRadio() {
  var props = PropertiesService.getScriptProperties();
  var chave = props.getProperty('CHAVE');
  if (!chave) {
    chave = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '').slice(0, 8);
    props.setProperty('CHAVE', chave);
  }
  radioGarantirAba_();
  radioPastaAudios_(); // cria a pasta dos áudios (e pede a permissão do Drive na primeira vez)
  radioAgenda_();      // cria a agenda "Serviços do Rosimar" (e pede a permissão do Agenda na primeira vez)
  var url = String(RADIO.URL_APP || '').trim();
  if (!/^https:\/\/script\.google\.com\/.*\/exec$/.test(url)) {
    Logger.log('⚠ Falta o endereço publicado. Vá em Implantar → Gerenciar implantações, copie o "URL do app da Web" ' +
      '(termina em /exec), cole na linha URL_APP lá em cima, salve e rode configurarRadio() de novo.');
    return;
  }
  var linkKevin = radioLinkConfig_(url, chave, 'Kevin (teste)');
  var linkRosimar = radioLinkConfig_(url, chave, 'Rosimar');
  Logger.log('LINK DO KEVIN (teste no S22):\n' + linkKevin);
  Logger.log('LINK DO ROSIMAR:\n' + linkRosimar);
  try {
    var html = HtmlService.createHtmlOutput(
      '<div style="font-family:sans-serif;font-size:14px">' +
      '<p><b>Link do Kevin (teste):</b></p><textarea style="width:100%;height:70px">' + linkKevin + '</textarea>' +
      '<p><b>Link do Rosimar:</b></p><textarea style="width:100%;height:70px">' + linkRosimar + '</textarea>' +
      '<p>Abra o link no Chrome do celular. Ele configura o app sozinho.</p></div>').setWidth(520).setHeight(330);
    SpreadsheetApp.getUi().showModalDialog(html, '📡 Rádio do Rosimar — links de configuração');
  } catch (err) { /* rodando sem a planilha aberta: os links ficam no registro de execução */ }
}

/** Troca a chave (se um link vazar). Depois mande os links novos. */
function trocarChaveRadio() {
  PropertiesService.getScriptProperties().deleteProperty('CHAVE');
  configurarRadio();
}

function radioLinkConfig_(url, chave, quem) {
  var json = JSON.stringify({ u: url, k: chave, n: quem });
  var b64 = Utilities.base64EncodeWebSafe(json, Utilities.Charset.UTF_8).replace(/=+$/, '');
  return RADIO.SITE + '#cfg=' + b64;
}

function radioGarantirAba_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var aba = ss.getSheetByName(RADIO.ABA);
  if (!aba) {
    aba = ss.insertSheet(RADIO.ABA, 0);
    aba.getRange(1, 1, 1, RADIO.CABECALHO.length).setValues([RADIO.CABECALHO]).setFontWeight('bold');
    aba.setFrozenRows(1);
  }
  // garante as colunas novas (Áudio, Hora, Agenda) em abas criadas antes delas existirem
  if (aba.getMaxColumns() < RADIO.CABECALHO.length) aba.insertColumnsAfter(aba.getMaxColumns(), RADIO.CABECALHO.length - aba.getMaxColumns());
  for (var c = 12; c <= RADIO.CABECALHO.length; c++) {
    if (!aba.getRange(1, c).getValue()) aba.getRange(1, c).setValue(RADIO.CABECALHO[c - 1]).setFontWeight('bold');
  }
  return aba;
}

function radioResposta_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function radioChaveOk_(chave) {
  var certa = PropertiesService.getScriptProperties().getProperty('CHAVE');
  return !!certa && typeof chave === 'string' && chave === certa;
}

/** GET: ?acao=ping|clientes&chave=... */
function doGet(e) {
  var p = (e && e.parameter) || {};
  if (p.acao === 'ouvir') return radioPaginaAudio_(String(p.f || ''), String(p.t || ''));
  if (!radioChaveOk_(p.chave)) return radioResposta_({ ok: false, erro: 'chave' });
  if (p.acao === 'clientes') return radioResposta_({ ok: true, clientes: radioClientes_() });
  return radioResposta_({ ok: true, aba: RADIO.ABA });
}

function radioClientes_() {
  var aba = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(RADIO.ABA_CLIENTES);
  if (!aba) return [];
  var dados = aba.getDataRange().getValues();
  var cab = dados[0].map(function (c) { return String(c).trim().toLowerCase(); });
  var iNome = cab.indexOf('nome do cliente');
  var iExtrato = cab.indexOf('nome extrato');
  var iApelidos = cab.indexOf('apelidos (rádio)');
  var iBairro = cab.indexOf('bairro');
  var lista = [];
  for (var r = 1; r < dados.length; r++) {
    var nome = String(dados[r][iNome < 0 ? 0 : iNome] || '').trim();
    if (!nome) continue;
    lista.push({
      nome: nome,
      extrato: iExtrato < 0 ? '' : String(dados[r][iExtrato] || '').trim(),
      apelidos: iApelidos < 0 ? '' : String(dados[r][iApelidos] || '').trim(),
      bairro: iBairro < 0 ? '' : String(dados[r][iBairro] || '').trim()
    });
  }
  return lista;
}

/** POST (corpo em texto JSON): { chave, registros: [ {...}, ... ] } */
function doPost(e) {
  var corpo;
  try { corpo = JSON.parse(e.postData.contents); } catch (err) { return radioResposta_({ ok: false, erro: 'json' }); }
  if (!radioChaveOk_(corpo.chave)) return radioResposta_({ ok: false, erro: 'chave' });
  if (corpo.acao === 'transcrever') return radioResposta_(radioTranscrever_(corpo.audios, corpo.nomes));
  if (corpo.acao === 'extrair') return radioResposta_(radioExtrair_(corpo.audio, corpo.quando));
  var registros = Array.isArray(corpo.registros) ? corpo.registros.slice(0, 50) : [];
  // gravados sem internet: a IA preenche aqui, antes de gravar na planilha (fora da trava, pode levar alguns segundos)
  registros.forEach(function (r) { if (r && r.pendenteIA) radioPreencherPendente_(r); });

  var trava = LockService.getScriptLock();
  trava.waitLock(20000);
  try {
    var aba = radioGarantirAba_();
    var ultima = aba.getLastRow();
    var jaTem = {};
    if (ultima > 1) {
      var inicio = Math.max(2, ultima - 999);
      aba.getRange(inicio, 11, ultima - inicio + 1, 1).getValues().forEach(function (l) { jaTem[l[0]] = true; });
    }
    var gravados = [];
    var linhas = [];
    var audios = [];
    var extras = [];
    registros.forEach(function (r) {
      var id = radioTexto_(r.id, 40);
      if (!id) return;
      gravados.push(id);
      if (jaTem[id]) return; // reenvio da fila: já está na planilha
      jaTem[id] = true;
      linhas.push([
        new Date(),
        radioData_(r.dataServico),
        radioTexto_(r.cliente, 120),
        radioValor_(r.valor),
        RADIO.TIPOS.indexOf(r.tipo) >= 0 ? r.tipo : radioTexto_(r.tipo, 60),
        RADIO.SITUACOES.indexOf(r.situacao) >= 0 ? r.situacao : '',
        radioTexto_(r.texto, 600),
        radioTexto_(r.quem, 40),
        'Novo',
        radioTexto_(r.alerta, 200),
        id
      ]);
      var audio = radioSalvarAudio_(r, id);
      audios.push(audio);
      var hora = /^\d{2}:\d{2}$/.test(String(r.hora || '')) ? r.hora : '';
      extras.push([hora, radioCriarEvento_(r, id, hora, audio), radioTexto_(r.endereco, 200)]);
    });
    if (linhas.length) {
      var linha0 = aba.getLastRow() + 1;
      aba.getRange(linha0, 1, linhas.length, linhas[0].length).setValues(linhas);
      aba.getRange(linha0, 1, linhas.length, 1).setNumberFormat('dd/MM/yyyy HH:mm');
      aba.getRange(linha0, 2, linhas.length, 1).setNumberFormat('dd/MM/yyyy');
      aba.getRange(linha0, 4, linhas.length, 1).setNumberFormat('"R$" #,##0.00');
      linhas.forEach(function (l, i) {
        if (l[9]) aba.getRange(linha0 + i, 1, 1, l.length + 1).setBackground('#fff4cc');
      });
      // Links como texto com link (funciona em planilha em português ou inglês; fórmula daria #ERROR!)
      aba.getRange(linha0, 12, linhas.length, 1).setRichTextValues(audios.map(function (u) { return [radioLink_('▶ Ouvir', u)]; }));
      aba.getRange(linha0, 13, linhas.length, 1).setNumberFormat('@').setValues(extras.map(function (x) { return [x[0]]; }));
      aba.getRange(linha0, 14, linhas.length, 1).setRichTextValues(extras.map(function (x) { return [radioLink_('📅 Ver', x[1])]; }));
      aba.getRange(linha0, 15, linhas.length, 1).setValues(extras.map(function (x) { return [x[2]]; }));
    }
    return radioResposta_({ ok: true, gravados: gravados });
  } finally {
    trava.releaseLock();
  }
}

// ---------- Áudios ----------

/** Pasta dos áudios, ao lado da planilha. Guarda o id para não criar outra. */
function radioPastaAudios_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('PASTA_AUDIOS');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) { /* apagada: cria outra */ } }
  var pai;
  try {
    var pais = DriveApp.getFileById(SpreadsheetApp.getActiveSpreadsheet().getId()).getParents();
    pai = pais.hasNext() ? pais.next() : DriveApp.getRootFolder();
  } catch (e) { pai = DriveApp.getRootFolder(); }
  var pasta = pai.createFolder(RADIO.PASTA_AUDIOS);
  props.setProperty('PASTA_AUDIOS', pasta.getId());
  return pasta;
}

/** Senha própria dos links de áudio (não muda quando a chave dos celulares é trocada). */
function radioToken_(fileId) {
  var props = PropertiesService.getScriptProperties();
  var seg = props.getProperty('CHAVE_AUDIO');
  if (!seg) { seg = Utilities.getUuid() + Utilities.getUuid(); props.setProperty('CHAVE_AUDIO', seg); }
  var assin = Utilities.computeHmacSha256Signature(fileId, seg);
  return assin.slice(0, 12).map(function (b) { return ('0' + (b & 255).toString(16)).slice(-2); }).join('');
}

/** Salva o áudio do registro no Drive e devolve a fórmula "▶ Ouvir" (ou vazio). */
function radioSalvarAudio_(r, id) {
  try {
    var a = r.audio;
    if (!a || typeof a.b64 !== 'string' || !a.b64) return '';
    var tipos = { 'audio/mp4': 'm4a', 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/wav': 'wav' };
    var mime = String(a.mime || '').split(';')[0];
    if (!tipos[mime]) return '';
    if (a.b64.length > 6000000) return '';
    var bytes = Utilities.base64Decode(a.b64);
    var nome = id + ' · ' + String(r.dataServico || '').slice(0, 10) + ' · ' +
      String(r.cliente || 'sem cliente').replace(/[\\/:*?"<>|#]/g, ' ').slice(0, 60) + '.' + tipos[mime];
    var arq = radioPastaAudios_().createFile(Utilities.newBlob(bytes, mime, nome));
    arq.setDescription('Rádio do Rosimar · ID ' + id + ' · ' + radioTexto_(r.texto, 400));
    var url = String(RADIO.URL_APP || '').trim() + '?acao=ouvir&f=' + arq.getId() + '&t=' + radioToken_(arq.getId());
    return url;
  } catch (err) {
    return '';
  }
}

/** Página que toca o áudio (abre ao clicar em ▶ Ouvir). */
function radioPaginaAudio_(fileId, token) {
  var html;
  if (!/^[\w-]{10,}$/.test(fileId) || token !== radioToken_(fileId)) {
    html = '<p style="font:20px sans-serif">Link de áudio inválido.</p>';
  } else {
    try {
      var arq = DriveApp.getFileById(fileId);
      var blob = arq.getBlob();
      var mime = blob.getContentType();
      var b64 = Utilities.base64Encode(blob.getBytes());
      var nome = arq.getName().replace(/[<>&"]/g, '');
      var desc = String(arq.getDescription() || '').replace(/[<>&"]/g, '');
      html = '<div style="font-family:sans-serif;max-width:560px;margin:24px auto;padding:0 16px">' +
        '<h2 style="margin:0 0 6px">📡 Áudio do registro</h2>' +
        '<p style="color:#555;margin:0 0 18px">' + nome + '</p>' +
        '<audio controls autoplay style="width:100%" src="data:' + mime + ';base64,' + b64 + '"></audio>' +
        '<p style="color:#555;font-size:14px;margin-top:18px">' + desc + '</p>' +
        '<p><a href="' + arq.getUrl() + '" target="_blank">Abrir no Drive</a></p></div>';
    } catch (err) {
      html = '<p style="font:20px sans-serif">Áudio não encontrado (pode ter sido apagado).</p>';
    }
  }
  return HtmlService.createHtmlOutput(html).setTitle('Áudio · Rádio do Rosimar')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/** Chama o Gemini. Manda a chave no cabeçalho; se for recusada (401/403), tenta de novo com ?key= (chaves novas "AQ."). */
function radioGemini_(modelo, corpo, chave) {
  var url = 'https://generativelanguage.googleapis.com/v1beta/models/' + modelo + ':generateContent';
  var op = { method: 'post', contentType: 'application/json', payload: JSON.stringify(corpo), muteHttpExceptions: true };
  op.headers = { 'x-goog-api-key': chave };
  var resp = UrlFetchApp.fetch(url, op);
  var cod = resp.getResponseCode();
  if (cod === 401 || cod === 403) {
    delete op.headers;
    resp = UrlFetchApp.fetch(url + '?key=' + encodeURIComponent(chave), op);
  }
  return resp;
}

// ---------- Transcrição (Gemini) ----------

/** Transcreve uma lista de áudios curtos (WAV) e devolve { ok, textos: [...] } na mesma ordem. */
function radioTranscrever_(audios, nomes) {
  var chave = PropertiesService.getScriptProperties().getProperty('GEMINI_KEY');
  if (!chave) return { ok: false, erro: 'sem-chave-gemini' };
  audios = Array.isArray(audios) ? audios.slice(0, 10) : [];
  if (!audios.length) return { ok: true, textos: [] };
  var lista = Array.isArray(nomes) ? nomes.slice(0, 300).map(function (n) { return String(n).slice(0, 60); }).join('; ') : '';
  var partes = [{ text:
    'Você vai ouvir ' + audios.length + ' áudio(s) curtos, em português do Brasil, de um dedetizador registrando um serviço. ' +
    'Cada áudio é a resposta a uma pergunta (cliente, serviço, dia/hora, valor ou endereço). ' +
    'Transcreva cada áudio exatamente como foi falado, sem resumir e sem inventar. Se um áudio estiver em silêncio, devolva texto vazio. ' +
    'Escreva números e valores em algarismos (ex.: 350, 1.300, 10h, 14/12). ' +
    (lista ? 'Nomes de clientes que podem aparecer (use esta grafia quando for o caso): ' + lista + '. ' : '') +
    'Responda só em JSON: {"textos": ["transcrição do áudio 1", "transcrição do áudio 2", ...]} na mesma ordem.' }];
  audios.forEach(function (a, i) {
    var mime = String(a && a.mime || '').split(';')[0];
    if (!/^audio\/(wav|mp3|mpeg|ogg|flac|aac)$/.test(mime) || typeof a.b64 !== 'string') return;
    partes.push({ text: 'Áudio ' + (i + 1) + ':' });
    partes.push({ inline_data: { mime_type: mime, data: a.b64 } });
  });
  var corpo = { contents: [{ role: 'user', parts: partes }],
    generationConfig: { temperature: 0, responseMimeType: 'application/json' } };
  var ultimoErro = '';
  for (var m = 0; m < RADIO.GEMINI_MODELOS.length; m++) {
    try {
      var resp = radioGemini_(RADIO.GEMINI_MODELOS[m], corpo, chave);
      var cod = resp.getResponseCode();
      if (cod === 404 || cod === 503 || cod === 429 || cod === 500) { ultimoErro = RADIO.GEMINI_MODELOS[m] + ' → ' + cod; continue; }
      if (cod !== 200) return { ok: false, erro: 'gemini', detalhe: cod + ': ' + resp.getContentText().slice(0, 300) };
      var json = JSON.parse(resp.getContentText());
      var texto = json.candidates && json.candidates[0] && json.candidates[0].content &&
        json.candidates[0].content.parts.map(function (p) { return p.text || ''; }).join('');
      var dados = JSON.parse(String(texto || '{}').replace(/^```(json)?|```$/g, ''));
      var textos = (Array.isArray(dados) ? dados : dados.textos || []).map(function (t) { return String(t || '').slice(0, 500); });
      while (textos.length < audios.length) textos.push('');
      return { ok: true, textos: textos.slice(0, audios.length), modelo: RADIO.GEMINI_MODELOS[m] };
    } catch (err) { ultimoErro = String(err).slice(0, 300); }
  }
  return { ok: false, erro: 'gemini', detalhe: ultimoErro };
}

/** Rode pelo editor depois de colocar a GEMINI_KEY: confere se a chave funciona (e pede a permissão de internet). */
function testarGemini() {
  var chave = PropertiesService.getScriptProperties().getProperty('GEMINI_KEY');
  if (!chave) { Logger.log('⚠ Falta a GEMINI_KEY em Configurações do projeto → Propriedades do script.'); return; }
  for (var m = 0; m < RADIO.GEMINI_MODELOS.length; m++) {
    var resp = radioGemini_(RADIO.GEMINI_MODELOS[m], { contents: [{ parts: [{ text: 'Responda só: ok' }] }] }, chave);
    Logger.log(RADIO.GEMINI_MODELOS[m] + ' → ' + resp.getResponseCode() + ' ' + resp.getContentText().slice(0, 120));
    if (resp.getResponseCode() === 200) { Logger.log('✅ Gemini funcionando com ' + RADIO.GEMINI_MODELOS[m]); return; }
  }
  Logger.log('❌ Nenhum modelo respondeu. Confira a chave.');
}

// ---------- Uma frase: a IA ouve e separa os campos ----------

var RADIO_DIAS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];

/** Ouve uma frase e devolve { ok, campos: {texto, cliente, clienteDaLista, servico, data, hora, valor, situacao, endereco} }.
 *  "quando" = data em que foi gravado (AAAA-MM-DD), para entender "hoje", "ontem", "sexta". */
function radioExtrair_(audio, quando) {
  var chave = PropertiesService.getScriptProperties().getProperty('GEMINI_KEY');
  if (!chave) return { ok: false, erro: 'sem-chave-gemini' };
  var mime = String(audio && audio.mime || '').split(';')[0];
  if (!audio || typeof audio.b64 !== 'string' || !/^audio\/(wav|mp3|mpeg|ogg|flac|aac)$/.test(mime)) return { ok: false, erro: 'audio' };
  var base = /^\d{4}-\d{2}-\d{2}$/.test(String(quando || '')) ? quando : Utilities.formatDate(new Date(), RADIO.FUSO, 'yyyy-MM-dd');
  var p = base.split('-'), d = new Date(+p[0], +p[1] - 1, +p[2]);
  var nomes = radioClientes_().map(function (c) { return c.nome + (c.extrato ? ' (no banco: ' + c.extrato + ')' : '') + (c.bairro ? ' [' + c.bairro + ']' : ''); });
  var instrucao =
    'Você recebe um áudio curto, em português do Brasil, de um dedetizador registrando um serviço. ' +
    'O áudio foi gravado em ' + RADIO_DIAS[d.getDay()] + ', ' + base + ' (use essa data para entender "hoje", "ontem", "amanhã", "sexta", "dia 14"). ' +
    'Clientes já cadastrados: ' + nomes.slice(0, 300).join('; ') + '. ' +
    'Tipos de serviço permitidos: ' + RADIO.TIPOS.join(', ') + ' (barata/formiga/pulga = Dedetização; cupim = Descupinização; rato = Desratização; caixa d\'água = Limpeza de caixa d\'água; bomba = Conserto de bomba). ' +
    'Responda SÓ em JSON com as chaves: ' +
    'texto (transcrição fiel do que foi falado), ' +
    'cliente (se for um cliente cadastrado, escreva exatamente o nome da lista; se não, o nome como foi falado; vazio se não disse), ' +
    'clienteDaLista (true/false), ' +
    'servico (um dos tipos permitidos; dois tipos = "A + B"; vazio se não disse), ' +
    'data (AAAA-MM-DD; vazio se não disse dia), hora (HH:MM; vazio se não disse), ' +
    'valor (número em reais, ex. 350 ou 1300.5; null se não disse), ' +
    'situacao (uma de: Realizado, A fazer, Pago, A receber; vazio se não ficou claro; marcado/agendado/hora futura = A fazer), ' +
    'endereco (se falou um endereço ou bairro do serviço; senão vazio). Não invente nada que não foi falado.';
  var corpo = { contents: [{ role: 'user', parts: [{ text: instrucao }, { inline_data: { mime_type: mime, data: audio.b64 } }] }],
    generationConfig: { temperature: 0, responseMimeType: 'application/json' } };
  var ultimoErro = '';
  for (var m = 0; m < RADIO.GEMINI_MODELOS.length; m++) {
    try {
      var resp = radioGemini_(RADIO.GEMINI_MODELOS[m], corpo, chave);
      var cod = resp.getResponseCode();
      if (cod === 404 || cod === 503 || cod === 429 || cod === 500) { ultimoErro = RADIO.GEMINI_MODELOS[m] + ' → ' + cod; continue; }
      if (cod !== 200) return { ok: false, erro: 'gemini', detalhe: cod + ': ' + resp.getContentText().slice(0, 300) };
      var json = JSON.parse(resp.getContentText());
      var texto = json.candidates[0].content.parts.map(function (x) { return x.text || ''; }).join('');
      var c = JSON.parse(String(texto).replace(/^```(json)?|```$/g, ''));
      return { ok: true, campos: radioLimparCampos_(c), modelo: RADIO.GEMINI_MODELOS[m] };
    } catch (err) { ultimoErro = String(err).slice(0, 300); }
  }
  return { ok: false, erro: 'gemini', detalhe: ultimoErro };
}

function radioLimparCampos_(c) {
  c = c || {};
  var valor = Number(c.valor);
  var nomesBase = radioClientes_().map(function (x) { return x.nome; });
  var cliente = String(c.cliente || '').trim().slice(0, 120);
  return {
    texto: String(c.texto || '').slice(0, 600),
    cliente: cliente,
    clienteDaLista: nomesBase.indexOf(cliente) >= 0,
    servico: String(c.servico || '').slice(0, 80),
    data: /^\d{4}-\d{2}-\d{2}$/.test(String(c.data || '')) ? c.data : '',
    hora: /^\d{2}:\d{2}$/.test(String(c.hora || '')) ? c.hora : '',
    valor: isFinite(valor) && valor > 0 ? Math.round(valor * 100) / 100 : null,
    situacao: RADIO.SITUACOES.indexOf(c.situacao) >= 0 ? c.situacao : '',
    endereco: String(c.endereco || '').slice(0, 200)
  };
}

/** Registro gravado sem internet: a IA preenche os campos a partir do áudio. */
function radioPreencherPendente_(r) {
  var res = r.audio ? radioExtrair_(r.audio, r.gravadoEm) : { ok: false, erro: 'audio' };
  var alertas = [];
  if (res.ok) {
    var c = res.campos;
    r.cliente = c.cliente; r.tipo = c.servico; r.valor = c.valor; r.hora = c.hora; r.endereco = r.endereco || c.endereco;
    r.dataServico = c.data || r.gravadoEm || '';
    r.situacao = c.situacao || ((c.hora || (c.data && c.data > (r.gravadoEm || ''))) ? 'A fazer' : '');
    r.texto = '[IA] ' + c.texto;
    alertas.push('Preenchido sem confirmação: conferir');
    if (c.cliente && !c.clienteDaLista) alertas.push('Cliente novo: cadastrar na Base');
    if (!c.cliente) alertas.push('Sem cliente');
    if (!c.valor) alertas.push('Sem valor');
  } else {
    r.dataServico = r.gravadoEm || '';
    alertas.push(res.erro === 'sem-chave-gemini' ? 'Gravado sem internet; IA sem chave: ouvir o áudio' : 'Gravado sem internet; IA não entendeu: ouvir o áudio');
  }
  r.alerta = alertas.concat(r.alerta ? [r.alerta] : []).join(' · ');
}

// ---------- Agenda ----------

/** Agenda própria do rádio. Guarda o id para não criar outra. */
function radioAgenda_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('AGENDA_ID');
  if (id) { var cal = CalendarApp.getCalendarById(id); if (cal) return cal; }
  var nova = CalendarApp.createCalendar(RADIO.AGENDA, { color: CalendarApp.Color.GREEN, timeZone: RADIO.FUSO,
    summary: 'Serviços agendados pelo Rádio do Rosimar' });
  props.setProperty('AGENDA_ID', nova.getId());
  return nova;
}

/** Endereço e telefone do cliente na Base (só para o evento; não vai para os celulares). */
function radioInfoCliente_(nome) {
  var aba = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(RADIO.ABA_CLIENTES);
  if (!aba || !nome) return {};
  var dados = aba.getDataRange().getValues();
  var cab = dados[0].map(function (c) { return String(c).trim().toLowerCase(); });
  var iNome = Math.max(0, cab.indexOf('nome do cliente'));
  var iEnd = cab.indexOf('endereço completo'), iTel = cab.indexOf('telefone (whatsapp)'), iBairro = cab.indexOf('bairro');
  var alvo = String(nome).trim().toLowerCase();
  for (var r = 1; r < dados.length; r++) {
    if (String(dados[r][iNome]).trim().toLowerCase() !== alvo) continue;
    return {
      endereco: iEnd < 0 ? '' : String(dados[r][iEnd] || '').trim(),
      telefone: iTel < 0 ? '' : String(dados[r][iTel] || '').trim(),
      bairro: iBairro < 0 ? '' : String(dados[r][iBairro] || '').trim()
    };
  }
  return {};
}

/** Cria o evento na agenda (todos os registros). Devolve o link do evento (ou vazio). */
function radioCriarEvento_(r, id, hora, urlAudio) {
  try {
    var feito = r.situacao !== 'A fazer'; // todos vão para a agenda; os já feitos ficam cinza, com ✔ e sem lembrete
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(r.dataServico || ''));
    if (!m) return '';
    var cal = radioAgenda_();
    var cliente = radioTexto_(r.cliente, 120) || 'sem cliente';
    var titulo = (feito ? '✔ ' : '') + (radioTexto_(r.tipo, 60) || 'Serviço') + ' · ' + cliente;
    var info = radioInfoCliente_(r.cliente);
    var valor = radioValor_(r.valor);
    var linhasDesc = [
      'Cliente: ' + cliente + (info.bairro ? ' (' + info.bairro + ')' : ''),
      valor ? 'Valor: R$ ' + valor.toFixed(2).replace('.', ',') : 'Valor: não informado',
      info.telefone ? 'Telefone: ' + info.telefone : '',
      'Falado: ' + radioTexto_(r.texto, 400),
      'Registrado por: ' + radioTexto_(r.quem, 40),
      'ID: ' + id
    ];
    if (urlAudio) linhasDesc.push('Áudio: ' + urlAudio);
    var opcoes = { description: linhasDesc.filter(String).join('\n'), location: radioTexto_(r.endereco, 200) || info.endereco || '' };
    var ev;
    if (hora) {
      var ini = Utilities.parseDate(r.dataServico + ' ' + hora, RADIO.FUSO, 'yyyy-MM-dd HH:mm');
      var fim = new Date(ini.getTime() + RADIO.DURACAO_HORAS * 3600000);
      ev = cal.createEvent(titulo, ini, fim, opcoes);
      if (!feito) ev.addPopupReminder(60);
    } else {
      var dia = Utilities.parseDate(r.dataServico + ' 12:00', RADIO.FUSO, 'yyyy-MM-dd HH:mm');
      ev = cal.createAllDayEvent(titulo, dia, opcoes);
    }
    if (feito) { ev.removeAllReminders(); ev.setColor(CalendarApp.EventColor.GRAY); }
    var eid = Utilities.base64EncodeWebSafe(ev.getId().split('@')[0] + ' ' + cal.getId()).replace(/=+$/, '');
    return 'https://www.google.com/calendar/event?eid=' + eid;
  } catch (err) {
    return '';
  }
}

// ---------- Ouvir o áudio sem sair da planilha ----------

/** Cria o menu "📡 Rádio" ao abrir a planilha. */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('📡 Rádio')
    .addItem('▶ Ouvir a linha selecionada', 'ouvirLinhaSelecionada')
    .addSeparator()
    .addItem('Mostrar links de configuração', 'configurarRadio')
    .addToUi();
}

/** Abre uma janelinha com o player do áudio da linha selecionada (pode deixar aberta e trocar de linha). */
function ouvirLinhaSelecionada() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var aba = ss.getActiveSheet();
  var ui = SpreadsheetApp.getUi();
  if (aba.getName() !== RADIO.ABA) { ui.alert('Clique numa linha da aba "' + RADIO.ABA + '".'); return; }
  var linha = aba.getActiveRange().getRow();
  if (linha < 2) { ui.alert('Clique numa linha de registro (não no cabeçalho).'); return; }
  var dados = aba.getRange(linha, 1, 1, 12).getDisplayValues()[0];
  var id = dados[10];
  var link = aba.getRange(linha, 12).getRichTextValue();
  var url = link && link.getLinkUrl();
  var m = /[?&]f=([\w-]+)/.exec(url || '');
  var html;
  if (!m) {
    html = '<p style="font:15px sans-serif">Esta linha não tem áudio.</p>';
  } else {
    try {
      var blob = DriveApp.getFileById(m[1]).getBlob();
      html = '<div style="font-family:sans-serif;font-size:14px">' +
        '<p style="margin:0 0 6px"><b>Linha ' + linha + '</b> · ' + radioHtml_(dados[2] || 'sem cliente') + ' · ' + radioHtml_(dados[3]) + ' · ' + radioHtml_(dados[1]) + '</p>' +
        '<audio controls autoplay style="width:100%" src="data:' + blob.getContentType() + ';base64,' + Utilities.base64Encode(blob.getBytes()) + '"></audio>' +
        '<p style="color:#555;margin:8px 0 0">' + radioHtml_(dados[6]) + '</p>' +
        '<p style="color:#888;font-size:12px;margin:8px 0 0">Para ouvir outra: clique em outra linha e use o menu 📡 Rádio de novo.</p></div>';
    } catch (err) {
      html = '<p style="font:15px sans-serif">Áudio não encontrado (pode ter sido apagado).</p>';
    }
  }
  ui.showModelessDialog(HtmlService.createHtmlOutput(html).setWidth(420).setHeight(190), '▶ Áudio · ' + (id || 'linha ' + linha));
}

function radioHtml_(t) { return String(t || '').replace(/[<>&"]/g, function (c) { return { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]; }); }

/** Célula com texto clicável (ou vazia). */
function radioLink_(texto, url) {
  if (!url) return SpreadsheetApp.newRichTextValue().setText('').build();
  return SpreadsheetApp.newRichTextValue().setText(texto).setLinkUrl(url).build();
}

/** Texto seguro: corta o tamanho e impede fórmula começando com = + - @ */
function radioTexto_(v, max) {
  var s = String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return s;
}

function radioValor_(v) {
  var n = Number(v);
  return isFinite(n) && n > 0 && n < 1000000 ? Math.round(n * 100) / 100 : '';
}

function radioData_(s) {
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
  if (!m) return '';
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}
