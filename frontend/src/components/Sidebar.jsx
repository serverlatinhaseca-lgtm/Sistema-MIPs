import { useNavigate, useLocation } from 'react-router-dom';
import { LayoutDashboard, BookOpen, Calculator, Users, ClipboardCheck, Sun, Moon, LogOut, KeyRound, Settings, Tag } from 'lucide-react';
import { useState, useEffect } from 'react';
import useBranding from '../useBranding';

const nomePerfil = (perfil) => ({ leitor: 'Funcionário', editor: 'Líder', gerente: 'Gerente', administrador: 'Administrador' }[String(perfil || '').toLowerCase()] || perfil);

export default function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const [dark, setDark] = useState(document.documentElement.classList.contains('dark'));
  const branding = useBranding();

  const toggleTheme = () => {
    const isDark = document.documentElement.classList.toggle('dark');
    setDark(isDark);
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
  };

  useEffect(() => {
    if (localStorage.getItem('theme') === 'dark') {
      document.documentElement.classList.add('dark');
      setDark(true);
    }
  }, []);

  const isActive = (path) => location.pathname === path;

  return (
    <aside className="w-64 bg-[var(--sidebar-bg)] border-r border-[var(--border-color)] p-6 hidden md:flex flex-col justify-between shrink-0">
      <div>
        <div className="flex items-center space-x-3 mb-10">
          {branding.logo_site ? <img src={branding.logo_site} alt="Logo" className="w-10 h-10 object-contain bg-white rounded-xl p-1" /> : <div className="w-10 h-10 bg-[var(--primary)] rounded-xl flex items-center justify-center text-white font-bold text-xl">M</div>}
          <span className="font-bold text-lg text-[var(--sidebar-text)]">{branding.nome_site}</span>
        </div>

        <nav className="space-y-2">
          {user.perfil?.toLowerCase() !== 'leitor' && (
            <div onClick={() => navigate('/dashboard')} className={`p-3 rounded-lg font-medium cursor-pointer flex items-center transition-colors ${isActive('/dashboard') ? 'bg-white/10 text-[var(--sidebar-text)]' : 'text-[var(--sidebar-text)] opacity-80 hover:opacity-100 hover:bg-white/5'}`}>
              <LayoutDashboard size={20} className="mr-3" /> Dashboard
            </div>
          )}
          <div onClick={() => navigate('/mips')} className={`p-3 rounded-lg font-medium cursor-pointer flex items-center transition-colors ${isActive('/mips') ? 'bg-white/10 text-[var(--sidebar-text)]' : 'text-[var(--sidebar-text)] opacity-80 hover:opacity-100 hover:bg-white/5'}`}>
            <BookOpen size={20} className="mr-3" /> Manuais (MIPs)
          </div>
          <div onClick={() => navigate('/receitas')} className={`p-3 rounded-lg font-medium cursor-pointer flex items-center transition-colors ${isActive('/receitas') ? 'bg-white/10 text-[var(--sidebar-text)]' : 'text-[var(--sidebar-text)] opacity-80 hover:opacity-100 hover:bg-white/5'}`}>
            <Calculator size={20} className="mr-3" /> Receitas
          </div>
          <div onClick={() => navigate('/avaliacoes')} className={`p-3 rounded-lg font-medium cursor-pointer flex items-center transition-colors ${isActive('/avaliacoes') ? 'bg-white/10 text-[var(--sidebar-text)]' : 'text-[var(--sidebar-text)] opacity-80 hover:opacity-100 hover:bg-white/5'}`}>
            <ClipboardCheck size={20} className="mr-3" /> {user.perfil?.toLowerCase() === 'leitor' ? 'Meu desempenho' : 'Avaliações'}
          </div>
          {['editor','gerente'].includes(user.perfil?.toLowerCase()) && <div onClick={() => navigate('/meu-desempenho')} className={`p-3 rounded-lg font-medium cursor-pointer flex items-center transition-colors ${isActive('/meu-desempenho') ? 'bg-white/10 text-[var(--sidebar-text)]' : 'text-[var(--sidebar-text)] opacity-80 hover:opacity-100 hover:bg-white/5'}`}><ClipboardCheck size={20} className="mr-3" /> Meu desempenho</div>}
          {user.perfil?.toLowerCase() === 'administrador' && (
            <><div onClick={() => navigate('/ferramentas/etiquetas')} className={`p-3 rounded-lg font-medium cursor-pointer flex items-center transition-colors ${isActive('/ferramentas/etiquetas') ? 'bg-white/10 text-[var(--sidebar-text)]' : 'text-[var(--sidebar-text)] opacity-80 hover:opacity-100 hover:bg-white/5'}`}><Tag size={20} className="mr-3" /> Etiquetas</div><div onClick={() => navigate('/ferramentas/caixas')} className={`p-3 rounded-lg font-medium cursor-pointer flex items-center transition-colors ${isActive('/ferramentas/caixas') ? 'bg-white/10 text-[var(--sidebar-text)]' : 'text-[var(--sidebar-text)] opacity-80 hover:opacity-100 hover:bg-white/5'}`}><Calculator size={20} className="mr-3" /> Pacotes e Caixas</div><div onClick={() => navigate('/usuarios')} className={`p-3 rounded-lg font-medium cursor-pointer flex items-center transition-colors ${isActive('/usuarios') ? 'bg-white/10 text-[var(--sidebar-text)]' : 'text-[var(--sidebar-text)] opacity-80 hover:opacity-100 hover:bg-white/5'}`}><Users size={20} className="mr-3" /> Usuários</div><div onClick={() => navigate('/configuracoes')} className={`p-3 rounded-lg font-medium cursor-pointer flex items-center transition-colors ${isActive('/configuracoes') ? 'bg-white/10 text-[var(--sidebar-text)]' : 'text-[var(--sidebar-text)] opacity-80 hover:opacity-100 hover:bg-white/5'}`}><Settings size={20} className="mr-3" /> Personalização</div></>
          )}
        </nav>
      </div>

      <div>
        <div onClick={() => navigate('/alterar-senha')} className="mb-2 p-3 text-[var(--sidebar-text)] opacity-80 hover:opacity-100 hover:bg-white/5 rounded-lg cursor-pointer flex items-center"><KeyRound size={20} className="mr-3" /> Minha senha</div>
        <div onClick={toggleTheme} className="mb-3 p-3 text-[var(--sidebar-text)] opacity-80 hover:opacity-100 hover:bg-white/5 rounded-lg cursor-pointer flex items-center transition-colors">
          {dark ? <Sun size={20} className="mr-3 text-amber-400" /> : <Moon size={20} className="mr-3" />}
          <span>{dark ? 'Modo Claro' : 'Modo Escuro'}</span>
        </div>
        <div className="mb-4 px-3 py-2 bg-white/5 rounded-lg">
          <p className="text-xs text-[var(--sidebar-text)] opacity-60">Logado como:</p>
          <p className="text-sm font-bold text-[var(--sidebar-text)] truncate">{user.nome}</p>
          <span className="inline-block mt-1 text-[10px] px-2 py-0.5 bg-white/10 text-[var(--sidebar-text)] rounded">{nomePerfil(user.perfil)}</span>
        </div>
        <div onClick={() => { localStorage.removeItem('token'); localStorage.removeItem('user'); sessionStorage.clear(); navigate('/'); }} className="p-3 text-red-400 hover:bg-red-500/10 rounded-lg cursor-pointer flex items-center">
          <LogOut size={20} className="mr-3" /> Sair
        </div>
      </div>
    </aside>
  );
}
