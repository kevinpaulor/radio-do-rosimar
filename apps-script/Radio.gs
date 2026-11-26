/**
 * 📡 Rádio do Rosimar — recebe os registros por voz e grava na planilha.
 * Criado por Kevin Paulo · @Arkev.arq
 *
 * Cole este arquivo como um arquivo NOVO (Radio.gs) no Apps Script da planilha
 * "[RÁDIO] K-AUTO Dedetização - Rosimar". Depois rode configurarRadio() uma vez.
 */

var RADIO = {
  ABA: 'Lançamentos por voz',
  ABA_CLIENTES: 'Base de Clientes',
  SITE: 'https://kevinpaulor.github.io/radio-do-rosimar/',
  CABECALHO: ['Data do registro', 'Data do serviço', 'Cliente', 'Valor (R$)', 'Tipo de serviço',
              'Situação', 'Texto falado', 'Quem registrou', 'Status', 'Alerta', 'ID'],
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
  var url = ScriptApp.getService().getUrl();
  if (!url) {
    Logger.log('⚠ Ainda não implantado. Faça: Implantar → Nova implantação → App da Web. Depois rode configurarRadio() de novo.');
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
    });
    if (linhas.length) {
      var linha0 = aba.getLastRow() + 1;
      aba.getRange(linha0, 1, linhas.length, linhas[0].length).setValues(linhas);
      aba.getRange(linha0, 1, linhas.length, 1).setNumberFormat('dd/MM/yyyy HH:mm');
      aba.getRange(linha0, 2, linhas.length, 1).setNumberFormat('dd/MM/yyyy');
      aba.getRange(linha0, 4, linhas.length, 1).setNumberFormat('"R$" #,##0.00');
      linhas.forEach(function (l, i) {
        if (l[9]) aba.getRange(linha0 + i, 1, 1, l.length).setBackground('#fff4cc');
      });
    }
    return radioResposta_({ ok: true, gravados: gravados });
  } finally {
    trava.releaseLock();
  }
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
