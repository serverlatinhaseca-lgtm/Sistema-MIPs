import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { Bell, Plus, Printer, Share2, Trash2, Pencil } from "lucide-react";
import Sidebar from "../components/Sidebar";
import GraficoDesempenho from "../components/GraficoDesempenho";
import { formatarMes } from "../avaliacoes";

const mesAtual = new Date().toISOString().slice(0, 7);
async function copiarLink(url) {
  if (navigator.clipboard && window.isSecureContext)
    return navigator.clipboard.writeText(url);
  const c = document.createElement("textarea");
  c.value = url;
  c.style.position = "fixed";
  c.style.opacity = "0";
  document.body.appendChild(c);
  c.select();
  document.execCommand("copy");
  c.remove();
}

function MinhasAvaliacoes({ api, headers }) {
  const [itens, setItens] = useState([]);
  useEffect(() => {
    axios
      .get(`${api}/minhas-avaliacoes`, { headers })
      .then((r) => setItens(r.data));
  }, []);
  return (
    <div className="min-h-screen bg-[var(--bg-main)] flex">
      <Sidebar />
      <main className="flex-1 p-4 sm:p-8">
        <h1 className="text-3xl font-bold mb-2">Meu desempenho</h1>
        <p className="text-[var(--text-muted)] mb-6">
          Consulte suas avaliações e sua evolução mensal.
        </p>
        <section className="panel-card mb-5">
          <GraficoDesempenho historico={itens} />
        </section>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {itens.map((i) => (
            <article key={i.id} className="panel-card">
              <p className="section-label">{formatarMes(i.mes_referencia)}</p>
              <strong className="block text-4xl my-3">{i.percentual}%</strong>
              <p className="font-bold mb-4">{i.classificacao}</p>
              <button
                onClick={() =>
                  window.open(
                    `/avaliacoes/compartilhada/${i.token_compartilhamento}`,
                    "_blank",
                  )
                }
                className="text-amber-700 font-bold"
              >
                Abrir avaliação
              </button>
            </article>
          ))}
          {!itens.length && (
            <p className="text-[var(--text-muted)]">
              Você ainda não possui avaliações.
            </p>
          )}
        </div>
      </main>
    </div>
  );
}

