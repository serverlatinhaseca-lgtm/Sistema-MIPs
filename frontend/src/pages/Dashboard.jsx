import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { BookOpen, Users, PlusCircle, Calculator, ClipboardCheck, AlertTriangle } from 'lucide-react';
import Sidebar from '../components/Sidebar';
import useBranding from '../useBranding';
import API from '../api';

export default function Dashboard() {
  const [stats, setStats] = useState({ totalMips: 0, totalUsuarios: 0, totalReceitas: 0, avaliacoesPendentes: 0 });
  const [tiposRec, setTiposRec] = useState([]);
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const branding = useBranding();

  useEffect(() => {
    if (user.perfil?.toLowerCase() === 'leitor') {
      navigate('/avaliacoes');
      return;
    }

    const fetchStats = async () => {
      try {
        const res = await axios.get(`${API}/api/dashboard`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        });
        const resRec = await axios.get(`${API}/api/receitas`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        });
        const resMet = await axios.get(`${API}/api/reclamacoes/metricas`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        }).catch(() => ({ data: {} }));
        setStats({ ...res.data, totalReceitas: resRec.data.length });
        setTiposRec(resMet.data.por_tipo || []);
      } catch (err) { console.error(err); }
    };
    fetchStats();
  }, [navigate, user.perfil]);

  return (
    <div className="min-h-screen bg-[var(--bg-main)] flex">
      <Sidebar />

      <main className="flex-1 p-6 sm:p-10">
        <header className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-[var(--text-main)]">Olá, {user.nome}!</h1>
            <p className="text-[var(--text-muted)] text-sm">Bem-vindo ao painel de controle do {branding.nome_site}.</p>
          </div>
          {['administrador','editor','gerente'].includes(user.perfil?.toLowerCase()) && (
            <button onClick={() => navigate('/mips/nova')} className="flex items-center bg-amber-600 text-white px-5 py-2.5 rounded-xl hover:bg-amber-700 font-medium transition-colors shadow-md">
              <PlusCircle size={20} className="mr-2" /> Nova MIP
            </button>
          )}
        </header>

        <section className="-mx-6 sm:-mx-10 mb-8 h-56 sm:h-72 relative overflow-hidden bg-gradient-to-r from-amber-700 via-amber-800 to-stone-950">
          {(branding.imagem_dashboard || '/faixa-dashboard.jpg') && <img key={branding.imagem_dashboard || 'padrao'} src={branding.imagem_dashboard || '/faixa-dashboard.jpg'} alt="" className="absolute inset-0 w-full h-full object-contain" onError={e => { e.currentTarget.style.display = 'none'; }} />}
        </section>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6 mb-10">
          <div onClick={() => navigate('/mips')} className="bg-[var(--bg-card)] border border-[var(--border-color)] p-6 rounded-2xl shadow-sm cursor-pointer hover:border-amber-600 transition-all">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-amber-100 rounded-xl flex items-center justify-center text-amber-600">
                <BookOpen size={24} />
              </div>
              <span className="text-3xl font-extrabold text-[var(--text-main)]">{stats.totalMips}</span>
            </div>
            <h3 className="text-lg font-bold text-[var(--text-main)]">MIPs Cadastradas</h3>
            <p className="text-[var(--text-muted)] text-sm">Manuais e procedimentos ativos</p>
          </div>

          <div onClick={() => navigate('/receitas')} className="bg-[var(--bg-card)] border border-[var(--border-color)] p-6 rounded-2xl shadow-sm cursor-pointer hover:border-amber-600 transition-all">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-orange-100 rounded-xl flex items-center justify-center text-orange-600">
                <Calculator size={24} />
              </div>
              <span className="text-3xl font-extrabold text-[var(--text-main)]">{stats.totalReceitas}</span>
            </div>
            <h3 className="text-lg font-bold text-[var(--text-main)]">Calculadora de Receitas</h3>
            <p className="text-[var(--text-muted)] text-sm">Gerenciamento e impressão de massas</p>
          </div>

          <div onClick={() => navigate('/avaliacoes')} className="bg-[var(--bg-card)] border border-[var(--border-color)] p-6 rounded-2xl shadow-sm cursor-pointer hover:border-amber-600 transition-all">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center text-green-700">
                <ClipboardCheck size={24} />
              </div>
              <span className="text-3xl font-extrabold text-[var(--text-main)]">{stats.avaliacoesPendentes}</span>
            </div>
            <h3 className="text-lg font-bold text-[var(--text-main)]">Avaliações Pendentes</h3>
            <p className="text-[var(--text-muted)] text-sm">Lembretes do mês atual</p>
          </div>

          {user.perfil?.toLowerCase() === 'administrador' && (
            <div onClick={() => navigate('/usuarios')} className="bg-[var(--bg-card)] border border-[var(--border-color)] p-6 rounded-2xl shadow-sm cursor-pointer hover:border-amber-600 transition-all">
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center text-blue-600">
                  <Users size={24} />
                </div>
                <span className="text-3xl font-extrabold text-[var(--text-main)]">{stats.totalUsuarios}</span>
              </div>
              <h3 className="text-lg font-bold text-[var(--text-main)]">Usuários do Sistema</h3>
              <p className="text-[var(--text-muted)] text-sm">Contas com acesso autorizado</p>
            </div>
          )}
        </div>

        <div onClick={() => navigate('/reclamacoes')} className="bg-[var(--bg-card)] border border-[var(--border-color)] p-6 rounded-2xl shadow-sm cursor-pointer hover:border-amber-600 transition-all">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-12 h-12 bg-red-100 rounded-xl flex items-center justify-center text-red-600">
              <AlertTriangle size={24} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-[var(--text-main)]">Principais reclamações</h3>
              <p className="text-[var(--text-muted)] text-sm">Por tipo — base completa. Clique para abrir.</p>
            </div>
          </div>
          <Pizza dados={tiposRec} />
        </div>
      </main>
    </div>
  );
}

