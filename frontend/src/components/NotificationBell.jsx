import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { AlertTriangle, Bell, CalendarCheck, CheckCheck, CheckCircle2, ClipboardCheck, FileWarning, HeartPulse, Megaphone, MessageCircle, RotateCcw, Volume2, VolumeX, X } from 'lucide-react';
import API from '../api';

const porTipo = {
  reclamacao_nova: { Icone: AlertTriangle, cor: '#b91c1c', fundo: '#fee2e2' },
  mip_revisao: { Icone: Bell, cor: '#a16207', fundo: '#fef9c3' },
  mip_aprovacao: { Icone: CheckCircle2, cor: '#15803d', fundo: '#dcfce7' },
  mip_correcao: { Icone: FileWarning, cor: '#b91c1c', fundo: '#fee2e2' },
  avaliacao_nova: { Icone: ClipboardCheck, cor: '#1d4ed8', fundo: '#dbeafe' },
  aso_agendado: { Icone: CalendarCheck, cor: '#1d4ed8', fundo: '#dbeafe' },
  aso_faixa: { Icone: HeartPulse, cor: '#a16207', fundo: '#fef9c3' },
  aso_vencido: { Icone: FileWarning, cor: '#b91c1c', fundo: '#fee2e2' },
  aso_confirmado: { Icone: CheckCircle2, cor: '#15803d', fundo: '#dcfce7' },
  chat_novo: { Icone: MessageCircle, cor: '#1d4ed8', fundo: '#dbeafe' },
  chat_msg: { Icone: MessageCircle, cor: '#1d4ed8', fundo: '#dbeafe' },
  chat_update: { Icone: Bell, cor: '#a16207', fundo: '#fef9c3' },
  chat_fechado: { Icone: CheckCircle2, cor: '#15803d', fundo: '#dcfce7' },
  comunicado_oficial: { Icone: Megaphone, cor: '#6d28d9', fundo: '#ede9fe' },
};

