  // ======================================================
  // CONFIGURAÇÃO
  // ======================================================
  const API_URL = 'https://script.google.com/macros/s/AKfycbxyWy2M-_m0GxvqBPJKgc2FULcMAs-_IJeC58Rc3kCnEQUBQcAwQKona2NYmsF88EnS/exec'
                  

  // ======================================================
  // SESSÃO
  // ======================================================
  const SESSION_KEY = 'usuarioLogado';
  let usuarioLogado = null;

  // ======================================================
  // ESTADO GLOBAL
  // ======================================================
  let categorias = [];
  let contas = [];
  let pagamentos = [];
  let lancamentos = [];
  let lancamentosFuturos = [];
  let lancamentosFuturosFiltrados = [];

  // ======================================================
  // FILTROS – LANÇAMENTOS FUTUROS
  // ======================================================
  let filtrosFuturos = {
    mes: '',
    ano: '',
    conta: ''
  };

  // ======================================================
  // PROJEÇÃO DE SALDO (v1.1.0)
  // ======================================================
  let projecaoSaldo = {

    modo: 'todos',

    mesesSelecionados: []

  };


  // ======================================================
  // HELPERS GERAIS
  // ======================================================
  function getUsuarioLogado() {
    const u = localStorage.getItem(SESSION_KEY);
    return u ? JSON.parse(u) : null;
  }

  async function post(action, payload = {}) {

    const user = getUsuarioLogado();

    // Adiciona automaticamente o usuário em todas as requisições,
    // exceto no login.
    if (action !== 'login' && user && !payload.usuario) {
      payload.usuario = user.login;
    }

    try {

      const res = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          action,
          ...payload
        })
      });

      return await res.json();

    } catch (err) {

      const params = new URLSearchParams({
        action,
        ...payload
      }).toString();

      const res = await fetch(`${API_URL}?${params}`);

      return await res.json();

    }

  }

  function formatMoney(v) {
    return Number(v || 0).toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    });
  }

  function parseValorBR(v) {

    if (typeof v === 'number' && Number.isFinite(v)) {
      return v;
    }

    if (!v) return 0;

    let s = String(v).trim();

    // remove tudo que não for número, vírgula ou ponto
    s = s.replace(/[^\d.,]/g, '');

    // se tiver vírgula, assume pt-BR
    if (s.includes(',')) {
      s = s.replace(/\./g, '').replace(',', '.');
    }

    const n = Number(s);

    return Number.isFinite(n) ? n : 0;
  }

  function formatarValorBR(v) {
    const n = parseValorBR(v);

    return n.toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  function mesIndex(data) {
    const d = new Date(data);
    return new Date(
      d.getUTCFullYear(),
      d.getUTCMonth(),
      d.getUTCDate()
    ).getMonth();
  }

  function formatarDataBR(dataISO) {
    if (!dataISO) return '';
    const d = new Date(dataISO);
    return d.toLocaleDateString('pt-BR');
  }

  // ======================================================
  // INIT GERAL + LOGIN
  // ======================================================
  document.addEventListener('DOMContentLoaded', () => {

    configurarLogin();

    // Botão Sair
    document
      .getElementById('btnLogout')
      ?.addEventListener('click', logout);

    verificarSessao();

  });

  // ---------------- LOGIN ----------------
  function configurarLogin() {
    const form = document.getElementById('loginForm');
    if (!form) return;

    form.addEventListener('submit', async e => {
      e.preventDefault();

      const login = document.getElementById('login').value;
      const senha = document.getElementById('senha').value;
      const erro  = document.getElementById('loginError');

      erro.classList.add('hidden');

      try {
        const res = await post('login', { login, senha });

        if (!res.ok) {
          erro.innerText = res.erro || 'Usuário ou senha inválidos';
          erro.classList.remove('hidden');
          return;
        }

        const user = res.usuario;

        localStorage.setItem(SESSION_KEY, JSON.stringify({
          id: user.id,
          login: user.login,
          nome: user.nome,
          perfil: user.perfil
        }));

        usuarioLogado = user.login;
        iniciarApp();


      } catch (err) {
        erro.innerText = 'Erro ao conectar com o servidor';
        erro.classList.remove('hidden');
      }
    });
  }

  // ======================================================
  // INIT DO SISTEMA (OBRIGATÓRIO)
  // ======================================================
  async function iniciarSistema() {
    atualizarPeriodoAtual();

    await carregarCategorias();
    await carregarContas();
    renderTabelaContas();
    await carregarPagamentos();
    await carregarLancamentos();
    await carregarLancamentosFuturos();

    inicializarFiltrosLancamentosFuturos();
    configurarFormulario();
    inicializarFormularioNovaDespesa();

    renderResumo();

    renderDashboard();

    renderResumoGeral();

    renderLancamentosFuturos();



    // ==================================================
    // DRE – INICIALIZAÇÃO CORRETA
    // ==================================================
    inicializarFiltrosDRE();
    atualizarDRE();

    ['dreAno', 'dreMeses', 'dreTipo', 'dreVisao', 'dreAnalise']
    .forEach(id => {
      const el = document.getElementById(id);
      if (el) el.onchange = atualizarDRE;
    });
  }

  function inicializarFiltrosLancamentosFuturos() {
    const selMes = document.getElementById('filtroMesFuturo');
    const selAno = document.getElementById('filtroAnoFuturo');
    const selConta = document.getElementById('filtroContaFuturo');
    const btnLimpar = document.getElementById('btnLimparFiltrosFuturo');

    if (!selMes || !selAno || !selConta || !btnLimpar) return;

    // ANOS
    const anoAtual = new Date().getFullYear();
    selAno.innerHTML = '<option value="">Todos</option>';
    for (let a = anoAtual - 1; a <= anoAtual + 10; a++) {
      selAno.innerHTML += `<option value="${a}">${a}</option>`;
    }

    // CONTAS
    selConta.innerHTML = '<option value="">Todas</option>';
    contas.forEach(c => {
      selConta.innerHTML += `<option value="${c.nome}">${c.nome}</option>`;
    });

    // EVENTOS
    selMes.onchange = () => {
      filtrosFuturos.mes = selMes.value;
      aplicarFiltrosLancamentosFuturos();
    };

    selAno.onchange = () => {
      filtrosFuturos.ano = selAno.value;
      aplicarFiltrosLancamentosFuturos();
    };

    selConta.onchange = () => {
      filtrosFuturos.conta = selConta.value;
      aplicarFiltrosLancamentosFuturos();
    };

    btnLimpar.onclick = () => {
      filtrosFuturos = { mes: '', ano: '', conta: '' };
      selMes.value = '';
      selAno.value = '';
      selConta.value = '';

      lancamentosFuturosFiltrados = [];
      controlarBotaoPagarTudo();
      renderLancamentosFuturos(lancamentosFuturos);
    };
  }

  // ---------------- SESSÃO ----------------
  function verificarSessao() {
    const user = getUsuarioLogado();
    if (user) {
      usuarioLogado = user.login;
      iniciarApp();
    } else {
      mostrarLogin();
    }
  }

  function mostrarLogin() {
    document.getElementById('login-screen')?.classList.remove('hidden');
    document.getElementById('app')?.classList.add('hidden');
  }

  // ======================================================
  // LOGOUT
  // ======================================================
  async function logout() {

    localStorage.removeItem(SESSION_KEY);

    usuarioLogado = null;

    categorias = [];
    contas = [];
    pagamentos = [];
    lancamentos = [];
    lancamentosFuturos = [];
    lancamentosFuturosFiltrados = [];

    document.getElementById('loginForm')?.reset();

    mostrarLogin();

    location.reload();

  }

  function iniciarApp() {
    document.getElementById('login-screen')?.classList.add('hidden');
    document.getElementById('app')?.classList.remove('hidden');
    iniciarSistema();
  }

  // ======================================================
  // PERÍODO
  // ======================================================
  function atualizarPeriodoAtual() {
    const el = document.getElementById('periodoAtual');
    if (!el) return;

    const hoje = new Date();
    el.innerText = hoje.toLocaleDateString('pt-BR', {
      month: 'long',
      year: 'numeric'
    });
  }

  // ======================================================
  // CATEGORIAS
  // ======================================================
  async function carregarCategorias() {
    const res = await post('getCategorias');
    categorias = res.categorias || [];
  }

  // ======================================================
  // CONTAS
  // ======================================================
  async function carregarContas() {
    const user = getUsuarioLogado();
    if (!user) return;

    const res = await post('getContas', {
      usuario: user.login
    });

    contas = res.contas || [];

    const selectConta = document.getElementById('conta');
    if (!selectConta) return;

    selectConta.innerHTML = '<option value="">Selecione</option>';

    contas
      .filter(c => c.ativo === 'SIM')
      .forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.nome;
        opt.textContent = c.nome;
        selectConta.appendChild(opt);
      });
  }

  // ======================================================
  // CONTAS – TABELA (ABA CONTAS)
  // ======================================================
  function renderTabelaContas() {
    const tbody = document.querySelector('#tabelaContas tbody');
    if (!tbody) return;

    tbody.innerHTML = '';

    if (!contas.length) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align:center;opacity:.6">
            Nenhuma conta cadastrada
          </td>
        </tr>
      `;
      return;
    }

    contas.forEach(conta => {
      const tr = document.createElement('tr');

      tr.innerHTML = `
        <td>${conta.nome}</td>
        <td>${conta.ativo === 'SIM' ? '✔️' : '❌'}</td>
        <td>${conta.bandeira || '-'}</td>
        <td>${conta.skin || '-'}</td>
        <td>${conta.mostrarResumo === 'SIM' ? '✔️' : '❌'}</td>
        <td>${conta.ordem ?? ''}</td>
        <td>
          <button class="btn-editar">Editar</button>
        </td>
      `;

      // 🔥 EDITAR FUNCIONANDO
      tr.querySelector('.btn-editar').onclick = () => {
        abrirModalEditarConta(conta);
      };

      // Opcional: visual de inativo
      if (conta.ativo === 'NAO') {
        tr.style.opacity = '0.5';
      }

      tbody.appendChild(tr);
    });
  }

  // ======================================================
  // PAGAMENTOS
  // ======================================================
  async function carregarPagamentos() {
    const res = await post('getPagamentos');
    pagamentos = res.pagamentos || [];

    const selectPagamento = document.getElementById('pagamento');
    if (!selectPagamento) return;

    selectPagamento.innerHTML = '<option value="">Selecione</option>';

    pagamentos.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.nome;
      opt.textContent = p.nome;
      selectPagamento.appendChild(opt);
    });
  }

  // ======================================================
  // LANÇAMENTOS ATUAIS
  // ======================================================
  async function carregarLancamentos() {

    const user = getUsuarioLogado();

    if (!user) {
      lancamentos = [];
      return;
    }

    const res = await post('getLancamentos', {
      usuario: user.login
    });

    if (!res.ok) {
      lancamentos = [];
      console.error(res.msg);
      return;
    }

    lancamentos = res.lancamentos || [];

  }

  // ======================================================
  // LANÇAMENTOS FUTUROS
  // ======================================================
  async function carregarLancamentosFuturos() {

    const user = getUsuarioLogado();

    if (!user) {
      lancamentosFuturos = [];
      return;
    }

    const res = await post('getLancamentosFuturos', {
      usuario: user.login
    });

    if (!res.ok) {
      lancamentosFuturos = [];
      console.error(res.msg);
      return;
    }

    lancamentosFuturos = res.lancamentos || [];

  }

  // ======================================================
  // CARDS – FUNÇÃO BASE
  // ======================================================
  function criarCard(conta, descricao, valor, extraClasse = '') {
    const div = document.createElement('div');

    div.className = `cartao ${conta.skin} ${extraClasse}`;

    div.innerHTML = `
      <div class="chip"></div>

      <div class="cartao-topo">${descricao}</div>

      <div class="cartao-fatura">${formatMoney(valor)}</div>

      <div class="cartao-footer">
        <span>${conta.nome}</span>
        <span class="bandeira">${conta.bandeira}</span>
      </div>
    `;

    return div;
  }

  // ======================================================
  // LIMPA COLUNAS DE CARDS (OBRIGATÓRIO)
  // ======================================================
  function limparColunas() {
    [
      'cards-debito',
      'cards-credito',
      'cards-pix-entrada',
      'cards-pix-saida'
    ].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = '';
    });
  }

  // ======================================================
  // RESUMO ATUAL (POR CONTA × PAGAMENTO) – CORRIGIDO
  // ======================================================
  function renderResumo() {
    limparColunas();

    contas
      .filter(c => c.ativo === 'SIM')          // 👈 ESSENCIAL
      .filter(c => c.mostrarResumo === 'SIM')
      .sort((a, b) => Number(a.ordem) - Number(b.ordem))
      .forEach(conta => {

        const nomeConta = conta.nome;
        const skin = conta.skin || 'padrao';
        const bandeira = conta.bandeira || 'VISA';

        // =========================
        // DÉBITO
        // =========================
        const debito = lancamentos
          .filter(l =>
            l[2] === 'SAIDA' &&
            l[5] === nomeConta &&
            l[6] === 'Débito'
          )
          .reduce((s, l) => s + parseValorBR(l[7]), 0);

        document.getElementById('cards-debito')
          ?.appendChild(
            criarCard(
              { nome: nomeConta, skin, bandeira },
              'Débito',
              debito
            )
          );

        // =========================
        // CRÉDITO
        // =========================
        const credito = lancamentos
          .filter(l =>
            l[2] === 'SAIDA' &&
            l[5] === nomeConta &&
            l[6] === 'Crédito'
          )
          .reduce((s, l) => s + parseValorBR(l[7]), 0);

        document.getElementById('cards-credito')
          ?.appendChild(
            criarCard(
              { nome: nomeConta, skin, bandeira },
              'Crédito',
              credito
            )
          );

        // =========================
        // PIX / TED – ENTRADA
        // =========================
        const pixEntrada = lancamentos
          .filter(l =>
            l[2] === 'ENTRADA' &&
            l[5] === nomeConta &&
            (l[6] === 'Pix' || l[6] === 'TED')
          )
          .reduce((s, l) => s + parseValorBR(l[7]), 0);

        document.getElementById('cards-pix-entrada')
          ?.appendChild(
            criarCard(
              { nome: nomeConta, skin, bandeira },
              'Pix / TED Recebido',
              pixEntrada,
              'pix-entrada'
            )
          );

        // =========================
        // PIX / TED – SAÍDA
        // =========================
        const pixSaida = lancamentos
          .filter(l =>
            l[2] === 'SAIDA' &&
            l[5] === nomeConta &&
            (l[6] === 'Pix' || l[6] === 'TED')
          )
          .reduce((s, l) => s + parseValorBR(l[7]), 0);

        document.getElementById('cards-pix-saida')
          ?.appendChild(
            criarCard(
              { nome: nomeConta, skin, bandeira },
              'Pix / TED Pago',
              pixSaida,
              'pix-saida'
            )
          );
      });

      // Atualiza Dashboard
      if (document.getElementById('dashboardCards')) {
          renderDashboard();
      }
            
      // Atualiza também o Resumo Geral
      if (document.getElementById('cards-resumo-geral')) {
          renderResumoGeral();
      }

  }

  // ======================================================
  // DASHBOARD - ÚLTIMOS LANÇAMENTOS
  // ======================================================
  function renderDashboardUltimosLancamentos() {

    // Durante a refatoração, os últimos lançamentos
    // passam a ser exibidos no Resumo Geral.

    const container =
        document.getElementById("resumoUltimos");

    if (!container) return;

    container.innerHTML = "";

    const lancamentos = [...dadosLancamentos]
        .sort((a, b) =>
            new Date(b.data) - new Date(a.data)
        )
        .slice(0, 10);

    if (!lancamentos.length) {

        container.innerHTML = `
            <div class="sem-registros">
                Nenhum lançamento encontrado.
            </div>
        `;

        return;
    }

    lancamentos.forEach(item => {

        const div = document.createElement("div");

        div.className =
            `dashboard-item ${item.tipo}`;

        div.innerHTML = `

            <div>

                <div class="descricao">
                    ${item.descricao}
                </div>

                <div class="categoria">
                    ${item.categoria}
                </div>

            </div>

            <div class="valor">

                ${formatarMoeda(item.valor)}

            </div>

        `;

        container.appendChild(div);

    });

}

  // ======================================================
  // LANÇAMENTOS FUTUROS – RENDER (ENTRADA + SAÍDA)
  // ======================================================
  function aplicarFiltrosLancamentosFuturos() {
    lancamentosFuturosFiltrados = lancamentosFuturos.filter(l => {

      const data = new Date(formatarDataISO(l[1]));
      const mes = data.getMonth();
      const ano = data.getFullYear();

      if (filtrosFuturos.mes !== '' && Number(filtrosFuturos.mes) !== mes) {
        return false;
      }

      if (filtrosFuturos.ano !== '' && Number(filtrosFuturos.ano) !== ano) {
        return false;
      }

      if (filtrosFuturos.conta !== '' && l[5] !== filtrosFuturos.conta) {
        return false;
      }

      return true;
    });

    controlarBotaoPagarTudo();
    renderLancamentosFuturos(lancamentosFuturosFiltrados);
  }

  // ======================================================
  // LANÇAMENTOS FUTUROS – RENDER (COM FILTRO)
  function renderLancamentosFuturos(lista = lancamentosFuturos) {
    const tbody = document.querySelector('#tabelaLancamentosFuturos tbody');
  const tfoot = document.querySelector('#tabelaLancamentosFuturos tfoot');
    if (!tbody) return;

    tbody.innerHTML = '';
    tfoot.innerHTML = '';

    if (!lista.length) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" style="text-align:center;opacity:.6">
            Nenhum lançamento futuro
          </td>
        </tr>`;
      return;
    }

    let totalSaidas = 0;
    let totalEntradas = 0;

    lista
      .sort((a, b) => new Date(formatarDataISO(a[1])) - new Date(formatarDataISO(b[1])))
      .forEach(l => {

        const tipo = l[2];
        const valor = parseValorBR(l[7]);

        if (tipo === 'ENTRADA') totalEntradas += valor;
        else totalSaidas += valor;

        const acaoLabel = 'Consolidar';

        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${formatarDataBR(l[1])}</td>
          <td>${l[3]}</td>
          <td>${l[5]}</td>
          <td>${formatMoney(valor)}</td>
          <td>
            <button class="btn-pagar btn-acao btn-consolidar">${acaoLabel}</button>
            <button class="btn-editar btn-acao">Editar</button>
            <button class="btn-excluir btn-acao">Excluir</button>
          </td>
        `;

        // ✅ PAGAR / RECEBER
        tr.querySelector('.btn-pagar').onclick = async () => {
          const msg = tipo === 'ENTRADA'
            ? 'Confirmar recebimento deste valor?'
            : 'Confirmar pagamento deste lançamento?';

          if (!confirm(msg)) return;

          const dataPagamento = new Date().toISOString().split('T')[0];

          await post('confirmarLancamentoFuturo', {
            id: l[0],
            data: dataPagamento
          });

          // 🔥 REMOVE IMEDIATAMENTE DO FRONT
          lancamentosFuturos = lancamentosFuturos.filter(f => f[0] !== l[0]);

          // 🔁 Recarrega lançamentos reais
          await carregarLancamentos();

          // Atualiza telas
          renderResumo();
          lancamentosFuturosFiltrados = [];
          controlarBotaoPagarTudo();
          aplicarFiltrosLancamentosFuturos();

          // Atualiza período visual
          const d = new Date(dataPagamento);
          const el = document.getElementById('periodoAtual');
          if (el) {
            el.innerText = d.toLocaleDateString('pt-BR', {
              month: 'long',
              year: 'numeric'
            });
          }
        };

        tr.querySelector('.btn-editar').onclick = () =>
          abrirModalEdicaoPadrao(l, 'updateLancamentoFuturo');

        tr.querySelector('.btn-excluir').onclick = async () => {
          if (!confirm('Deseja excluir este lançamento futuro?')) return;

          await post('deleteLancamentoFuturo', { id: l[0] });

          lancamentosFuturos = lancamentosFuturos.filter(f => f[0] !== l[0]);
          renderLancamentosFuturos();
        };

        tbody.appendChild(tr);
      });

    const trTotal = document.createElement('tr');
    tfoot.innerHTML = `
    <tr>

        <th colspan="3">
            Totais
        </th>

        <th>
            <div style="color:green">
                ${formatMoney(totalEntradas)}
            </div>

            <div style="color:red">
                ${formatMoney(totalSaidas)}
            </div>
        </th>

        <th></th>

    </tr>
    `;
  }

  // ======================================================
  // FORM – NOVA DESPESA (SEM BUG)
  // ======================================================
  function configurarFormulario() {
    const selTipo = document.getElementById('tipo');
    const selCategoria = document.getElementById('categoria');
    const selSub = document.getElementById('subcategoria');
    const selPagamento = document.getElementById('pagamento');
    const chkParcelado = document.getElementById('parcelado');
    const campoParcelamento = document.getElementById('campoParcelamento');
    const form = document.getElementById('formLancamento');

    if (!selTipo || !selCategoria || !selSub || !form) return;

    function atualizarParcelamento() {
      const permitido =
        selTipo.value === 'SAIDA' &&
        selPagamento.value === 'Crédito' &&
        chkParcelado.checked;

      campoParcelamento.classList.toggle('hidden', !permitido);

      if (!permitido) {
        document.getElementById('qtdParcelas').value = '';
        document.getElementById('valorParcela').value = '';
      }
    }

    selTipo.onchange = () => {
      preencherCategorias(selTipo.value);
      atualizarParcelamento();

      if (selCategoria.options.length > 0) {
        selCategoria.selectedIndex = 0;
        preencherSubcategorias(selTipo.value, selCategoria.value);
      }
    };

    selCategoria.onchange = () => {
      preencherSubcategorias(selTipo.value, selCategoria.value);
    };

    selPagamento.onchange = atualizarParcelamento;
    chkParcelado.onchange = atualizarParcelamento;

    form.onsubmit = salvarLancamento;
  }

  function inicializarFormularioNovaDespesa() {
    const selTipo = document.getElementById('tipo');
    const selCategoria = document.getElementById('categoria');

    if (!selTipo || !selCategoria) return;
    if (!categorias.length) return;

    preencherCategorias(selTipo.value);

    if (selCategoria.options.length > 0) {
      selCategoria.selectedIndex = 0;
      preencherSubcategorias(selTipo.value, selCategoria.value);
    }
  }

  function preencherCategorias(tipo) {
    const selCategoria = document.getElementById('categoria');
    if (!selCategoria) return;

    selCategoria.innerHTML = '';
    [...new Set(categorias.filter(c => c.tipo === tipo).map(c => c.categoria))]
      .forEach(c => selCategoria.innerHTML += `<option>${c}</option>`);
  }

  function preencherSubcategorias(tipo, categoria) {
    const selSub = document.getElementById('subcategoria');
    if (!selSub) return;

    selSub.innerHTML = '';
    categorias
      .filter(c => c.tipo === tipo && c.categoria === categoria)
      .forEach(c => selSub.innerHTML += `<option>${c.subcategoria}</option>`);
  }

  // ======================================================
  // FORM – SALVAR LANÇAMENTO (VALOR 100% BLINDADO)
  // ======================================================
  async function salvarLancamento(e) {
    e.preventDefault();

    const user = getUsuarioLogado();
    if (!user) {
      alert('Sessão expirada. Faça login novamente.');
      mostrarLogin();
      return;
    }

    const tipo       = document.getElementById('tipo').value;
    const pagamento  = document.getElementById('pagamento').value;
    const parcelado  = document.getElementById('parcelado').checked;
    const isFuturo   = document.getElementById('chk-futuro')?.checked;

    try {
      // ==================================================
      // PARCELAMENTO (CRÉDITO)
      // ==================================================
      if (parcelado && tipo === 'SAIDA' && pagamento === 'Crédito') {

        const qtdParcelas = Number(
          document.getElementById('qtdParcelas').value
        );

        const valorParcelaStr = document
          .getElementById('valorParcela')
          .value
          .trim();

        if (!qtdParcelas || qtdParcelas < 2) {
          alert('Informe a quantidade de parcelas.');
          return;
        }

        if (!valorParcelaStr) {
          alert('Informe o valor da parcela.');
          return;
        }

        const dataBase = new Date(
          document.getElementById('data').value
        );

        for (let i = 0; i < qtdParcelas; i++) {
          const d = new Date(dataBase);
          d.setMonth(d.getMonth() + i);

          await post('addLancamentoFuturo', {
            tipo: 'SAIDA',
            categoria: document.getElementById('categoria').value,
            subcategoria: document.getElementById('subcategoria').value,
            conta: document.getElementById('conta').value,
            pagamento: 'Crédito',
            valor: valorParcelaStr, // ✅ STRING "99,99"
            data: d.toISOString().split('T')[0],
            descricao:
              `${document.getElementById('descricao').value || ''} (${i + 1}/${qtdParcelas})`,
            usuario: user.login
          });
        }

      } else {
        // ==================================================
        // LANÇAMENTO NORMAL / FUTURO
        // ==================================================
        const valorStr = document
          .getElementById('valor')
          .value
          .trim();

        if (!valorStr) {
          alert('Informe um valor.');
          return;
        }

        await post(
          isFuturo ? 'addLancamentoFuturo' : 'addLancamento',
          {
            tipo,
            categoria: document.getElementById('categoria').value,
            subcategoria: document.getElementById('subcategoria').value,
            conta: document.getElementById('conta').value,
            pagamento,
            valor: valorStr, // ✅ STRING "99,99"
            data: document.getElementById('data').value,
            descricao: document.getElementById('descricao').value,
            usuario: user.login
          }
        );
      }

      // ==================================================
      // PÓS-SUCESSO
      // ==================================================
      e.target.reset();

      await carregarLancamentos();
      await carregarLancamentosFuturos();

      renderResumo();
      renderLancamentosFuturos();

    } catch (err) {
      alert(err.message || 'Erro ao salvar lançamento.');
    }
  }

  // ======================================================
  // RESUMO GERAL (ABA NOVA)
  // ======================================================

  // Calcula os totais gerais (CORRIGIDO)
  function calcularResumoGeral() {

    // ===============================
    // SALDO ATUAL
    // ===============================
    const entradas = lancamentos
      .filter(l => l[2] === 'ENTRADA')
      .reduce((s, l) => s + parseValorBR(l[7]), 0);

    const saidas = lancamentos
      .filter(l => l[2] === 'SAIDA')
      .reduce((s, l) => s + parseValorBR(l[7]), 0);

    const saldoAtual = entradas - saidas;

  // ===================================================
  // FILTRA LANÇAMENTOS FUTUROS
  // ===================================================

    const futuros = obterLancamentosProjetados();

      // ===============================
      // FUTUROS
      // ===============================
      let entradasFuturas = 0;
      let saidasFuturas = 0;

      const gruposCredito = {};

      futuros.forEach(l => {

        const tipo = l[2];
        const pagamento = l[6];
        const valor = parseValorBR(l[7]);
        const descricao = (l[8] || '').trim();
        const conta = l[5];
        const fatura = l[11];

        // ENTRADAS
        if (tipo === 'ENTRADA') {
          entradasFuturas += valor;
          return;
        }

        // SAÍDAS NÃO CRÉDITO
        if (tipo === 'SAIDA' && pagamento !== 'Crédito') {
          saidasFuturas += valor;
          return;
        }

        // CRÉDITO
        if (tipo === 'SAIDA' && pagamento === 'Crédito') {

          const chave = `${conta}||${descricao}`;

          if (!gruposCredito[chave]) {
            gruposCredito[chave] = [];
          }

          gruposCredito[chave].push({
            valor,
            fatura
          });

        }

      });

    // ===================================================
    // FATURA ÚNICA × PARCELAMENTO
    // ===================================================

    Object.values(gruposCredito).forEach(grupo => {

      const faturas = [...new Set(grupo.map(g => g.fatura))];

      if (faturas.length === 1) {

        grupo.forEach(g => {

          saidasFuturas += g.valor;

        });

        return;

      }

      const menor = faturas.sort()[0];

      grupo
        .filter(g => g.fatura === menor)
        .forEach(g => {

          saidasFuturas += g.valor;

        });

    });

    const saldoProjetado =
      saldoAtual +
      entradasFuturas -
      saidasFuturas;

    return {

      entradas,

      saidas,

      entradasFuturas,

      saidasFuturas,

      saldoAtual,

      saldoProjetado

    };

  }

  // ======================================================
  // PROJEÇÃO - LANÇAMENTOS FUTUROS
  // ======================================================
  function obterLancamentosProjetados() {

      if (projecaoSaldo.modo === "todos") {
          return [...lancamentosFuturos];
      }

      const hoje = new Date();

      const anoAtual = hoje.getFullYear();
      const mesAtual = hoje.getMonth();

      let mesesSelecionados = [];

      switch (projecaoSaldo.modo) {

          case "mes1": {

              const d = new Date(anoAtual, mesAtual + 1, 1);

              mesesSelecionados.push({
                  ano: d.getFullYear(),
                  mes: d.getMonth()
              });

              break;

          }

          case "mes3":

              for (let i = 1; i <= 3; i++) {

                  const d = new Date(anoAtual, mesAtual + i, 1);

                  mesesSelecionados.push({
                      ano: d.getFullYear(),
                      mes: d.getMonth()
                  });

              }

              break;

          case "mes6":

              for (let i = 1; i <= 6; i++) {

                  const d = new Date(anoAtual, mesAtual + i, 1);

                  mesesSelecionados.push({
                      ano: d.getFullYear(),
                      mes: d.getMonth()
                  });

              }

              break;

          case "personalizado":

              mesesSelecionados = projecaoSaldo.mesesSelecionados.map(m => ({
                  ano: anoAtual,
                  mes: Number(m)
              }));

              break;

          default:
              return [...lancamentosFuturos];

      }

      return lancamentosFuturos.filter(l => {

          const data = new Date(formatarDataISO(l[1]));

          return mesesSelecionados.some(m =>
              m.ano === data.getFullYear() &&
              m.mes === data.getMonth()
          );

      });

  }
  // ======================================================
  // HELPERS – MODAL FUTURO
  // ======================================================
  function formatarDataISO(data) {
    if (!data) return '';

    // Já está em ISO
    if (data.includes('-')) return data;

    // Está em BR
    if (data.includes('/')) {
      const [d, m, a] = data.split('/');
      return `${a}-${m}-${d}`;
    }

    return '';
  }

  function preencherSelectCategoriasEdicao(l) {
    const selCat = document.getElementById('edit-categoria');
    const selSub = document.getElementById('edit-subcategoria');

    selCat.innerHTML = '';
    selSub.innerHTML = '';

    const cats = categorias.filter(c => c.tipo === l[2]);

    [...new Set(cats.map(c => c.categoria))].forEach(c => {
      selCat.innerHTML += `<option ${c === l[3] ? 'selected' : ''}>${c}</option>`;
    });

    function carregarSub() {
      selSub.innerHTML = '';
      cats
        .filter(c => c.categoria === selCat.value)
        .forEach(c => {
          selSub.innerHTML += `<option ${c.subcategoria === l[4] ? 'selected' : ''}>${c.subcategoria}</option>`;
        });
    }

    selCat.onchange = carregarSub;
    carregarSub();
  }

  function preencherSelectContasEdicao(l) {
    const sel = document.getElementById('edit-conta');
    sel.innerHTML = '';

    contas.forEach(c => {
      sel.innerHTML += `<option ${c.nome === l[5] ? 'selected' : ''}>${c.nome}</option>`;
    });
  }


  // ======================================================
  // CONTROLE DA PROJEÇÃO DE SALDO
  // ======================================================

  function alterarModoProjecao(modo) {

      projecaoSaldo.modo = modo;

      const painel = document.getElementById("painelMesesProjecao");

      if (modo === "personalizado") {

          painel?.classList.remove("hidden");

          atualizarBotoesProjecao();

          renderResumoGeral();

          return;

      } else {

          painel?.classList.add("hidden");

          projecaoSaldo.mesesSelecionados = [];

          atualizarBotoesProjecao();

          document
              .querySelectorAll(".chk-projecao-mes")
              .forEach(chk => {

                  chk.checked = false;

              });

      }

      atualizarBotoesProjecao();

      renderResumoGeral();

  }

  function atualizarBotoesProjecao() {

      document
          .querySelectorAll(".btn-projecao")
          .forEach(btn => {

              btn.classList.toggle(
                  "ativo",
                  btn.dataset.modo === projecaoSaldo.modo
              );

          });

      document
          .querySelectorAll(".chk-projecao-mes")
          .forEach(chk => {

              chk.checked =
                  projecaoSaldo.mesesSelecionados.includes(
                      Number(chk.value)
                  );

              chk.onchange = aplicarMesesPersonalizados;

          });

  }

  function aplicarMesesPersonalizados() {

      if (projecaoSaldo.modo !== "personalizado") return;

      const selecionados = [];

      document
          .querySelectorAll(".chk-projecao-mes")
          .forEach(chk => {

              if (chk.checked) {

                  selecionados.push(Number(chk.value));

              }

          });

      projecaoSaldo.mesesSelecionados = selecionados;

      renderResumoGeral();

  }

  // ======================================================
  // RENDERIZAÇÃO - RESUMO GERAL
  // ======================================================
  function renderResumoGeral() {

      const container = document.getElementById("cards-resumo-geral");

      if (!container) return;

      const resumo = calcularResumoGeral();

      container.innerHTML = "";

      atualizarBotoesProjecao();

      const cards = [

          {
              titulo: "Saldo Atual",
              valor: resumo.saldoAtual,
              classe: resumo.saldoAtual >= 0 ? "positivo" : "negativo",
              icone: "💰"
          },

          {
              titulo: "Entradas Futuras",
              valor: resumo.entradasFuturas,
              classe: "positivo",
              icone: "📈"
          },

          {
              titulo: "Saídas Futuras",
              valor: resumo.saidasFuturas,
              classe: "negativo",
              icone: "📉"
          },

          {
              titulo: "Saldo Projetado",
              valor: resumo.saldoProjetado,
              classe: resumo.saldoProjetado >= 0 ? "positivo" : "negativo",
              icone: "🎯"
          }

      ];

      cards.forEach(card => {

          const div = document.createElement("div");

          div.className = `card-resumo ${card.classe}`;

          div.innerHTML = `

              <div class="card-resumo-topo">

                  <span class="titulo">
                      ${card.titulo}
                  </span>

                  <span class="icone">
                      ${card.icone}
                  </span>

              </div>

              <div class="valor">

                  ${formatMoney(card.valor)}

              </div>

          `;

          container.appendChild(div);

      });

  }

  // ======================================================
  // SELECT – PAGAMENTOS (EDIÇÃO)
  // ======================================================
  function preencherSelectPagamentosEdicao(l) {
    const sel = document.getElementById('edit-pagamento');
    if (!sel) return;

    sel.innerHTML = '';

    pagamentos.forEach(p => {
      sel.innerHTML += `
        <option ${p.nome === l[6] ? 'selected' : ''}>
          ${p.nome}
        </option>
      `;
    });
  }

  // ======================================================
  // MODAL – EDIÇÃO DE ENTRADA
  // ======================================================
  function abrirModalEditarConta(conta) {
    const modal = document.createElement('div');
    modal.className = 'modal-edicao';

    modal.innerHTML = `
      <div class="modal-overlay"></div>
      <div class="modal-box">
        <h3>Editar Conta</h3>

        <label>Nome</label>
        <input type="text" id="edit-nome" value="${conta.nome}" readonly>

        <label>Ativo</label>
        <select id="edit-ativo">
          <option value="SIM" ${conta.ativo === 'SIM' ? 'selected' : ''}>SIM</option>
          <option value="NAO" ${conta.ativo === 'NAO' ? 'selected' : ''}>NÃO</option>
        </select>

        <label>Bandeira</label>
        <select id="edit-bandeira">
          <option>VISA</option>
          <option>MASTERCARD</option>
          <option>ELO</option>
        </select>

        <label>Skin</label>
        <input type="text" id="edit-skin" value="${conta.skin || ''}">

        <label>Mostrar no Resumo</label>
        <select id="edit-resumo">
          <option value="SIM" ${conta.mostrarResumo === 'SIM' ? 'selected' : ''}>SIM</option>
          <option value="NAO" ${conta.mostrarResumo === 'NAO' ? 'selected' : ''}>NÃO</option>
        </select>

        <label>Ordem</label>
        <input type="number" id="edit-ordem" value="${conta.ordem || 0}">

        <div class="modal-acoes">
          <button id="btn-cancelar">Cancelar</button>
          <button id="btn-salvar">Salvar</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    modal.querySelector('.modal-overlay').onclick =
    modal.querySelector('#btn-cancelar').onclick = () => modal.remove();

    modal.querySelector('#edit-bandeira').value = conta.bandeira;

    modal.querySelector('#btn-salvar').onclick = async () => {
      await post('updateConta', {
        usuario: usuarioLogado,
        conta: conta.nome,
        ativo: document.getElementById('edit-ativo').value,
        mostrarResumo: document.getElementById('edit-resumo').value,
        ordem: document.getElementById('edit-ordem').value
      });

      modal.remove();
      await carregarContas();
      renderTabelaContas();
      renderResumo();
    };
  }

  // ======================================================
  // MODAL PADRÃO – EDIÇÃO DE LANÇAMENTO (VALOR EM R$ CORRETO)
  // ======================================================
  function abrirModalEdicaoPadrao(l, tipoUpdate) {
    const modal = document.createElement('div');
    modal.className = 'modal-edicao';

    modal.innerHTML = `
      <div class="modal-overlay"></div>
      <div class="modal-box">
        <h3>Editar Lançamento</h3>

        <label>Data</label>
        <input type="date" id="edit-data" value="${formatarDataISO(l[1])}">

        <label>Categoria</label>
        <select id="edit-categoria"></select>

        <label>Subcategoria</label>
        <select id="edit-subcategoria"></select>

        <label>Conta</label>
        <select id="edit-conta"></select>

        <label>Forma de Pagamento/Recebimento</label>
        <select id="edit-pagamento"></select>

        <label>Valor</label>
        <input
          type="text"
          id="edit-valor"
          value="${formatarValorBR(l[7])}"
        >

        <label>Descrição</label>
        <input type="text" id="edit-descricao" value="${l[8] || ''}">

        <div class="modal-acoes">
          <button id="btn-cancelar">Cancelar</button>
          <button id="btn-salvar">Salvar</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    modal.querySelector('.modal-overlay').onclick =
    modal.querySelector('#btn-cancelar').onclick = () => modal.remove();

    preencherSelectCategoriasEdicao(l);
    preencherSelectContasEdicao(l);
    preencherSelectPagamentosEdicao(l);

    modal.querySelector('#btn-salvar').onclick = async () => {
      try {
        const valorStr = document
          .getElementById('edit-valor')
          .value
          .trim();

        if (!valorStr) {
          alert('Informe um valor válido.');
          return;
        }

        await post(tipoUpdate, {
          id: l[0],
          data: document.getElementById('edit-data').value,
          tipo: l[2],
          categoria: document.getElementById('edit-categoria').value,
          subcategoria: document.getElementById('edit-subcategoria').value,
          conta: document.getElementById('edit-conta').value,
          pagamento: document.getElementById('edit-pagamento').value,
          valor: valorStr, // ✅ STRING "99,99"
          descricao: document.getElementById('edit-descricao').value,
          usuario: usuarioLogado
        });

        modal.remove();

        await carregarLancamentos();
        await carregarLancamentosFuturos();

        renderResumo();
        renderLancamentosFuturos();

      } catch (err) {
        alert(err.message || 'Erro ao salvar edição.');
      }
    };
  }

  // ======================================================
  // BOTÃO PAGAR TUDO – CONTROLE
  // ======================================================
  function controlarBotaoPagarTudo() {
    const btn = document.getElementById('btnPagarTudo');
    if (!btn) return;

    const filtroAtivo =
      filtrosFuturos.mes !== '' ||
      filtrosFuturos.ano !== '' ||
      filtrosFuturos.conta !== '';

    btn.disabled = !filtroAtivo || lancamentosFuturosFiltrados.length === 0;
  }

  // ======================================================
  // PAGAR TODOS OS LANÇAMENTOS FILTRADOS
  // ======================================================
  document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('btnPagarTudo');
    if (!btn) return;

    btn.onclick = async () => {

      if (!lancamentosFuturosFiltrados.length) return;

      const confirmacao = confirm(
        `Confirmar pagamento de ${lancamentosFuturosFiltrados.length} lançamentos filtrados?`
      );

      if (!confirmacao) return;

      // ✅ DATA LOCAL (SEM UTC)
      const hoje = new Date();
      const dataPagamento = hoje.toLocaleDateString('en-CA');

      // ⚠️ processa um por um, mantendo regra atual
      for (const l of [...lancamentosFuturosFiltrados]) {
        await post('confirmarLancamentoFuturo', {
          id: l[0],
          data: dataPagamento
        });

        lancamentosFuturos = lancamentosFuturos.filter(f => f[0] !== l[0]);
      }

      // ✅ LIMPEZA FINAL (AQUI É O LUGAR CERTO)
      lancamentosFuturosFiltrados = [];
      controlarBotaoPagarTudo();

      // 🔁 Recarrega lançamentos reais
      await carregarLancamentos();

      // 🔄 Reaplica filtros
      aplicarFiltrosLancamentosFuturos();

      // 🔄 Atualiza telas
      renderResumo();

      // 🔄 Atualiza período visual
      const el = document.getElementById('periodoAtual');
      if (el) {
        const d = new Date(dataPagamento);
        el.innerText = d.toLocaleDateString('pt-BR', {
          month: 'long',
          year: 'numeric'
        });
      }
    };
  });

  // ======================================================
  // MENU LATERAL + NAVEGAÇÃO ENTRE ABAS (FINAL / CORRETO)
  // ======================================================
  document.addEventListener('DOMContentLoaded', () => {

    const btnMenu     = document.getElementById('btnMenu');
    const sideMenu    = document.getElementById('sideMenu');
    const menuOverlay = document.getElementById('menuOverlay');

    const links = document.querySelectorAll('.side-link');
    const abas  = document.querySelectorAll('.tab-content');

    if (!btnMenu || !sideMenu || !menuOverlay) return;

    // ---------------- ABRIR MENU ----------------
    btnMenu.addEventListener('click', () => {
      sideMenu.classList.add('open');
      menuOverlay.classList.remove('hidden');
    });

    // ---------------- FECHAR MENU ----------------
    menuOverlay.addEventListener('click', () => {
      sideMenu.classList.remove('open');
      menuOverlay.classList.add('hidden');
    });

    // ---------------- NAVEGAÇÃO ENTRE ABAS ----------------
    links.forEach(link => {
      link.addEventListener('click', () => {

        const alvo = link.dataset.tab;
        if (!alvo) return;

        // remove estados
        links.forEach(l => l.classList.remove('active'));
        abas.forEach(a => a.classList.remove('active'));

        // ativa selecionado
        link.classList.add('active');
        const abaAtiva = document.getElementById(`tab-${alvo}`);
        if (abaAtiva) abaAtiva.classList.add('active');

        // fecha menu após clique (mobile)
        sideMenu.classList.remove('open');
        menuOverlay.classList.add('hidden');

        // gancho especial
        if (alvo === 'resumo-geral') {
          renderResumoGeral();
        }

        if (alvo === "inteligencia") {

            inicializarFiltrosIF();

            renderInteligenciaFinanceira();

        }

        if (alvo === 'historico') {
          carregarLancamentos().then(renderHistoricoLancamentos);
        }
        
      });
    });

  });

  // ======================================================
  // DRE – IMPLEMENTAÇÃO ISOLADA E SEGURA
  // ======================================================

  // ---------- FILTRO DE MESES ----------
  function inicializarFiltrosDRE() {

    const btn  = document.getElementById('dreMesBtn');
    const menu = document.getElementById('dreMesMenu');
    const selAno = document.getElementById('dreAno');

    if (!btn || !menu || !selAno) return;

    // ---------- ANOS ----------
    const anoAtual = new Date().getFullYear();
    selAno.innerHTML = '';
    for (let a = anoAtual - 2; a <= anoAtual + 2; a++) {
      selAno.innerHTML += `<option value="${a}">${a}</option>`;
    }
    selAno.value = anoAtual;

    // ---------- ANOS/MESES ----------
    const meses = [
      'Janeiro','Fevereiro','Março','Abril',
      'Maio','Junho','Julho','Agosto',
      'Setembro','Outubro','Novembro','Dezembro'
    ];

    menu.innerHTML = meses.map((m, i) => `
      <label>
        <input type="checkbox" value="${i}" checked>
        ${m}
      </label>
    `).join('');

    // ---------- DROPDOWN ----------
    btn.onclick = e => {
      e.stopPropagation();
      menu.classList.toggle('hidden');
    };

    // 🔒 IMPEDIR FECHAMENTO AO CLICAR DENTRO DO MENU
    menu.onclick = e => {
      e.stopPropagation();
    };

    // 🔒 FECHAR SOMENTE AO CLICAR FORA
    document.addEventListener('click', () => {
      menu.classList.add('hidden');
    });


    // ---------- EVENTOS ----------
    menu.querySelectorAll('input').forEach(chk => {
      chk.onchange = atualizarDRE;
    });

    selAno.onchange = atualizarDRE;
  }

  // ---------- CORE ----------
  function gerarDRECore({ lancamentos, visao, tipo, ano, mesesSelecionados }) {

    const meses = [...mesesSelecionados].sort((a, b) => a - b);
    const mapa = {};

    // ===============================
    // 1. DEFINE TODAS AS CHAVES
    // ===============================
    const chaves = new Set();

    lancamentos.forEach(l => {
      const d = new Date(formatarDataISO(l[1]));
      if (d.getFullYear() !== ano) return;
      if (tipo !== 'TODOS' && l[2] !== tipo) return;

      const chave =
        visao === 'categoria' ? l[3] :
        visao === 'conta'     ? l[5] :
        l[2];

      if (chave) chaves.add(chave);
    });

    // ===============================
    // 3. SOMA OS VALORES
    // ===============================
    lancamentos.forEach(l => {

      const d = new Date(formatarDataISO(l[1]));
      const anoLanc = d.getFullYear();
      const mesLanc = d.getMonth();
      const tipoLanc = l[2];

      if (anoLanc !== ano) return;
      if (tipo !== 'TODOS' && tipoLanc !== tipo) return;
      if (!meses.includes(mesLanc)) return;

      const chave =
        visao === 'categoria' ? l[3] :
        visao === 'conta'     ? l[5] :
        l[2];

      const subcategoria = l[4];

      const valor = parseValorBR(l[7]);
      const valorAssinado = tipoLanc === 'SAIDA' ? -valor : valor;

      // cria agrupamento
      if (!mapa[chave]) {
        mapa[chave] = {
          valores: meses.map(() => 0),
          subcategorias: {}
        };
      }

      // cria subcategoria
      if (!mapa[chave].subcategorias[subcategoria]) {
        mapa[chave].subcategorias[subcategoria] = meses.map(() => 0);
      }

      // índice do mês
      const indexMes = meses.indexOf(mesLanc);
      if (indexMes === -1) return;

      // soma
      mapa[chave].valores[indexMes] += valorAssinado;
      mapa[chave].subcategorias[subcategoria][indexMes] += valorAssinado;
    });

    // ===============================
    // 4. MONTA LINHAS
    // ===============================
    const linhas = Object.keys(mapa)
    .sort()
    .map(nome => {

      const valores = mapa[nome].valores;

      return {
        nome,
        valores,
        total: valores.reduce((s, v) => s + v, 0),
        subcategorias: mapa[nome].subcategorias
      };

    });

    return {
      meses,
      linhas,
      totalGeral: linhas.reduce((s, l) => s + l.total, 0),
      visaoLabel:
        visao === 'categoria' ? 'Categoria' :
        visao === 'conta'     ? 'Conta' :
        'Tipo'
    };
  }

  // ---------- ATUALIZAR ----------
  function atualizarDRE() {

    const mesesSelecionados = [
      ...document.querySelectorAll('#dreMesMenu input:checked')
    ].map(c => Number(c.value));

    if (!mesesSelecionados.length) return;

    const dados = gerarDRECore({
      lancamentos,
      visao: document.getElementById('dreVisao').value,
      tipo: document.getElementById('dreTipo').value,
      ano: Number(document.getElementById('dreAno').value),
      mesesSelecionados
    });

    renderTabelaDRE(dados);
  }

  //====================================================
  // RENDER TABELA DRE 
  //====================================================
  function renderTabelaDRE(dados) {
    const tabela = document.getElementById('tabelaDRE');
    if (!tabela) return;

    const thead = tabela.querySelector('thead');
    const tbody = tabela.querySelector('tbody');
    const tfoot = tabela.querySelector('tfoot');

    thead.innerHTML = '';
    tbody.innerHTML = '';
    tfoot.innerHTML = '';

    const nomeMes = m =>
      new Date(2000, m).toLocaleDateString('pt-BR', { month: 'short' });

    const analise = document.getElementById('dreAnalise')?.value || 'horizontal';
    const tipoFiltro = document.getElementById('dreTipo')?.value || 'TODOS';
    const mostrarDelta = dados.meses.length === 2 && analise === 'horizontal';

    // ==================================================
    // BASE DA VERTICAL = TOTAL DE ENTRADAS POR MÊS
    // ==================================================
    const totalEntradasPorMes = dados.meses.map((_, i) =>
      dados.linhas.reduce((s, l) => l.valores[i] > 0 ? s + l.valores[i] : s, 0)
    );

    // =========================
    // CABEÇALHO
    // =========================
    thead.innerHTML = `
      <tr>
        <th>${dados.visaoLabel}</th>
        ${dados.meses.map(m => `<th>${nomeMes(m)}</th>`).join('')}
        ${mostrarDelta ? '<th>Δ</th>' : ''}
        <th>${analise === 'vertical' ? 'Total %' : 'Total'}</th>
      </tr>
    `;

    // =========================
    // LINHAS COM SUBCATEGORIA
    // =========================
    dados.linhas.forEach(l => {

      const catId = l.nome.replace(/\s+/g,'_');

      const deltaLinha = mostrarDelta
        ? l.valores[1] - l.valores[0]
        : 0;

      // -------------------------
      // LINHA DA CATEGORIA
      // -------------------------
      tbody.innerHTML += `
        <tr class="dre-categoria" data-cat="${catId}">
          <td>
            <button class="dre-toggle" data-cat="${catId}">▶</button>
            ${l.nome}
          </td>

          ${l.valores.map((v,i)=>{

            if (analise === 'vertical') {
              const base = totalEntradasPorMes[i] || 0;

              if (v < 0 && base > 0) {
                const perc = (Math.abs(v) / base) * 100;
                return `<td class="valor-negativo">${perc.toFixed(1)}%</td>`;
              }

              return `<td>-</td>`;
            }

            return `
              <td class="${v > 0 ? 'valor-positivo' : v < 0 ? 'valor-negativo' : ''}">
                ${formatMoney(v)}
              </td>
            `;

          }).join('')}

          ${mostrarDelta
            ? `<td class="${
                  deltaLinha >= 0 ? 'valor-positivo' : 'valor-negativo'
                }">
                  ${formatMoney(deltaLinha)}
              </td>`
            : ''}

          <td>
            <strong>
              ${
                analise === 'vertical'
                  ? (() => {
                      const totalEntradas = totalEntradasPorMes.reduce((s,v)=>s+v,0);
                      const saida = Math.abs(l.total);
                      const perc = totalEntradas ? (saida / totalEntradas) * 100 : 0;
                      return `${perc.toFixed(1)}%`;
                    })()
                  : formatMoney(l.total)
              }
            </strong>
          </td>
        </tr>
      `;

      // -------------------------
      // SUBCATEGORIAS
      // -------------------------
      Object.entries(l.subcategorias || {}).forEach(([sub,valores]) => {

        const totalSub = valores.reduce((s,v)=>s+v,0);

        const deltaSub = mostrarDelta
          ? valores[1] - valores[0]
          : 0;

        tbody.innerHTML += `
          <tr class="dre-subcategoria hidden" data-cat="${catId}">
            <td style="padding-left:30px">${sub}</td>

            ${valores.map((v,i)=>{

              if (analise === 'vertical') {
                const base = totalEntradasPorMes[i] || 0;

                if (v < 0 && base > 0) {
                  const perc = (Math.abs(v) / base) * 100;
                  return `<td class="valor-negativo">${perc.toFixed(1)}%</td>`;
                }


                return `<td>-</td>`;
              }

              return `
                <td class="${v > 0 ? 'valor-positivo' : v < 0 ? 'valor-negativo' : ''}">
                  ${formatMoney(v)}
                </td>
              `;

            }).join('')}

            ${mostrarDelta
            ? `<td class="${
                  deltaSub >= 0 ? 'valor-positivo' : 'valor-negativo'
                }">
                  ${formatMoney(deltaSub)}
              </td>`
            : ''}

            <td>
              ${
                analise === 'vertical'
                  ? (() => {
                      const totalEntradas = totalEntradasPorMes.reduce((s,v)=>s+v,0);
                      const saida = Math.abs(totalSub);
                      const perc = totalEntradas ? (saida / totalEntradas) * 100 : 0;
                      return `${perc.toFixed(1)}%`;
                    })()
                  : formatMoney(totalSub)
              }
            </td>
          </tr>
        `;

      });

    });

    // ==================================================
    // TOGGLE DAS SUBCATEGORIAS
    // ==================================================
    document.querySelectorAll('.dre-toggle').forEach(btn => {

      btn.onclick = () => {

        const cat = btn.dataset.cat;

        const linhas = document.querySelectorAll(
          `.dre-subcategoria[data-cat="${cat}"]`
        );

        linhas.forEach(l => l.classList.toggle('hidden'));

        btn.textContent =
          btn.textContent === '▶' ? '▼' : '▶';

      };

    });

    // =========================
    // FOOTER — VERTICAL
    // =========================
    if (analise === 'vertical') {
      tfoot.innerHTML = `
        <tr>
          <th>Total comprometido</th>
          ${dados.meses.map((_, i) => {
            const saidas = dados.linhas.reduce((s, l) => l.valores[i] < 0 ? s + Math.abs(l.valores[i]) : s, 0);
            const entradas = totalEntradasPorMes[i] || 0;
            const perc = entradas ? (saidas / entradas) * 100 : 0;
            return `<th>${perc.toFixed(1)}%</th>`;
          }).join('')}
          <th>—</th>
        </tr>
      `;
      return;
    }

    // ==================================================
    // FOOTER — ENTRADAS + SAÍDAS (Δ CORRETO)
    // ==================================================

      const totalEntradas = dados.meses.map((_, i) =>
        dados.linhas.reduce((s, l) => l.valores[i] > 0 ? s + l.valores[i] : s, 0)
      );

      const totalSaidas = dados.meses.map((_, i) =>
        dados.linhas.reduce((s, l) => l.valores[i] < 0 ? s + Math.abs(l.valores[i]) : s, 0)
      );

      const resultado = totalEntradas.map((v, i) => v - totalSaidas[i]);

      const deltaEntradas = mostrarDelta ? totalEntradas[1] - totalEntradas[0] : 0;
      const deltaSaidas   = mostrarDelta ? totalSaidas[1] - totalSaidas[0] : 0;
      const deltaResultado = mostrarDelta
        ? (totalEntradas[1] - totalSaidas[1]) - (totalEntradas[0] - totalSaidas[0])
        : 0;

      tfoot.innerHTML = `
        <tr>
          <th>Total Recebido</th>
          ${totalEntradas.map(v => `<th class="valor-positivo">${formatMoney(v)}</th>`).join('')}
          ${mostrarDelta ? `<th class="${deltaEntradas >= 0 ? 'valor-positivo' : 'valor-negativo'}">${formatMoney(deltaEntradas)}</th>` : ''}
          <th class="valor-positivo">${formatMoney(totalEntradas.reduce((s,v)=>s+v,0))}</th>
        </tr>

        <tr>
          <th>Total Gasto</th>
          ${totalSaidas.map(v => `<th class="valor-negativo">${formatMoney(-v)}</th>`).join('')}
          ${mostrarDelta ? `<th class="${deltaSaidas >= 0 ? 'valor-negativo' : 'valor-positivo'}">${formatMoney(-deltaSaidas)}</th>` : ''}
          <th class="valor-negativo">${formatMoney(-totalSaidas.reduce((s,v)=>s+v,0))}</th>
        </tr>

        <tr>
          <th>Resultado</th>
          ${resultado.map(v => `<th class="${v >= 0 ? 'valor-positivo' : 'valor-negativo'}">${formatMoney(v)}</th>`).join('')}
          ${mostrarDelta ? `<th class="${deltaResultado >= 0 ? 'valor-positivo' : 'valor-negativo'}">${formatMoney(deltaResultado)}</th>` : ''}
          <th class="${dados.totalGeral >= 0 ? 'valor-positivo' : 'valor-negativo'}">${formatMoney(dados.totalGeral)}</th>
        </tr>
      `;
    }


    function renderHistoricoLancamentos() {

    const tbody = document.querySelector('#tabelaHistorico tbody');
    if (!tbody) return;

    tbody.innerHTML = '';

    if (!lancamentos.length) {
      tbody.innerHTML = `
        <tr>
          <td colspan="9" style="text-align:center;opacity:.6">
            Nenhum lançamento encontrado
          </td>
        </tr>`;
      return;
    }

    lancamentos
      .sort((a,b)=> new Date(formatarDataISO(b[1])) - new Date(formatarDataISO(a[1])))
      .forEach(l => {

        const valor = parseValorBR(l[7]);

        const tr = document.createElement('tr');

        tr.innerHTML = `
          <td>${formatarDataBR(l[1])}</td>
          <td>${l[2]}</td>
          <td>${l[3]}</td>
          <td>${l[4]}</td>
          <td>${l[5]}</td>
          <td>${l[6]}</td>
          <td class="${valor >=0 ? 'valor-positivo':'valor-negativo'}">
            ${formatMoney(valor)}
          </td>
          <td>${l[8] || ''}</td>
          <td>
            <button class="btn-editar btn-acao">Editar</button>
            <button class="btn-excluir btn-acao">Excluir</button>
          </td>
        `;

        // EDITAR
        tr.querySelector('.btn-editar').onclick = () =>
          abrirModalEdicaoPadrao(l,'updateLancamento');

        // EXCLUIR
        tr.querySelector('.btn-excluir').onclick = async () => {

          if (!confirm('Excluir este lançamento?')) return;

          await post('deleteLancamento',{ id:l[0] });

          await carregarLancamentos();
          renderHistoricoLancamentos();
          renderResumo();
          atualizarDRE();
          renderHistoricoLancamentos();
        };

        tbody.appendChild(tr);

      });
  }

  // ======================================================
// INTELIGÊNCIA FINANCEIRA
// ======================================================

function calcularInteligenciaFinanceira() {

    const dados = {

        categorias: {},

        maiorGasto: null,
        menorGasto: null,

        categoriaMaior: "--",
        categoriaMenor: "--",

        totalPago: 0,
        totalRecebido: 0,

        mediaDiaria: 0,

        comprometimento: 0,

        previsaoMes: 0,

        resumo: ""

    };

    if (!Array.isArray(lancamentos) || !lancamentos.length) {

        dados.resumo = "Nenhum lançamento encontrado.";

        return dados;

    }

    const selAno = document.getElementById("ifAno");
    const selMes = document.getElementById("ifMes");

    const anoSelecionado = Number(selAno?.value || new Date().getFullYear());
    const mesSelecionado = selMes?.value;

    const categorias = {};
    const diasComMovimento = new Set();

    lancamentos.forEach(l => {

        const data = new Date(formatarDataISO(l[1]));

        if (data.getFullYear() !== anoSelecionado) return;

        if (
            mesSelecionado !== "" &&
            data.getMonth() !== Number(mesSelecionado)
        ) return;

        const tipo = String(l[2]).toUpperCase();
        const categoria = l[3];
        const valor = parseValorBR(l[7]);

        diasComMovimento.add(data.getDate());

        if (tipo === "SAIDA") {

            dados.totalPago += valor;

            categorias[categoria] =
                (categorias[categoria] || 0) + valor;

            if (!dados.maiorGasto || valor > dados.maiorGasto.valor) {

                dados.maiorGasto = {
                    categoria,
                    valor
                };

            }

            if (!dados.menorGasto || valor < dados.menorGasto.valor) {

                dados.menorGasto = {
                    categoria,
                    valor
                };

            }

        }

        if (tipo === "ENTRADA") {

            dados.totalRecebido += valor;

        }

    });

    const listaCategorias = Object.entries(categorias);

    if (listaCategorias.length) {

        listaCategorias.sort((a,b)=>b[1]-a[1]);

        dados.categoriaMaior = listaCategorias[0][0];

        dados.categoriaMenor = listaCategorias[listaCategorias.length-1][0];

    }

    const qtdDias = diasComMovimento.size || 1;

    dados.mediaDiaria = dados.totalPago / qtdDias;

    if (mesSelecionado !== "") {

        const diasNoMes = new Date(
            anoSelecionado,
            Number(mesSelecionado)+1,
            0
        ).getDate();

        dados.previsaoMes =
            dados.mediaDiaria * diasNoMes;

    } else {

        dados.previsaoMes = dados.totalPago;

    }

    if (dados.totalRecebido > 0) {

        dados.comprometimento =
            (dados.totalPago / dados.totalRecebido) * 100;

    }

    dados.resumo =
        `Foram analisados ${diasComMovimento.size} dias com movimentações. O total de despesas foi ${formatMoney(dados.totalPago)} e o total de receitas foi ${formatMoney(dados.totalRecebido)}.`;

    // IMPORTANTE
    dados.categorias = categorias;

    return dados;

}

// ======================================================
// RENDERIZAÇÃO - INTELIGÊNCIA FINANCEIRA
// ======================================================

function renderInteligenciaFinanceira() {

    const dados = calcularInteligenciaFinanceira();
    const score = calcularScoreFinanceiro(dados);

    const maior = document.getElementById("ifMaiorGasto");
    const menor = document.getElementById("ifMenorGasto");
    const catMaior = document.getElementById("ifCategoriaMaior");
    const catMenor = document.getElementById("ifCategoriaMenor");
    const pago = document.getElementById("ifTotalPago");
    const recebido = document.getElementById("ifTotalRecebido");
    const media = document.getElementById("ifMediaDiaria");
    const comprometimento = document.getElementById("ifComprometimento");
    const previsao = document.getElementById("ifPrevisao");
    const resumo = document.getElementById("ifResumoIA");

    if (!maior) return;

    maior.textContent = dados.maiorGasto
        ? `${dados.maiorGasto.categoria} - ${formatMoney(dados.maiorGasto.valor)}`
        : "--";

    menor.textContent = dados.menorGasto
        ? `${dados.menorGasto.categoria} - ${formatMoney(dados.menorGasto.valor)}`
        : "--";

    catMaior.textContent = dados.categoriaMaior;
    catMenor.textContent = dados.categoriaMenor;

    pago.textContent = formatMoney(dados.totalPago);
    recebido.textContent = formatMoney(dados.totalRecebido);
    media.textContent = formatMoney(dados.mediaDiaria);

    comprometimento.textContent =
        dados.comprometimento.toFixed(1) + "%";

    previsao.textContent =
        formatMoney(dados.previsaoMes);

    if (resumo) {

        resumo.innerHTML = `
            <strong>Score Financeiro:</strong>
            ${score.score}/100 - ${score.classificacao}
            <br><br>
            ${dados.resumo}
        `;

    }

    atualizarDistribuicaoDespesas(dados);

    atualizarInsightsFinanceiros(dados);

    atualizarComparativoFinanceiro();

}

// ======================================================
// FILTROS - INTELIGÊNCIA FINANCEIRA
// ======================================================

function inicializarFiltrosIF() {

    const selAno = document.getElementById("ifAno");
    const btn = document.getElementById("btnAtualizarIF");

    if (!selAno || !btn) return;

    if (selAno.options.length === 0) {

        const anoAtual = new Date().getFullYear();

        for (let a = anoAtual - 5; a <= anoAtual + 1; a++) {

            selAno.innerHTML += `
                <option value="${a}">
                    ${a}
                </option>
            `;

        }

        selAno.value = anoAtual;

    }

    btn.onclick = () => {

        renderInteligenciaFinanceira();

    };

}

// ======================================================
// INSIGHTS FINANCEIROS
// ======================================================

function atualizarInsightsFinanceiros(dados){

    const div = document.getElementById("ifInsights");

    if(!div) return;

    div.innerHTML = "";

    const insights = [];

    if(dados.comprometimento >= 90){

        insights.push(
            "⚠️ Suas despesas representam mais de 90% da sua renda."
        );

    }else if(dados.comprometimento >= 70){

        insights.push(
            "⚠️ Mais de 70% da sua renda já está comprometida."
        );

    }else{

        insights.push(
            "✅ Seu comprometimento financeiro está dentro de uma faixa saudável."
        );

    }

    if(dados.categoriaMaior !== "--"){

        insights.push(
            `📌 A categoria que mais consumiu recursos foi ${dados.categoriaMaior}.`
        );

    }

    if(dados.maiorGasto){

        insights.push(
            `💸 O maior gasto individual foi de ${formatMoney(dados.maiorGasto.valor)}.`
        );

    }

    if(dados.mediaDiaria > 0){

        insights.push(
            `📅 Sua média diária de despesas é ${formatMoney(dados.mediaDiaria)}.`
        );

    }

    insights.forEach(texto=>{

        div.innerHTML += `

        <div class="if-insight-item">

            ${texto}

        </div>

        `;

    });

}

// ======================================================
// COMPARATIVO COM O MÊS ANTERIOR
// ======================================================

function atualizarComparativoFinanceiro() {

    const div = document.getElementById("ifComparativo");

    if (!div) return;

    div.innerHTML = "";

    const selAno = Number(document.getElementById("ifAno").value);

    const selMes = document.getElementById("ifMes").value;

    if (selMes === "") {

        div.innerHTML = `
            <div class="if-vazio">
                Selecione um mês para visualizar o comparativo.
            </div>
        `;

        return;

    }

    const mesAtual = Number(selMes);

    if (mesAtual === 0) {

        div.innerHTML = `
            <div class="if-vazio">
                Janeiro não possui mês anterior para comparação.
            </div>
        `;

        return;

    }

    const atual = {};
    const anterior = {};

    lancamentos.forEach(l => {

        const data = new Date(formatarDataISO(l[1]));

        if (data.getFullYear() !== selAno) return;

        const tipo = String(l[2]).toUpperCase();

        if (tipo !== "SAIDA") return;

        const categoria = l[3];

        const valor = parseValorBR(l[7]);

        if (data.getMonth() === mesAtual) {

            atual[categoria] =
                (atual[categoria] || 0) + valor;

        }

        if (data.getMonth() === mesAtual - 1) {

            anterior[categoria] =
                (anterior[categoria] || 0) + valor;

        }

    });

    const categorias = new Set([
        ...Object.keys(atual),
        ...Object.keys(anterior)
    ]);

    categorias.forEach(cat => {

        const valorAtual = atual[cat] || 0;

        const valorAnterior = anterior[cat] || 0;

        let texto;

        if (valorAnterior === 0 && valorAtual > 0) {

            texto = `🆕 ${cat}: nova despesa (${formatMoney(valorAtual)})`;

        }

        else if (valorAtual > valorAnterior) {

            const perc =
                ((valorAtual - valorAnterior) /
                valorAnterior) * 100;

            texto =
                `🔺 ${cat}: +${perc.toFixed(1)}%`;

        }

        else if (valorAtual < valorAnterior) {

            const perc =
                ((valorAnterior - valorAtual) /
                valorAnterior) * 100;

            texto =
                `🔻 ${cat}: -${perc.toFixed(1)}%`;

        }

        else {

            texto =
                `➡️ ${cat}: estável`;

        }

        div.innerHTML += `

            <div class="if-insight-item">

                ${texto}

            </div>

        `;

    });

}

// ======================================================
// SCORE FINANCEIRO
// ======================================================

function calcularScoreFinanceiro(dados) {

    let score = 100;

    if (dados.comprometimento > 90) {

        score -= 40;

    } else if (dados.comprometimento > 75) {

        score -= 25;

    } else if (dados.comprometimento > 60) {

        score -= 10;

    }

    if (dados.previsaoMes > dados.totalRecebido) {

        score -= 20;

    }

    if (dados.totalRecebido <= 0) {

        score = 0;

    }

    score = Math.max(0, Math.min(100, Math.round(score)));

    let classificacao = "";

    if (score >= 90) {

        classificacao = "Excelente";

    } else if (score >= 75) {

        classificacao = "Bom";

    } else if (score >= 50) {

        classificacao = "Atenção";

    } else {

        classificacao = "Crítico";

    }

    return {

        score,

        classificacao

    };

}

// ======================================================
// EMOJIS DAS CATEGORIAS
// ======================================================

const EMOJIS_CATEGORIAS = {

    "Alimentação": "🍔",
    "Mercado": "🛒",

    "Transporte": "🚗",
    "Combustível": "⛽",
    "Veiculo": "🚘",

    "Moradia": "🏠",
    "Aluguel": "🏠",
    "Energia": "⚡",
    "Água": "💧",

    "Comunicação": "📡",
    "Internet": "🌐",
    "Telefone": "📱",

    "Farmácia": "💊",
    "Saúde": "🩺",

    "Educação": "🎓",

    "Lazer": "🎮",
    "Viagem": "✈️",

    "Despesas Pessoais": "🧴",

    "Tarifas e Impostos": "🧾",

    "Investimentos": "📈",
    "Salário": "💵",

    "Pix": "💸",
    "Cartão": "💳",

    "Outros": "📦"

};

function obterEmojiCategoria(nome){

    return EMOJIS_CATEGORIAS[nome] || "📦";

}

// ======================================================
// DISTRIBUIÇÃO INTELIGENTE DAS DESPESAS
// ======================================================

function atualizarDistribuicaoDespesas(dados){

    const painel = document.getElementById("ifDistribuicaoCategorias");

    if(!painel) return;

    const categorias = Object.entries(dados.categorias || {})
        .sort((a,b)=>b[1]-a[1]);

    if(!categorias.length){

        painel.innerHTML = `
            <div class="if-vazio">
                Nenhuma informação disponível.
            </div>
        `;

        return;

    }

    const total = categorias.reduce((s,c)=>s+c[1],0);

    let html = '<div class="if-distribuicao-lista">';

    categorias.forEach(([categoria,valor])=>{

        const percentual = total
            ? (valor/total)*100
            : 0;

        let cor="#22c55e";

        if(percentual>=35){

            cor="#ef4444";

        }else if(percentual>=20){

            cor="#f59e0b";

        }else if(percentual>=10){

            cor="#3b82f6";

        }

        html += `

        <div class="if-item">

            <div class="if-item-topo">

                <div class="if-item-esquerda">

                    <span class="if-emoji">

                        ${obterEmojiCategoria(categoria)}

                    </span>

                    <span>

                        ${categoria}

                    </span>

                </div>

                <div class="if-valor">

                    ${formatMoney(valor)}

                </div>

            </div>

            <div class="if-barra">

                <div
                    class="if-preenchimento"
                    style="
                        width:${percentual.toFixed(1)}%;
                        background:${cor};
                    ">
                </div>

            </div>

            <div class="if-percentual">

                ${percentual.toFixed(1)}%

            </div>

        </div>

        `;

    });

    html += "</div>";

    painel.innerHTML = html;

}
