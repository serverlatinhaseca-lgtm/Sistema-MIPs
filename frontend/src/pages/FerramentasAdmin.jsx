import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import EtiquetasEditor from '../components/EtiquetasEditor';
import Sidebar from '../components/Sidebar';

export default function FerramentasAdmin() {
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const [menuOculto, setMenuOculto] = useState(() => localStorage.getItem('ferramentas_menu_oculto') === '1');

  useEffect(() => {
    localStorage.setItem('ferramentas_menu_oculto', menuOculto ? '1' : '0');
  }, [menuOculto]);

  if (String(user.perfil || '').toLowerCase() !== 'administrador') return <Navigate to="/mips" replace />;

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--bg-main)] text-[var(--text-main)]">
      {!menuOculto && <Sidebar />}
      <main className="flex h-screen min-w-0 flex-1 flex-col overflow-hidden p-4 md:p-8">
        <div className="mb-6 flex shrink-0 flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mb-1 text-xs font-bold uppercase tracking-[0.18em] text-[var(--primary)]">Ferramenta administrativa</p>
            <h1 className="text-3xl font-bold text-[var(--text-main)]">Etiquetas</h1>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Emissão, configuração de rotas e impressão em folha Pimaco 6187.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-fit rounded-full border border-orange-200 bg-orange-50 px-3 py-1.5 text-xs font-semibold text-[#a65526] dark:border-orange-900/50 dark:bg-orange-950/30 dark:text-orange-300">Salvamento automático</span>
            <button
              type="button"
              onClick={() => setMenuOculto(!menuOculto)}
              className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-1.5 text-xs font-semibold text-[var(--text-main)] transition hover:border-[var(--primary)] hover:text-[var(--primary)]"
            >
              {menuOculto ? 'Mostrar menu' : 'Ocultar barra lateral'}
            </button>
          </div>
        </div>
        <EtiquetasEditor />
      </main>
    </div>
  );
}
