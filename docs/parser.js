/* 📡 Rádio do Rosimar — entende a fala e separa cliente, valor, data, tipo e situação.
   Funciona no navegador (window.RadioParser) e no Node (testes). */
(function (raiz) {
  'use strict';

  var TIPOS = [
    { nome: "Limpeza de caixa d'água", chaves: ['caixa d agua', 'caixa dagua', 'caixa de agua', 'caixa da agua', 'caixas d agua', 'limpeza de caixa', 'caixa'] },
    { nome: 'Descupinização', chaves: ['descupiniz', 'cupim', 'cupins'] },
    { nome: 'Desratização', chaves: ['desratiz', 'rato', 'ratos', 'ratazana', 'roedor'] },
    { nome: 'Impermeabilização', chaves: ['impermeabiliz'] },
    { nome: 'Conserto de bomba', chaves: ['bomba'] },
    { nome: 'Documento/análise', chaves: ['documento', 'analise', 'laudo', 'certificado'] },
    { nome: 'Venda de produto', chaves: ['venda', 'vendi', 'produto'] },
    { nome: 'Dedetização', chaves: ['dedetiz', 'detetiz', 'dedetis', 'barata', 'formiga', 'pulga', 'traca', 'inseto', 'mosquito', 'escorpiao', 'aranha', 'percevejo'] }
  ];

  // A ordem importa: "nao pagou" precisa ser visto antes de "pagou".
  var SITUACOES = [
    { nome: 'A receber', chaves: ['a receber', 'falta pagar', 'vai pagar', 'nao pagou', 'ainda nao pagou', 'fiado', 'vai depositar', 'vai mandar o pix', 'falta receber'] },
    { nome: 'A fazer', chaves: ['a fazer', 'vou fazer', 'vai ser', 'marcado', 'marquei', 'agendado', 'agendei', 'combinado para', 'combinei'] },
    { nome: 'Pago', chaves: ['ja pagou', 'pagou', 'paguei', 'pago', 'recebi', 'recebido', 'pix caiu', 'caiu o pix', 'quitado', 'quitou'] },
    { nome: 'Realizado', chaves: ['realizado', 'feito', 'fiz', 'terminei', 'concluido', 'servico feito'] }
  ];

  var UNIDADES = {
    zero: 0, um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9,
    dez: 10, onze: 11, doze: 12, treze: 13, quatorze: 14, catorze: 14, quinze: 15, dezesseis: 16, dezasseis: 16,
    dezessete: 17, dezoito: 18, dezenove: 19, vinte: 20, trinta: 30, quarenta: 40, cinquenta: 50, cincoenta: 50,
    sessenta: 60, setenta: 70, oitenta: 80, noventa: 90, cem: 100, cento: 100, duzentos: 200, duzentas: 200,
    trezentos: 300, trezentas: 300, quatrocentos: 400, quinhentos: 500, seiscentos: 600, setecentos: 700,
    oitocentos: 800, novecentos: 900
  };

  var MESES = { janeiro: 1, fevereiro: 2, marco: 3, abril: 4, maio: 5, junho: 6, julho: 7, agosto: 8,
    setembro: 9, outubro: 10, novembro: 11, dezembro: 12 };
  var MESES_NOME = ['', 'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto',
    'setembro', 'outubro', 'novembro', 'dezembro'];
  var SEMANA = { domingo: 0, segunda: 1, terca: 2, quarta: 3, quinta: 4, sexta: 5, sabado: 6 };

  // Palavras que não fazem parte do nome do cliente.
  var ENCHIMENTO = ('o a os as um uma no na nos nas de do da dos das pro pra para por com e que ja la foi fiz fui ' +
    'servico servicos cliente valor reais real r$ centavos hoje ontem anteontem amanha dia data agora ' +
    'mes semana passada passado que vem proxima proximo ai entao tipo isso ele ela ali aqui deu ficou cobrei cobrado ' +
    'limpeza registro registra anota anotar coloca bota').split(' ');
  var ENCHIMENTO_SET = {};
  ENCHIMENTO.forEach(function (p) { ENCHIMENTO_SET[p] = true; });

  // Palavras genéricas de nomes de clientes (pesam menos na comparação).
  var GENERICAS = {};
  ('rest restaurante padaria dona seu sr sra cond condominio edificio ltda bar mercado mercadinho mercearia loja ' +
    'comercio comercial residencia de do da dos das e lanchonete salao cafe the').split(' ')
    .forEach(function (p) { GENERICAS[p] = true; });

  function normalizar(s) {
    return String(s || '')
      .toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/r\$\s*/g, ' r$ ')
      .replace(/[^a-z0-9$.,/: ]+/g, ' ')
      .replace(/:(?!\d)/g, ' ')
      .replace(/([a-z])[.,]+(?=\s|$)/g, '$1')
      .replace(/[.,]+(?=\s|$)/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /** Mesmos cortes do normalizar(), mas mantendo acentos e maiúsculas (para o nome de cliente novo). */
  function palavrasOriginais(s) {
    return String(s || '')
      .replace(/R\$\s*/gi, ' r$ ')
      .replace(/[^0-9$.,/: A-Za-zÀ-ÖØ-öø-ÿ]+/g, ' ')
      .replace(/:(?!\d)/g, ' ')
      .replace(/([A-Za-zÀ-ÖØ-öø-ÿ])[.,]+(?=\s|$)/g, '$1')
      .replace(/[.,]+(?=\s|$)/g, '')
      .replace(/\s+/g, ' ')
      .trim().split(' ');
  }

  function numeroDeDigitos(tok) {
    if (!/^\d[\d.,]*$/.test(tok)) return null;
    var t = tok;
    if (/,\d{1,2}$/.test(t)) t = t.replace(/\./g, '').replace(',', '.');
    else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
    else if (/^\d+\.\d{1,2}$/.test(t)) { /* 350.50 */ }
    else t = t.replace(/[.,]/g, '');
    var n = parseFloat(t);
    return isFinite(n) ? n : null;
  }

  function ehPalavraNumero(t) { return Object.prototype.hasOwnProperty.call(UNIDADES, t) || t === 'mil'; }

  /** Acha os números da frase (por extenso ou em algarismos). Cada um com posição inicial/final em tokens. */
  function acharNumeros(toks) {
    var res = [];
    var i = 0;
    while (i < toks.length) {
      var t = toks[i];
      var dig = numeroDeDigitos(t);
      if (dig !== null || ehPalavraNumero(t)) {
        var ini = i, total = 0, atual = 0, usou = false, ultimo = Infinity;
        while (i < toks.length) {
          var w = toks[i];
          var d = numeroDeDigitos(w);
          if (d !== null) {
            if (usou && d >= ultimo) break; // dois números seguidos: "dia 14 350"
            atual += d; ultimo = d; usou = true; i++;
          } else if (w === 'mil') {
            atual = (atual || 1) * 1000; total += atual; atual = 0; ultimo = Infinity; usou = true; i++;
          } else if (Object.prototype.hasOwnProperty.call(UNIDADES, w)) {
            var v = UNIDADES[w];
            // em português o maior vem antes: "trezentos e cinquenta". Se vier maior depois, é outro número.
            if (usou && v >= ultimo) break;
            atual += v; ultimo = v; usou = true; i++;
          } else if (w === 'e' && usou && i + 1 < toks.length && (ehPalavraNumero(toks[i + 1]) || numeroDeDigitos(toks[i + 1]) !== null)) {
            i++;
          } else break;
        }
        var valor = total + atual;
        // "e cinquenta centavos"
        var fim = i;
        var centavos = 0;
        if (toks[fim] === 'reais' || toks[fim] === 'real') fim++;
        if (toks[fim] === 'e' && toks[fim + 1] && (ehPalavraNumero(toks[fim + 1]) || numeroDeDigitos(toks[fim + 1]) !== null)) {
          var j = fim + 1, c = 0;
          while (j < toks.length && (ehPalavraNumero(toks[j]) || numeroDeDigitos(toks[j]) !== null || (toks[j] === 'e' && toks[j + 1] && ehPalavraNumero(toks[j + 1])))) {
            if (toks[j] !== 'e') c += numeroDeDigitos(toks[j]) !== null ? numeroDeDigitos(toks[j]) : UNIDADES[toks[j]] || 0;
            j++;
          }
          if (toks[j] === 'centavos' || toks[j] === 'centavo') { centavos = c; fim = j + 1; }
        }
        res.push({ valor: valor + centavos / 100, ini: ini, fim: Math.max(i, fim) });
        if (fim > i) i = fim;
      } else i++;
    }
    return res;
  }

  function hojeLocal(agora) {
    var d = agora ? new Date(agora) : new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }
  function iso(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function maisDias(d, n) { var x = new Date(d); x.setDate(x.getDate() + n); return x; }

  function contemFrase(norm, chave) {
    return (' ' + norm + ' ').indexOf(' ' + chave) >= 0;
  }

  function levenshtein(a, b) {
    if (a === b) return 0;
    var m = a.length, n = b.length;
    if (!m) return n; if (!n) return m;
    var prev = new Array(n + 1), cur = new Array(n + 1);
    for (var j = 0; j <= n; j++) prev[j] = j;
    for (var i = 1; i <= m; i++) {
      cur[0] = i;
      for (j = 1; j <= n; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
      var tmp = prev; prev = cur; cur = tmp;
    }
    return prev[n];
  }
  function parecido(a, b) {
    if (a === b) return 1;
    if (a.length <= 3 || b.length <= 3) return 0;
    return 1 - levenshtein(a, b) / Math.max(a.length, b.length);
  }

  /** Compara a fala com a lista de clientes. Devolve {nome, nota} ou null. */
  function acharCliente(texto, clientes) {
    var toks = normalizar(texto).split(' ').filter(function (t) { return t && !/^\d[\d.,]*$/.test(t); });
    if (!toks.length || !clientes || !clientes.length) return null;
    var melhor = null;
    clientes.forEach(function (c) {
      var variantes = [{ s: c.nome, peso: 1 }];
      String(c.apelidos || '').split(/[,;]/).forEach(function (a) { if (a.trim()) variantes.push({ s: a, peso: 1 }); });
      if (c.extrato) variantes.push({ s: c.extrato, peso: 0.9 });
      if (c.bairro) variantes.push({ s: c.nome + ' ' + c.bairro, peso: 1 });
      variantes.forEach(function (v) {
        var todos = normalizar(v.s).split(' ').filter(function (t) { return t.length >= 2 && !/^\d+$/.test(t); });
        var fortes = todos.filter(function (t) { return !GENERICAS[t]; });
        if (!fortes.length) fortes = todos;
        if (!fortes.length) return;
        var soma = 0, achou = 0;
        fortes.forEach(function (ct) {
          var m = 0;
          toks.forEach(function (tt) { var p = parecido(ct, tt); if (p > m) m = p; });
          if (m >= 0.78) { soma += m; achou++; }
        });
        if (!achou) return;
        var nota = (soma / fortes.length) * v.peso;
        // Uma palavra comprida e bem característica já identifica o cliente ("Apóstolo" → "7 Apóstolos…").
        fortes.forEach(function (ct) {
          if (ct.length < 6) return;
          var m = 0;
          toks.forEach(function (tt) { var p = parecido(ct, tt); if (p > m) m = p; });
          if (m >= 0.85 && m * 0.8 * v.peso > nota) nota = m * 0.8 * v.peso;
        });
        var bonusGen = 0;
        todos.forEach(function (gt) { if (GENERICAS[gt] && toks.indexOf(gt) >= 0) bonusGen += 0.02; });
        nota += bonusGen + achou * 0.01;
        if (!melhor || nota > melhor.nota) melhor = { nome: c.nome, nota: nota };
      });
    });
    return melhor && melhor.nota >= 0.62 ? melhor : null;
  }

  function capitalizar(s) {
    return s.split(' ').map(function (p) {
      if (!p) return p;
      if (['de', 'do', 'da', 'dos', 'das', 'e'].indexOf(p) >= 0) return p;
      return p.charAt(0).toUpperCase() + p.slice(1);
    }).join(' ');
  }

  /**
   * Entende uma frase.
   * opcoes: { clientes: [{nome, extrato, apelidos}], agora: Date }
   */
  function entender(texto, opcoes) {
    opcoes = opcoes || {};
    var norm = normalizar(texto);
    var toks = norm ? norm.split(' ') : [];
    var usado = toks.map(function () { return false; });
    var hoje = hojeLocal(opcoes.agora);
    var r = { texto: String(texto || '').trim(), cliente: '', clienteBase: false, valor: null, dataServico: iso(hoje),
      dataFalada: false, hora: '', tipo: '', situacao: '' };

    // Situação (antes de tudo, para "não pagou" não virar "pagou")
    var futuro = /\b(que vem|proxima|proximo|amanha|depois de amanha|vou fazer|marcado|agendado|a fazer)\b/.test(norm);
    for (var s = 0; s < SITUACOES.length && !r.situacao; s++) {
      for (var k = 0; k < SITUACOES[s].chaves.length; k++) {
        if (contemFrase(norm, SITUACOES[s].chaves[k])) { r.situacao = SITUACOES[s].nome; marcarFrase(SITUACOES[s].chaves[k]); break; }
      }
    }

    // Tipo de serviço (pode ter mais de um)
    var tipos = [];
    TIPOS.forEach(function (t) {
      for (var k = 0; k < t.chaves.length; k++) {
        if (contemFrase(norm, t.chaves[k])) {
          if (tipos.indexOf(t.nome) < 0) tipos.push(t.nome);
          marcarFrase(t.chaves[k]);
        }
      }
    });
    r.tipo = tipos.join(' + ');

    // Números
    var nums = acharNumeros(toks);

    // Hora: "às 10", "10h", "10h30", "10:30", "10 horas", "meio dia", "e meia", "da tarde"
    var hh = null, mm = 0, fimHora = -1;
    for (var q = 0; q < toks.length && hh === null; q++) {
      var mh = /^(\d{1,2})(?::(\d{2})|h(\d{2})?)$/.exec(toks[q]);
      if (mh && +mh[1] <= 23) {
        hh = +mh[1]; mm = +(mh[2] || mh[3] || 0); usado[q] = true; fimHora = q + 1;
        if (toks[q - 1] === 'as') usado[q - 1] = true;
      } else if (toks[q] === 'meio' && toks[q + 1] === 'dia') {
        hh = 12; usado[q] = usado[q + 1] = true; fimHora = q + 2;
        if (toks[q - 1] === 'ao' || toks[q - 1] === 'as') usado[q - 1] = true;
      }
    }
    if (hh === null) nums.forEach(function (n) {
      if (hh !== null) return;
      var antes = toks[n.ini - 1], dep = toks[n.fim];
      if ((antes === 'as' || dep === 'horas' || dep === 'hora' || dep === 'h') && n.valor === Math.floor(n.valor) && n.valor <= 23) {
        hh = n.valor; n.hora = true; fimHora = n.fim;
        for (var x = n.ini; x < n.fim; x++) usado[x] = true;
        if (antes === 'as') usado[n.ini - 1] = true;
        if (dep === 'horas' || dep === 'hora' || dep === 'h') { usado[n.fim] = true; fimHora = n.fim + 1; }
      }
    });
    if (hh !== null) {
      if (toks[fimHora] === 'e' && toks[fimHora + 1] === 'meia') { mm = 30; usado[fimHora] = usado[fimHora + 1] = true; fimHora += 2; }
      var periodo = toks[fimHora] === 'da' ? toks[fimHora + 1] : '';
      if (periodo === 'tarde' || periodo === 'noite') { if (hh < 12) hh += 12; usado[fimHora] = usado[fimHora + 1] = true; }
      else if (periodo === 'manha' || periodo === 'madrugada') { usado[fimHora] = usado[fimHora + 1] = true; }
      r.hora = String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
      // falou a hora sem dizer que já fez/pagou: é um agendamento
      if (!/\b(fiz|feito|realizado|terminei|concluido|pagou|paguei|recebi)\b/.test(norm)) futuro = true;
    }

    // Datas
    var data = null;
    for (var i = 0; i < toks.length; i++) {
      var t = toks[i];
      if (t === 'hoje') { data = hoje; usado[i] = true; }
      else if (t === 'ontem') { data = maisDias(hoje, -1); usado[i] = true; }
      else if (t === 'anteontem') { data = maisDias(hoje, -2); usado[i] = true; }
      else if (t === 'amanha') { data = maisDias(hoje, toks[i - 1] === 'de' && toks[i - 2] === 'depois' ? 2 : 1); usado[i] = true; }
      else if (/^\d{1,2}\/\d{1,2}(\/\d{2,4})?$/.test(t)) {
        var p = t.split('/');
        var ano = p[2] ? (p[2].length === 2 ? 2000 + +p[2] : +p[2]) : hoje.getFullYear();
        data = ajustarAno(new Date(ano, +p[1] - 1, +p[0]), !p[2]);
        usado[i] = true;
      } else if (Object.prototype.hasOwnProperty.call(SEMANA, t)) {
        // "sexta", "segunda-feira"
        var alvo = SEMANA[t];
        var dif = (hoje.getDay() - alvo + 7) % 7;
        var agoraH = opcoes.agora ? new Date(opcoes.agora) : new Date();
        var horaAindaVem = r.hora && r.hora > String(agoraH.getHours()).padStart(2, '0') + ':' + String(agoraH.getMinutes()).padStart(2, '0');
        var adiante = (alvo - hoje.getDay() + 7) % 7;
        if (!adiante && !horaAindaVem) adiante = 7; // mesmo dia da semana: hoje só se a hora ainda não passou
        data = futuro ? maisDias(hoje, adiante) : maisDias(hoje, -dif);
        usado[i] = true;
        if (toks[i + 1] === 'feira') usado[i + 1] = true;
      }
    }
    // "dia 14", "dia quatorze de novembro", "14 de novembro"
    nums.forEach(function (n) {
      var antes = toks[n.ini - 1];
      var mesTok = toks[n.fim] === 'de' ? toks[n.fim + 1] : null;
      var temMes = mesTok && Object.prototype.hasOwnProperty.call(MESES, mesTok);
      if ((antes === 'dia' || temMes) && n.valor >= 1 && n.valor <= 31 && n.valor === Math.floor(n.valor)) {
        var mes = temMes ? MESES[mesTok] - 1 : hoje.getMonth();
        var d = new Date(hoje.getFullYear(), mes, n.valor);
        if (temMes) d = ajustarAno(d, true);
        else if (d > hoje && !futuro) d = new Date(hoje.getFullYear(), hoje.getMonth() - 1, n.valor);
        else if (d < hoje && futuro) d = new Date(hoje.getFullYear(), hoje.getMonth() + 1, n.valor);
        data = d;
        n.data = true;
        for (var x = n.ini; x < n.fim; x++) usado[x] = true;
        if (antes === 'dia') usado[n.ini - 1] = true;
        if (temMes) { usado[n.fim] = true; usado[n.fim + 1] = true; }
      }
    });
    if (data) { r.dataServico = iso(data); r.dataFalada = true; }
    if (!r.situacao && (futuro || (data && data > hoje))) r.situacao = 'A fazer';

    // Cliente da base primeiro: um número que faz parte do nome ("sete Apóstolos", "Ponto 87") não é o valor.
    var naBase = acharCliente(texto, opcoes.clientes);
    var numerosDoNome = {};
    if (naBase) {
      var tn = normalizar(naBase.nome).split(' ');
      acharNumeros(tn).forEach(function (n) { numerosDoNome[n.valor] = true; });
      tn.forEach(function (t) { var m = /\d+/.exec(t); if (m) numerosDoNome[+m[0]] = true; });
    }
    // Valor: o número marcado com "reais"/"R$"; senão o maior que não é data nem parte do nome.
    var candidatos = nums.filter(function (n) { return !n.data && !n.hora && !numerosDoNome[n.valor]; });
    var marcado = candidatos.filter(function (n) {
      return toks[n.ini - 1] === 'r$' || toks[n.fim - 1] === 'reais' || toks[n.fim] === 'reais' || toks[n.fim] === 'real' || toks[n.fim - 1] === 'centavos';
    });
    var escolhido = (marcado.length ? marcado : candidatos).reduce(function (a, b) { return !a || b.valor > a.valor ? b : a; }, null);
    if (escolhido && escolhido.valor > 0) {
      r.valor = Math.round(escolhido.valor * 100) / 100;
      for (var y = escolhido.ini; y < escolhido.fim; y++) usado[y] = true;
      if (toks[escolhido.ini - 1] === 'r$') usado[escolhido.ini - 1] = true;
    }

    // Cliente: primeiro procura na base; senão, o que sobrou da frase.
    if (naBase) { r.cliente = naBase.nome; r.clienteBase = true; r.clienteNota = naBase.nota; }
    else {
      var sobra = toks.filter(function (tk, idx) {
        return !usado[idx] && !ENCHIMENTO_SET[tk] && !/^\d[\d.,/]*$/.test(tk) && !ehPalavraNumero(tk) && tk !== 'feira';
      });
      if (sobra.length) {
        var orig = palavrasOriginais(texto);
        var iguais = orig.length === toks.length;
        var nomes = [];
        toks.forEach(function (tk, idx) {
          if (sobra.indexOf(tk) >= 0 && !usado[idx] && !ENCHIMENTO_SET[tk]) nomes.push(iguais ? orig[idx] : tk);
        });
        r.cliente = capitalizar(nomes.join(' ').toLowerCase());
      }
    }

    r.faltando = [];
    if (!r.cliente) r.faltando.push('cliente');
    if (!r.valor) r.faltando.push('valor');
    if (!r.tipo) r.faltando.push('tipo');
    return r;

    function marcarFrase(chave) {
      var partes = chave.split(' ');
      for (var a = 0; a < toks.length; a++) {
        var ok = true;
        for (var b = 0; b < partes.length; b++) {
          if (!toks[a + b] || toks[a + b].indexOf(partes[b]) !== 0) { ok = false; break; }
        }
        if (ok) for (b = 0; b < partes.length; b++) usado[a + b] = true;
      }
    }
    function ajustarAno(d, semAno) {
      if (semAno && d - hoje > 60 * 864e5) d.setFullYear(d.getFullYear() - 1);
      return d;
    }
  }

  /** Só o valor (resposta a "Qual o valor?") */
  function entenderValor(texto) {
    var toks = normalizar(texto).split(' ').filter(Boolean);
    var nums = acharNumeros(toks);
    var maior = nums.reduce(function (a, b) { return !a || b.valor > a.valor ? b : a; }, null);
    return maior && maior.valor > 0 ? Math.round(maior.valor * 100) / 100 : null;
  }

  /** Só o tipo (resposta a "Qual o serviço?") */
  function entenderTipo(texto) {
    var norm = normalizar(texto);
    var tipos = [];
    TIPOS.forEach(function (t) {
      if (t.chaves.some(function (c) { return contemFrase(norm, c); }) && tipos.indexOf(t.nome) < 0) tipos.push(t.nome);
    });
    if (tipos.length) return tipos.join(' + ');
    return norm ? 'Outro: ' + norm : '';
  }

  /** Só o cliente (resposta a "Qual o cliente?") */
  function entenderCliente(texto, clientes) {
    var b = acharCliente(texto, clientes);
    if (b) return { cliente: b.nome, clienteBase: true };
    var tk = normalizar(texto).split(' ');
    var orig = palavrasOriginais(texto);
    var nomes = [];
    tk.forEach(function (t, i) { if (t && !ENCHIMENTO_SET[t]) nomes.push(orig.length === tk.length ? orig[i] : t); });
    return { cliente: capitalizar(nomes.join(' ').toLowerCase()), clienteBase: false };
  }

  /** "sim" / "não" / null */
  function simOuNao(texto) {
    var n = ' ' + normalizar(texto) + ' ';
    if (/ (nao|errado|errada|de novo|outra vez|repete|cancela|corrige) /.test(n)) return 'nao';
    if (/ (sim|isso|certo|certinho|correto|pode|confirma|confirmo|ok|okay|beleza|ta certo|grava|positivo|exato|perfeito) /.test(n)) return 'sim';
    return null;
  }

  function valorFalado(v) {
    var inteiro = Math.floor(v), cent = Math.round((v - inteiro) * 100);
    var s = inteiro.toLocaleString('pt-BR') + (inteiro === 1 ? ' real' : ' reais');
    if (cent) s += ' e ' + cent + ' centavos';
    return s;
  }
  function valorTela(v) {
    return 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function dataFalada(isoData, agora) {
    var hoje = iso(hojeLocal(agora));
    var ontem = iso(maisDias(hojeLocal(agora), -1));
    if (isoData === hoje) return 'hoje';
    if (isoData === ontem) return 'ontem';
    if (isoData === iso(maisDias(hojeLocal(agora), 1))) return 'amanhã';
    var p = isoData.split('-');
    return 'dia ' + (+p[2]) + ' de ' + MESES_NOME[+p[1]];
  }
  function horaFalada(h) {
    var p = h.split(':'), hh = +p[0], mm = +p[1];
    return hh + (hh === 1 ? ' hora' : ' horas') + (mm === 30 ? ' e meia' : mm ? ' e ' + mm : '');
  }
  function dataTela(isoData) {
    var p = isoData.split('-');
    return p[2] + '/' + p[1] + '/' + p[0];
  }

  /** Frase de confirmação lida em voz alta */
  function fraseConfirmacao(r, agora) {
    var partes = [];
    partes.push((r.clienteBase ? 'Cliente ' : 'Cliente novo, ') + r.cliente);
    if (r.valor) partes.push(valorFalado(r.valor));
    if (r.tipo) partes.push(r.tipo.replace('Documento/análise', 'documento ou análise').replace(' + ', ' e ').replace('Outro: ', ''));
    partes.push(dataFalada(r.dataServico, agora) + (r.hora ? ' às ' + horaFalada(r.hora) : ''));
    if (r.situacao) partes.push(r.situacao.toLowerCase());
    return partes.join(', ') + '. Está certo?';
  }

  var api = {
    entender: entender, entenderValor: entenderValor, entenderTipo: entenderTipo, entenderCliente: entenderCliente,
    simOuNao: simOuNao, fraseConfirmacao: fraseConfirmacao, valorTela: valorTela, dataTela: dataTela,
    normalizar: normalizar, acharCliente: acharCliente, TIPOS: TIPOS.map(function (t) { return t.nome; })
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else raiz.RadioParser = api;
})(typeof window !== 'undefined' ? window : this);
