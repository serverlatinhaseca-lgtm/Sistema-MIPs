import { useEffect, useRef, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import Sidebar from '../components/Sidebar';

const FERRAMENTAS = {
  '/ferramentas/etiquetas': { titulo: 'Etiquetas', descricao: 'Emissão, configuração de rotas e impressão em folha Pimaco 6187.', arquivo: '/admin-tools/etiquetas.html' },
  '/ferramentas/caixas': { titulo: 'Pacotes e Caixas', descricao: 'Cálculo de produção para bisnaguinhas e pães hot dog.', arquivo: '/admin-tools/caixas.html' }
};

export default function FerramentasAdmin() {
  const location = useLocation();
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const ferramenta = FERRAMENTAS[location.pathname];
  const [menuOculto, setMenuOculto] = useState(() => localStorage.getItem('ferramentas_menu_oculto') === '1');
  const iframeRef = useRef(null);
  const observadorRef = useRef(null);

  const alternarMenu = () => {
    const proximo = !menuOculto;
    setMenuOculto(proximo);
    localStorage.setItem('ferramentas_menu_oculto', proximo ? '1' : '0');
  };

  const ajustarAltura = () => {
    const iframe = iframeRef.current;
    const documento = iframe?.contentDocument;
    if (!iframe || !documento) return;
    const altura = Math.max(documento.body?.scrollHeight || 0, documento.documentElement?.scrollHeight || 0, 720);
    iframe.style.height = `${altura + 4}px`;
  };

  const prepararAlturaAutomatica = () => {
    observadorRef.current?.disconnect();
    ajustarAltura();
    const corpo = iframeRef.current?.contentDocument?.body;
    if (corpo && window.ResizeObserver) {
      observadorRef.current = new ResizeObserver(ajustarAltura);
      observadorRef.current.observe(corpo);
    }
  };

  useEffect(() => () => observadorRef.current?.disconnect(), []);

  if (String(user.perfil || '').toLowerCase() !== 'administrador') return <Navigate to="/mips" replace />;
  if (!ferramenta) return <Navigate to="/dashboard" replace />;

  return (
    <div className="flex min-h-screen bg-[var(--background)]">
      {!menuOculto && <Sidebar />}
      <main className="flex-1 min-w-0 p-4 md:p-8 overflow-hidden">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mb-1 text-xs font-bold uppercase tracking-[0.18em] text-[var(--primary)]">Ferramenta administrativa</p>
            <h1 className="text-3xl font-bold text-[var(--text-primary)]">{ferramenta.titulo}</h1>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">{ferramenta.descricao}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-fit rounded-full border border-orange-200 bg-orange-50 px-3 py-1.5 text-xs font-semibold text-[#a65526] dark:border-orange-900/50 dark:bg-orange-950/30 dark:text-orange-300">Salvamento automático no banco</span>
            <button type="button" onClick={alternarMenu} className="rounded-lg border border-[var(--border-color)] bg-[var(--card-bg)] px-3 py-1.5 text-xs font-semibold text-[var(--text-primary)] transition hover:border-[var(--primary)] hover:text-[var(--primary)]">
              {menuOculto ? 'Mostrar menu' : 'Ocultar barra lateral'}
            </button>
          </div>
        </div>
        <iframe
          ref={iframeRef}
          title={ferramenta.titulo}
          src={ferramenta.arquivo}
          onLoad={prepararAlturaAutomatica}
          scrolling="no"
          className="w-full border-0 bg-transparent"
          style={{ height: 720, minHeight: 720, overflow: 'hidden' }}
        />
      </main>
    </div>
  );
}
