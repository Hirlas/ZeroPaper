// src/pages/Dashboard.jsx
// Zero Paper – Dashboard gerencial interativo
// Integra com GET /dashboard?periodo=mes|30dias|6meses|12meses

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Activity,
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpRight,
  Banknote,
  CalendarClock,
  CalendarDays,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  CreditCard,
  RefreshCw,
  ShoppingBag,
  Smartphone,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import api from "../services/api";
import { formatBRL } from "../utils/currency";
import { FORMAS_PAGAMENTO } from "../constants/formaPagamento";

const PERIODOS = [
  { value: "mes", label: "Este mês" },
  { value: "30dias", label: "30 dias" },
  { value: "6meses", label: "6 meses" },
  { value: "12meses", label: "12 meses" },
];

const FORMA_CONFIG = {
  dinheiro: { label: "Dinheiro", icon: Banknote, tone: "green" },
  pix: { label: "Pix", icon: Smartphone, tone: "violet" },
  debito: { label: "Débito", icon: CreditCard, tone: "blue" },
  credito: { label: "Crédito", icon: CreditCard, tone: "amber" },
};

const dataBR = (iso) => (iso ? String(iso).slice(0, 10).split("-").reverse().join("/") : "—");
const formaLabel = (value) => FORMAS_PAGAMENTO.find((f) => f.value === value)?.label ?? value;

