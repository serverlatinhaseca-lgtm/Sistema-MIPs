import { useEffect, useRef, useState } from 'react';
import { Smartphone, Share, X } from 'lucide-react';

const CHAVE_ESCONDIDO = 'pwa-install-prompt-escondido';
const CHAVE_INSTALADO = 'pwa-instalado';
const DIAS = 7;

function haMenosDe(dias) {
  const dt = localStorage.getItem(CHAVE_ESCONDIDO);
  return dt && (Date.now() - Number(dt)) < dias * 24 * 60 * 60 * 1000;
}

function jaInstalado() {
  return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone || localStorage.getItem(CHAVE_INSTALADO) === '1';
}

function ehCelular() {
  return window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
}

function ehIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export default function InstallPrompt() {
  const [visivel, setVisivel] = useState(false);
  const deferred = useRef(null);

  useEffect(() => {
    if (jaInstalado() || haMenosDe(DIAS) || !ehCelular()) return;

    let timer = null;
    const mostrar = () => {
      if (timer) return;
      timer = setTimeout(() => setVisivel(true), 2500);
    };

    const onPrompt = (e) => {
      e.preventDefault();
      deferred.current = e;
      mostrar();
    };

    window.addEventListener('beforeinstallprompt', onPrompt);
    if (ehIOS()) {
      // iOS não dispara beforeinstallprompt; orientamos direto no banner.
      mostrar();
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      if (timer) clearTimeout(timer);
    };
  }, []);

  if (!visivel) return null;

  const fechar = () => {
    setVisivel(false);
    localStorage.setItem(CHAVE_ESCONDIDO, String(Date.now()));
  };

  const instalar = async () => {
    if (!deferred.current) {
      fechar();
      return;
    }
    deferred.current.prompt();
    const { outcome } = await deferred.current.userChoice;
    deferred.current = null;
    fechar();
    if (outcome === 'accepted') localStorage.setItem(CHAVE_INSTALADO, '1');
  };

  return (
    <div className="fixed bottom-0 inset-x-0 z-[90] p-3 sm:p-4 pointer-events-none">
      <section className="panel-card pointer-events-auto flex items-start gap-3 max-w-md w-full mx-auto shadow-2xl" role="dialog" aria-label="Instalar aplicativo">
        <div className="w-11 h-11 shrink-0 rounded-2xl bg-amber-100 text-amber-700 grid place-items-center">
          {ehIOS() ? <Share size={22} /> : <Smartphone size={22} />}
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="font-semibold leading-tight">Instale o app no seu celular</h2>
          {ehIOS() ? (
            <p className="mt-1 text-sm text-[var(--text-muted)] leading-relaxed">
              Toque no ícone <strong className="text-[var(--text-main)]">Compartilhar</strong>
              <span className="inline-flex align-middle text-amber-600 mx-1"><Share size={16} /></span>
              e depois em <strong className="text-[var(--text-main)]">"Adicionar à Tela de Início"</strong> para acessar como aplicativo.
            </p>
          ) : (
            <p className="mt-1 text-sm text-[var(--text-muted)] leading-relaxed">
              Acesse mais rápido e sem digitar o endereço, com ícone na sua tela inicial.
            </p>
          )}
          <div className="flex gap-2 mt-3">
            <button onClick={fechar} className="border border-[var(--border-color)] rounded-xl px-3 py-2 text-sm">Agora não</button>
            {!ehIOS() && (
              <button onClick={instalar} className="flex-1 bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white rounded-xl px-3 py-2 text-sm font-semibold">
                Instalar
              </button>
            )}
          </div>
        </div>
        <button onClick={fechar} className="shrink-0 p-1 rounded-lg hover:bg-[var(--bg-main)]" aria-label="Fechar"><X size={18} /></button>
      </section>
    </div>
  );
}