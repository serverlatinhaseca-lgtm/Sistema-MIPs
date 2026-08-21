import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { ArrowLeft, Clock, User, Trash2, CheckCircle, XCircle, Pencil, History, Target } from 'lucide-react';
import LeitorTopbar from '../components/LeitorTopbar';

export default function DetalheMIP() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [mip, setMip] = useState(null);
  const [versoes, setVersoes] = useState([]);
  const [mostrarVersoes, setMostrarVersoes] = useState(false);
  const [mostrarReprovacao, setMostrarReprovacao] = useState(false);
  const [orientacao, setOrientacao] = useState('');
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const isAdmin = user.perfil?.toLowerCase() === 'administrador';
  const isLeitor = user.perfil?.toLowerCase() === 'leitor';

  useEffect(() => {
    const fetchMip = async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await axios.get(`http://${window.location.hostname}:7001/api/mips/${id}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setMip(res.data);
      } catch (err) { alert('Erro ao carregar MIP'); navigate('/mips'); }
    };
    fetchMip();
  }, [id, navigate]);

  const handleAprovar = async () => {
    try {
      const token = localStorage.getItem('token');
      await axios.patch(`http://${window.location.hostname}:7001/api/mips/${id}/aprovar`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      alert('MIP aprovada com sucesso!');
      window.location.reload();
    } catch (err) { alert('Erro ao aprovar MIP'); }
  };

  const handleReprovar = async (e) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem('token');
      const { data } = await axios.patch(`http://${window.location.hostname}:7001/api/mips/${id}/reprovar`, { orientacao }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setMip((atual) => ({ ...atual, status: 'Reprovado', orientacao_correcao: orientacao }));
      setMostrarReprovacao(false);
      alert(data.mensagem);
    } catch (err) { alert(err.response?.data?.error || 'Erro ao reprovar MIP'); }
  };

  const handleExcluir = async () => {
    if (!confirm('Deseja realmente excluir esta MIP?')) return;
    try {
      const token = localStorage.getItem('token');
      await axios.delete(`http://${window.location.hostname}:7001/api/mips/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      navigate('/mips');
    } catch (err) { alert('Erro ao excluir MIP'); }
  };

  const abrirHistorico = async () => {
    try { const r=await axios.get(`http://${window.location.hostname}:7001/api/mips/${id}/versoes`,{headers:{Authorization:`Bearer ${localStorage.getItem('token')}`}});setVersoes(r.data);setMostrarVersoes(true); }
    catch { alert('Erro ao carregar histórico.'); }
  };

  if (!mip) return <div className="p-8 text-center text-[var(--text-muted)]">Carregando MIP...</div>;

  return (
    <div className="min-h-screen bg-[var(--bg-main)]">
      {isLeitor && <LeitorTopbar titulo="Consulta de MIP" />}
      <div className="p-4 sm:p-8"><div className="max-w-4xl mx-auto bg-[var(--bg-card)] border border-[var(--border-color)] p-4 sm:p-8 rounded-xl shadow-sm">

        {/* Cabeçalho de Navegação e Ações */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 pb-4 border-b border-[var(--border-color)]">
          <button onClick={() => navigate('/mips')} className="flex items-center text-[var(--text-muted)] hover:text-[var(--primary)] font-medium text-sm sm:text-base transition-colors">
            <ArrowLeft size={18} className="mr-2 shrink-0" /> Voltar
          </button>

          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-end">
            {isAdmin && mip.status !== 'Publicado' && (
              <button onClick={handleAprovar} className="flex items-center bg-emerald-600 text-white px-3 py-2 rounded-lg font-medium text-xs sm:text-sm shadow-sm hover:bg-emerald-700">
                <CheckCircle size={16} className="mr-1.5 shrink-0" /> Aprovar
              </button>
            )}
            {isAdmin && mip.status !== 'Publicado' && (
              <button onClick={()=>{setOrientacao(mip.orientacao_correcao||'');setMostrarReprovacao(true);}} className="flex items-center bg-red-600 text-white px-3 py-2 rounded-lg font-medium text-xs sm:text-sm shadow-sm hover:bg-red-700">
                <XCircle size={16} className="mr-1.5 shrink-0" /> Solicitar correções
              </button>
            )}
            {!isLeitor && (
              <><button onClick={()=>navigate(`/mips/${id}/editar`)} className="flex items-center text-amber-700 px-3 py-2 rounded-lg font-medium text-xs sm:text-sm"><Pencil size={16} className="mr-1.5"/>Editar</button><button onClick={abrirHistorico} className="flex items-center text-blue-700 px-3 py-2 rounded-lg font-medium text-xs sm:text-sm"><History size={16} className="mr-1.5"/>Versões</button><button onClick={handleExcluir} className="flex items-center text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 px-3 py-2 rounded-lg font-medium text-xs sm:text-sm transition-colors">
                <Trash2 size={16} className="mr-1.5 shrink-0" /> Excluir
              </button></>
            )}
          </div>
        </div>

        {/* Informações Principais da MIP */}
        <div className="flex flex-wrap justify-between items-center gap-2 mb-4">
          <span className="bg-[var(--primary)]/10 text-[var(--primary)] text-xs sm:text-sm font-semibold px-3 py-1 rounded">{mip.codigo}</span>
          <span className="text-xs sm:text-sm font-medium text-[var(--text-muted)] bg-[var(--bg-main)] border border-[var(--border-color)] px-3 py-1 rounded">{mip.status}</span>
        </div>

        <h1 className="text-2xl sm:text-3xl font-bold text-[var(--text-main)] mb-4 leading-tight">{mip.titulo}</h1>

        <div className="flex flex-wrap items-center gap-4 text-xs sm:text-sm text-[var(--text-muted)] mb-6 pb-6 border-b border-[var(--border-color)]">
          <span className="flex items-center"><User size={15} className="mr-1.5 shrink-0"/> {mip.autor_nome || 'Sistema'}</span>
          <span className="flex items-center"><Clock size={15} className="mr-1.5 shrink-0"/> {new Date(mip.criado_em).toLocaleDateString('pt-BR')}</span>
        </div>

        {mip.resumo && (
          <div className="mb-6 p-4 bg-[var(--bg-main)] rounded-xl border-l-4 border-[var(--primary)]">
            <h3 className="font-semibold text-[var(--text-main)] mb-1 text-sm sm:text-base">Resumo</h3>
            <p className="text-[var(--text-muted)] text-sm">{mip.resumo}</p>
          </div>
        )}

        {mip.objetivo && (
          <div className="mb-6 p-4 bg-amber-50 dark:bg-amber-950/20 rounded-xl border border-amber-200 dark:border-amber-900">
            <h3 className="font-semibold text-[var(--text-main)] mb-1 text-sm sm:text-base flex items-center"><Target size={17} className="mr-2 text-[var(--primary)]"/>Objetivo</h3>
            <p className="text-[var(--text-main)] text-sm whitespace-pre-wrap">{mip.objetivo}</p>
          </div>
        )}

        {mip.status === 'Reprovado' && mip.orientacao_correcao && (
          <div className="mb-6 p-5 bg-red-50 dark:bg-red-950/20 rounded-xl border-l-4 border-red-600">
            <h3 className="font-bold text-red-700 dark:text-red-300 mb-2">Correções solicitadas pelo Administrador</h3>
            <p className="text-[var(--text-main)] whitespace-pre-wrap">{mip.orientacao_correcao}</p>
            <p className="text-xs text-[var(--text-muted)] mt-3">Edite a MIP e salve novamente para reenviá-la à aprovação.</p>
          </div>
        )}

        {/* Conteúdo Operacional Formatado */}
        <div className="mt-8">
          <h3 className="font-bold text-[var(--text-main)] text-base sm:text-lg mb-4">Conteúdo Operacional</h3>
          <div
            className="prose prose-headings:text-[var(--text-main)] prose-p:text-[var(--text-main)] prose-strong:text-[var(--text-main)] prose-ul:text-[var(--text-main)] prose-ol:text-[var(--text-main)] prose-li:text-[var(--text-main)] prose-a:text-[var(--primary)] prose-blockquote:text-[var(--text-muted)] prose-td:text-[var(--text-main)] prose-th:text-[var(--text-main)] max-w-none text-[var(--text-main)] leading-relaxed bg-[var(--bg-main)] p-4 sm:p-6 rounded-xl border border-[var(--border-color)] overflow-x-auto text-sm sm:text-base [&_img]:max-w-full [&_img]:h-auto [&_img]:rounded-lg [&_table]:w-full [&_table]:overflow-x-auto [&_iframe]:w-full [&_iframe]:aspect-video"
            dangerouslySetInnerHTML={{ __html: mip.conteudo }}
          />
        </div>

        {mostrarVersoes && <div className="fixed inset-0 bg-black/60 z-50 grid place-items-center p-4"><div className="bg-[var(--bg-card)] rounded-2xl p-6 max-w-3xl w-full max-h-[85vh] overflow-auto"><div className="flex justify-between mb-4"><div><h2 className="text-xl font-bold">Histórico de versões</h2><p className="text-sm text-[var(--text-muted)]">Veja exatamente o que mudou em cada edição.</p></div><button onClick={()=>setMostrarVersoes(false)}>Fechar</button></div>{versoes.map(v=><article key={v.id} className="border-t border-[var(--border-color)] py-5"><div className="flex justify-between gap-3"><strong>Alteração da versão {v.numero_versao}</strong><span className="text-xs text-[var(--text-muted)]">{new Date(v.criado_em).toLocaleString('pt-BR')}</span></div><p className="text-sm text-[var(--text-muted)] mb-3">Alterado por {v.alterado_por_nome||'Sistema'}</p><div className="space-y-2">{(v.alteracoes||[]).map((a,i)=><div key={`${a.campo}-${i}`} className="bg-[var(--bg-main)] rounded-xl p-3 text-sm"><strong className="text-[var(--primary)]">{a.campo}</strong><div className="grid sm:grid-cols-2 gap-2 mt-1"><p><span className="text-xs text-[var(--text-muted)] block">Antes</span>{a.de}</p><p><span className="text-xs text-[var(--text-muted)] block">Depois</span>{a.para}</p></div></div>)}{!(v.alteracoes||[]).length&&<p className="text-sm text-[var(--text-muted)]">Nenhuma diferença de conteúdo identificada.</p>}</div></article>)}{!versoes.length&&<p>Nenhuma alteração registrada.</p>}</div></div>}

        {mostrarReprovacao && <div className="fixed inset-0 bg-black/60 z-50 grid place-items-center p-4"><form onSubmit={handleReprovar} className="panel-card max-w-xl w-full"><h2 className="text-xl font-bold mb-1">Solicitar correções</h2><p className="text-sm text-[var(--text-muted)] mb-4">Explique ao autor exatamente o que precisa ser corrigido antes da nova aprovação.</p><textarea required minLength="5" rows="6" className="field" value={orientacao} onChange={e=>setOrientacao(e.target.value)} placeholder="Ex.: revisar a sequência da etapa 3 e incluir o responsável pelo controle..."/><div className="flex gap-3 mt-4"><button type="button" onClick={()=>setMostrarReprovacao(false)} className="flex-1 border border-[var(--border-color)] p-3 rounded-xl">Cancelar</button><button className="flex-1 bg-red-600 text-white p-3 rounded-xl font-bold">Reprovar e enviar</button></div></form></div>}

      </div></div>
    </div>
  );
}
