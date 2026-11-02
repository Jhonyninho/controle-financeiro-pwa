// ======================================================================
//  CONTROLE FINANCEIRO PESSOAL - BACKEND (Google Apps Script)
//  Arquitetura: API PWA (Frontend Externo)
//  Versão: 3.2 - DATA BR ESTÁVEL (SEM UTC)
// ======================================================================

/* ======================================================================
 *  CONFIGURAÇÕES GLOBAIS
 * ====================================================================== */
const SHEET_USERS      = 'Usuarios';
const SHEET_USERS_CONTAS = 'Usuarios_Contas';
const SHEET_CATEGORIES = 'Categorias';
const SHEET_ACCOUNTS   = 'Contas';
const SHEET_ENTRIES    = 'Lancamentos';
const SHEET_FUTURE     = 'Lancamentos_Futuros';
const SHEET_PAYMENTS   = 'Pagamentos';

/* ======================================================================
 *  ENTRY POINT - API (ROTEADOR)
 * ====================================================================== */
function doGet(e){
  const data   = e.parameter || {};
  const action = data.action;

  try {
    switch(action){

      // Login
      case 'login':
        return resposta(loginUsuario(data));

      // Setup
      case 'setup':
        return resposta(setupProject());

      // Categorias / Pagamentos
      case 'getCategorias':
        return resposta(getCategorias(data));
      case 'getPagamentos':
        return resposta(getPagamentos());

      // 🔐 CONTAS POR USUÁRIO
      case 'getContas':
        return resposta(getContas(data));

      case 'updateConta':
        return resposta(updateContaUsuario(data));

      // Lançamentos
      case 'addLancamento':
        return resposta(addLancamento(data));
      case 'updateLancamento':
        return resposta(updateLancamento(data));
      case 'deleteLancamento':
        return resposta(deleteLancamento(data));
      case 'getLancamentos':
        return resposta(getLancamentos(data));

      case 'getLancamentosFuturos':
        return resposta(getLancamentosFuturos(data));
      case 'addLancamentoFuturo':
        return resposta(addLancamentoFuturo(data));
      case 'updateLancamentoFuturo':
        return resposta(updateLancamentoFuturo(data));
      case 'deleteLancamentoFuturo':
        return resposta(deleteLancamentoFuturo(data));
      case 'confirmarLancamentoFuturo':
        return resposta(confirmarLancamentoFuturo(data));

      // Dashboard
      case 'dashboard':
        return resposta(getDashboard(data));

      case 'getResumoCategorias':
        return resposta(getResumoCategorias(data));

      case 'getResumoContas':
        return resposta(getResumoContas(data));

      // Inteligência Financeira
      case 'getInteligenciaFinanceira':
        return resposta(getInteligenciaFinanceira(data));

      case 'getComparativoCategorias':
        return resposta(getComparativoCategorias(data));

      default:
        return resposta({ ok:true, msg:'API Controle Financeiro ativa' });
    }
  } catch(err){
    return resposta({ ok:false, erro: err.toString() });
  }
}

