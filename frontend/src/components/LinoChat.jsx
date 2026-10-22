import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { Bot, ChevronDown, ChevronUp, Send, X } from 'lucide-react';
import API from '../api';
import useBranding from '../useBranding';

const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const RESPOSTA_PADRAO = 'Hmm, isso eu ainda não sei responder... Tente perguntar sobre MIPs, receitas, avaliações, reclamações ou senha. Se for urgente, fale com seu líder!';
const NIVEIS_LINO = [['funcionario', 'Funcionário'], ['lider', 'Líder'], ['gerente', 'Gerente'], ['administrador', 'Administrador']];
const ORDEM_NIVEL = Object.fromEntries(NIVEIS_LINO.map(([id], i) => [id, i]));
const nivelDoPerfil = perfil => ({ leitor: 'funcionario', editor: 'lider', gerente: 'gerente', administrador: 'administrador' }[String(perfil || '').toLowerCase()] || 'funcionario');

function escolherResposta(texto, respostas) {
  const palavras = new Set(norm(texto).split(/[^a-z0-9]+/).filter(w => w.length > 2));
  if (!palavras.size) return null;
  let melhor = null, pontos = 0;
  for (const r of respostas) {
    const chaves = `${r.gatilhos || ''} ${r.pergunta || ''}`.split(/[^a-z0-9]+/).map(norm).filter(w => w.length > 2);
    let p = 0;
    for (const c of chaves) if (palavras.has(c)) p += c.length > 4 ? 2 : 1;
    if (p > pontos) { pontos = p; melhor = r; }
  }
  return pontos > 0 ? melhor : null;
}

