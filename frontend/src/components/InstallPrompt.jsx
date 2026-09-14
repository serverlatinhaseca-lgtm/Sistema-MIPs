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
    if (jaInstalado() || haMenosDe(DIAS)) return;

    let timer = null;

    const onPrompt = (e) => {
      e.preventDefault();
      deferred.current = e;
      setVisivel(true);
    };

    const onInstalado = () => localStorage.setItem(CHAVE_INSTALADO, '1');

    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalado);

    // Dispara em qualquer celular (Android com HTTP não emite beforeinstallprompt;
    // iOS nunca emite). No desktop, só aparece se o Chrome permitir instalação.
    if (ehCelular()) timer = setTimeout(() => setVisivel(true), 2000);

    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalado);
      if (timer) clearTimeout(timer);
    };
  }, []);

  if (!visivel) return null;

  const fechar = () => {
    setVisivel(false);
    localStorage.setItem(CHAVE_ESCONDIDO, String(Date.now()));
  };

  const instalar = async () => {
    if (!deferred.current) return;
    deferred.current.prompt();
    const { outcome } = await deferred.current.userChoice;
    deferred.current = null;
    fechar();
    if (outcome === 'accepted') localStorage.setItem(CHAVE_INSTALADO, '1');
  };

  const temInstalacao = !!deferred.current;

  const instrucoes = () => {
    if (ehIOS()) {
      return (
        <>
          Toque no botão <strong className="text-[var(--text-main)]">Compartilhar</strong>{' '}
          <span className="inline-flex align-middle text-amber-600 mx-1"><Share size={16} /></span>{' '}
          (ícone quadrado com seta) e depois em{' '}
          <strong className="text-[var(--text-main)]">"Adicionar à Tela de Início"</strong>.
        </>
      );
    }
    if (!temInstalacao && ehCelular()) {
      return (
        <>
          Abra o menu de três pontos{' '}
          <strong className="text-[var(--text-main)]">⋮</strong> do navegador e toque em{' '}
          <strong className="text-[var(--text-main)]">"Adicionar à tela inicial"</strong> ou{' '}
          <strong className="text-[var(--text-main)]">"Instalar aplicativo"</strong>.
        </>
      );
    }
    return <>Clique no ícone de instalação que aparece na barra de endereço do navegador.</>;
  };

  return (
    <div className="fixed inset-0 z-[90] bg-black/55 grid place-items-center p-4">
      <section className="panel-card w-full max-w-lg relative shadow-2xl" role="dialog" aria-modal="true" aria-label="Instalar aplicativo">
        <button onClick={fechar} className="absolute right-4 top-4 p-2 rounded-lg hover:bg-[var(--bg-main)]" aria-label="Fechar"><X size={20} /></button>
        <div className="w-12 h-12 rounded-2xl grid place-items-center mb-4 bg-amber-100 text-amber-700">
          {ehIOS() ? <Share size={24} /> : <Smartphone size={24} />}
        </div>
        <h2 className="text-xl font-bold pr-10">Instale o app no seu celular</h2>
        <p className="mt-2 text-[var(--text-muted)] leading-relaxed">
          Acesse o {window.location.hostname} mais rápido, com ícone na tela inicial e sem digitar o endereço.{' '}
          {instrucoes()}
        </p>
        <div className="flex gap-3 mt-6">
          <button onClick={fechar} className="flex-1 border border-[var(--border-color)] rounded-xl p-3">Agora não</button>
          {temInstalacao && (
            <button onClick={instalar} className="flex-1 bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white rounded-xl p-3 font-semibold">
              Instalar
            </button>
          )}
        </div>
      </section>
    </div>
  );
}