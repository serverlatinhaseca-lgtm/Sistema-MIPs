import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import axios from "axios";
import { ArrowLeft, Printer, Share2 } from "lucide-react";
import GraficoDesempenho from "../components/GraficoDesempenho";
import { formatarMes } from "../avaliacoes";
import useBranding from "../useBranding";

export default function AvaliacaoCompartilhada() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [avaliacao, setAvaliacao] = useState(null);
  const [erro, setErro] = useState("");
  const api = `http://${window.location.hostname}:7001/api`;
  const branding = useBranding();

  useEffect(() => {
    axios
      .get(`${api}/avaliacoes/compartilhada/${token}`)
      .then((res) => setAvaliacao(res.data))
      .catch((e) =>
        setErro(
          e.response?.data?.error || "Não foi possível abrir esta avaliação.",
        ),
      );
  }, [api, token]);

  async function compartilhar() {
    try {
      if (navigator.share)
        await navigator.share({
          title: `Avaliação de ${avaliacao.colaborador_nome}`,
          url: window.location.href,
        });
      else {
        if (navigator.clipboard && window.isSecureContext)
          await navigator.clipboard.writeText(window.location.href);
        else {
          const campo = document.createElement("textarea");
          campo.value = window.location.href;
          campo.style.position = "fixed";
          campo.style.opacity = "0";
          document.body.appendChild(campo);
          campo.select();
          document.execCommand("copy");
          campo.remove();
        }
        alert("Link copiado!");
      }
    } catch (e) {
      if (e.name !== "AbortError") alert("Não foi possível compartilhar.");
    }
  }

  if (erro)
    return (
      <main className="min-h-screen grid place-items-center bg-[var(--bg-main)] p-6">
        <div className="bg-[var(--bg-card)] p-8 rounded-2xl border border-[var(--border-color)] text-center">
          <h1 className="text-2xl font-bold mb-2">Avaliação indisponível</h1>
          <p>{erro}</p>
        </div>
      </main>
    );
  if (!avaliacao)
    return (
      <main className="min-h-screen grid place-items-center bg-[var(--bg-main)]">
        Carregando avaliação...
      </main>
    );

  const respostas = avaliacao.respostas || [];
  const logoRelatorio = branding.logo_avaliacao || branding.logo_site || "/nova-esperanca-logo.png";
  return (
    <main className="min-h-screen bg-[#eeeae6] py-5 sm:py-8 px-3 print:bg-white print:p-0">
      <div className="max-w-5xl mx-auto flex items-center justify-between mb-4 no-print">
        <button
          onClick={() =>
            localStorage.getItem("token")
              ? navigate("/avaliacoes")
              : navigate("/")
          }
          className="font-bold text-stone-700 flex items-center"
        >
          <ArrowLeft size={18} className="mr-1" />
          Voltar
        </button>
        <div className="flex gap-2">
          <button
            onClick={compartilhar}
            className="bg-white border border-stone-300 px-4 py-2 rounded-xl font-bold flex items-center"
          >
            <Share2 size={18} className="mr-2" />
            Compartilhar
          </button>
          <button
            onClick={() => window.print()}
            className="bg-amber-600 text-white px-4 py-2 rounded-xl font-bold flex items-center"
          >
            <Printer size={18} className="mr-2" />
            Imprimir
          </button>
        </div>
      </div>

      <article className="evaluation-report brand-report max-w-5xl mx-auto bg-white shadow-2xl print:shadow-none overflow-hidden">
        <div className="h-3 bg-[#ff8d2f]" />
        <header className="brand-report-header grid md:grid-cols-[190px_1fr_150px] items-center gap-6 px-7 py-6 border-b border-[#ead8cc]">
          <div className="brand-logo-wrap"><img src={logoRelatorio} alt={branding.nome_site || "Nova Esperança"} className="max-h-28 max-w-[170px] object-contain" /></div>
          <div><p className="brand-kicker">Avaliação mensal de competências</p><h1 className="brand-serif text-3xl text-[#a65526] font-bold mt-1">Relatório de desempenho</h1><p className="text-[#5e5e5e] mt-2"><strong>{avaliacao.colaborador_nome}</strong> · {avaliacao.setor || avaliacao.cargo}</p></div>
          <div className="brand-score"><span>Nota final</span><strong>{avaliacao.percentual}%</strong><small>{avaliacao.classificacao}</small></div>
        </header>

        <section className="grid sm:grid-cols-3 gap-px bg-[#ead8cc] border-b border-[#ead8cc]">
          <div className="brand-meta"><span>Elaborado por</span><strong>{avaliacao.elaborado_por}</strong></div>
          <div className="brand-meta"><span>Aplicado por</span><strong>{avaliacao.aplicado_por}</strong></div>
          <div className="brand-meta"><span>Período avaliado</span><strong>{formatarMes(avaliacao.mes_referencia)}</strong></div>
        </section>

        <section className="px-7 pt-6 pb-3"><div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2"><div><p className="brand-kicker">Competências avaliadas</p><h2 className="brand-serif text-2xl text-[#a65526] font-bold">Detalhamento da avaliação</h2></div><p className="text-xs text-[#5e5e5e]">0-49 Ruim · 50-79 Regular · 80-90 Bom · 91-100 Ótimo</p></div></section>
        <div className="px-7 pb-7 space-y-4">
        {respostas.map((item, indice) => {
          return (
            <section
              key={item.pergunta_id || item.competencia || indice}
              className="evaluation-section brand-competency grid grid-cols-[1fr_76px] sm:grid-cols-[1fr_96px]"
            >
              <div className="p-4 sm:p-5">
                <div className="flex items-center gap-3"><span className="brand-section-number">{String(indice + 1).padStart(2,"0")}</span><div><p className="text-[10px] uppercase tracking-[0.18em] text-[#ff8d2f] font-extrabold">Competência</p><h3 className="brand-serif text-lg font-bold text-[#a65526]">{item.titulo}</h3></div></div>
                <p className="font-semibold text-sm mt-3 text-[#454545]">{String(item.pergunta || "").replace(/^\s*SEÇÃO\s+\d+\s*:\s*/i, "")}</p>
                <ol className="list-decimal ml-5 mt-2 text-xs text-[#5e5e5e] space-y-1">
                  {(item.criterios || []).map((criterio) => (
                    <li key={criterio}>{criterio}</li>
                  ))}
                </ol>
                <div className="brand-observation"><span>Observação</span><p>{item.observacao || "Sem observações registradas."}</p></div>
              </div>
              <div className="brand-note grid place-items-center text-center">
                <span>
                  <small className="block uppercase tracking-wider">Nota</small>
                  <strong className="text-3xl">{item.nota ?? "—"}</strong>
                </span>
              </div>
            </section>
          );
        })}
        </div>

        <section className="performance-print bg-[#faf6f2] border-t border-[#ead8cc] px-7 py-7">
          <div className="mb-4">
            <p className="brand-kicker">Histórico individual</p>
            <h2 className="brand-serif text-2xl font-bold text-[#a65526]">Evolução do desempenho</h2>
          </div>
          <GraficoDesempenho historico={avaliacao.historico} />
        </section>
        <footer className="bg-[#5e5e5e] text-white px-7 py-3 flex justify-between text-[10px] uppercase tracking-widest"><span>{branding.nome_site || "Nova Esperança"}</span><span>Tecnologia e tradição em produção de pães</span></footer>
      </article>
    </main>
  );
}
