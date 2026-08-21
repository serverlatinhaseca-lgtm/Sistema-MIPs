import { useNavigate, useLocation } from 'react-router-dom';
import { AlertTriangle, LayoutDashboard, BookOpen, Calculator, Users, ClipboardCheck, Sun, Moon, LogOut, KeyRound, Settings, Tag, Folder, ChevronDown, ChevronRight } from 'lucide-react';
import { useState, useEffect } from 'react';
import useBranding from '../useBranding';

const nomePerfil = (perfil) => ({ leitor: 'Funcionário', editor: 'Líder', gerente: 'Gerente', administrador: 'Administrador' }[String(perfil || '').toLowerCase()] || perfil);

export default function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const [dark, setDark] = useState(document.documentElement.classList.contains('dark'));
  const [pastas, setPastas] = useState({ferramentas:location.pathname.startsWith('/ferramentas'),configuracao:['/usuarios','/configuracoes'].includes(location.pathname)});
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
          <div onClick={() => navigate('/reclamacoes')} className={`p-3 rounded-lg font-medium cursor-pointer flex items-center transition-colors ${isActive('/reclamacoes') ? 'bg-white/10 text-[var(--sidebar-text)]' : 'text-[var(--sidebar-text)] opacity-80 hover:opacity-100 hover:bg-white/5'}`}><AlertTriangle size={20} className="mr-3" /> Reclamações</div>
          {['editor','gerente'].includes(user.perfil?.toLowerCase()) && <div onClick={() => navigate('/meu-desempenho')} className={`p-3 rounded-lg font-medium cursor-pointer flex items-center transition-colors ${isActive('/meu-desempenho') ? 'bg-white/10 text-[var(--sidebar-text)]' : 'text-[var(--sidebar-text)] opacity-80 hover:opacity-100 hover:bg-white/5'}`}><ClipboardCheck size={20} className="mr-3" /> Meu desempenho</div>}
          {user.perfil?.toLowerCase() === 'administrador' && <>
            <Pasta titulo="Ferramentas" aberta={pastas.ferramentas} alternar={()=>setPastas(v=>({...v,ferramentas:!v.ferramentas}))}>
              <Item icon={<Tag size={18}/>} titulo="Etiquetas" ativo={isActive('/ferramentas/etiquetas')} abrir={()=>navigate('/ferramentas/etiquetas')}/>
              <Item icon={<Calculator size={18}/>} titulo="Pacotes e Caixas" ativo={isActive('/ferramentas/caixas')} abrir={()=>navigate('/ferramentas/caixas')}/>
            </Pasta>
            <Pasta titulo="Configuração" aberta={pastas.configuracao} alternar={()=>setPastas(v=>({...v,configuracao:!v.configuracao}))}>
              <Item icon={<Users size={18}/>} titulo="Usuários" ativo={isActive('/usuarios')} abrir={()=>navigate('/usuarios')}/>
              <Item icon={<Settings size={18}/>} titulo="Central de configurações" ativo={isActive('/configuracoes')} abrir={()=>navigate('/configuracoes')}/>
            </Pasta>
          </>}
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

function Pasta({titulo,aberta,alternar,children}){return <div className="mt-2"><button onClick={alternar} className={`w-full p-3 rounded-lg font-semibold flex items-center text-[var(--sidebar-text)] transition-colors ${aberta?'bg-white/10':'opacity-80 hover:bg-white/5'}`}><Folder size={20} className="mr-3"/><span className="flex-1 text-left">{titulo}</span>{aberta?<ChevronDown size={17}/>:<ChevronRight size={17}/>}</button>{aberta&&<div className="ml-4 pl-3 border-l border-white/10 mt-1 space-y-1">{children}</div>}</div>}
function Item({icon,titulo,ativo,abrir}){return <button onClick={abrir} className={`w-full p-2.5 rounded-lg text-sm flex items-center text-left text-[var(--sidebar-text)] ${ativo?'bg-white/10':'opacity-70 hover:opacity-100 hover:bg-white/5'}`}><span className="mr-2.5">{icon}</span>{titulo}</button>}