function Pizza({ dados }) {
  const cores = ['#0f766e', '#d97706', '#1d4ed8', '#6d28d9', '#b91c1c', '#15803d', '#a16207'];
  const resto = (dados || []).slice(6).reduce((t, x) => t + x.total, 0);
  const fatias = resto > 0 ? [...(dados || []).slice(0, 6), { nome: 'Outras', total: resto }] : (dados || []).slice(0, 6);
  const total = fatias.reduce((t, x) => t + x.total, 0);
  if (!total) return <p className="text-[var(--text-muted)] text-sm mt-4">Sem reclamações registradas.</p>;
  const R = 54, C = 2 * Math.PI * R;
  let acc = 0;
  return <div className="flex flex-col sm:flex-row items-center gap-6 mt-4">
    <svg width="160" height="160" viewBox="0 0 140 140" role="img" aria-label="Gráfico de reclamações por tipo">
      {fatias.map((f, i) => { const frac = f.total / total, ini = acc; acc += frac;
        return <circle key={f.nome} cx="70" cy="70" r={R} fill="none" stroke={cores[i % cores.length]} strokeWidth="22" strokeDasharray={`${frac * C} ${C}`} strokeDashoffset={-ini * C} transform="rotate(-90 70 70)" />; })}
      <text x="70" y="67" textAnchor="middle" fontSize="22" fontWeight="800" fill="var(--text-main)">{total}</text>
      <text x="70" y="85" textAnchor="middle" fontSize="11" fill="var(--text-muted)">reclamações</text>
    </svg>
    <ul className="flex-1 w-full space-y-2">
      {fatias.map((f, i) => <li key={f.nome} className="flex items-center gap-2 text-sm"><span className="w-3 h-3 rounded-full shrink-0" style={{ background: cores[i % cores.length] }} /><span className="flex-1 truncate text-[var(--text-main)]">{f.nome}</span><strong className="text-[var(--text-main)]">{f.total}</strong><span className="text-[var(--text-muted)] w-10 text-right">{Math.round(f.total / total * 100)}%</span></li>)}
    </ul>
  </div>;
}
