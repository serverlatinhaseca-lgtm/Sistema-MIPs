import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { BookOpen, Users, PlusCircle, Calculator, ClipboardCheck, AlertTriangle, Megaphone, Bell, MessageCircle, HeartPulse, FileText, CalendarDays } from 'lucide-react';
import Sidebar from '../components/Sidebar';
import LeitorTopbar from '../components/LeitorTopbar';
import useBranding from '../useBranding';
import API from '../api';

const ATALHOS_FUNCIONARIO = [
  { rota: '/mips', titulo: 'Manuais (MIPs)', descricao: 'Consulte os procedimentos da operação.', Icone: BookOpen, fundo: 'bg-amber-100 dark:bg-amber-950/40', cor: 'text-amber-600' },
  { rota: '/receitas', titulo: 'Receitas', descricao: 'Calcule os ingredientes para a produção.', Icone: Calculator, fundo: 'bg-orange-100 dark:bg-orange-950/40', cor: 'text-orange-600' },
  { rota: '/avaliacoes', titulo: 'Meu desempenho', descricao: 'Veja suas avaliações e sua evolução.', Icone: ClipboardCheck, fundo: 'bg-green-100 dark:bg-green-950/40', cor: 'text-green-700' },
  { rota: '/reclamacoes', titulo: 'Reclamações', descricao: 'Acompanhe as ocorrências de atendimento.', Icone: AlertTriangle, fundo: 'bg-red-100 dark:bg-red-950/40', cor: 'text-red-600' },
  { rota: '/atendimento', titulo: 'Atendimento', descricao: 'Abra um ticket e converse com o RH.', Icone: MessageCircle, fundo: 'bg-teal-100 dark:bg-teal-950/40', cor: 'text-teal-700' },
  { rota: '/comunicados', titulo: 'Comunicados', descricao: 'Fique por dentro dos avisos oficiais.', Icone: Megaphone, fundo: 'bg-blue-100 dark:bg-blue-950/40', cor: 'text-blue-600' },
  { rota: '/notificacoes', titulo: 'Notificações', descricao: 'Revise seus avisos e preferências.', Icone: Bell, fundo: 'bg-violet-100 dark:bg-violet-950/40', cor: 'text-violet-600' },
];

// Atalhos do perfil RH: só os módulos de RH (+ MIPs e Reclamações em leitura).
const ATALHOS_RH = [
  { rota: '/aso', titulo: 'ASO', descricao: 'Exames ocupacionais, vencimentos e PDFs.', Icone: HeartPulse, fundo: 'bg-rose-100 dark:bg-rose-950/40', cor: 'text-rose-600' },
  { rota: '/banco-horas', titulo: 'Banco de Horas', descricao: 'Publique demonstrativos por competência.', Icone: FileText, fundo: 'bg-sky-100 dark:bg-sky-950/40', cor: 'text-sky-700' },
  { rota: '/folgas', titulo: 'Folgas', descricao: 'Grade da equipe e solicitações.', Icone: CalendarDays, fundo: 'bg-emerald-100 dark:bg-emerald-950/40', cor: 'text-emerald-700' },
  { rota: '/atendimento', titulo: 'Atendimento', descricao: 'Todos os tickets abertos pelos funcionários.', Icone: MessageCircle, fundo: 'bg-teal-100 dark:bg-teal-950/40', cor: 'text-teal-700' },
  { rota: '/comunicados', titulo: 'Comunicados', descricao: 'Crie e acompanhe as leituras.', Icone: Megaphone, fundo: 'bg-blue-100 dark:bg-blue-950/40', cor: 'text-blue-600' },
  { rota: '/reclamacoes', titulo: 'Reclamações', descricao: 'Consulta das ocorrências de atendimento.', Icone: AlertTriangle, fundo: 'bg-red-100 dark:bg-red-950/40', cor: 'text-red-600' },
  { rota: '/mips', titulo: 'Manuais (MIPs)', descricao: 'Leia os procedimentos publicados.', Icone: BookOpen, fundo: 'bg-amber-100 dark:bg-amber-950/40', cor: 'text-amber-600' },
  { rota: '/notificacoes', titulo: 'Notificações', descricao: 'Revise seus avisos e preferências.', Icone: Bell, fundo: 'bg-violet-100 dark:bg-violet-950/40', cor: 'text-violet-600' },
];

