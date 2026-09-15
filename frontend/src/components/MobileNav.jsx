import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import Sidebar from './Sidebar';
import useBranding from '../useBranding';

// Barra + menu lateral para celular nos perfis com Sidebar
// (Líder, Gerente, Administrador). O Leitor já tem o LeitorTopbar.
export default function MobileNav() {
  const [aberto, setAberto] = useState(false);
  const location = useLocation();
  const branding = useBranding();

  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const token = localStorage.getItem('token');
  const ehLeitor = String(user.perfil || '').toLowerCase() === 'leitor';

  useEffect(() => { setAberto(false); }, [location.pathname]);
  useEffect(() => {
    document.body.style.overflow = aberto ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [aberto]);

  if (!token || ehLeitor) return null;

  return (
    <div className="md:hidden no-print">
      <header className="sticky top-0 z-40 flex items-center gap-3 px-4 py-3 bg-[var(--sidebar-bg)] text-[var(--sidebar-text)]">
        <button onClick={() => setAberto(true)} aria-label="Abrir menu" className="p-2 -ml-2 rounded-lg hover:bg-white/10">
          <Menu size={22} />
        </button>
        {branding.logo_site
          ? <img src={branding.logo_site} alt="Logo" className="w-8 h-8 object-contain bg-white rounded-lg p-0.5" />
          : <div className="w-8 h-8 bg-[var(--primary)] rounded-lg flex items-center justify-center text-white font-bold">M</div>}
        <span className="font-bold truncate">{branding.nome_site}</span>
      </header>

      {aberto && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/60" onClick={() => setAberto(false)} />
          <div className="absolute left-0 top-0 bottom-0 shadow-2xl">
            <button onClick={() => setAberto(false)} aria-label="Fechar menu" className="absolute right-3 top-3 z-10 p-2 rounded-lg text-[var(--sidebar-text)] hover:bg-white/10">
              <X size={20} />
            </button>
            <Sidebar emDrawer aoNavegar={() => setAberto(false)} />
          </div>
        </div>
      )}
    </div>
  );
}
