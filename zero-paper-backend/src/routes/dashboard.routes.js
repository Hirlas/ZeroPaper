// ============================================================
// ZERO PAPER – Dashboard gerencial
// GET /dashboard?periodo=mes|30dias|6meses|12meses
// Indicadores, série do gráfico e detalhes para os cards clicáveis.
// Acesso: somente administrador.
// ============================================================

const router = require('express').Router();
const prisma = require('../lib/prisma');
const autenticar = require('../middlewares/autenticar');
const { isoData, hojeBR, arred } = require('../utils/formatadores');

router.use(autenticar);

router.use((req, res, next) => {
  if (req.funcionario?.papel !== 'admin') {
    return res.status(403).json({ erro: 'Acesso restrito ao administrador.' });
  }
  next();
});

const UM_DIA_MS = 86_400_000;
const LIMITE_DETALHES = 30;
const num = (v) => Number(v ?? 0);
const paraData = (iso) => new Date(iso + 'T00:00:00.000Z');

function somarDias(iso, dias) {
  const d = paraData(iso);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

function inicioDoMesAtras(iso, n) {
  const partes = iso.split('-').map(Number);
  return new Date(Date.UTC(partes[0], partes[1] - 1 - n, 1)).toISOString().slice(0, 10);
}

function obterInicioPeriodo(hoje, periodo) {
  if (periodo === 'mes') return hoje.slice(0, 7) + '-01';
  if (periodo === '30dias') return somarDias(hoje, -29);
  if (periodo === '6meses') return inicioDoMesAtras(hoje, 5);
  return inicioDoMesAtras(hoje, 11);
}

function montarSerie(inicio, hoje, periodo) {
  const diaria = periodo === 'mes' || periodo === '30dias';
  const serie = new Map();

  if (diaria) {
    for (let dia = inicio; dia <= hoje; dia = somarDias(dia, 1)) {
      serie.set(dia, { chave: dia, label: dia.slice(8, 10) + '/' + dia.slice(5, 7), total: 0 });
    }
  } else {
    const quantidadeMeses = periodo === '6meses' ? 5 : 11;
    for (let i = quantidadeMeses; i >= 0; i -= 1) {
      const chave = inicioDoMesAtras(hoje, i).slice(0, 7);
      const data = new Date(chave + '-01T00:00:00.000Z');
      const label = data.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit', timeZone: 'UTC' });
      serie.set(chave, { chave, label: label.replace('.', ''), total: 0 });
    }
  }

  return { serie, diaria };
}

router.get('/', async (req, res) => {
  const periodo = String(req.query.periodo || 'mes');
  const permitidos = ['mes', '30dias', '6meses', '12meses'];

  if (!permitidos.includes(periodo)) {
    return res.status(400).json({ erro: 'Período inválido. Use mes, 30dias, 6meses ou 12meses.' });
  }

  const hoje = hojeBR();
  const inicioISO = obterInicioPeriodo(hoje, periodo);
  const inicio = paraData(inicioISO);
  const hojeData = paraData(hoje);
  const em7diasISO = somarDias(hoje, 7);
  const em7diasData = paraData(em7diasISO);

  try {
    const [
      parcelasAbertas,
      pagamentosPorDia,
      pagamentosPorForma,
      pagamentosDetalhes,
      vendasResumo,
      vendasDetalhes,
    ] = await Promise.all([
      // Saldo atual de todas as vendas parceladas ainda não quitadas.
      prisma.parcela.findMany({
        where: {
          status: { in: ['pendente', 'atrasada', 'parcial'] },
          divida: { tipo_venda: 'parcelada' },
        },
        select: {
          id_parcela: true,
          numero: true,
          valor_parcela: true,
          valor_pago_acumulado: true,
          data_vencimento: true,
          divida: {
            select: {
              id_divida: true,
              descricao_produto: true,
              parcelas_total: true,
              cliente: { select: { id_cliente: true, nome: true } },
            },
          },
        },
      }),

      // Agrupamento diário: alimenta o gráfico sem carregar todo o histórico.
      prisma.pagamento.groupBy({
        by: ['data_pagamento'],
        where: { estornado: false, data_pagamento: { gte: inicio, lte: hojeData } },
        _sum: { valor_pago: true },
        _count: { _all: true },
        orderBy: { data_pagamento: 'asc' },
      }),

      prisma.pagamento.groupBy({
        by: ['forma_pagamento'],
        where: { estornado: false, data_pagamento: { gte: inicio, lte: hojeData } },
        _sum: { valor_pago: true },
        _count: { _all: true },
      }),

      // Detalhes recentes para o modal de recebimentos.
      prisma.pagamento.findMany({
        where: { estornado: false, data_pagamento: { gte: inicio, lte: hojeData } },
        orderBy: [{ data_pagamento: 'desc' }, { id_pagamento: 'desc' }],
        take: LIMITE_DETALHES,
        select: {
          id_pagamento: true,
          data_pagamento: true,
          valor_pago: true,
          forma_pagamento: true,
          parcela: {
            select: {
              numero: true,
              divida: {
                select: {
                  id_divida: true,
                  descricao_produto: true,
                  parcelas_total: true,
                  cliente: { select: { id_cliente: true, nome: true } },
                },
              },
            },
          },
        },
      }),

      prisma.divida.aggregate({
        where: { data_registro: { gte: inicio, lte: hojeData } },
        _count: { _all: true },
        _sum: { valor_total: true },
      }),

      // Lista limitada para o modal; os totais vêm do aggregate acima.
      prisma.divida.findMany({
        where: { data_registro: { gte: inicio, lte: hojeData } },
        orderBy: [{ data_registro: 'desc' }, { id_divida: 'desc' }],
        take: LIMITE_DETALHES,
        select: {
          id_divida: true,
          id_cliente: true,
          data_registro: true,
          descricao_produto: true,
          parcelas_total: true,
          tipo_venda: true,
          valor_total: true,
          parcelas: { select: { valor_pago_acumulado: true } },
          cliente: { select: { nome: true } },
        },
      }),
    ]);

    // ── Indicadores de saldo atual ───────────────────────────
    const emAberto = { total: 0, parcelas: 0 };
    const atraso = { total: 0, parcelas: 0, clientes: 0 };
    const aVencer = { total: 0, parcelas: 0 };
    const devedores = new Map();
    const detalhesEmAberto = [];
    const detalhesAtraso = [];
    const detalhesAVencer = [];

    for (const p of parcelasAbertas) {
      const restante = arred(num(p.valor_parcela) - num(p.valor_pago_acumulado));
      if (restante <= 0) continue;

      const d = p.divida;
      const vencimento = isoData(p.data_vencimento);
      const item = {
        id_parcela: p.id_parcela,
        id_divida: d.id_divida,
        id_cliente: d.cliente.id_cliente,
        cliente: d.cliente.nome,
        produto: d.descricao_produto,
        parcela: p.numero + '/' + d.parcelas_total,
        vencimento,
        restante,
      };

      emAberto.total = arred(emAberto.total + restante);
      emAberto.parcelas += 1;
      detalhesEmAberto.push(item);

      if (vencimento < hoje) {
        const dias = Math.floor((hojeData - paraData(vencimento)) / UM_DIA_MS);
        atraso.total = arred(atraso.total + restante);
        atraso.parcelas += 1;
        detalhesAtraso.push({ ...item, diasAtraso: dias });

        const idCliente = d.cliente.id_cliente;
        if (!devedores.has(idCliente)) {
          devedores.set(idCliente, {
            id_cliente: idCliente,
            nome: d.cliente.nome,
            total: 0,
            maiorAtrasoDias: 0,
          });
        }
        const devedor = devedores.get(idCliente);
        devedor.total = arred(devedor.total + restante);
        devedor.maiorAtrasoDias = Math.max(devedor.maiorAtrasoDias, dias);
      } else if (vencimento <= em7diasISO) {
        aVencer.total = arred(aVencer.total + restante);
        aVencer.parcelas += 1;
        detalhesAVencer.push(item);
      }
    }

    atraso.clientes = devedores.size;
    const maioresDevedores = [...devedores.values()]
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);

    detalhesEmAberto.sort((a, b) => a.vencimento.localeCompare(b.vencimento));
    detalhesAtraso.sort((a, b) => b.diasAtraso - a.diasAtraso);
    detalhesAVencer.sort((a, b) => a.vencimento.localeCompare(b.vencimento));

    // ── Recebimentos e série do gráfico no período escolhido ─
    const { serie, diaria } = montarSerie(inicioISO, hoje, periodo);
    let recebidoTotal = 0;
    let quantidadePagamentos = 0;

    for (const pg of pagamentosPorDia) {
      const valor = num(pg._sum.valor_pago);
      const chaveData = isoData(pg.data_pagamento);
      const chaveSerie = diaria ? chaveData : chaveData.slice(0, 7);

      recebidoTotal = arred(recebidoTotal + valor);
      quantidadePagamentos += pg._count._all;
      if (serie.has(chaveSerie)) {
        const ponto = serie.get(chaveSerie);
        ponto.total = arred(ponto.total + valor);
      }
    }

    const porForma = pagamentosPorForma.map((f) => ({
      forma: f.forma_pagamento,
      total: arred(num(f._sum.valor_pago)),
      quantidade: f._count._all,
    }));

    // ── Detalhes de recebimentos e vendas ────────────────────
    const itensRecebimentos = pagamentosDetalhes.map((pg) => {
      const d = pg.parcela.divida;
      return {
        id_pagamento: pg.id_pagamento,
        id_divida: d.id_divida,
        id_cliente: d.cliente.id_cliente,
        data: isoData(pg.data_pagamento),
        cliente: d.cliente.nome,
        produto: d.descricao_produto,
        parcela: pg.parcela.numero + '/' + d.parcelas_total,
        forma: pg.forma_pagamento,
        valor: arred(num(pg.valor_pago)),
      };
    });

    const itensVendas = vendasDetalhes.map((d) => {
      const recebido = arred(d.parcelas.reduce((s, p) => s + num(p.valor_pago_acumulado), 0));
      const total = arred(num(d.valor_total));
      return {
        id_divida: d.id_divida,
        id_cliente: d.id_cliente,
        data: isoData(d.data_registro),
        cliente: d.cliente.nome,
        produto: d.descricao_produto,
        tipo: d.tipo_venda === 'avista' ? 'À vista' : 'Parcelada',
        parcelas: d.parcelas_total,
        total,
        recebido,
        emAberto: d.tipo_venda === 'avista' ? 0 : Math.max(0, arred(total - recebido)),
      };
    });

    return res.json({
      referencia: hoje,
      periodo: { chave: periodo, de: inicioISO, ate: hoje, granularidade: diaria ? 'dia' : 'mes' },
      emAberto,
      recebidoPeriodo: {
        total: recebidoTotal,
        quantidade: quantidadePagamentos,
        porForma,
      },
      vendasPeriodo: {
        quantidade: vendasResumo._count._all,
        total: arred(num(vendasResumo._sum.valor_total)),
      },
      atraso,
      aVencer7dias: aVencer,
      maioresDevedores,
      recebimentosPorPeriodo: [...serie.values()],
      detalhes: {
        emAberto: { totalItens: emAberto.parcelas, itens: detalhesEmAberto.slice(0, LIMITE_DETALHES) },
        atraso: { totalItens: atraso.parcelas, itens: detalhesAtraso.slice(0, LIMITE_DETALHES) },
        aVencer7dias: { totalItens: aVencer.parcelas, itens: detalhesAVencer.slice(0, LIMITE_DETALHES) },
        recebimentos: { totalItens: quantidadePagamentos, itens: itensRecebimentos },
        vendas: { totalItens: vendasResumo._count._all, itens: itensVendas },
      },
    });
  } catch (error) {
    console.error('[DASHBOARD]', error.message);
    return res.status(500).json({ erro: 'Erro ao carregar o dashboard.' });
  }
});

module.exports = router;
