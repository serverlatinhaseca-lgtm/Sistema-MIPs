import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { BookOpen, Users, PlusCircle, Calculator, ClipboardCheck } from 'lucide-react';
import Sidebar from '../components/Sidebar';
import useBranding from '../useBranding';

export default function Dashboard() {
  const [stats, setStats] = useState({ totalMips: 0, totalUsuarios: 0, totalReceitas: 0, avaliacoesPendentes: 0 });
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const host = window.location.hostname;
  const branding = useBranding();

  useEffect(() => {
    if (user.perfil?.toLowerCase() === 'leitor') {
      navigate('/avaliacoes');
      return;
    }

    const fetchStats = async () => {
      try {
        const res = await axios.get(`http://${host}:7001/api/dashboard`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        });
        const resRec = await axios.get(`http://${host}:7001/api/receitas`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        });
        setStats({ ...res.data, totalReceitas: resRec.data.length });
      } catch (err) { console.error(err); }
    };
    fetchStats();
  }, [host, navigate, user.perfil]);

  return (
    <div className="min-h-screen bg-[var(--bg-main)] flex">
      <Sidebar />

      <main className="flex-1 p-6 sm:p-10">
        <header className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-[var(--text-main)]">Olá, {user.nome}! 👋</h1>
            <p className="text-[var(--text-muted)] text-sm">Bem-vindo ao painel de controle do {branding.nome_site}.</p>
          </div>
          {(user.perfil?.toLowerCase() === 'administrador' || user.perfil?.toLowerCase() === 'editor') && (
            <button onClick={() => navigate('/mips/nova')} className="flex items-center bg-amber-600 text-white px-5 py-2.5 rounded-xl hover:bg-amber-700 font-medium transition-colors shadow-md">
              <PlusCircle size={20} className="mr-2" /> Nova MIP
            </button>
          )}
        </header>

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
      </main>
    </div>
  );
}