function doPost(e) {
  try {
    const body = e.postData && e.postData.contents
      ? JSON.parse(e.postData.contents)
      : {};

    if (!body.action) {
      throw new Error('Ação não informada');
    }

    // reutiliza o mesmo roteamento do GET
    return doGet({ parameter: body });

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({
        ok: false,
        erro: err.message || String(err)
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/* ======================================================================
 *  RESPONSE HELPER
 * ====================================================================== */
function resposta(obj){
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ======================================================================
 *  HELPERS GERAIS
 * ====================================================================== */
function sheet(name){
  return SpreadsheetApp.getActive().getSheetByName(name);
}

/* ======================================================================
 *  FILTRO DE DADOS POR USUÁRIO
 * ====================================================================== */

/**
 * Retorna apenas os registros pertencentes ao usuário informado.
 * A coluna "Usuario" é a coluna 10 (índice 9).
 */
function filtrarRegistrosUsuario(dados, usuario) {

  usuario = String(usuario || '').trim();

  if (!usuario) return [];

  return dados.filter(linha =>
    String(linha[9]).trim() === usuario
  );

}

// Converte YYYY-MM-DD → DD/MM/YYYY (sem Date / sem UTC)
function toBRDate(dateISO){
  if (!dateISO) return '';
  const p = dateISO.split('-');
  if (p.length !== 3) return dateISO;
  return `${p[2]}/${p[1]}/${p[0]}`;
}


/* ======================================================================
 *  SETUP INICIAL DO PROJETO
 * ====================================================================== */
function setupProject(){
  const ss = SpreadsheetApp.getActive();

  if(!sheet(SHEET_USERS))
    ss.insertSheet(SHEET_USERS).appendRow(['ID','Login','Senha','Nome','Perfil']);

  if(!sheet(SHEET_CATEGORIES))
    ss.insertSheet(SHEET_CATEGORIES)
      .appendRow(['ID','Tipo','Categoria','Subcategoria','Padrao']);

  if(!sheet(SHEET_ACCOUNTS))
  ss.insertSheet(SHEET_ACCOUNTS)
    .appendRow(['ID','Nome','Ativo','Bandeira','Skin','MostrarResumo','Ordem']);


  if(!sheet(SHEET_PAYMENTS))
    ss.insertSheet(SHEET_PAYMENTS)
      .appendRow(['ID','Nome','Ativo']);

  if(!sheet(SHEET_ENTRIES))
    ss.insertSheet(SHEET_ENTRIES)
      .appendRow([
        'ID','Data','Tipo','Categoria','Subcategoria',
        'Conta','Pagamento','Valor','Descricao','Usuario'
      ]);

  if(!sheet(SHEET_FUTURE))
    ss.insertSheet(SHEET_FUTURE)
      .appendRow([
        'ID','Data','Tipo','Categoria','Subcategoria',
        'Conta','Pagamento','Valor','Descricao','Usuario','Status','FaturaMes'
      ]);

  return { ok:true };
}


/* ======================================================================
 *  CATEGORIAS
 * ====================================================================== */
function seedCategorias(){
  const sh = sheet(SHEET_CATEGORIES);
  sh.clear().appendRow(['ID','Tipo','Categoria','Subcategoria','Padrao']);

const dados = [
    ['ENTRADA','Salário','Mensal','SIM'],
    ['ENTRADA','Renda Extra','Freelance','NAO'],
    ['ENTRADA','Saldo em Conta','Acumulado','NAO'],
    ['SAIDA','Moradia','Aluguel','SIM'],
    ['SAIDA','Moradia','Condominio','NAO'],
    ['SAIDA','Moradia','Água','NAO'],
    ['SAIDA','Moradia','Luz','NAO'],
    ['SAIDA','Alimentação','Mercado','NAO'],
    ['SAIDA','Alimentação','Restaurante','NAO'],
    ['SAIDA','Transporte','Combustível','NAO'],
    ['SAIDA','Transporte','Uber','NAO'],
    ['SAIDA','Transporte','99','NAO'],
    ['SAIDA','Lazer','Streaming','NAO'],
    ['SAIDA','Lazer','Passeio','NAO'],
    ['SAIDA','Saúde','Farmácia','NAO'],
    ['SAIDA','Educação','Cursos','NAO'],
    ['SAIDA','Veiculo','Manutenção','NAO'],
    ['SAIDA','Tarifas e Impostos','Taxas','NAO'],
    ['SAIDA','Outros','Diversos','NAO'],
    ['SAIDA','Comunicação','Internet','SIM'],
    ['SAIDA','Despesas Pessoais','Beleza','NAO'],
    ['SAIDA','Despesas Pessoais','Seguro','NAO'],
    ['SAIDA','Despesas Pessoais','Assinaturas','NAO'],
    ['ENTRADA','Reembolso','Diversos','NAO'],
    ['ENTRADA','Salário','Adiantamento','SIM'],
    ['SAIDA','Saúde','Dentista','NAO'],
    ['SAIDA','Saúde','Consulta Médica','NAO'],
    ['SAIDA','Saúde','Exame Médico','NAO'],
    ['SAIDA','Financeiro','Emprestimo','NAO'],
    ['ENTRADA','Benefícios','Saque Aniversário','NAO'],
    ['ENTRADA','Salário','13º Salário','NAO'],
    ['ENTRADA','Dividendos','Diversos','NAO'],
    ['ENTRADA','Renda Extra','Vendas','NAO'],
    ['ENTRADA','Recebidos','Diversos','NAO'],
    ['ENTRADA','Benefícios','Rescisão','NAO'],
    ['ENTRADA','Benefícios','Seguro Desemprego','NAO'],
    ['ENTRADA','Salário','Férias','NAO'],
    ['ENTRADA','Despesas Pessoais','Vestuários','NAO'],
    ['ENTRADA','Despesas Pessoais','Móveis','NAO'],
    ['ENTRADA','Despesas Pessoais','Eletrônicos','NAO'],
  ];

  dados.forEach((d,i)=> sh.appendRow([i+1, d[0], d[1], d[2], d[3]]));
  return { ok:true };
}

function getCategorias(d){
  const dados = sheet(SHEET_CATEGORIES).getDataRange().getValues();
  const lista = [];

  for(let i=1;i<dados.length;i++){
    if(!d.tipo || dados[i][1] === d.tipo){
      lista.push({
        id: dados[i][0],
        tipo: dados[i][1],
        categoria: dados[i][2],
        subcategoria: dados[i][3],
        padrao: dados[i][4]
      });
    }
  }
  return { ok:true, categorias: lista };
}


/* ======================================================================
 *  CONTAS (BANCOS)
 * ====================================================================== */
function seedContas() {
  const sh = sheet(SHEET_ACCOUNTS);
  sh.clear().appendRow([
    'ID',
    'Nome',
    'Ativo',
    'Bandeira',
    'Skin',
    'MostrarResumo',
    'Ordem'
  ]);

  const contas = [
    ['Banco do Brasil', 'VISA', 'bb', 'SIM', 1],
    ['Santander', 'MASTERCARD', 'santander', 'SIM', 2],
    ['Mercado Pago', 'VISA', 'mercado', 'SIM', 3],
    ['Itau', 'MASTERCARD', 'itau', 'SIM', 4],
    ['Nubank', 'VISA', 'nubank', 'SIM', 5],
    ['Bradesco', 'ELO', 'bradesco', 'SIM', 6],
    ['Inter', 'MASTERCARD', 'inter', 'SIM', 7],
    ['btgpactual', 'VISA', 'btg', 'SIM', 8],
    ['Caixa', 'ELO', 'caixa', 'SIM', 9]
  ];

  contas.forEach((c, i) => {
    sh.appendRow([
      i + 1,
      c[0],
      'SIM',
      c[1],
      c[2],
      c[3],
      c[4]
    ]);
  });

  return { ok: true };
}

/*========================================================================*/
function getContas(d) {
  const usuario = (d.usuario || '').trim();
  if (!usuario) return { ok:true, contas:[] };

  const ss = SpreadsheetApp.getActive();
  const shContas = ss.getSheetByName(SHEET_ACCOUNTS);
  const shUC = ss.getSheetByName(SHEET_USERS_CONTAS);

  const contasBase = shContas.getDataRange().getValues();
  const hC = contasBase.shift().map(h => String(h).toLowerCase());

  const idxC = {
    nome: hC.indexOf('nome'),
    bandeira: hC.indexOf('bandeira'),
    skin: hC.indexOf('skin'),
    ordem: hC.indexOf('ordem')
  };

  // -------------------------
  // Se não existir Usuarios_Contas
  // -------------------------
  if (!shUC) {
    return {
      ok: true,
      contas: contasBase.map((c, i) => ({
        nome: c[idxC.nome],
        bandeira: c[idxC.bandeira],
        skin: c[idxC.skin],
        ativo: 'SIM',
        mostrarResumo: 'SIM',
        ordem: Number(c[idxC.ordem]) || i + 1
      }))
    };
  }

  const rel = shUC.getDataRange().getValues();
  const hU = rel.shift().map(h => String(h).toLowerCase());

  const idxU = {
    usuario: hU.indexOf('usuario'),
    conta: hU.indexOf('conta'),
    ativo: hU.indexOf('ativo'),
    mostrarResumo: hU.indexOf('mostrarresumo'),
    ordem: hU.indexOf('ordem')
  };

  // Blindagem REAL
  if (idxU.usuario === -1 || idxU.conta === -1) {
    return { ok:true, contas:[] };
  }

  // Preferências do usuário
  const prefs = {};
  rel.forEach(r => {
    if (String(r[idxU.usuario]).trim() === usuario) {
      prefs[String(r[idxU.conta]).trim()] = {
        ativo: r[idxU.ativo],
        mostrarResumo: r[idxU.mostrarResumo],
        ordem: Number(r[idxU.ordem]) || 999
      };
    }
  });

  const lista = contasBase.map((c, i) => {
    const nome = String(c[idxC.nome]).trim();
    const p = prefs[nome];

    return {
      nome,
      bandeira: c[idxC.bandeira],
      skin: c[idxC.skin],
      ativo: p ? p.ativo : 'NAO',
      mostrarResumo: p ? p.mostrarResumo : 'NAO',
      ordem: p ? p.ordem : (Number(c[idxC.ordem]) || i + 1)
    };
  });

  lista.sort((a,b) => a.ordem - b.ordem);

  return { ok:true, contas: lista };
}

/*====================================================================*/
function updateContaUsuario(d) {
  const usuario = (d.usuario || '').trim();
  const conta   = (d.conta || '').trim();

  if (!usuario || !conta) {
    return { ok: false, msg: 'Usuário e conta obrigatórios' };
  }

  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName('Usuarios_Contas');

  // Cria a aba se não existir
  if (!sh) {
    ss.insertSheet(SHEET_USERS_CONTAS)
      .appendRow(['Usuario','Conta','Ativo','MostrarResumo','Ordem']);
  }

  const dados = sh.getDataRange().getValues();
  const header = dados.shift();

  const idx = {
    usuario: header.indexOf('Usuario'),
    conta: header.indexOf('Conta'),
    ativo: header.indexOf('Ativo'),
    mostrarResumo: header.indexOf('MostrarResumo'),
    ordem: header.indexOf('Ordem')
  };

  // Procura registro existente
  let linha = dados.findIndex(r =>
    String(r[idx.usuario]).trim() === usuario &&
    String(r[idx.conta]).trim() === conta
  );

  if (linha >= 0) {
    // Atualiza
    sh.getRange(linha + 2, idx.ativo + 1).setValue(d.ativo);
    sh.getRange(linha + 2, idx.mostrarResumo + 1).setValue(d.mostrarResumo);
    sh.getRange(linha + 2, idx.ordem + 1).setValue(Number(d.ordem) || 999);
  } else {
    // Insere
    sh.appendRow([
      usuario,
      conta,
      d.ativo || 'NAO',
      d.mostrarResumo || 'NAO',
      Number(d.ordem) || 999
    ]);
  }

  return { ok: true };
}

/* ======================================================================
 *  PAGAMENTOS
 * ====================================================================== */
function seedPagamentos(){
  const sh = sheet(SHEET_PAYMENTS);
  sh.clear().appendRow(['ID','Nome','Ativo']);

  ['Pix','Débito','Crédito','Dinheiro','TED','Boleto']
    .forEach((p,i)=> sh.appendRow([i+1, p, 'SIM']));

  return { ok:true };
}

function getPagamentos(){
  const dados = sheet(SHEET_PAYMENTS).getDataRange().getValues();
  const lista = [];

  for(let i=1;i<dados.length;i++){
    if(dados[i][2] === 'SIM'){
      lista.push({ id:dados[i][0], nome:dados[i][1] });
    }
  }
  return { ok:true, pagamentos: lista };
}


/* ======================================================================
 *  FATURA (SEM UTC / SEM Date)
 * ====================================================================== */
function calcularFaturaMes(dataISO, conta){
  const contas = sheet(SHEET_ACCOUNTS).getDataRange().getValues();

  for(let i=1;i<contas.length;i++){
    if(contas[i][2] === conta && contas[i][1] === 'CREDITO'){
      const p = dataISO.split('-');
      const dia = Number(p[2]);
      let mes = Number(p[1]);
      let ano = Number(p[0]);

      const diaFechamento = Number(contas[i][3] || 0);

      if(diaFechamento && dia > diaFechamento){
        mes++;
        if(mes === 13){ mes = 1; ano++; }
      }
      return ano + '-' + ('0'+mes).slice(-2);
    }
  }
  return '';
}


/* ======================================================================
 *  LANÇAMENTOS ATUAIS
 * ====================================================================== */
function addLancamento(d){

  Logger.log('VALOR RECEBIDO NO BACKEND (addLancamento): ' + d.valor);
  const sh = sheet(SHEET_ENTRIES);
  const dados = sh.getDataRange().getValues();

  let maxId = 0;
  for (let i = 1; i < dados.length; i++) {
    maxId = Math.max(maxId, Number(dados[i][0]) || 0);
  }

  const novoId = maxId + 1;

  sh.appendRow([
    novoId,
    toBRDate(d.data),
    d.tipo,
    d.categoria,
    d.subcategoria,
    d.conta,
    d.pagamento || '',
    normalizarValorBackend(d.valor),
    d.descricao || '',
    d.usuario || ''
  ]);

  return { ok: true, id: novoId };
}

function updateLancamento(d){
  const sh = sheet(SHEET_ENTRIES);
  const dados = sh.getDataRange().getValues();

  for (let i = 1; i < dados.length; i++) {
    if (String(dados[i][0]) === String(d.id)) {
      sh.getRange(i + 1, 2, 1, 9).setValues([[
        toBRDate(d.data),
        d.tipo,
        d.categoria,
        d.subcategoria,
        d.conta,
        d.pagamento || '',
        normalizarValorBackend(d.valor),
        d.descricao || '',
        d.usuario || ''
      ]]);
      break;
    }
  }
  return { ok: true };
}

/* ======================================================================
 *  RETORNA APENAS OS LANÇAMENTOS DO USUÁRIO LOGADO
 * ====================================================================== */
function getLancamentos(d) {

  const usuario = String(d.usuario || '').trim();

  if (!usuario) {
    return {
      ok: false,
      msg: 'Usuário não informado.'
    };
  }

  const dados = sheet(SHEET_ENTRIES)
    .getDataRange()
    .getValues()
    .slice(1);

  const lancamentos = filtrarRegistrosUsuario(dados, usuario);

  return {
    ok: true,
    lancamentos: lancamentos
  };

}

function deleteLancamento(d){
  const sh = sheet(SHEET_ENTRIES);
  const dados = sh.getDataRange().getValues();

  for(let i=1;i<dados.length;i++){
    if(String(dados[i][0]) === String(d.id)){
      sh.deleteRow(i+1);
      break;
    }
  }
  return { ok:true };
}

/* ======================================================================
 *  DASHBOARD (FILTRADO POR USUÁRIO)
 * ====================================================================== */
function getDashboard(d){

  const usuario = String(d.usuario || '').trim();

  if (!usuario) {
    return {
      ok:false,
      msg:'Usuário não informado.'
    };
  }

  const dados = filtrarRegistrosUsuario(
    sheet(SHEET_ENTRIES)
      .getDataRange()
      .getValues()
      .slice(1),
    usuario
  );

  const hoje = new Date();
  const mes = d.mes ? Number(d.mes) : hoje.getMonth() + 1;
  const ano = d.ano ? Number(d.ano) : hoje.getFullYear();

  let entradas = 0;
  let saidas   = 0;

  dados.forEach(l => {

    const tipo  = l[2];
    const valor = parseValorBR_backend(l[7]);
    const data  = l[1];

    if (!data) return;

    const partes = String(data).split('/');

    if (partes.length !== 3) return;

    const mesRow = Number(partes[1]);
    const anoRow = Number(partes[2]);

    if (mesRow !== mes || anoRow !== ano) return;

    if (tipo === 'ENTRADA') entradas += valor;
    if (tipo === 'SAIDA')   saidas   += valor;

  });

  return {
    ok:true,
    mes,
    ano,
    entradas,
    saidas,
    saldo: entradas - saidas
  };

}

/* ======================================================================
 *  RESUMO POR CATEGORIAS (FILTRADO POR USUÁRIO)
 * ====================================================================== */
function getResumoCategorias(d){

  const usuario = String(d.usuario || '').trim();

  if (!usuario) {
    return {
      ok:false,
      msg:'Usuário não informado.'
    };
  }

  const dados = filtrarRegistrosUsuario(
    sheet(SHEET_ENTRIES)
      .getDataRange()
      .getValues()
      .slice(1),
    usuario
  );

  const hoje = new Date();
  const mes = d.mes ? Number(d.mes) : hoje.getMonth() + 1;
  const ano = d.ano ? Number(d.ano) : hoje.getFullYear();

  const resumo = {};

  dados.forEach(l => {

    if (l[2] !== 'SAIDA') return;

    const data = l[1];
    if (!data) return;

    const partes = String(data).split('/');

    if (partes.length !== 3) return;

    const mesRow = Number(partes[1]);
    const anoRow = Number(partes[2]);

    if (mesRow !== mes || anoRow !== ano) return;

    const categoria = l[3];
    const valor = parseValorBR_backend(l[7]);

    resumo[categoria] = (resumo[categoria] || 0) + valor;

  });

  return {
    ok:true,
    categorias: resumo
  };

}

/* ======================================================================
 *  RESUMO POR CONTAS (FILTRADO POR USUÁRIO)
 * ====================================================================== */
function getResumoContas(d){

  const usuario = String(d.usuario || '').trim();

  if (!usuario) {
    return {
      ok:false,
      msg:'Usuário não informado.'
    };
  }

  const dados = filtrarRegistrosUsuario(
    sheet(SHEET_ENTRIES)
      .getDataRange()
      .getValues()
      .slice(1),
    usuario
  );

  const hoje = new Date();
  const mes = d.mes ? Number(d.mes) : hoje.getMonth() + 1;
  const ano = d.ano ? Number(d.ano) : hoje.getFullYear();

  const resumo = {};

  dados.forEach(l => {

    const data = l[1];
    if (!data) return;

    const partes = String(data).split('/');

    if (partes.length !== 3) return;

    const mesRow = Number(partes[1]);
    const anoRow = Number(partes[2]);

    if (mesRow !== mes || anoRow !== ano) return;

    const conta = String(l[5]).trim();
    const valor = parseValorBR_backend(l[7]);

    resumo[conta] = (resumo[conta] || 0) + valor;

  });

  return {
    ok:true,
    contas: resumo
  };

}

/* ======================================================================
 *  LANÇAMENTOS FUTUROS
 * ====================================================================== */
/* ======================================================================
 *  RETORNA APENAS OS LANÇAMENTOS FUTUROS DO USUÁRIO LOGADO
 * ====================================================================== */
function getLancamentosFuturos(d) {

  const usuario = String(d.usuario || '').trim();

  if (!usuario) {
    return {
      ok: false,
      msg: 'Usuário não informado.'
    };
  }

  const dados = sheet(SHEET_FUTURE)
    .getDataRange()
    .getValues()
    .slice(1);

  const lancamentos = filtrarRegistrosUsuario(dados, usuario);

  return {
    ok: true,
    lancamentos: lancamentos
  };

}

function addLancamentoFuturo(d){

  Logger.log('VALOR RECEBIDO NO BACKEND (addLancamento): ' + d.valor);
  const shA = sheet(SHEET_ENTRIES);
  const shF = sheet(SHEET_FUTURE);

  let maxId = 0;
  [shA, shF].forEach(sh => {
    sh.getDataRange().getValues().slice(1)
      .forEach(l => maxId = Math.max(maxId, Number(l[0]) || 0));
  });

  shF.appendRow([
    maxId + 1,
    d.data,
    d.tipo,
    d.categoria,
    d.subcategoria,
    d.conta,
    d.pagamento || '',
    normalizarValorBackend(d.valor),
    d.descricao || '',
    d.usuario || '',
    'ABERTO'
  ]);

  return { ok: true, id: maxId + 1 };
}

function updateLancamentoFuturo(d){
  const sh = sheet(SHEET_FUTURE);
  const dados = sh.getDataRange().getValues();

  for (let i = 1; i < dados.length; i++) {
    if (String(dados[i][0]) === String(d.id)) {
      sh.getRange(i + 1, 2, 1, 9).setValues([[
        d.data,
        d.tipo,
        d.categoria,
        d.subcategoria,
        d.conta,
        d.pagamento || '',
        normalizarValorBackend(d.valor),
        d.descricao || '',
        d.usuario || ''
      ]]);
      break;
    }
  }
  return { ok: true };
}

function deleteLancamentoFuturo(d){
  const sh = sheet(SHEET_FUTURE);
  const dados = sh.getDataRange().getValues();

  for(let i=1;i<dados.length;i++){
    if(String(dados[i][0]) === String(d.id)){
      sh.deleteRow(i+1);
      break;
    }
  }
  return { ok:true };
}

function confirmarLancamentoFuturo(d) {
  const shF = sheet(SHEET_FUTURE);
  const shA = sheet(SHEET_ENTRIES);

  const dadosF = shF.getDataRange().getValues();
  const dadosA = shA.getDataRange().getValues();

  let maxId = 0;
  for (let i = 1; i < dadosA.length; i++) {
    maxId = Math.max(maxId, Number(dadosA[i][0]) || 0);
  }

  for (let i = 1; i < dadosF.length; i++) {
    if (String(dadosF[i][0]) === String(d.id)) {
      const l = dadosF[i];

      shA.appendRow([
        maxId + 1,
        toBRDate(d.data),
        l[2],
        l[3],
        l[4],
        l[5],
        l[6],
        normalizarValorBackend(l[7]),
        l[8] || '',
        l[9] || ''
      ]);

      shF.deleteRow(i + 1);
      break;
    }
  }

  return { ok: true };
}

/* ======================================================================
 *  INTELIGÊNCIA FINANCEIRA
 * ====================================================================== */

function getInteligenciaFinanceira(d){

  const usuario = String(d.usuario || '').trim();

  if(!usuario){

    return {
      ok:false,
      msg:'Usuário não informado.'
    };

  }

  const dados = filtrarRegistrosUsuario(
      sheet(SHEET_ENTRIES)
      .getDataRange()
      .getValues()
      .slice(1),
      usuario
  );

  return{

      ok:true,

      totalLancamentos:dados.length,

      dados

  };

}

/* ======================================================================
 *  COMPARATIVO ENTRE MESES
 * ====================================================================== */

function getComparativoCategorias(d){

  const usuario = String(d.usuario || '').trim();

  if(!usuario){

      return{
          ok:false,
          msg:'Usuário não informado.'
      };

  }

  const dados = filtrarRegistrosUsuario(
      sheet(SHEET_ENTRIES)
      .getDataRange()
      .getValues()
      .slice(1),
      usuario
  );

  return{

      ok:true,

      lancamentos:dados

  };

}

/* ======================================================================
 *  LOGIN – USUÁRIO + SENHA (SIMPLES)
 * ====================================================================== */
function loginUsuario(d){
  const login = (d.login || '').trim();
  const senha = (d.senha || '').trim();

  if(!login || !senha){
    return { ok:false, msg:'Login e senha obrigatórios' };
  }

  const sh = sheet(SHEET_USERS);
  const dados = sh.getDataRange().getValues();

  for(let i = 1; i < dados.length; i++){
    const rowLogin = String(dados[i][1]).trim();
    const rowSenha = String(dados[i][2]).trim();

    if(rowLogin === login && rowSenha === senha){
      return {
        ok: true,
        usuario: {
          id: dados[i][0],
          login: rowLogin,
          nome: dados[i][3],
          perfil: dados[i][4]
        }
      };
    }
  }

  return { ok:false, msg:'Usuário ou senha inválidos' };
}

/* ======================================================================
 *  COMPATIBILIDADE – NORMALIZAR DATA
 * ====================================================================== */
function normalizarDataBR(data){
  if(!data) return '';
  if(data.indexOf('/') !== -1) return data;

  const p = data.split('-');
  if(p.length === 3) return p[2]+'/'+p[1]+'/'+p[0];

  return data;
}

/**
 * Converte o valor armazenado na planilha (String "1.250,00") 
 * para número (Number 1250.00) para cálculos.
 */
function parseValorBR_backend(valor) {
  if (typeof valor === 'number') return valor;
  if (!valor) return 0;
  
  // Remove pontos de milhar e troca vírgula por ponto
  const limpo = String(valor)
    .replace(/\./g, '')
    .replace(',', '.');
  
  const num = parseFloat(limpo);
  return isNaN(num) ? 0 : num;
}

/**
 * VALOR MONETÁRIO – BACKEND (PT-BR DEFINITIVO)
 * REGRA:
 * - Converte para NUMBER com segurança
 * - GRAVA NO SHEETS COMO STRING pt-BR (vírgula decimal)
 * - Elimina bug de multiplicação por locale
 */
function normalizarValorBackend(v) {

  let n;

  if (typeof v === 'number' && Number.isFinite(v)) {
    n = v;
  } 
  else if (typeof v === 'string') {
    n = Number(
      v
        .replace(/\./g, '') // remove milhar
        .replace(',', '.')  // decimal
    );
  }

  if (!Number.isFinite(n)) {
    throw new Error('Valor inválido recebido pelo backend: ' + v);
  }

  // 🔒 FORÇA FORMATO PT-BR PARA O SHEETS
  return Utilities.formatString('%.2f', n).replace('.', ',');
}