// Lino — ajuda do portal (chat fake com respostas pré-programadas, editáveis em Configurações).
export default function LinoChat() {
  const branding = useBranding();
  const [aberto, setAberto] = useState(false);
  const [respostas, setRespostas] = useState([]);
  const [mostrarTopicos, setMostrarTopicos] = useState(() => window.innerHeight >= 640);
  const [msgs, setMsgs] = useState([{ de: 'lino', texto: 'Oi! Eu sou o Lino, ajudante do Portal - Nova Esperança. Sobre o que quer saber hoje?' }]);
  const [texto, setTexto] = useState('');
  const [digitando, setDigitando] = useState(false);
  const fimRef = useRef(null);
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const nivelUsuario = nivelDoPerfil(user.perfil);
  const limiteNivel = ORDEM_NIVEL[nivelUsuario] ?? 0;
  const respostasVisiveis = respostas.filter(r => (ORDEM_NIVEL[r.nivel] ?? 0) <= limiteNivel);
  const grupos = NIVEIS_LINO
    .filter(([id]) => respostasVisiveis.some(r => (r.nivel || 'funcionario') === id))
    .sort((a, b) => {
      const da = a[0] === nivelUsuario ? 0 : 1, db = b[0] === nivelUsuario ? 0 : 1;
      if (da !== db) return da - db;
      return ORDEM_NIVEL[b[0]] - ORDEM_NIVEL[a[0]];
    });

  useEffect(() => {
    if (!localStorage.getItem('token')) return;
    axios.get(`${API}/api/ajuda/respostas`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } })
      .then(({ data }) => setRespostas(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);
  useEffect(() => { fimRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [msgs, digitando, aberto]);

  function responder(pergunta) {
    const textoPergunta = String(pergunta || '').trim();
    if (!textoPergunta || digitando) return;
    setMsgs(v => [...v, { de: 'voce', texto: textoPergunta }]);
    setTexto('');
    setDigitando(true);
    const achada = escolherResposta(textoPergunta, respostasVisiveis);
    setTimeout(() => {
      setMsgs(v => [...v, { de: 'lino', texto: achada ? achada.resposta : RESPOSTA_PADRAO }]);
      setDigitando(false);
    }, 600 + Math.random() * 500);
  }

  const icone = branding.ajuda_icone
    ? <img src={branding.ajuda_icone} alt="Ajuda" className="w-full h-full object-contain !m-0 drop-shadow-lg" />
    : <Bot size={44} className="text-[var(--primary)] drop-shadow-lg" />;

  return <div className="no-print">
    {!aberto && <button onClick={() => setAberto(true)} title="Ajuda — falar com o Lino" aria-label="Abrir ajuda do Lino" className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] right-4 z-[70] w-16 h-16 sm:w-20 sm:h-20 rounded-full grid place-items-center bg-transparent">
      <span className="lino-icone w-full h-full grid place-items-center rounded-full border-[3px] border-[var(--primary)] p-1.5 shadow-lg bg-[var(--bg-card)]">{branding.ajuda_icone ? <span className="w-full h-full block overflow-hidden rounded-full">{icone}</span> : icone}</span>
    </button>}
    {aberto && <section className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] right-3 sm:right-4 z-[90] w-[min(92vw,360px)] h-[min(520px,calc(100dvh-7rem))] max-h-[calc(100dvh-7rem)] flex flex-col panel-card !p-0 overflow-hidden shadow-2xl" role="dialog" aria-label="Ajuda do Lino">
      <div className="flex items-center gap-3 px-4 py-3 bg-[var(--primary)] text-white">
        <span className="lino-icone w-9 h-9 rounded-full overflow-hidden bg-white grid place-items-center shrink-0">{icone}</span>
        <div className="flex-1 min-w-0"><strong className="block leading-tight">Lino</strong><small className="opacity-80">Ajudante do portal · responde na hora</small></div>
        <button onClick={() => setAberto(false)} className="p-2 rounded-lg hover:bg-white/10" aria-label="Fechar ajuda"><X size={18} /></button>
      </div>
      <div className="flex-1 overflow-auto p-4 space-y-3 bg-[var(--bg-main)]">
        {msgs.map((m, i) => <div key={i} className={`flex ${m.de === 'voce' ? 'justify-end' : 'justify-start'}`}>
          <p className={`max-w-[85%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${m.de === 'voce' ? 'bg-[var(--primary)] text-white rounded-br-md' : 'bg-[var(--bg-card)] border border-[var(--border-color)] rounded-bl-md'}`}>{m.texto}</p>
        </div>)}
        {digitando && <div className="flex justify-start"><p className="px-4 py-2.5 rounded-2xl rounded-bl-md bg-[var(--bg-card)] border border-[var(--border-color)] text-sm animate-pulse">Lino está digitando…</p></div>}
        <div ref={fimRef} />
      </div>
      {!!respostasVisiveis.length && <div className="border-t border-[var(--border-color)] bg-[var(--bg-card)]">
        <button type="button" onClick={() => setMostrarTopicos(v => !v)} className="w-full flex items-center justify-between gap-2 px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)] hover:text-[var(--text-main)]" aria-expanded={mostrarTopicos}>
          <span>Tópicos por nível de acesso</span>
          {mostrarTopicos ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
        {mostrarTopicos && <div className="max-h-32 sm:max-h-44 overflow-y-auto border-t border-[var(--border-color)]">
          {grupos.map(([id, rotulo]) => {
            const itens = respostasVisiveis.filter(r => (r.nivel || 'funcionario') === id);
            return <div key={id} className="px-3 py-2 border-b border-[var(--border-color)] last:border-b-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">{rotulo} <span className="opacity-60">· {itens.length}</span></p>
              <div className="flex flex-wrap gap-1.5">
                {itens.map(r => <button key={r.id} onClick={() => responder(r.pergunta)} className="text-left text-[11px] font-semibold leading-snug px-2.5 py-1.5 rounded-full border border-[var(--border-color)] bg-[var(--bg-main)] hover:border-[var(--primary)] hover:text-[var(--primary)] transition-colors">{r.pergunta}</button>)}
              </div>
            </div>;
          })}
        </div>}
      </div>}
      <form onSubmit={e => { e.preventDefault(); responder(texto); }} className="flex gap-2 p-3 border-t border-[var(--border-color)] bg-[var(--bg-card)]">
        <input className="field !mt-0 flex-1" placeholder="Pergunte ao Lino…" value={texto} onChange={e => setTexto(e.target.value)} maxLength={300} />
        <button type="submit" className="bg-[var(--primary)] text-white p-3 rounded-xl shrink-0" aria-label="Enviar"><Send size={18} /></button>
      </form>
    </section>}
  </div>;
}
