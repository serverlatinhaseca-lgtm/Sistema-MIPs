import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { Bot, Send, X } from 'lucide-react';
import API from '../api';
import useBranding from '../useBranding';

const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const RESPOSTA_PADRAO = 'Hmm, isso eu ainda não sei responder... Tente perguntar sobre MIPs, receitas, avaliações, reclamações ou senha. Se for urgente, fale com seu líder!';

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
  const [msgs, setMsgs] = useState([{ de: 'lino', texto: 'Oi! Eu sou o Lino, ajudante do Portal - Nova Esperança. Sobre o que quer saber hoje?' }]);
  const [texto, setTexto] = useState('');
  const [digitando, setDigitando] = useState(false);
  const fimRef = useRef(null);

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
    const achada = escolherResposta(textoPergunta, respostas);
    setTimeout(() => {
      setMsgs(v => [...v, { de: 'lino', texto: achada ? achada.resposta : RESPOSTA_PADRAO }]);
      setDigitando(false);
    }, 600 + Math.random() * 500);
  }

  const icone = branding.ajuda_icone
    ? <img src={branding.ajuda_icone} alt="Ajuda" className="w-full h-full object-contain !m-0 drop-shadow-lg" />
    : <Bot size={44} className="text-[var(--primary)] drop-shadow-lg" />;

  return <div className="no-print">
    {!aberto && <button onClick={() => setAberto(true)} title="Ajuda — falar com o Lino" aria-label="Abrir ajuda do Lino" className="fixed bottom-5 right-5 z-[70] w-20 h-20 rounded-full grid place-items-center bg-transparent">
      <span className="w-full h-full grid place-items-center rounded-full border-[3px] border-[var(--primary)] p-1.5 shadow-lg">{branding.ajuda_icone ? <span className="w-full h-full block overflow-hidden rounded-full">{icone}</span> : icone}</span>
    </button>}
    {aberto && <section className="fixed bottom-5 right-4 z-[90] w-[min(92vw,360px)] h-[min(520px,70vh)] flex flex-col panel-card !p-0 overflow-hidden shadow-2xl" role="dialog" aria-label="Ajuda do Lino">
      <div className="flex items-center gap-3 px-4 py-3 bg-[var(--primary)] text-white">
        <span className="w-9 h-9 rounded-full overflow-hidden bg-white grid place-items-center shrink-0">{icone}</span>
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
      {!!respostas.length && <div className="flex gap-2 overflow-x-auto px-3 py-2 border-t border-[var(--border-color)] bg-[var(--bg-card)]">
        {respostas.slice(0, 6).map(r => <button key={r.id} onClick={() => responder(r.pergunta)} className="whitespace-nowrap text-xs font-semibold px-3 py-1.5 rounded-full border border-[var(--border-color)] hover:bg-[var(--bg-main)]">{r.pergunta}</button>)}
      </div>}
      <form onSubmit={e => { e.preventDefault(); responder(texto); }} className="flex gap-2 p-3 border-t border-[var(--border-color)] bg-[var(--bg-card)]">
        <input className="field !mt-0 flex-1" placeholder="Pergunte ao Lino…" value={texto} onChange={e => setTexto(e.target.value)} maxLength={300} />
        <button type="submit" className="bg-[var(--primary)] text-white p-3 rounded-xl shrink-0" aria-label="Enviar"><Send size={18} /></button>
      </form>
    </section>}
  </div>;
}