function useAnimatedNumber(value, duration = 750) {
  const [shown, setShown] = useState(0);

  useEffect(() => {
    const target = Number(value) || 0;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    if (reduced) {
      setShown(target);
      return undefined;
    }

    let frame = 0;
    const started = performance.now();
    const tick = (now) => {
      const progress = Math.min((now - started) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setShown(target * eased);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, duration]);

  return shown;
}

function Money({ value, className = "" }) {
  const animated = useAnimatedNumber(value);
  return <span className={className}>{formatBRL(animated)}</span>;
}

function Count({ value }) {
  const animated = useAnimatedNumber(value);
  return <span>{Math.round(animated).toLocaleString("pt-BR")}</span>;
}

function ToneIcon({ icon: Icon, tone = "blue", size = "lg" }) {
  return (
    <span className={`zp-tone-icon zp-tone-${tone} ${size === "sm" ? "zp-tone-icon-sm" : ""}`}>
      <Icon size={size === "sm" ? 17 : 21} strokeWidth={2.1} />
    </span>
  );
}

function StatCard({ title, value, caption, icon, tone, onClick, money = false }) {
  return (
    <button type="button" onClick={onClick} className="zp-stat-card group">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="zp-stat-label">{title}</p>
          <p className="zp-stat-value mt-2">
            {money ? <Money value={value} /> : <Count value={value} />}
          </p>
        </div>
        <ToneIcon icon={icon} tone={tone} />
      </div>
      <div className="mt-4 flex items-center justify-between gap-2">
        <span className={`zp-pill zp-pill-${tone}`}>{caption}</span>
        <span className="zp-card-action">Ver detalhes <ChevronRight size={15} /></span>
      </div>
    </button>
  );
}

function Pill({ children, tone = "blue" }) {
  return <span className={`zp-pill zp-pill-${tone}`}>{children}</span>;
}

function EmptyState({ children = "Nenhum registro encontrado neste período." }) {
  return (
    <div className="px-5 py-10 text-center">
      <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-gray-100 text-gray-400">
        <Activity size={20} />
      </div>
      <p className="text-sm text-gray-500">{children}</p>
    </div>
  );
}

function DetailsModal({ modal, dados, onClose }) {
  if (!modal) return null;

  const detalhe = dados?.detalhes?.[modal.key];
  const itens = detalhe?.itens ?? [];
  const totalItens = detalhe?.totalItens ?? itens.length;

  const tituloPorChave = {
    emAberto: "Valores em aberto",
    recebido: "Recebimentos do período",
    vendas: "Vendas do período",
    atraso: "Parcelas em atraso",
    aVencer7dias: "Vencimentos nos próximos 7 dias",
  };

  const renderItem = (item, index) => {
    if (modal.key === "recebimentos") {
      return (
        <div key={item.id_pagamento ?? index} className="zp-detail-row">
          <div className="min-w-0 flex-1">
            <Link to={`/dividas/${item.id_cliente}`} onClick={onClose} className="zp-detail-link">
              {item.cliente}
            </Link>
            <p className="zp-detail-sub truncate">{item.produto} · Parcela {item.parcela}</p>
            <p className="zp-detail-sub">{dataBR(item.data)} · {formaLabel(item.forma)}</p>
          </div>
          <strong className="shrink-0 text-sm text-green-700">{formatBRL(item.valor)}</strong>
        </div>
      );
    }

    if (modal.key === "vendas") {
      return (
        <div key={item.id_divida ?? index} className="zp-detail-row">
          <div className="min-w-0 flex-1">
            <Link to={`/dividas/${item.id_cliente}`} onClick={onClose} className="zp-detail-link">
              {item.cliente}
            </Link>
            <p className="zp-detail-sub truncate">{item.produto} · {item.tipo}</p>
            <p className="zp-detail-sub">{dataBR(item.data)} · Recebido {formatBRL(item.recebido)}</p>
          </div>
          <strong className="shrink-0 text-sm text-gray-800">{formatBRL(item.total)}</strong>
        </div>
      );
    }

    const atrasada = modal.key === "atraso";
    return (
      <div key={item.id_parcela ?? index} className="zp-detail-row">
        <div className="min-w-0 flex-1">
          <Link to={`/dividas/${item.id_cliente}`} onClick={onClose} className="zp-detail-link">
            {item.cliente}
          </Link>
          <p className="zp-detail-sub truncate">{item.produto} · Parcela {item.parcela}</p>
          <p className="zp-detail-sub">
            {atrasada ? `${item.diasAtraso} dia(s) em atraso` : `Vencimento: ${dataBR(item.vencimento)}`}
          </p>
        </div>
        <strong className={`shrink-0 text-sm ${atrasada ? "text-red-700" : "text-amber-700"}`}>
          {formatBRL(item.restante)}
        </strong>
      </div>
    );
  };

  return (
    <div className="zp-modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="zp-modal" role="dialog" aria-modal="true" aria-labelledby="zp-modal-title">
        <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-5 py-4 sm:px-6">
          <div>
            <h2 id="zp-modal-title" className="text-base font-semibold text-gray-900">
              {modal.title || tituloPorChave[modal.key]}
            </h2>
            <p className="mt-1 text-xs text-gray-500">
              {totalItens.toLocaleString("pt-BR")} registro(s) · exibindo até {itens.length}
            </p>
          </div>
          <button type="button" onClick={onClose} className="zp-modal-close" aria-label="Fechar detalhes">
            <X size={19} />
          </button>
        </div>
        <div className="max-h-[65vh] overflow-y-auto px-5 sm:px-6">
          {itens.length ? itens.map(renderItem) : <EmptyState />}
        </div>
        <div className="border-t border-gray-100 px-5 py-3 text-right sm:px-6">
          <button type="button" onClick={onClose} className="zp-modal-done">Fechar</button>
        </div>
      </section>
    </div>
  );
}

function RecebimentosChart({ pontos, periodo, onPeriodChange }) {
  const maior = Math.max(...pontos.map((p) => Number(p.total) || 0), 1);
  const formatCompacto = (valor) => new Intl.NumberFormat("pt-BR", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(valor);

  return (
    <section className="zp-panel">
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5 sm:px-6">
        <div>
          <h2 className="zp-panel-title">Recebimentos</h2>
          <p className="zp-panel-subtitle">Acompanhe a entrada de valores no período</p>
        </div>
        <Pill tone="blue">{periodo === "mes" || periodo === "30dias" ? "Visão diária" : "Visão mensal"}</Pill>
      </div>

      {!pontos.length || pontos.every((p) => !Number(p.total)) ? (
        <EmptyState>Não há recebimentos registrados neste intervalo.</EmptyState>
      ) : (
        <div className="px-5 pb-5 pt-7 sm:px-6">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs text-gray-400">Valores recebidos</span>
            <span className="text-xs font-semibold text-gray-500">{pontos.length} período(s)</span>
          </div>
          <div className="zp-chart-scroll">
            <div className="zp-chart-bars" style={{ minWidth: pontos.length > 15 ? `${pontos.length * 22}px` : "100%" }}>
              {pontos.map((p, i) => {
                const altura = Math.max((Number(p.total) / maior) * 100, p.total > 0 ? 4 : 1);
                const mostrarLabel = pontos.length <= 12 || i === 0 || i === pontos.length - 1 ||
                  (pontos.length > 12 && i % 5 === 0);
                return (
                  <div className="zp-chart-column" key={p.chave}>
                    <div className="zp-chart-track" title={`${p.label}: ${formatBRL(p.total)}`}>
                      <div
                        className="zp-chart-bar"
                        style={{ height: `${altura}%`, animationDelay: `${Math.min(i * 22, 330)}ms` }}
                      />
                    </div>
                    <span className="zp-chart-label">{mostrarLabel ? p.label : ""}</span>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 border-t border-gray-100 pt-4 text-xs text-gray-500">
            <span className="inline-flex items-center gap-2"><i className="zp-legend-dot" /> Recebimentos confirmados</span>
            <span>Maior período: {formatCompacto(maior)}</span>
          </div>
        </div>
      )}
    </section>
  );
}

function DashboardStyles() {
  return (
    <style>{`
      .zp-dashboard{min-height:calc(100vh - 76px);background:#f5f6fa;padding:30px 22px 42px;color:#172033}
      .zp-dashboard-inner{max-width:1320px;margin:0 auto}
      .zp-eyebrow{font-size:10px;font-weight:700;letter-spacing:.13em;text-transform:uppercase;color:#737da8}
      .zp-dashboard-title{font-family:'Sora',sans-serif;font-size:24px;font-weight:700;letter-spacing:-.04em;color:#161b2e}
      .zp-dashboard-subtitle{margin-top:5px;color:#7b8498;font-size:13px}
      .zp-period-switch{display:flex;align-items:center;gap:4px;padding:4px;border:1px solid #e5e7ef;border-radius:13px;background:#fff}
      .zp-period-button{border:0;border-radius:9px;padding:8px 12px;background:transparent;color:#687086;font-size:12px;font-weight:600;white-space:nowrap;transition:background .2s,color .2s,box-shadow .2s;cursor:pointer}
      .zp-period-button:hover{background:#f3f4f8;color:#414a85}
      .zp-period-button.active{background:#414a85;color:#fff;box-shadow:0 3px 8px rgba(65,74,133,.2)}
      .zp-refresh-button{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:38px;border:1px solid #414a85;border-radius:11px;padding:0 13px;background:#414a85;color:#fff;font-size:12px;font-weight:600;transition:.18s}
      .zp-refresh-button:hover{background:#353d6d;transform:translateY(-1px)}
      .zp-refresh-button:disabled{opacity:.65;cursor:wait;transform:none}
      .zp-refresh-button svg.spin{animation:zp-spin 1s linear infinite}
      .zp-live-dot{display:inline-block;width:7px;height:7px;border-radius:50%;background:#22a06b;box-shadow:0 0 0 3px #e5f6ec;animation:zp-pulse 2s infinite}
      .zp-stat-card{width:100%;min-width:0;border:1px solid #e7e9f0;border-radius:17px;background:#fff;padding:18px;text-align:left;box-shadow:0 2px 8px rgba(25,33,58,.025);transition:transform .2s,border-color .2s,box-shadow .2s}
      .zp-stat-card:hover{transform:translateY(-3px);border-color:#c8cce0;box-shadow:0 12px 26px rgba(32,41,78,.08)}
      .zp-stat-card:focus-visible,.zp-period-button:focus-visible,.zp-refresh-button:focus-visible{outline:3px solid rgba(80,88,143,.28);outline-offset:2px}
      .zp-stat-label{color:#7d8496;font-size:12px;font-weight:600}
      .zp-stat-value{overflow:hidden;color:#171d31;font-family:'Sora',sans-serif;font-size:clamp(20px,2.1vw,27px);font-weight:700;letter-spacing:-.045em;line-height:1.2;white-space:nowrap}
      .zp-tone-icon{display:flex;width:42px;height:42px;flex-shrink:0;align-items:center;justify-content:center;border-radius:14px}
      .zp-tone-icon-sm{width:32px;height:32px;border-radius:11px}
      .zp-tone-blue{background:#edf0ff;color:#414a85}
      .zp-tone-green{background:#e7f7ef;color:#16845a}
      .zp-tone-violet{background:#f2edff;color:#7654bd}
      .zp-tone-amber{background:#fff3df;color:#ba7a16}
      .zp-tone-red{background:#ffebeb;color:#d34b50}
      .zp-pill{display:inline-flex;align-items:center;gap:5px;border-radius:999px;padding:5px 9px;font-size:10px;font-weight:700;line-height:1.1;white-space:nowrap}
      .zp-pill-blue{background:#edf0ff;color:#414a85}
      .zp-pill-green{background:#e7f7ef;color:#16845a}
      .zp-pill-violet{background:#f2edff;color:#7654bd}
      .zp-pill-amber{background:#fff3df;color:#a66a0f}
      .zp-pill-red{background:#ffebeb;color:#c34249}
      .zp-card-action{display:inline-flex;align-items:center;gap:1px;color:#8c93a5;font-size:10px;font-weight:600;white-space:nowrap;transition:color .18s}
      .zp-stat-card:hover .zp-card-action{color:#414a85}
      .zp-panel{overflow:hidden;border:1px solid #e7e9f0;border-radius:17px;background:#fff;box-shadow:0 2px 8px rgba(25,33,58,.025)}
      .zp-panel-title{font-size:14px;font-weight:700;color:#1c2338}
      .zp-panel-subtitle{margin-top:4px;color:#9299a9;font-size:11px}
      .zp-chart-scroll{overflow-x:auto;padding-bottom:3px}
      .zp-chart-bars{display:flex;height:190px;align-items:stretch;gap:7px}
      .zp-chart-column{display:flex;min-width:0;flex:1;flex-direction:column;justify-content:flex-end;align-items:center;gap:9px}
      .zp-chart-track{display:flex;height:160px;width:100%;align-items:flex-end;overflow:hidden;border-radius:7px 7px 3px 3px;background:#f5f6fa}
      .zp-chart-bar{width:100%;min-height:2px;border-radius:7px 7px 2px 2px;background:linear-gradient(180deg,#7d86c1 0%,#414a85 100%);transform-origin:bottom;animation:zp-grow .7s cubic-bezier(.2,.75,.25,1) both;transition:height .5s ease}
      .zp-chart-label{height:14px;color:#969cac;font-size:9px;white-space:nowrap}
      .zp-legend-dot{display:inline-block;width:8px;height:8px;border-radius:3px;background:#50588f}
      .zp-alert-card{display:flex;align-items:center;gap:13px;border:1px solid #f1e5cd;border-radius:15px;background:#fffaf1;padding:14px 16px}
      .zp-alert-icon{display:flex;width:38px;height:38px;flex-shrink:0;align-items:center;justify-content:center;border-radius:12px;background:#fff0d4;color:#b7791f}
      .zp-alert-title{font-size:12px;font-weight:700;color:#6e4d1e}
      .zp-alert-sub{margin-top:3px;color:#9a805c;font-size:11px}
      .zp-section-title{font-size:13px;font-weight:700;color:#242b40}
      .zp-list-row{display:flex;align-items:center;gap:12px;border-top:1px solid #f0f1f5;padding:12px 18px}
      .zp-list-row:first-child{border-top:0}
      .zp-rank{display:flex;width:27px;height:27px;flex-shrink:0;align-items:center;justify-content:center;border-radius:9px;background:#f0f1f7;color:#5c648f;font-size:10px;font-weight:800}
      .zp-detail-row{display:flex;align-items:center;gap:14px;border-bottom:1px solid #f0f1f5;padding:13px 0}
      .zp-detail-row:last-child{border-bottom:0}
      .zp-detail-link{color:#354078;font-size:12px;font-weight:700;text-decoration:none}
      .zp-detail-link:hover{text-decoration:underline}
      .zp-detail-sub{margin-top:3px;color:#9299a9;font-size:10px}
      .zp-modal-backdrop{position:fixed;inset:0;z-index:100;display:flex;align-items:center;justify-content:center;background:rgba(13,18,38,.48);padding:16px;backdrop-filter:blur(3px);animation:zp-fade .18s ease}
      .zp-modal{width:min(100%,620px);overflow:hidden;border:1px solid rgba(255,255,255,.6);border-radius:20px;background:#fff;box-shadow:0 24px 80px rgba(0,0,0,.2);animation:zp-modal-in .22s ease}
      .zp-modal-close{display:flex;width:34px;height:34px;align-items:center;justify-content:center;border:0;border-radius:10px;background:#f3f4f8;color:#70788c;transition:.15s}
      .zp-modal-close:hover{background:#e9ebf3;color:#252b42}
      .zp-modal-done{border:0;border-radius:9px;background:#414a85;padding:8px 16px;color:white;font-size:12px;font-weight:600}
      .zp-modal-done:hover{background:#353d6d}
      .zp-error{border:1px solid #f2caca;border-radius:12px;background:#fff1f1;padding:12px 14px;color:#b4232a;font-size:12px}
      .zp-skeleton{height:116px;border-radius:17px;background:linear-gradient(90deg,#eceef4 25%,#f6f7fa 50%,#eceef4 75%);background-size:200% 100%;animation:zp-shimmer 1.3s infinite}
      @keyframes zp-spin{to{transform:rotate(360deg)}}
      @keyframes zp-pulse{0%,100%{box-shadow:0 0 0 3px #e5f6ec}50%{box-shadow:0 0 0 6px rgba(34,160,107,.08)}}
      @keyframes zp-grow{from{transform:scaleY(.05);opacity:.45}to{transform:scaleY(1);opacity:1}}
      @keyframes zp-fade{from{opacity:0}to{opacity:1}}
      @keyframes zp-modal-in{from{opacity:0;transform:translateY(8px) scale(.985)}to{opacity:1;transform:translateY(0) scale(1)}}
      @keyframes zp-shimmer{to{background-position:-200% 0}}
      @media(max-width:700px){
        .zp-dashboard{padding:22px 13px 32px}
        .zp-dashboard-title{font-size:21px}
        .zp-period-switch{width:100%;overflow-x:auto}
        .zp-period-button{flex:1;padding:8px 9px}
        .zp-stat-card{padding:14px;border-radius:15px}
        .zp-tone-icon{width:36px;height:36px;border-radius:12px}
        .zp-stat-value{font-size:clamp(17px,5vw,23px)}
        .zp-chart-bars{gap:5px}
        .zp-chart-track{height:140px}
        .zp-chart-bars{height:170px}
      }
      @media(prefers-reduced-motion:reduce){
        .zp-dashboard *, .zp-dashboard *::before, .zp-dashboard *::after{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important;scroll-behavior:auto!important}
      }
    `}</style>
  );
}

export default function Dashboard() {
  const { auth } = useAuth();
  const ehAdmin = auth?.funcionario?.papel === "admin";
  const nome = auth?.funcionario?.nome?.split(" ")[0] ?? "";
  const [periodo, setPeriodo] = useState("mes");
  const [dados, setDados] = useState(null);
  const [loading, setLoading] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [erro, setErro] = useState("");
  const [modal, setModal] = useState(null);
  const [ultimaAtualizacao, setUltimaAtualizacao] = useState(null);

  const carregar = useCallback(async ({ silencioso = false } = {}) => {
    if (silencioso) setAtualizando(true);
    else setLoading(true);
    setErro("");

    try {
      const resposta = await api.get("/dashboard", { params: { periodo } });
      setDados(resposta.data);
      setUltimaAtualizacao(new Date());
    } catch (error) {
      setErro(error.response?.data?.erro || "Não foi possível carregar os indicadores. Verifique sua conexão e tente novamente.");
    } finally {
      setLoading(false);
      setAtualizando(false);
    }
  }, [periodo]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  useEffect(() => {
    const timer = window.setInterval(() => carregar({ silencioso: true }), 60_000);
    return () => window.clearInterval(timer);
  }, [carregar]);

  useEffect(() => {
    if (!modal) return undefined;
    const fecharEsc = (event) => {
      if (event.key === "Escape") setModal(null);
    };
    window.addEventListener("keydown", fecharEsc);
    return () => window.removeEventListener("keydown", fecharEsc);
  }, [modal]);

  const resumo = useMemo(() => {
    if (!dados) return [];
    const recebido = dados.recebidoPeriodo ?? { total: 0, quantidade: 0 };
    const vendas = dados.vendasPeriodo ?? { total: 0, quantidade: 0 };
    return [
      {
        key: "emAberto",
        title: "Total em aberto",
        value: dados.emAberto?.total ?? 0,
        caption: `${dados.emAberto?.parcelas ?? 0} parcelas pendentes`,
        icon: Wallet,
        tone: "blue",
        money: true,
      },
      {
        key: "recebido",
        title: "Recebido no período",
        value: recebido.total,
        caption: `${recebido.quantidade} pagamento(s)`,
        icon: ArrowDownToLine,
        tone: "green",
        money: true,
      },
      {
        key: "vendas",
        title: "Vendas no período",
        value: vendas.total,
        caption: `${vendas.quantidade} venda(s) registrada(s)`,
        icon: ShoppingBag,
        tone: "violet",
        money: true,
      },
      {
        key: "atraso",
        title: "Em atraso",
        value: dados.atraso?.total ?? 0,
        caption: `${dados.atraso?.clientes ?? 0} cliente(s) em atraso`,
        icon: AlertTriangle,
        tone: "red",
        money: true,
      },
    ];
  }, [dados]);

  const tituloPeriodo = PERIODOS.find((p) => p.value === periodo)?.label ?? "Este mês";

  if (!ehAdmin) {
    return (
      <div className="zp-dashboard flex items-center justify-center">
        <div className="zp-panel max-w-md p-7 text-center">
          <ToneIcon icon={Users} tone="amber" />
          <h1 className="mt-4 text-base font-semibold text-gray-800">Dashboard gerencial</h1>
          <p className="mt-2 text-sm text-gray-500">Os indicadores financeiros são restritos ao administrador.</p>
        </div>
        <DashboardStyles />
      </div>
    );
  }

  return (
    <div className="zp-dashboard">
      <DashboardStyles />
      <div className="zp-dashboard-inner">
        <header className="mb-6 flex flex-col justify-between gap-5 xl:flex-row xl:items-end">
          <div>
            <p className="zp-eyebrow">BIOS IPHONES · GESTÃO</p>
            <h1 className="zp-dashboard-title mt-2">Olá, {nome} <span aria-hidden="true">👋</span></h1>
            <p className="zp-dashboard-subtitle">Aqui está o resumo financeiro da sua operação.</p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="zp-period-switch" role="group" aria-label="Filtrar período">
              {PERIODOS.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setPeriodo(item.value)}
                  className={`zp-period-button ${periodo === item.value ? "active" : ""}`}
                  aria-pressed={periodo === item.value}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <button type="button" onClick={() => carregar({ silencioso: true })} disabled={atualizando}
              className="zp-refresh-button">
              <RefreshCw size={15} className={atualizando ? "spin" : ""} />
              {atualizando ? "Atualizando" : "Atualizar"}
            </button>
          </div>
        </header>

        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="zp-live-dot" />
            <span className="text-[11px] font-semibold text-gray-500">Atualização automática ativa · a cada 1 minuto</span>
          </div>
          <span className="text-[10px] text-gray-400">
            {ultimaAtualizacao ? `Atualizado às ${ultimaAtualizacao.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}` : "Sincronizando dados…"}
          </span>
        </div>

        {erro && <div className="zp-error mb-4" role="alert">{erro}</div>}

        {loading && !dados ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => <div className="zp-skeleton" key={index} />)}
          </div>
        ) : dados ? (
          <>
            <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Indicadores principais">
              {resumo.map((card) => (
                <StatCard
                  key={card.key}
                  title={card.title}
                  value={card.value}
                  caption={card.caption}
                  icon={card.icon}
                  tone={card.tone}
                  money={card.money}
                  onClick={() => setModal({
                    key: card.key,
                    title: card.key === "recebido" ? "Recebimentos do período" : undefined,
                  })}
                />
              ))}
            </section>

            <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(290px,1fr)]">
              <RecebimentosChart pontos={dados.recebimentosPorPeriodo ?? []} periodo={periodo} onPeriodChange={setPeriodo} />

              <section className="zp-panel">
                <div className="flex items-start justify-between gap-3 px-5 pt-5">
                  <div>
                    <h2 className="zp-panel-title">Vencimentos próximos</h2>
                    <p className="zp-panel-subtitle">Parcelas nos próximos 7 dias</p>
                  </div>
                  <ToneIcon icon={CalendarClock} tone="amber" size="sm" />
                </div>
                <button type="button" onClick={() => setModal({ key: "aVencer7dias" })}
                  className="mt-4 flex w-full items-center justify-between gap-3 bg-amber-50 px-5 py-4 text-left transition hover:bg-amber-100">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wide text-amber-700">A receber</p>
                    <p className="mt-1 font-semibold text-amber-900"><Money value={dados.aVencer7dias?.total ?? 0} /></p>
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-bold text-amber-800"><Count value={dados.aVencer7dias?.parcelas ?? 0} /></p>
                    <p className="text-[10px] text-amber-700">parcela(s)</p>
                  </div>
                  <ChevronRight size={16} className="text-amber-600" />
                </button>
                <div className="px-5 py-4">
                  <div className="mb-2 flex items-center gap-2">
                    <Clock3 size={14} className="text-gray-400" />
                    <span className="text-[11px] font-semibold text-gray-600">Resumo do período: {tituloPeriodo}</span>
                  </div>
                  <p className="text-[11px] leading-5 text-gray-400">
                    O saldo em aberto e os atrasos representam a situação atual da carteira, enquanto vendas e recebimentos respeitam o período selecionado.
                  </p>
                </div>
              </section>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
              <section className="zp-panel">
                <div className="flex items-center justify-between gap-3 px-5 py-4 sm:px-6">
                  <div>
                    <h2 className="zp-section-title">Maiores devedores</h2>
                    <p className="zp-panel-subtitle">Clientes com maior saldo vencido</p>
                  </div>
                  <ToneIcon icon={Users} tone="red" size="sm" />
                </div>
                {(dados.maioresDevedores ?? []).length ? (
                  <div>
                    {dados.maioresDevedores.map((cliente, index) => (
                      <div className="zp-list-row" key={cliente.id_cliente}>
                        <span className="zp-rank">{String(index + 1).padStart(2, "0")}</span>
                        <div className="min-w-0 flex-1">
                          <Link to={`/dividas/${cliente.id_cliente}`} className="block truncate text-xs font-bold text-gray-700 hover:text-bios-primary-700 hover:underline">
                            {cliente.nome}
                          </Link>
                          <p className="mt-1 text-[10px] text-gray-400">Maior atraso: {cliente.maiorAtrasoDias} dia(s)</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs font-bold text-red-700">{formatBRL(cliente.total)}</p>
                          <Pill tone="red">Em atraso</Pill>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : <EmptyState>Não há clientes com parcelas vencidas.</EmptyState>}
                <div className="border-t border-gray-100 px-5 py-3">
                  <button type="button" onClick={() => setModal({ key: "atraso" })} className="text-[11px] font-bold text-bios-primary-600 hover:underline">
                    Ver todas as parcelas em atraso
                  </button>
                </div>
              </section>

              <section className="zp-panel">
                <div className="flex items-center justify-between gap-3 px-5 py-4 sm:px-6">
                  <div>
                    <h2 className="zp-section-title">Formas de recebimento</h2>
                    <p className="zp-panel-subtitle">Distribuição no intervalo selecionado</p>
                  </div>
                  <ToneIcon icon={CircleDollarSign} tone="green" size="sm" />
                </div>
                {(dados.recebidoPeriodo?.porForma ?? []).length ? (
                  <div className="px-5 pb-2">
                    {dados.recebidoPeriodo.porForma
                      .slice()
                      .sort((a, b) => b.total - a.total)
                      .map((item) => {
                        const config = FORMA_CONFIG[item.forma] ?? { label: formaLabel(item.forma), icon: CircleDollarSign, tone: "blue" };
                        const total = dados.recebidoPeriodo.total || 1;
                        const percent = Math.round((item.total / total) * 100);
                        return (
                          <div className="border-t border-gray-100 py-3 first:border-0" key={item.forma}>
                            <div className="mb-2 flex items-center gap-2">
                              <ToneIcon icon={config.icon} tone={config.tone} size="sm" />
                              <span className="flex-1 text-xs font-semibold text-gray-700">{config.label}</span>
                              <span className="text-xs font-bold text-gray-800">{formatBRL(item.total)}</span>
                              <Pill tone={config.tone}>{percent}%</Pill>
                            </div>
                            <div className="h-1.5 overflow-hidden rounded-full bg-gray-100">
                              <div className="h-full rounded-full bg-bios-primary-500 transition-all duration-700" style={{ width: `${percent}%` }} />
                            </div>
                          </div>
                        );
                      })}
                  </div>
                ) : <EmptyState>Não há recebimentos no período selecionado.</EmptyState>}
              </section>
            </div>

            <section className="zp-panel mt-4">
              <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-6">
                <div>
                  <h2 className="zp-section-title">Recebimentos recentes</h2>
                  <p className="zp-panel-subtitle">Últimas movimentações do período</p>
                </div>
                <button type="button" onClick={() => setModal({ key: "recebimentos" })}
                  className="inline-flex items-center gap-1 text-[11px] font-bold text-bios-primary-600 hover:underline">
                  Ver todos <ArrowUpRight size={14} />
                </button>
              </div>
              {(dados.detalhes?.recebimentos?.itens ?? []).slice(0, 5).length ? (
                <div>
                  {dados.detalhes.recebimentos.itens.slice(0, 5).map((item) => {
                    const config = FORMA_CONFIG[item.forma] ?? { label: formaLabel(item.forma), icon: CircleDollarSign, tone: "blue" };
                    return (
                      <div key={item.id_pagamento} className="zp-list-row">
                        <ToneIcon icon={config.icon} tone={config.tone} size="sm" />
                        <div className="min-w-0 flex-1">
                          <Link to={`/dividas/${item.id_cliente}`} className="block truncate text-xs font-bold text-gray-700 hover:text-bios-primary-700 hover:underline">
                            {item.cliente}
                          </Link>
                          <p className="mt-1 truncate text-[10px] text-gray-400">{item.produto} · {dataBR(item.data)}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs font-bold text-green-700">{formatBRL(item.valor)}</p>
                          <Pill tone={config.tone}>{config.label}</Pill>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : <EmptyState>Os recebimentos deste período aparecerão aqui.</EmptyState>}
            </section>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-[10px] text-gray-400">
              <span className="inline-flex items-center gap-1.5"><CalendarDays size={12} /> Referência: {dataBR(dados.referencia)}</span>
              <span>Os valores são calculados com base nos registros do Zero Paper.</span>
            </div>
          </>
        ) : !erro ? (
          <div className="zp-panel"><EmptyState>Não foi possível exibir os indicadores.</EmptyState></div>
        ) : null}
      </div>

      <DetailsModal modal={modal} dados={dados} onClose={() => setModal(null)} />
    </div>
  );
}
