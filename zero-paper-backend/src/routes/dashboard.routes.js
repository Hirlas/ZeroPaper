// ============================================================
// ZERO PAPER – Dashboard
// GET /dashboard → indicadores principais do sistema, em uma única chamada
//
//   emAberto          → quanto ainda falta receber (vendas parceladas)
//   recebidoMes       → o que entrou no caixa neste mês (sem estornos)
//   vendasMes         → vendas registradas neste mês
//   atraso            → parcelas vencidas e ainda não pagas
//   aVencer7dias      → parcelas que vencem nos próximos 7 dias
//   maioresDevedores  → top 5 clientes em atraso
//   recebimentosPorMes→ últimos 6 meses (para o gráfico)
//
// Acesso: somente admin (mesma regra dos relatórios).
// ============================================================

const router     = require('express').Router();
const prisma     = require('../lib/prisma');
const autenticar = require('../middlewares/autenticar');
const { isoData, hojeBR, arred } = require('../utils/formatadores');

router.use(autenticar);

router.use((req, res, next) => {
  if (req.funcionario?.papel !== 'admin') {
    return res.status(403).json({ erro: 'Acesso restrito ao administrador.' });
  }
  next();
});

// ── helpers ──────────────────────────────────────────────────
const UM_DIA_MS = 86_400_000;
const num = (v) => Number(v ?? 0);
const paraData = (iso) => new Date(`${iso}T00:00:00.000Z`);

/** "2026-11-18" + 7 dias → "2026-11-25" */
function somarDias(iso, dias) {
  const d = paraData(iso);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** Primeiro dia do mês, `n` meses atrás. ("2026-11-18", 5 → "2026-06-01") */
function inicioDoMesAtras(iso, n) {
  const [ano, mes] = iso.split('-').map(Number);
  return new Date(Date.UTC(ano, mes - 1 - n, 1)).toISOString().slice(0, 10);
}

// ── GET /dashboard ───────────────────────────────────────────
router.get('/', async (_req, res) => {
  const hoje       = hojeBR();
  const hojeData   = paraData(hoje);
  const inicioMes  = paraData(`${hoje.slice(0, 7)}-01`);
  const inicioSerie = paraData(inicioDoMesAtras(hoje, 5));
  const em7dias    = paraData(somarDias(hoje, 7));

  try {
    // As 3 consultas são independentes, então rodam ao mesmo tempo.
    const [parcelasAbertas, pagamentos, vendasMes] = await Promise.all([
      // Parcelas com saldo a receber. Venda à vista nunca entra aqui.
      prisma.parcela.findMany({
        where: {
          status: { in: ['pendente', 'atrasada', 'parcial'] },
          divida: { tipo_venda: 'parcelada' },
        },
        select: {
          valor_parcela: true,
          valor_pago_acumulado: true,
          data_vencimento: true,
          divida: {
            select: { cliente: { select: { id_cliente: true, nome: true } } },
          },
        },
      }),

      // Pagamentos dos últimos 6 meses. Estornados ficam de fora.
      prisma.pagamento.findMany({
        where: { estornado: false, data_pagamento: { gte: inicioSerie, lte: hojeData } },
        select: { valor_pago: true, data_pagamento: true, forma_pagamento: true },
      }),

      prisma.divida.aggregate({
        where: { data_registro: { gte: inicioMes, lte: hojeData } },
        _count: { _all: true },
        _sum: { valor_total: true },
      }),
    ]);

    // ── 1) Parcelas: em aberto, em atraso, a vencer ──────────
    const emAberto  = { total: 0, parcelas: 0 };
    const atraso    = { total: 0, parcelas: 0, clientes: 0 };
    const aVencer   = { total: 0, parcelas: 0 };
    const devedores = new Map();

    for (const p of parcelasAbertas) {
      const restante = arred(num(p.valor_parcela) - num(p.valor_pago_acumulado));
      if (restante <= 0) continue;

      emAberto.total = arred(emAberto.total + restante);
      emAberto.parcelas += 1;

      const vencimento = new Date(p.data_vencimento);

      if (vencimento < hojeData) {
        // vencida (vencer hoje ainda não conta como atraso)
        const dias = Math.floor((hojeData - vencimento) / UM_DIA_MS);
        const c = p.divida.cliente;

        atraso.total = arred(atraso.total + restante);
        atraso.parcelas += 1;

        if (!devedores.has(c.id_cliente)) {
          devedores.set(c.id_cliente, {
            id_cliente: c.id_cliente, nome: c.nome, total: 0, maiorAtrasoDias: 0,
          });
        }
        const d = devedores.get(c.id_cliente);
        d.total = arred(d.total + restante);
        d.maiorAtrasoDias = Math.max(d.maiorAtrasoDias, dias);
      } else if (vencimento <= em7dias) {
        aVencer.total = arred(aVencer.total + restante);
        aVencer.parcelas += 1;
      }
    }
    atraso.clientes = devedores.size;

    const maioresDevedores = [...devedores.values()]
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);

    // ── 2) Pagamentos: recebido no mês, por forma, e série de 6 meses ──
    const serie = new Map();
    for (let i = 5; i >= 0; i--) serie.set(inicioDoMesAtras(hoje, i).slice(0, 7), 0);

    const recebidoMes = { total: 0, quantidade: 0 };
    const porForma = new Map();
    const mesAtual = hoje.slice(0, 7);

    for (const pg of pagamentos) {
      const valor = num(pg.valor_pago);
      const mes = isoData(pg.data_pagamento).slice(0, 7);

      if (serie.has(mes)) serie.set(mes, arred(serie.get(mes) + valor)); // só os 6 meses do gráfico

      if (mes === mesAtual) {
        recebidoMes.total = arred(recebidoMes.total + valor);
        recebidoMes.quantidade += 1;
        porForma.set(pg.forma_pagamento, arred((porForma.get(pg.forma_pagamento) ?? 0) + valor));
      }
    }

    return res.json({
      referencia: hoje,
      emAberto,
      recebidoMes: {
        ...recebidoMes,
        porForma: [...porForma.entries()].map(([forma, total]) => ({ forma, total })),
      },
      vendasMes: {
        quantidade: vendasMes._count._all,
        total: arred(num(vendasMes._sum.valor_total)),
      },
      atraso,
      aVencer7dias: aVencer,
      maioresDevedores,
      recebimentosPorMes: [...serie.entries()].map(([mes, total]) => ({ mes, total })),
    });
  } catch (error) {
    console.error('[DASHBOARD]', error.message);
    return res.status(500).json({ erro: 'Erro ao carregar o dashboard.' });
  }
});

module.exports = router;