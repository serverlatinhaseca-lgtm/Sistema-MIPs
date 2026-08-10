import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { ArrowLeft, Clock, User, Trash2, CheckCircle } from 'lucide-react';

export default function DetalheMIP() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [mip, setMip] = useState(null);
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

  if (!mip) return <div className="p-8 text-center text-[var(--text-muted)]">Carregando MIP...</div>;

  return (
    <div className="min-h-screen bg-[var(--bg-main)] p-4 sm:p-8">
      <div className="max-w-4xl mx-auto bg-[var(--bg-card)] border border-[var(--border-color)] p-4 sm:p-8 rounded-xl shadow-sm">

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
            {!isLeitor && (
              <button onClick={handleExcluir} className="flex items-center text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 px-3 py-2 rounded-lg font-medium text-xs sm:text-sm transition-colors">
                <Trash2 size={16} className="mr-1.5 shrink-0" /> Excluir
              </button>
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

        {/* Conteúdo Operacional Formatado */}
        <div className="mt-8">
          <h3 className="font-bold text-[var(--text-main)] text-base sm:text-lg mb-4">Conteúdo Operacional</h3>
          <div
            className="prose prose-headings:text-[var(--text-main)] prose-p:text-[var(--text-main)] prose-strong:text-[var(--text-main)] prose-ul:text-[var(--text-main)] prose-ol:text-[var(--text-main)] prose-li:text-[var(--text-main)] prose-a:text-[var(--primary)] prose-blockquote:text-[var(--text-muted)] prose-td:text-[var(--text-main)] prose-th:text-[var(--text-main)] max-w-none text-[var(--text-main)] leading-relaxed bg-[var(--bg-main)] p-4 sm:p-6 rounded-xl border border-[var(--border-color)] overflow-x-auto text-sm sm:text-base [&_img]:max-w-full [&_img]:h-auto [&_img]:rounded-lg [&_table]:w-full [&_table]:overflow-x-auto [&_iframe]:w-full [&_iframe]:aspect-video"
            dangerouslySetInnerHTML={{ __html: mip.conteudo }}
          />
        </div>

      </div>
    </div>
  );
}