export default function Avaliacoes() {
  const api = `http://${window.location.hostname}:7001/api`,
    user = JSON.parse(localStorage.getItem("user") || "{}"),
    headers = { Authorization: `Bearer ${localStorage.getItem("token")}` };
  const [usuarios, setUsuarios] = useState([]),
    [modelos, setModelos] = useState([]),
    [modeloConfigId, setModeloConfigId] = useState(""),
    [perguntas, setPerguntas] = useState([]),
    [avaliacoes, setAvaliacoes] = useState([]),
    [lembretes, setLembretes] = useState({
      quantidade: 0,
      pendentes: [],
      mes: mesAtual,
    }),
    [selecionado, setSelecionado] = useState(""),
    [formAberto, setFormAberto] = useState(false),
    [editandoId, setEditandoId] = useState(null),
    [erro, setErro] = useState(""),
    [salvando, setSalvando] = useState(false),
    [respostas, setRespostas] = useState({});
  const [novaPergunta, setNovaPergunta] = useState({
    titulo: "",
    pergunta: "",
    criterios: "",
    obrigatoria: false,
  });
  const competencias = perguntas.map((p) => ({
    ...p,
    chave: String(p.id),
    criterios: Array.isArray(p.criterios) ? p.criterios : [],
  }));
  const [form, setForm] = useState({
    colaborador_id: "",
    mes_referencia: mesAtual,
    elaborado_por: user.nome || "",
    aplicado_por: user.nome || "",
  });
  async function carregar() {
    try {
      const [u, a, l, m] = await Promise.all([
        axios.get(`${api}/colaboradores`, { headers }),
        axios.get(`${api}/avaliacoes`, { headers }),
        axios.get(`${api}/avaliacoes/lembretes?mes=${mesAtual}`, { headers }),
        axios.get(`${api}/modelos-avaliacao`, { headers }),
      ]);
      setUsuarios(u.data);
      setAvaliacoes(a.data);
      setLembretes(l.data);
      setModelos(m.data);
      const configId = modeloConfigId || String(m.data[0]?.id || "");
      setModeloConfigId(configId);
      if (!formAberto && configId) {
        const p = await axios.get(
          `${api}/perguntas-avaliacao?modelo_id=${configId}`,
          { headers },
        );
        setPerguntas(p.data);
      }
      setSelecionado((v) => v || String(u.data[0]?.id || ""));
    } catch (e) {
      setErro(
        e.response?.data?.error || "Não foi possível carregar as avaliações.",
      );
    }
  }
  useEffect(() => {
    if (user.perfil?.toLowerCase() !== "leitor") carregar();
  }, []);
  const historico = useMemo(
      () =>
        avaliacoes.filter(
          (a) => String(a.colaborador_id) === String(selecionado),
        ),
      [avaliacoes, selecionado],
    ),
    pontos = competencias.reduce(
      (t, c) => t + Number(respostas[c.chave]?.nota || 0),
      0,
    );
  async function carregarPerguntasUsuario(id) {
    if (!id) {
      setPerguntas([]);
      return;
    }
    const p = await axios.get(`${api}/perguntas-avaliacao?usuario_id=${id}`, {
      headers,
    });
    setPerguntas(p.data);
  }
  async function iniciar(id = "") {
    setEditandoId(null);
    setForm({
      colaborador_id: String(id),
      mes_referencia: mesAtual,
      elaborado_por: user.nome || "",
      aplicado_por: user.nome || "",
    });
    setRespostas({});
    await carregarPerguntasUsuario(id);
    setErro("");
    setFormAberto(true);
    window.scrollTo(0, 0);
  }
  async function editar(id) {
    try {
      const { data } = await axios.get(`${api}/avaliacoes/${id}`, { headers }),
        mapa = {};
      (data.respostas || []).forEach((r) => {
        mapa[r.competencia] = {
          nota: Number(r.nota),
          observacao: r.observacao || "",
        };
      });
      setPerguntas(
        (data.respostas || []).map((r, index) => ({
          id: r.pergunta_id || r.competencia,
          titulo: r.titulo,
          pergunta: r.pergunta,
          criterios: r.criterios || [],
          obrigatoria: r.obrigatoria,
          ordem: index + 1,
        })),
      );
      setEditandoId(id);
      setForm({
        colaborador_id: String(data.usuario_avaliado_id || data.colaborador_id),
        mes_referencia: data.mes_referencia,
        elaborado_por: data.elaborado_por,
        aplicado_por: data.aplicado_por,
      });
      setRespostas(mapa);
      setErro("");
      setFormAberto(true);
      window.scrollTo(0, 0);
    } catch (e) {
      alert(e.response?.data?.error || "Erro ao abrir avaliação para edição.");
    }
  }
  async function salvar(e) {
    e.preventDefault();
    setSalvando(true);
    try {
      const payload = {
          ...form,
          colaborador_id: Number(form.colaborador_id),
          respostas: competencias.map((c) => ({
            competencia: c.chave,
            nota: Number(respostas[c.chave]?.nota),
            observacao: respostas[c.chave]?.observacao || "",
          })),
        },
        r = await axios[editandoId ? "put" : "post"](
          `${api}/avaliacoes${editandoId ? `/${editandoId}` : ""}`,
          payload,
          { headers },
        );
      await carregar();
      setFormAberto(false);
      setEditandoId(null);
      window.open(
        `/avaliacoes/compartilhada/${r.data.token_compartilhamento}`,
        "_blank",
      );
    } catch (e) {
      setErro(e.response?.data?.error || "Erro ao salvar avaliação.");
    } finally {
      setSalvando(false);
    }
  }
  async function compartilhar(a) {
    const url = `${window.location.origin}/avaliacoes/compartilhada/${a.token_compartilhamento}`;
    try {
      if (navigator.share)
        await navigator.share({
          title: `Avaliação de ${a.colaborador_nome}`,
          url,
        });
      else {
        await copiarLink(url);
        alert("Link copiado!");
      }
    } catch (e) {
      if (e.name !== "AbortError") alert("Não foi possível compartilhar.");
    }
  }
  async function excluir(id) {
    if (confirm("Deseja realmente apagar esta avaliação?")) {
      try {
        await axios.delete(`${api}/avaliacoes/${id}`, { headers });
        await carregar();
      } catch (e) {
        alert(e.response?.data?.error || "Erro ao excluir avaliação.");
      }
    }
  }
  async function adicionarPergunta(e) {
    e.preventDefault();
    try {
      await axios.post(
        `${api}/perguntas-avaliacao`,
        {
          ...novaPergunta,
          modelo_avaliacao_id: Number(modeloConfigId),
          criterios: novaPergunta.criterios
            .split("\n")
            .map((x) => x.trim())
            .filter(Boolean),
        },
        { headers },
      );
      setNovaPergunta({
        titulo: "",
        pergunta: "",
        criterios: "",
        obrigatoria: false,
      });
      await carregar();
    } catch (e) {
      alert(e.response?.data?.error || "Erro ao adicionar pergunta.");
    }
  }
  async function removerPergunta(id) {
    if (!confirm("Remover esta pergunta das próximas avaliações?")) return;
    try {
      await axios.delete(`${api}/perguntas-avaliacao/${id}`, { headers });
      await carregar();
    } catch (e) {
      alert(e.response?.data?.error || "Erro ao remover pergunta.");
    }
  }
  if (user.perfil?.toLowerCase() === "leitor")
    return <MinhasAvaliacoes api={api} headers={headers} />;
  if (formAberto)
    return (
      <div className="min-h-screen bg-[var(--bg-main)] flex">
        <Sidebar />
        <main className="flex-1 p-4 sm:p-8">
          <button
            onClick={() => setFormAberto(false)}
            className="text-amber-700 font-semibold mb-4"
          >
            ← Voltar às avaliações
          </button>
          <div className="flex justify-between mb-7">
            <div>
              <p className="section-label">Avaliação mensal</p>
              <h1 className="text-3xl font-bold">
                {editandoId ? "Editar avaliação" : "Registrar desempenho"}
              </h1>
            </div>
            <div className="panel-card">
              <small>Resultado parcial</small>
              <strong className="block text-2xl">
                {competencias.length
                  ? Math.round((pontos / (competencias.length * 10)) * 100)
                  : 0}
                %
              </strong>
            </div>
          </div>
          <form onSubmit={salvar}>
            <section className="panel-card grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
              <label className="font-semibold text-sm">
                Usuário
                <select
                  required
                  value={form.colaborador_id}
                  onChange={(e) => {
                    setForm({ ...form, colaborador_id: e.target.value });
                    setRespostas({});
                    carregarPerguntasUsuario(e.target.value);
                  }}
                  className="field"
                >
                  <option value="">Selecione</option>
                  {usuarios.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.nome}
                    </option>
                  ))}
                </select>
              </label>
              <label className="font-semibold text-sm">
                Mês
                <input
                  required
                  type="month"
                  value={form.mes_referencia}
                  onChange={(e) =>
                    setForm({ ...form, mes_referencia: e.target.value })
                  }
                  className="field"
                />
              </label>
              <label className="font-semibold text-sm">
                Elaborado por
                <input
                  required
                  value={form.elaborado_por}
                  onChange={(e) =>
                    setForm({ ...form, elaborado_por: e.target.value })
                  }
                  className="field"
                />
              </label>
              <label className="font-semibold text-sm">
                Aplicado por
                <input
                  required
                  value={form.aplicado_por}
                  onChange={(e) =>
                    setForm({ ...form, aplicado_por: e.target.value })
                  }
                  className="field"
                />
              </label>
            </section>
            <div className="text-right text-xs text-[var(--text-muted)] mb-4">
              🔴 Muito ruim · 0 &nbsp; 🟡 Ruim · 5 &nbsp; 🟠 Bom · 8 &nbsp; 🟢
              Ótimo · 10
            </div>
            {competencias.map((c, i) => (
              <section
                key={c.chave}
                className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl overflow-hidden mb-4"
              >
                <div className="bg-stone-800 p-5 flex flex-col lg:flex-row justify-between gap-4">
                  <div>
                    <p className="text-xs uppercase font-bold text-stone-200">
                      Seção {i + 1} · {c.titulo}
                    </p>
                    <h2 className="font-bold text-lg text-white">
                      {c.pergunta}
                    </h2>
                  </div>
                  <div className="flex gap-2">
                    {[0, 5, 8, 10].map((n) => (
                      <label
                        key={n}
                        className={`w-12 h-11 rounded-xl grid place-items-center cursor-pointer font-bold ${Number(respostas[c.chave]?.nota) === n ? "bg-amber-600 text-white" : "bg-white text-stone-900"}`}
                      >
                        <input
                          className="sr-only"
                          required
                          type="radio"
                          name={`nota-${c.chave}`}
                          onChange={() =>
                            setRespostas({
                              ...respostas,
                              [c.chave]: { ...respostas[c.chave], nota: n },
                            })
                          }
                        />
                        {n}
                      </label>
                    ))}
                  </div>
                </div>
                <ol className="list-decimal ml-10 p-5 pb-2 text-sm">
                  {c.criterios.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ol>
                <div className="p-5 pt-2">
                  <label className="font-semibold text-sm">
                    Observação e ponto de melhoria{" "}
                    {c.obrigatoria && (
                      <span className="text-red-600">· obrigatória</span>
                    )}
                    <textarea
                      required={c.obrigatoria}
                      className="field"
                      rows="3"
                      value={respostas[c.chave]?.observacao || ""}
                      onChange={(e) =>
                        setRespostas({
                          ...respostas,
                          [c.chave]: {
                            ...respostas[c.chave],
                            observacao: e.target.value,
                          },
                        })
                      }
                    />
                  </label>
                </div>
              </section>
            ))}
            {erro && <p className="text-red-600 mb-4">{erro}</p>}
            <button
              disabled={salvando}
              className="float-right bg-amber-600 text-white px-7 py-3 rounded-xl font-bold"
            >
              {salvando
                ? "Salvando..."
                : editandoId
                  ? "Salvar alterações"
                  : "Concluir avaliação"}
            </button>
          </form>
        </main>
      </div>
    );
  return (
    <div className="min-h-screen bg-[var(--bg-main)] flex">
      <Sidebar />
      <main className="flex-1 p-4 sm:p-8 overflow-x-hidden">
        <header className="flex justify-between gap-4 mb-7">
          <div>
            <p className="section-label">Gestão de pessoas</p>
            <h1 className="text-3xl font-bold">Avaliações mensais</h1>
            <p className="text-[var(--text-muted)]">
              As avaliações são vinculadas aos usuários do sistema.
            </p>
          </div>
          <button
            disabled={!usuarios.length}
            onClick={() => iniciar()}
            className="bg-amber-600 text-white px-5 py-3 rounded-xl font-bold flex items-center h-fit"
          >
            <Plus size={20} className="mr-2" />
            Nova avaliação
          </button>
        </header>
        {lembretes.quantidade > 0 && (
          <section className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex gap-3 mb-5 text-amber-950">
            <Bell />
            <div>
              <strong>
                {lembretes.quantidade} avaliações pendentes em{" "}
                {formatarMes(lembretes.mes)}
              </strong>
              <p className="text-sm">
                {lembretes.pendentes.map((p) => p.nome).join(", ")}
              </p>
            </div>
          </section>
        )}
        {erro && <p className="text-red-600 mb-4">{erro}</p>}
        <div className="grid xl:grid-cols-[1.5fr_1fr] gap-5 mb-5">
          <section className="panel-card">
            <select
              value={selecionado}
              onChange={(e) => setSelecionado(e.target.value)}
              className="field mb-3"
            >
              {usuarios.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nome}
                </option>
              ))}
            </select>
            <GraficoDesempenho historico={historico} />
          </section>
          <section className="panel-card">
            <h2 className="section-title mb-1">Usuários</h2>
            <p className="text-sm text-[var(--text-muted)] mb-3">
              Setor e cargo são definidos na aba Usuários.
            </p>
            {usuarios.map((u) => (
              <button
                key={u.id}
                onClick={() => iniciar(u.id)}
                className="w-full text-left p-3 rounded-xl hover:bg-[var(--bg-main)]"
              >
                <strong className="block">{u.nome}</strong>
                <small className="text-[var(--text-muted)]">
                  {u.setor || "Sem setor"}
                  {u.cargo ? ` · ${u.cargo}` : ""}
                </small>
              </button>
            ))}
          </section>
        </div>
        {user.perfil?.toLowerCase() === "administrador" && (
          <section className="panel-card mb-5">
            <h2 className="section-title mb-1">Perguntas da avaliação</h2>
            <p className="text-sm text-[var(--text-muted)] mb-4">
              Somente o Administrador pode adicionar ou remover perguntas.
            </p>
            <label className="font-semibold text-sm">
              Setor / modelo
              <select
                className="field mb-4"
                value={modeloConfigId}
                onChange={async (e) => {
                  const id = e.target.value;
                  setModeloConfigId(id);
                  const r = await axios.get(
                    `${api}/perguntas-avaliacao?modelo_id=${id}`,
                    { headers },
                  );
                  setPerguntas(r.data);
                }}
              >
                {modelos.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nome}
                  </option>
                ))}
              </select>
            </label>
            <div className="space-y-2 mb-5">
              {perguntas.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between gap-3 border border-[var(--border-color)] rounded-xl p-3"
                >
                  <div>
                    <strong>{p.titulo}</strong>
                    <p className="text-sm text-[var(--text-muted)]">
                      {p.pergunta}
                    </p>
                  </div>
                  <button
                    onClick={() => removerPergunta(p.id)}
                    className="text-red-600 font-bold"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              ))}
            </div>
            <form
              onSubmit={adicionarPergunta}
              className="grid lg:grid-cols-2 gap-3"
            >
              <input
                required
                className="field"
                placeholder="Título da competência"
                value={novaPergunta.titulo}
                onChange={(e) =>
                  setNovaPergunta({ ...novaPergunta, titulo: e.target.value })
                }
              />
              <input
                required
                className="field"
                placeholder="Pergunta principal"
                value={novaPergunta.pergunta}
                onChange={(e) =>
                  setNovaPergunta({ ...novaPergunta, pergunta: e.target.value })
                }
              />
              <textarea
                className="field lg:col-span-2"
                rows="3"
                placeholder="Critérios de avaliação — um por linha"
                value={novaPergunta.criterios}
                onChange={(e) =>
                  setNovaPergunta({
                    ...novaPergunta,
                    criterios: e.target.value,
                  })
                }
              />
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={novaPergunta.obrigatoria}
                  onChange={(e) =>
                    setNovaPergunta({
                      ...novaPergunta,
                      obrigatoria: e.target.checked,
                    })
                  }
                />{" "}
                Exigir observação
              </label>
              <button className="bg-amber-600 text-white rounded-xl px-5 py-3 font-bold">
                Adicionar pergunta
              </button>
            </form>
          </section>
        )}
        <section className="panel-card">
          <h2 className="section-title mb-4">Histórico de avaliações</h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="text-left">
                  <th>Usuário</th>
                  <th>Mês</th>
                  <th>Resultado</th>
                  <th>Classificação</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {avaliacoes.map((a) => (
                  <tr
                    key={a.id}
                    className="border-t border-[var(--border-color)]"
                  >
                    <td className="py-4 font-bold">{a.colaborador_nome}</td>
                    <td>{formatarMes(a.mes_referencia)}</td>
                    <td>{a.percentual}%</td>
                    <td>{a.classificacao}</td>
                    <td>
                      <div className="flex gap-3">
                        <button
                          onClick={() =>
                            window.open(
                              `/avaliacoes/compartilhada/${a.token_compartilhamento}`,
                              "_blank",
                            )
                          }
                          className="text-amber-700 font-bold flex"
                        >
                          <Printer size={16} className="mr-1" />
                          Abrir
                        </button>
                        <button
                          onClick={() => compartilhar(a)}
                          className="text-blue-700 font-bold flex"
                        >
                          <Share2 size={16} className="mr-1" />
                          Link
                        </button>
                        <button
                          onClick={() => editar(a.id)}
                          className="text-amber-700 font-bold flex"
                        >
                          <Pencil size={16} className="mr-1" />
                          Editar
                        </button>
                        <button
                          onClick={() => excluir(a.id)}
                          className="text-red-600 font-bold flex"
                        >
                          <Trash2 size={16} className="mr-1" />
                          Apagar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}