export default function Dashboard() {
  const [stats, setStats] = useState({ totalMips: 0, totalUsuarios: 0, totalReceitas: 0, avaliacoesPendentes: 0 });
  const [tiposRec, setTiposRec] = useState([]);
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const branding = useBranding();
  const isLeitor = String(user.perfil || '').toLowerCase() === 'leitor';
  const isRH = String(user.perfil || '').toLowerCase() === 'rh';

  useEffect(() => {
    if (isLeitor || isRH) return;

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
  }, [isLeitor, isRH]);

  if (isRH) {
    return (
      <div className="min-h-screen bg-[var(--bg-main)] flex">
        <Sidebar />
        <main className="flex-1 min-w-0 p-4 sm:p-10 max-w-6xl">
          <header className="mb-5 sm:mb-7">
            <p className="section-label">Recursos Humanos</p>
            <h1 className="text-2xl sm:text-3xl font-bold">Olá, {(user.nome || '').split(' ')[0] || 'RH'}!</h1>
            <p className="text-[var(--text-muted)] text-sm mt-1">Painel do RH — ASO, banco de horas, folgas, atendimento e comunicados.</p>
          </header>

          <FaixaPainel branding={branding} className="mb-6 rounded-2xl" />

          <h2 className="text-lg font-bold mb-3">Atalhos</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {ATALHOS_RH.map(({ rota, titulo, descricao, Icone, fundo, cor }) => (
              <button
                key={rota}
                onClick={() => navigate(rota)}
                className="group flex flex-col items-start gap-3 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-4 sm:p-5 text-left shadow-sm hover:border-[var(--primary)] hover:shadow-md active:scale-[0.99] transition-all"
              >
                <span className={`w-11 h-11 rounded-xl grid place-items-center ${fundo} ${cor}`}>
                  <Icone size={22} />
                </span>
                <span className="font-bold text-sm sm:text-base leading-tight">{titulo}</span>
                <span className="text-xs text-[var(--text-muted)] leading-snug">{descricao}</span>
              </button>
            ))}
          </div>
        </main>
      </div>
    );
  }

  if (isLeitor) {
    return (
      <div className="min-h-screen bg-[var(--bg-main)] text-[var(--text-main)]">
        <LeitorTopbar titulo="Início" />
        <main className="p-4 sm:p-8 max-w-5xl mx-auto">
          <header className="mb-5 sm:mb-7">
            <h1 className="text-2xl sm:text-3xl font-bold">Olá, {(user.nome || '').split(' ')[0] || 'colaborador'}!</h1>
            <p className="text-[var(--text-muted)] text-sm mt-1">Bem-vindo ao {branding.nome_site}. Use os atalhos abaixo.</p>
          </header>

          <FaixaPainel branding={branding} className="mb-6 rounded-2xl" />

          <h2 className="text-lg font-bold mb-3">Atalhos</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
            {ATALHOS_FUNCIONARIO.map(({ rota, titulo, descricao, Icone, fundo, cor }) => (
              <button
                key={rota}
                onClick={() => navigate(rota)}
                className="group flex flex-col items-start gap-3 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-4 sm:p-5 text-left shadow-sm hover:border-[var(--primary)] hover:shadow-md active:scale-[0.99] transition-all"
              >
                <span className={`w-11 h-11 rounded-xl grid place-items-center ${fundo} ${cor}`}>
                  <Icone size={22} />
                </span>
                <span className="font-bold text-sm sm:text-base leading-tight">{titulo}</span>
                <span className="text-xs text-[var(--text-muted)] leading-snug">{descricao}</span>
              </button>
            ))}
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--bg-main)] flex">
      <Sidebar />

      <main className="flex-1 min-w-0 p-4 sm:p-10">
        <header className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-8">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-[var(--text-main)]">Olá, {user.nome}!</h1>
            <p className="text-[var(--text-muted)] text-sm">Bem-vindo ao painel de controle do {branding.nome_site}.</p>
          </div>
          {['administrador','editor','gerente'].includes(user.perfil?.toLowerCase()) && (
            <button onClick={() => navigate('/mips/nova')} className="flex items-center justify-center bg-amber-600 text-white px-5 py-2.5 rounded-xl hover:bg-amber-700 font-medium transition-colors shadow-md">
              <PlusCircle size={20} className="mr-2" /> Nova MIP
            </button>
          )}
        </header>

        <FaixaPainel branding={branding} className="-mx-4 sm:-mx-10 mb-8" />

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

function FaixaPainel({ branding, className = '' }) {
  const src = branding.imagem_dashboard || '/faixa-dashboard.jpg';
  return (
    <section className={`faixa-dashboard relative h-40 sm:h-auto sm:aspect-[4/1] overflow-hidden bg-stone-950 ${className}`}>
      <img
        key={src}
        src={src}
        alt="Campanhas e novidades"
        className="absolute -left-px -top-px object-cover object-center"
        onError={(e) => { e.currentTarget.style.display = 'none'; }}
      />
    </section>
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
