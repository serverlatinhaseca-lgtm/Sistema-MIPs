import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import { ArrowLeft, Printer, Share2 } from 'lucide-react';
import GraficoDesempenho from '../components/GraficoDesempenho';
import { COMPETENCIAS, formatarMes } from '../avaliacoes';

export default function AvaliacaoCompartilhada() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [avaliacao, setAvaliacao] = useState(null);
  const [erro, setErro] = useState('');
  const api = `http://${window.location.hostname}:7001/api`;

  useEffect(() => {
    axios.get(`${api}/avaliacoes/compartilhada/${token}`).then((res) => setAvaliacao(res.data)).catch((e) => setErro(e.response?.data?.error || 'Não foi possível abrir esta avaliação.'));
  }, [api, token]);

  async function compartilhar() {
    try {
      if (navigator.share) await navigator.share({ title: `Avaliação de ${avaliacao.colaborador_nome}`, url: window.location.href });
      else { await navigator.clipboard.writeText(window.location.href); alert('Link copiado!'); }
    } catch (e) { if (e.name !== 'AbortError') alert('Não foi possível compartilhar.'); }
  }

  if (erro) return <main className="min-h-screen grid place-items-center bg-[var(--bg-main)] p-6"><div className="bg-[var(--bg-card)] p-8 rounded-2xl border border-[var(--border-color)] text-center"><h1 className="text-2xl font-bold mb-2">Avaliação indisponível</h1><p>{erro}</p></div></main>;
  if (!avaliacao) return <main className="min-h-screen grid place-items-center bg-[var(--bg-main)]">Carregando avaliação...</main>;

  const respostas = new Map((avaliacao.respostas || []).map((item) => [item.competencia, item]));
  return (
    <main className="min-h-screen bg-stone-100 py-5 sm:py-8 px-3 print:bg-white print:p-0">
      <div className="max-w-5xl mx-auto flex items-center justify-between mb-4 no-print">
        <button onClick={() => localStorage.getItem('token') ? navigate('/avaliacoes') : navigate('/')} className="font-bold text-stone-700 flex items-center"><ArrowLeft size={18} className="mr-1"/>Voltar</button>
        <div className="flex gap-2"><button onClick={compartilhar} className="bg-white border border-stone-300 px-4 py-2 rounded-xl font-bold flex items-center"><Share2 size={18} className="mr-2"/>Compartilhar</button><button onClick={() => window.print()} className="bg-amber-600 text-white px-4 py-2 rounded-xl font-bold flex items-center"><Printer size={18} className="mr-2"/>Imprimir</button></div>
      </div>

      <article className="evaluation-report max-w-5xl mx-auto bg-white p-5 sm:p-9 shadow-xl print:shadow-none print:p-0">
        <header className="grid sm:grid-cols-[1fr_1.6fr] border-2 border-stone-700">
          <div className="bg-slate-600 text-white text-2xl font-black grid place-items-center p-5">{avaliacao.setor}</div>
          <div className="text-xl font-black grid place-items-center p-5">Nome: {avaliacao.colaborador_nome}</div>
        </header>

        <section className="grid sm:grid-cols-[1fr_1.7fr] border-2 border-t-0 border-stone-700">
          <div className="p-4 sm:border-r-2 border-stone-700 text-sm space-y-2"><p><strong>Elaborado por:</strong><br/>{avaliacao.elaborado_por}</p><p><strong>Aplicado por:</strong><br/>{avaliacao.aplicado_por}</p><p><strong>Mês:</strong> {formatarMes(avaliacao.mes_referencia)}</p><p><strong>Duração:</strong> {avaliacao.duracao_minutos} minutos</p></div>
          <div className="text-center"><h2 className="bg-stone-200 font-black py-2">NOTA FINAL</h2><p className="text-xs font-bold py-2">0–49 RUIM · 50–79 REGULAR · 80–90 BOM · 91–100 ÓTIMO</p><strong className="block bg-amber-400 text-5xl py-2">{avaliacao.percentual}%</strong><p className="font-bold py-2">{avaliacao.classificacao} · {avaliacao.pontuacao_total} de 70 pontos</p></div>
        </section>

        <h2 className="border-2 border-stone-700 text-center font-black py-3 mt-4">AVALIAÇÃO MENSAL DE COMPETÊNCIA DOS COLABORADORES</h2>
        {COMPETENCIAS.map((item, indice) => { const resposta = respostas.get(item.chave) || {}; return <section key={item.chave} className="evaluation-section grid grid-cols-[1fr_80px] sm:grid-cols-[1fr_110px] border-2 border-t-0 border-stone-500"><div className="p-3"><h3 className="font-black text-sm">SEÇÃO {indice+1}: {item.pergunta}</h3><ol className="list-decimal ml-5 mt-1 text-xs space-y-0.5">{item.criterios.map((criterio)=><li key={criterio}>{criterio}</li>)}</ol><div className="bg-orange-50 text-red-700 font-bold text-xs p-2 mt-2 min-h-8">{resposta.observacao || 'Sem observações registradas.'}</div></div><div className="bg-slate-100 border-l-2 border-stone-500 grid place-items-center text-center"><span><small className="block">Nota</small><strong className="text-3xl">{resposta.nota ?? '—'}</strong></span></div></section>; })}

        <section className="mt-6 performance-print"><div className="mb-2"><p className="text-xs uppercase tracking-widest font-bold text-amber-700">Histórico</p><h2 className="text-xl font-black">Evolução do desempenho</h2></div><GraficoDesempenho historico={avaliacao.historico}/></section>
      </article>
    </main>
  );
}
