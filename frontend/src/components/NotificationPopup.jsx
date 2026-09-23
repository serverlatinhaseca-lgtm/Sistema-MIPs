import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { X } from 'lucide-react';
import API from '../api';

// Pop-up em tempo real (canto superior direito, 10s, som sutil).
// Pesquisa não lidas a cada 15s; só exibe as que chegarem após a primeira carga.
export default function NotificationPopup() {
  const [popups, setPopups] = useState([]);
  const vistos = useRef(null);
  const navigate = useNavigate();

  function bip() {
    if (localStorage.getItem('sino-mudo') === '1') return;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.type = 'sine'; o.frequency.value = 880;
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.4);
      o.start(); o.stop(ctx.currentTime + 0.45);
    } catch { /* sem som, sem problema */ }
  }

  useEffect(() => {
    if (!localStorage.getItem('token')) return;
    let vivo = true;
    async function verificar() {
      try {
        const { data } = await axios.get(`${API}/api/notificacoes?somente=nao-lidas&limite=20`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        });
        if (!vivo) return;
        const ids = new Set((data.itens || []).map((n) => n.id));
        if (vistos.current === null) { vistos.current = ids; return; }
        const novas = (data.itens || []).filter((n) => !vistos.current.has(n.id)).reverse();
        vistos.current = ids;
        if (novas.length) {
          bip();
          setPopups((v) => [...v.slice(-2), ...novas.slice(0, 3)]);
          for (const n of novas.slice(0, 3)) {
            setTimeout(() => setPopups((v) => v.filter((x) => x.id !== n.id)), 10000);
          }
        }
      } catch { /* popup nunca bloqueia */ }
    }
    verificar();
    const t = setInterval(verificar, 15000);
    return () => { vivo = false; clearInterval(t); };
  }, []);

  function abrir(n) {
    setPopups((v) => v.filter((x) => x.id !== n.id));
    if (n.link) navigate(n.link);
  }

  if (!popups.length) return null;
  return (
    <div className="no-print fixed top-16 right-4 z-[100] w-[min(92vw,340px)] space-y-2" aria-live="polite">
      {popups.map((n) => (
        <div key={n.id} className="panel-card !p-0 overflow-hidden shadow-2xl border-l-4 border-l-amber-500">
          <div className="flex gap-3 px-4 py-3">
            <button onClick={() => abrir(n)} className="flex-1 min-w-0 text-left">
              <strong className="block text-sm truncate">{n.titulo}</strong>
              {!!n.mensagem && <span className="block text-xs text-[var(--text-muted)] truncate">{n.mensagem}</span>}
            </button>
            <button onClick={() => setPopups((v) => v.filter((x) => x.id !== n.id))} className="p-1 rounded-lg hover:bg-[var(--bg-main)] shrink-0" aria-label="Fechar aviso"><X size={16} /></button>
          </div>
        </div>
      ))}
    </div>
  );
}
