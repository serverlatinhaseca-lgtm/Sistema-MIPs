import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { BellRing, CheckCircle2, FileWarning, X } from 'lucide-react';

export default function MipNotifications() {
  const [avisos, setAvisos] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    let ativo = true;
    const carregar = async () => {
      try {
        const { data } = await axios.get(`http://${window.location.hostname}:7001/api/mips-notificacoes`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        });
        const lidas = JSON.parse(localStorage.getItem('mips-notificacoes-lidas') || '[]');
        const novas = data.filter(a => !lidas.includes(`${a.id}:${a.status}:${a.atualizado_em}`));
        if (ativo) setAvisos(novas);
      } catch { /* notificações não bloqueiam a navegação */ }
    };
    carregar();
    const timer = setInterval(carregar, 60000);
    return () => { ativo = false; clearInterval(timer); };
  }, []);

  if (!avisos.length) return null;
  const aviso = avisos[0];
  const fechar = () => {
    const chave = `${aviso.id}:${aviso.status}:${aviso.atualizado_em}`;
    const atuais = JSON.parse(localStorage.getItem('mips-notificacoes-lidas') || '[]');
    localStorage.setItem('mips-notificacoes-lidas', JSON.stringify([...new Set([...atuais, chave])].slice(-200)));
    setAvisos(v => v.slice(1));
  };
  const reprovada = aviso.tipo === 'correcao';
  const aprovada = aviso.tipo === 'aprovacao';

  return <div className="fixed inset-0 z-[100] bg-black/55 grid place-items-center p-4">
    <section className="panel-card w-full max-w-lg relative shadow-2xl" role="dialog" aria-modal="true" aria-label="Notificação de MIP">
      <button onClick={fechar} className="absolute right-4 top-4 p-2 rounded-lg hover:bg-[var(--bg-main)]" aria-label="Fechar"><X size={20}/></button>
      <div className={`w-12 h-12 rounded-2xl grid place-items-center mb-4 ${reprovada ? 'bg-red-100 text-red-700' : aprovada ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
        {reprovada ? <FileWarning/> : aprovada ? <CheckCircle2/> : <BellRing/>}
      </div>
      <h2 className="text-xl font-bold pr-10">{reprovada ? 'Correções solicitadas' : aprovada ? 'MIP aprovada' : 'MIP aguardando sua análise'}</h2>
      <p className="mt-2 text-[var(--text-muted)]"><strong>{aviso.codigo}</strong> — {aviso.titulo}</p>
      {reprovada && aviso.orientacao_correcao && <div className="mt-4 rounded-xl bg-red-50 dark:bg-red-950/30 p-4 text-sm text-red-800 dark:text-red-200">{aviso.orientacao_correcao}</div>}
      <div className="flex gap-3 mt-6">
        <button onClick={fechar} className="flex-1 border border-[var(--border-color)] rounded-xl p-3">Ver depois</button>
        <button onClick={() => { fechar(); navigate(`/mips/${aviso.id}`); }} className="flex-1 bg-[var(--primary)] text-white rounded-xl p-3 font-semibold">Abrir MIP</button>
      </div>
      {avisos.length > 1 && <p className="text-center text-xs text-[var(--text-muted)] mt-3">Mais {avisos.length - 1} notificação(ões)</p>}
    </section>
  </div>;
}
