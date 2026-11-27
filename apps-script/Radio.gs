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
              'Situação', 'Texto falado', 'Quem registrou', 'Status', 'Alerta', 'ID', 'Áudio'],
  PASTA_AUDIOS: 'Rádio do Rosimar — Áudios',
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
  // garante a coluna "Áudio" (L) em abas criadas antes dela existir
  if (aba.getMaxColumns() < RADIO.CABECALHO.length) aba.insertColumnsAfter(aba.getMaxColumns(), RADIO.CABECALHO.length - aba.getMaxColumns());
  if (!aba.getRange(1, 12).getValue()) aba.getRange(1, 12).setValue('Áudio').setFontWeight('bold');
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
  var registros = Array.isArray(corpo.registros) ? corpo.registros.slice(0, 50) : [];

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
      audios.push(radioSalvarAudio_(r, id));
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
      aba.getRange(linha0, 12, linhas.length, 1).setFormulas(audios.map(function (a) { return [a]; }));
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
    var tipos = { 'audio/mp4': 'm4a', 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mpeg': 'mp3' };
    var mime = String(a.mime || '').split(';')[0];
    if (!tipos[mime]) return '';
    if (a.b64.length > 6000000) return '';
    var bytes = Utilities.base64Decode(a.b64);
    var nome = id + ' · ' + String(r.dataServico || '').slice(0, 10) + ' · ' +
      String(r.cliente || 'sem cliente').replace(/[\\/:*?"<>|#]/g, ' ').slice(0, 60) + '.' + tipos[mime];
    var arq = radioPastaAudios_().createFile(Utilities.newBlob(bytes, mime, nome));
    arq.setDescription('Rádio do Rosimar · ID ' + id + ' · ' + radioTexto_(r.texto, 400));
    var url = String(RADIO.URL_APP || '').trim() + '?acao=ouvir&f=' + arq.getId() + '&t=' + radioToken_(arq.getId());
    return '=HYPERLINK("' + url + '","▶ Ouvir")';
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
