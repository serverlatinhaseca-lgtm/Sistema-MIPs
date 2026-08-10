import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Bell, ClipboardCheck, Plus, Printer, Share2, TrendingUp, UserPlus, Users } from 'lucide-react';
import Sidebar from '../components/Sidebar';
import GraficoDesempenho from '../components/GraficoDesempenho';
import { COMPETENCIAS, formatarMes } from '../avaliacoes';

const mesAtual = new Date().toISOString().slice(0, 7);

export default function Avaliacoes() {
  const host = window.location.hostname;
  const api = `http://${host}:7001/api`;
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const headers = { Authorization: `Bearer ${localStorage.getItem('token')}` };
  const [colaboradores, setColaboradores] = useState([]);
  const [avaliacoes, setAvaliacoes] = useState([]);
  const [lembretes, setLembretes] = useState({ quantidade: 0, pendentes: [], mes: mesAtual });
  const [selecionado, setSelecionado] = useState('');
  const [modoFormulario, setModoFormulario] = useState(false);
  const [mostrarCadastro, setMostrarCadastro] = useState(false);
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [novoColaborador, setNovoColaborador] = useState({ nome: '', setor: '', cargo: '' });
  const [formulario, setFormulario] = useState({
    colaborador_id: '', mes_referencia: mesAtual, elaborado_por: user.nome || '', aplicado_por: user.nome || '', duracao_minutos: 60,
  });
  const [respostas, setRespostas] = useState({});

  async function carregar() {
    try {
      const [colab, aval, lemb] = await Promise.all([
        axios.get(`${api}/colaboradores`, { headers }),
        axios.get(`${api}/avaliacoes`, { headers }),
        axios.get(`${api}/avaliacoes/lembretes?mes=${mesAtual}`, { headers }),
      ]);
      setColaboradores(colab.data);
      setAvaliacoes(aval.data);
      setLembretes(lemb.data);
      setSelecionado((atual) => atual || String(colab.data[0]?.id || ''));
    } catch (e) { setErro(e.response?.data?.error || 'Não foi possível carregar as avaliações.'); }
  }

  useEffect(() => {
    if (user.perfil?.toLowerCase() === 'leitor') { navigate('/mips'); return; }
    carregar();
  }, []);

  const historicoSelecionado = useMemo(() => avaliacoes.filter((item) => String(item.colaborador_id) === String(selecionado)), [avaliacoes, selecionado]);
  const media = avaliacoes.length ? Math.round(avaliacoes.reduce((total, item) => total + Number(item.percentual), 0) / avaliacoes.length) : null;
  const pontosFormulario = COMPETENCIAS.reduce((total, item) => total + Number(respostas[item.chave]?.nota || 0), 0);
  const percentualFormulario = Math.round((pontosFormulario / 70) * 100);

  function iniciarAvaliacao(colaboradorId = '') {
    setFormulario({ colaborador_id: String(colaboradorId), mes_referencia: mesAtual, elaborado_por: user.nome || '', aplicado_por: user.nome || '', duracao_minutos: 60 });
    setRespostas({});
    setErro('');
    setModoFormulario(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function cadastrarColaborador(event) {
    event.preventDefault();
    setErro('');
    try {
      const result = await axios.post(`${api}/colaboradores`, novoColaborador, { headers });
      setNovoColaborador({ nome: '', setor: '', cargo: '' });
      setMostrarCadastro(false);
      await carregar();
      setSelecionado(String(result.data.id));
    } catch (e) { setErro(e.response?.data?.error || 'Erro ao cadastrar colaborador.'); }
  }

  async function salvarAvaliacao(event) {
    event.preventDefault();
    setErro('');
    setSalvando(true);
    try {
      const payload = {
        ...formulario,
        colaborador_id: Number(formulario.colaborador_id),
        duracao_minutos: Number(formulario.duracao_minutos),
        respostas: COMPETENCIAS.map((item) => ({ competencia: item.chave, nota: Number(respostas[item.chave]?.nota), observacao: respostas[item.chave]?.observacao || '' })),
      };
      const result = await axios.post(`${api}/avaliacoes`, payload, { headers });
      await carregar();
      navigate(`/avaliacoes/compartilhada/${result.data.token_compartilhamento}`);
    } catch (e) { setErro(e.response?.data?.error || 'Erro ao salvar avaliação.'); }
    finally { setSalvando(false); }
  }

  async function compartilhar(token, nome) {
    const url = `${window.location.origin}/avaliacoes/compartilhada/${token}`;
    try {
      if (navigator.share) await navigator.share({ title: `Avaliação de ${nome}`, url });
      else { await navigator.clipboard.writeText(url); alert('Link copiado!'); }
    } catch (e) { if (e.name !== 'AbortError') alert('Não foi possível compartilhar.'); }
  }

  if (modoFormulario) return (
    <div className="min-h-screen bg-[var(--bg-main)] flex">
      <Sidebar />
      <main className="flex-1 p-4 sm:p-8 lg:p-10 overflow-x-hidden">
        <button onClick={() => setModoFormulario(false)} className="text-amber-700 font-semibold mb-4">← Voltar às avaliações</button>
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-7">
          <div><p className="text-xs uppercase tracking-widest font-bold text-amber-700">Avaliação mensal</p><h1 className="text-3xl font-bold text-[var(--text-main)]">Registrar desempenho</h1></div>
          <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl px-5 py-3"><span className="text-sm text-[var(--text-muted)]">Resultado parcial</span><strong className="block text-2xl text-[var(--text-main)]">{percentualFormulario}%</strong></div>
        </div>
        <form onSubmit={salvarAvaliacao}>
          <section className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl p-5 grid sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-5">
            <label className="text-sm font-semibold">Colaborador<select required value={formulario.colaborador_id} onChange={(e) => setFormulario({ ...formulario, colaborador_id: e.target.value })} className="field"><option value="">Selecione</option>{colaboradores.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}</select></label>
            <label className="text-sm font-semibold">Mês<input required type="month" value={formulario.mes_referencia} onChange={(e) => setFormulario({ ...formulario, mes_referencia: e.target.value })} className="field" /></label>
            <label className="text-sm font-semibold">Elaborado por<input required value={formulario.elaborado_por} onChange={(e) => setFormulario({ ...formulario, elaborado_por: e.target.value })} className="field" /></label>
            <label className="text-sm font-semibold">Aplicado por<input required value={formulario.aplicado_por} onChange={(e) => setFormulario({ ...formulario, aplicado_por: e.target.value })} className="field" /></label>
            <label className="text-sm font-semibold">Duração (min)<input required min="1" type="number" value={formulario.duracao_minutos} onChange={(e) => setFormulario({ ...formulario, duracao_minutos: e.target.value })} className="field" /></label>
          </section>

          <div className="flex flex-wrap gap-3 justify-end text-xs text-[var(--text-muted)] mb-4"><span>🔴 Muito ruim · 0</span><span>🟡 Ruim · 5</span><span>🟠 Bom · 8</span><span>🟢 Ótimo · 10</span></div>
          {COMPETENCIAS.map((item, indice) => <section key={item.chave} className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl overflow-hidden mb-4 shadow-sm">
            <div className="bg-slate-100 dark:bg-stone-800 p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div><p className="text-xs uppercase tracking-wider font-bold text-slate-600 dark:text-stone-300">Seção {indice+1} · {item.titulo}</p><h2 className="font-bold text-lg text-[var(--text-main)]">{item.pergunta}</h2></div>
              <div className="flex gap-2">{[0,5,8,10].map((nota) => <label key={nota} className={`w-12 h-11 rounded-xl border-2 grid place-items-center cursor-pointer font-bold transition ${Number(respostas[item.chave]?.nota) === nota ? 'bg-amber-600 border-amber-600 text-white' : 'bg-[var(--bg-card)] border-[var(--border-color)] text-[var(--text-main)]'}`}><input className="sr-only" type="radio" required name={`nota-${item.chave}`} value={nota} onChange={() => setRespostas({ ...respostas, [item.chave]: { ...respostas[item.chave], nota } })}/>{nota}</label>)}</div>
            </div>
            <ol className="list-decimal ml-10 p-5 pb-2 text-sm text-[var(--text-main)] space-y-1">{item.criterios.map((criterio) => <li key={criterio}>{criterio}</li>)}</ol>
            <div className="p-5 pt-2"><label className="text-sm font-semibold">Observação e ponto de melhoria {item.obrigatoria && <span className="text-red-600">· obrigatória</span>}<textarea required={item.obrigatoria} rows="3" value={respostas[item.chave]?.observacao || ''} onChange={(e) => setRespostas({ ...respostas, [item.chave]: { ...respostas[item.chave], observacao: e.target.value } })} className="field resize-y" placeholder="Registre exemplos concretos e a orientação combinada." /></label></div>
          </section>)}
          {erro && <p className="text-red-600 font-semibold mb-4">{erro}</p>}
          <div className="flex justify-end"><button disabled={salvando} className="bg-amber-600 text-white px-7 py-3 rounded-xl font-bold hover:bg-amber-700 disabled:opacity-60">{salvando ? 'Salvando...' : 'Concluir avaliação'}</button></div>
        </form>
      </main>
    </div>
  );

  return (
    <div className="min-h-screen bg-[var(--bg-main)] flex">
      <Sidebar />
      <main className="flex-1 p-4 sm:p-8 lg:p-10 overflow-x-hidden">
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-7"><div><p className="text-xs uppercase tracking-widest font-bold text-amber-700">Gestão de pessoas</p><h1 className="text-3xl font-bold text-[var(--text-main)]">Avaliações mensais</h1><p className="text-[var(--text-muted)]">Acompanhe a evolução da equipe e mantenha as conversas em dia.</p></div><button disabled={!colaboradores.length} onClick={() => iniciarAvaliacao()} className="bg-amber-600 text-white px-5 py-3 rounded-xl font-bold flex items-center justify-center disabled:opacity-50"><Plus size={20} className="mr-2"/>Nova avaliação</button></header>

        {lembretes.quantidade > 0 && <section className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3 mb-5 text-amber-950"><Bell className="shrink-0 mt-1"/><div><strong>{lembretes.quantidade} {lembretes.quantidade === 1 ? 'avaliação pendente' : 'avaliações pendentes'} em {formatarMes(lembretes.mes)}</strong><p className="text-sm">{lembretes.pendentes.slice(0,4).map((item) => item.nome).join(', ')}{lembretes.quantidade > 4 ? ` e mais ${lembretes.quantidade-4}` : ''}.</p></div></section>}
        {erro && <p className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 mb-5">{erro}</p>}

        <div className="grid sm:grid-cols-3 gap-4 mb-5">
          <article className="metric-card"><Bell className="text-amber-600"/><div><span>Pendentes no mês</span><strong>{lembretes.quantidade}</strong></div></article>
          <article className="metric-card"><ClipboardCheck className="text-green-600"/><div><span>Realizadas</span><strong>{avaliacoes.length}</strong></div></article>
          <article className="metric-card"><TrendingUp className="text-blue-600"/><div><span>Média geral</span><strong>{media === null ? '—' : `${media}%`}</strong></div></article>
        </div>

        <div className="grid xl:grid-cols-[1.5fr_1fr] gap-5 mb-5">
          <section className="panel-card"><div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3"><div><p className="section-label">Desempenho</p><h2 className="section-title">Evolução do colaborador</h2></div><select value={selecionado} onChange={(e) => setSelecionado(e.target.value)} className="field sm:max-w-xs"><option value="">Selecione</option>{colaboradores.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}</select></div><GraficoDesempenho historico={historicoSelecionado}/></section>
          <section className="panel-card"><div className="flex items-center justify-between mb-4"><div><p className="section-label">Equipe</p><h2 className="section-title">Colaboradores</h2></div><button onClick={() => setMostrarCadastro(!mostrarCadastro)} className="text-amber-700 font-bold flex items-center"><UserPlus size={18} className="mr-1"/>Cadastrar</button></div>
            {mostrarCadastro && <form onSubmit={cadastrarColaborador} className="bg-[var(--bg-main)] border border-[var(--border-color)] rounded-xl p-3 space-y-2 mb-4"><input required placeholder="Nome" value={novoColaborador.nome} onChange={(e) => setNovoColaborador({...novoColaborador,nome:e.target.value})} className="field"/><input required placeholder="Setor" value={novoColaborador.setor} onChange={(e) => setNovoColaborador({...novoColaborador,setor:e.target.value})} className="field"/><input placeholder="Cargo" value={novoColaborador.cargo} onChange={(e) => setNovoColaborador({...novoColaborador,cargo:e.target.value})} className="field"/><button className="w-full bg-amber-600 text-white rounded-lg py-2 font-bold">Salvar</button></form>}
            <div className="space-y-2 max-h-72 overflow-y-auto">{colaboradores.map((item) => { const pendente=lembretes.pendentes.some((p)=>p.id===item.id); return <button key={item.id} onClick={() => iniciarAvaliacao(item.id)} className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-[var(--bg-main)] text-left"><div className="flex items-center"><span className="w-9 h-9 rounded-full bg-stone-700 text-white grid place-items-center font-bold mr-3">{item.nome.slice(0,2).toUpperCase()}</span><span><strong className="block text-[var(--text-main)]">{item.nome}</strong><small className="text-[var(--text-muted)]">{item.setor}{item.cargo ? ` · ${item.cargo}` : ''}</small></span></div><span className={`w-2.5 h-2.5 rounded-full ${pendente?'bg-amber-500':'bg-green-500'}`}/></button>})}{!colaboradores.length && <div className="text-center py-10 text-[var(--text-muted)]"><Users className="mx-auto mb-2"/>Cadastre o primeiro colaborador.</div>}</div>
          </section>
        </div>

        <section className="panel-card"><div className="mb-4"><p className="section-label">Registro</p><h2 className="section-title">Histórico de avaliações</h2></div><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-sm"><thead><tr className="text-left text-[var(--text-muted)] border-b border-[var(--border-color)]"><th className="py-3">Colaborador</th><th>Mês</th><th>Setor</th><th>Resultado</th><th>Classificação</th><th>Ações</th></tr></thead><tbody>{avaliacoes.map((item)=><tr key={item.id} className="border-b border-[var(--border-color)] last:border-0"><td className="py-4 font-bold">{item.colaborador_nome}</td><td>{formatarMes(item.mes_referencia)}</td><td>{item.setor}</td><td className="font-bold">{item.percentual}%</td><td><span className="px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 font-bold text-xs">{item.classificacao}</span></td><td><div className="flex gap-3"><button onClick={()=>window.open(`/avaliacoes/compartilhada/${item.token_compartilhamento}`,'_blank')} className="text-amber-700 font-bold flex items-center"><Printer size={16} className="mr-1"/>Abrir</button><button onClick={()=>compartilhar(item.token_compartilhamento,item.colaborador_nome)} className="text-blue-700 font-bold flex items-center"><Share2 size={16} className="mr-1"/>Link</button></div></td></tr>)}{!avaliacoes.length&&<tr><td colSpan="6" className="py-10 text-center text-[var(--text-muted)]">Nenhuma avaliação registrada.</td></tr>}</tbody></table></div></section>
      </main>
    </div>
  );
}