function tempoRel(iso) {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min}min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h`;
  const d = Math.floor(h / 24);
  if (d === 1) return 'ontem';
  if (d < 7) return `há ${d} dias`;
  return new Date(iso).toLocaleDateString('pt-BR');
}

// Sino único de notificações: um indicador geral (badge) + painel registrado no banco.
// Sem popups bloqueantes; atualiza sozinho a cada 30s.
export default function NotificationBell({ modo = 'sidebar' }) {
  const [itens, setItens] = useState([]);
  const [naoLidas, setNaoLidas] = useState(0);
  const [arquivadas, setArquivadas] = useState(0);
  const [aba, setAba] = useState('novas');
  const [aberto, setAberto] = useState(false);
  const [mudo, setMudo] = useState(() => localStorage.getItem('sino-mudo') === '1');
  const navigate = useNavigate();
  const auth = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
  const audioRef = useRef(null), anteriorRef = useRef(null);

  function bip() {
    if (localStorage.getItem('sino-mudo') === '1') return;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      audioRef.current = audioRef.current || new Ctx();
      const ctx = audioRef.current;
      if (ctx.state === 'suspended') ctx.resume();
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.type = 'sine'; o.frequency.value = 880;
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.4);
      o.start(); o.stop(ctx.currentTime + 0.45);
    } catch { /* sem som, sem problema */ }
  }
  function alternarMudo() {
    const v = !mudo;
    setMudo(v);
    localStorage.setItem('sino-mudo', v ? '1' : '0');
    if (!v) bip();
  }

  async function carregar(abaAtual = aba) {
    try {
      const somente = abaAtual === 'arquivadas' ? 'arquivadas' : 'nao-lidas';
      const { data } = await axios.get(`${API}/api/notificacoes?somente=${somente}&limite=100`, auth());
      setItens(data.itens || []);
      const total = data.nao_lidas || 0;
      if (anteriorRef.current != null && total > anteriorRef.current) bip();
      anteriorRef.current = total;
      setNaoLidas(total);
      setArquivadas(data.arquivadas || 0);
    } catch { /* sino nunca bloqueia a navegação */ }
  }
  useEffect(() => {
    if (!localStorage.getItem('token')) return;
    carregar(aba);
    const t = setInterval(() => carregar(aba), 30000);
    return () => clearInterval(t);
  }, [aba]);

  async function abrir(n) {
    setAberto(false);
    if (!n.lida) {
      setItens(v => v.filter(x => x.id !== n.id));
      setNaoLidas(v => { const nv = Math.max(0, v - 1); anteriorRef.current = nv; return nv; });
      setArquivadas(v => v + 1);
      try { await axios.patch(`${API}/api/notificacoes/${n.id}/lida`, {}, auth()); } catch { /* segue a navegação */ }
    }
    if (n.link) navigate(n.link);
  }
  async function restaurar(n) {
    setItens(v => v.filter(x => x.id !== n.id));
    setArquivadas(v => Math.max(0, v - 1));
    setNaoLidas(v => { const nv = v + 1; anteriorRef.current = nv; return nv; });
    try { await axios.patch(`${API}/api/notificacoes/${n.id}/lida`, { lida: false }, auth()); } catch { carregar(aba); }
  }
  async function marcarTodas() {
    setItens([]);
    setNaoLidas(0);
    anteriorRef.current = 0;
    setArquivadas(v => v + naoLidas);
    try { await axios.post(`${API}/api/notificacoes/marcar-todas-lidas`, {}, auth()); } catch { carregar(); }
  }

  const botao = modo === 'topo'
    ? 'reader-nav-button'
    : modo === 'fixo'
    ? 'fixed top-4 right-4 z-[70] w-11 h-11 rounded-full grid place-items-center bg-[var(--bg-card)] text-[var(--text-main)] border border-[var(--border-color)] shadow-lg'
    : 'p-3 rounded-lg font-medium cursor-pointer flex items-center transition-colors text-[var(--sidebar-text)] opacity-80 hover:opacity-100 hover:bg-white/5 w-full';

  return <>
    <button onClick={() => setAberto(v => !v)} className={botao} title="Notificações" aria-label={`Notificações${naoLidas ? ` (${naoLidas} não lidas)` : ''}`}>
      <span className="relative">
        <Bell size={modo === 'topo' ? 18 : 20} className={modo === 'topo' || modo === 'fixo' ? '' : 'mr-3'} />
        {naoLidas > 0 && <span className="absolute -top-2 -right-2 min-w-5 h-5 px-1 rounded-full bg-red-600 text-white text-[11px] font-bold grid place-items-center">{naoLidas > 9 ? '9+' : naoLidas}</span>}
      </span>
      {modo === 'topo' ? <span>Notificações</span> : modo === 'fixo' ? null : <span className="flex-1 text-left">Notificações{naoLidas > 0 ? ` (${naoLidas})` : ''}</span>}
    </button>
    {aberto && <>
      <div className="fixed inset-0 z-[80]" onClick={() => setAberto(false)} />
      <section className="no-print fixed top-16 right-4 z-[90] w-[min(92vw,380px)] max-h-[70vh] flex flex-col panel-card !p-0 overflow-hidden shadow-2xl" role="dialog" aria-label="Central de notificações">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-color)]">
          <div className="flex gap-1">
            {[['novas', `Novas${naoLidas > 0 ? ` (${naoLidas})` : ''}`], ['arquivadas', `Arquivadas${arquivadas > 0 ? ` (${arquivadas})` : ''}`]].map(([v, t]) => <button key={v} onClick={() => setAba(v)} className={`px-3 py-1.5 rounded-lg text-sm font-bold ${aba === v ? 'bg-[var(--primary)] text-white' : 'hover:bg-[var(--bg-main)]'}`}>{t}</button>)}
          </div>
          <div className="flex gap-1">
            <button onClick={alternarMudo} className="p-2 rounded-lg hover:bg-[var(--bg-main)]" title={mudo ? 'Ativar som' : 'Silenciar'}>{mudo ? <VolumeX size={18} /> : <Volume2 size={18} />}</button>
            {aba === 'novas' && naoLidas > 0 && <button onClick={marcarTodas} className="p-2 rounded-lg hover:bg-[var(--bg-main)]" title="Arquivar todas"><CheckCheck size={18} /></button>}
            <button onClick={() => setAberto(false)} className="p-2 rounded-lg hover:bg-[var(--bg-main)]" aria-label="Fechar"><X size={18} /></button>
          </div>
        </div>
        <div className="overflow-auto">
          {!itens.length && <p className="p-5 text-sm text-center text-[var(--text-muted)]">{aba === 'novas' ? 'Nada novo por aqui.' : 'Nenhuma notificação arquivada.'}</p>}
          {itens.map(n => {
            const { Icone, cor, fundo } = porTipo[n.tipo] || porTipo.mip_revisao;
            return <div key={n.id} className="flex items-center gap-1 border-b border-[var(--border-color)] hover:bg-[var(--bg-main)]">
              <button onClick={() => abrir(n)} className="flex-1 min-w-0 text-left flex gap-3 px-4 py-3">
                <span className="w-9 h-9 rounded-xl grid place-items-center shrink-0" style={{ color: cor, background: fundo }}><Icone size={18} /></span>
                <span className="min-w-0">
                  <span className="flex items-center gap-2"><strong className="text-sm truncate">{n.titulo}</strong>{!n.lida && <span className="w-2 h-2 rounded-full bg-red-600 shrink-0" />}</span>
                  {!!n.mensagem && <span className="block text-xs text-[var(--text-muted)] truncate">{n.mensagem}</span>}
                  <small className="text-[11px] text-[var(--text-muted)]">{tempoRel(n.criado_em)}</small>
                </span>
              </button>
              {aba === 'arquivadas' && <button onClick={() => restaurar(n)} className="p-2 mr-2 rounded-lg hover:bg-[var(--bg-main)] shrink-0" title="Restaurar para novas"><RotateCcw size={16} /></button>}
            </div>;
          })}
        </div>
      </section>
    </>}</>;
}
