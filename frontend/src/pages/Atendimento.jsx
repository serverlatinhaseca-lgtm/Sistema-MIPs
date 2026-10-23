import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { CheckCircle2, MessageCircle, Mic, Paperclip, Plus, Printer, RotateCcw, Search, Send, Square, X } from 'lucide-react';
import Sidebar from '../components/Sidebar';
import LeitorTopbar from '../components/LeitorTopbar';
import API from '../api';

const CATEGORIAS = ['ASO', 'Folga', 'Dúvida', 'Documento', 'Banco de Horas', 'Outro'];
// Atendendo = na fila do RH · Pendente = aguardando o funcionário · Concluído = histórico.
const STATUS = ['Atendendo', 'Pendente', 'Concluído'];
const PRIORIDADES = ['Baixa', 'Média', 'Alta', 'Urgente'];
const corStatus = (s) => ({ Atendendo: '#a16207', Pendente: '#1d4ed8', Concluído: '#15803d' }[s] || '#57534e');
const corPri = (p) => ({ Baixa: '#57534e', Média: '#1d4ed8', Alta: '#c2410c', Urgente: '#b91c1c' }[p] || '#57534e');

export default function Atendimento() {
  const api = `${API}/api`;
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const perfil = String(user.perfil || '').toLowerCase();
  const ehRH = ['administrador', 'gerente', 'rh'].includes(perfil);
  const headers = { Authorization: `Bearer ${localStorage.getItem('token')}` };

  const [lista, setLista] = useState([]);
  const [situacao, setSituacao] = useState('ativos');
  const [fStatus, setFStatus] = useState('');
  const [fCat, setFCat] = useState('');
  const [de, setDe] = useState('');
  const [ate, setAte] = useState('');
  const [busca, setBusca] = useState('');
  const [aberto, setAberto] = useState(null); // ticket detalhado
  const [novo, setNovo] = useState(false);
  const [form, setForm] = useState({ categoria: 'Dúvida', prioridade: 'Média', titulo: '', descricao: '' });
  const [arquivoNovo, setArquivoNovo] = useState(null);
  const [texto, setTexto] = useState('');
  const [anexo, setAnexo] = useState(null);
  const [gravando, setGravando] = useState(false);
  const [msg, setMsg] = useState('');
  const recRef = useRef(null);
  const fimRef = useRef(null);

  async function carregarLista(fS = fStatus, fC = fCat, b = busca) {
    const q = new URLSearchParams();
    if (ehRH) q.set('situacao', situacao);
    if (fS) q.set('status', fS);
    if (fC) q.set('categoria', fC);
    if (b.trim()) q.set('busca', b.trim());
    if (situacao === 'historico') {
      if (de) q.set('de', de);
      if (ate) q.set('ate', ate);
    }
    const { data } = await axios.get(`${api}/tickets${q.toString() ? `?${q}` : ''}`, { headers });
    setLista(data || []);
  }

  async function abrirTicket(id) {
    const { data } = await axios.get(`${api}/tickets/${id}`, { headers });
    setAberto(data);
  }

  useEffect(() => { carregarLista().catch(() => {}); }, [fStatus, fCat, situacao, de, ate]);
  useEffect(() => {
    const t = setTimeout(() => carregarLista().catch(() => {}), busca ? 400 : 0);
    return () => clearTimeout(t);
  }, [busca]);

  // Tempo real por polling: atualiza mensagens abertas a cada 5s.
  useEffect(() => {
    if (!aberto) return;
    const t = setInterval(async () => {
      try {
        const { data } = await axios.get(`${api}/tickets/${aberto.id}`, { headers });
        setAberto(data);
      } catch { /* mantém o que tem */ }
    }, 5000);
    return () => clearInterval(t);
  }, [aberto?.id]);

  useEffect(() => { fimRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [aberto?.mensagens?.length]);

  async function criarTicket(e) {
    e.preventDefault();
    try {
      const dados = new FormData();
      dados.append('categoria', form.categoria);
      dados.append('prioridade', form.prioridade);
      dados.append('titulo', form.titulo);
      dados.append('descricao', form.descricao);
      if (arquivoNovo) dados.append('anexo', arquivoNovo, arquivoNovo.name || 'anexo');
      const { data } = await axios.post(`${api}/tickets`, dados, { headers });
      setNovo(false);
      setForm({ categoria: 'Dúvida', prioridade: 'Média', titulo: '', descricao: '' });
      setArquivoNovo(null);
      setMsg(`Ticket ${data.numero} aberto — o RH foi notificado.`);
      await carregarLista();
      abrirTicket(data.id);
    } catch (err) { setMsg(err.response?.data?.error || 'Erro ao abrir ticket.'); }
  }

  async function enviarMsg(e, arquivoForcado) {
    e?.preventDefault();
    const arq = arquivoForcado || anexo;
    if (!texto.trim() && !arq) return;
    const dados = new FormData();
    dados.append('texto', texto);
    if (arq) dados.append('anexo', arq, arq.name || 'anexo');
    try {
      await axios.post(`${api}/tickets/${aberto.id}/mensagens`, dados, { headers });
      setTexto('');
      setAnexo(null);
      const { data } = await axios.get(`${api}/tickets/${aberto.id}`, { headers });
      setAberto(data);
      carregarLista();
    } catch (err) { setMsg(err.response?.data?.error || 'Erro ao enviar.'); }
  }

  async function gravarAudio() {
    if (gravando) { recRef.current?.stop(); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      const partes = [];
      rec.ondataavailable = (e) => partes.push(e.data);
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        setGravando(false);
        const blob = new Blob(partes, { type: rec.mimeType || 'audio/webm' });
        enviarMsg(null, new File([blob], `audio-${Date.now()}.webm`, { type: blob.type }));
      };
      recRef.current = rec;
      rec.start();
      setGravando(true);
    } catch { setMsg('Microfone indisponível.'); }
  }

  async function mudarStatus(campo, valor) {
    try {
      const { data } = await axios.patch(`${api}/tickets/${aberto.id}`, { [campo]: valor }, { headers });
      setAberto((v) => ({ ...v, ...data }));
      carregarLista();
    } catch (err) { setMsg(err.response?.data?.error || 'Erro ao atualizar.'); }
  }

  function imprimir() {
    const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
    const w = window.open('', '_blank');
    w.document.write(`<html><head><title>${esc(aberto.numero)}</title><style>body{font-family:sans-serif;max-width:700px;margin:20px auto}li{margin-bottom:8px}</style></head><body>
      <h1>${esc(aberto.numero)} — ${esc(aberto.titulo)}</h1>
      <p>Categoria: ${esc(aberto.categoria)} · Prioridade: ${esc(aberto.prioridade)} · Status: ${esc(aberto.status)}</p>
      <p>${esc(aberto.descricao)}</p><hr><ul>
      ${(aberto.mensagens || []).map((m) => `<li><strong>${esc(m.nome_autor)}</strong> (${new Date(m.criado_em).toLocaleString('pt-BR')}): ${esc(m.texto)}${m.anexo_nome ? ` [anexo: ${esc(m.anexo_nome)}]` : ''}</li>`).join('')}
      </ul><script>window.print()</script></body></html>`);
    w.document.close();
  }

  const ehAudio = (m) => /audio|webm|mp3|m4a|ogg|wav/i.test(`${m.anexo_tipo} ${m.anexo_nome}`);
  const ehImagem = (m) => /image|jpe?g|png/i.test(`${m.anexo_tipo} ${m.anexo_nome}`);
  const ehVideo = (m) => /video|mp4/i.test(`${m.anexo_tipo} ${m.anexo_nome}`);

  const campo = 'mt-1 w-full px-3 py-2 rounded-xl border border-[var(--border-color)] bg-[var(--bg-main)] text-sm';
  const abaAtiva = 'px-3 py-2 rounded-xl text-sm font-bold bg-amber-600 text-white';
  const abaInativa = 'px-3 py-2 rounded-xl text-sm font-bold bg-[var(--bg-card)] border border-[var(--border-color)] text-[var(--text-muted)]';

  const listaEl = (
    <div className="space-y-2">
      {ehRH && (
        <div className="flex gap-2 mb-2">
          <button onClick={() => { setSituacao('ativos'); setFStatus(''); }} className={situacao === 'ativos' ? abaAtiva : abaInativa}>Em atendimento</button>
          <button onClick={() => { setSituacao('historico'); setFStatus('Concluído'); }} className={situacao === 'historico' ? abaAtiva : abaInativa}>Histórico</button>
        </div>
      )}
      <div className="flex flex-wrap gap-2 mb-3">
        <div className="relative flex-1 min-w-44">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar nº, assunto ou mensagem…"
            className="w-full pl-9 pr-3 py-2 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] text-sm" />
        </div>
        <select value={fStatus} onChange={(e) => setFStatus(e.target.value)} className="px-3 py-2 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] text-sm">
          <option value="">Todos os status</option>{STATUS.map((s) => <option key={s}>{s}</option>)}
        </select>
        <select value={fCat} onChange={(e) => setFCat(e.target.value)} className="px-3 py-2 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] text-sm">
          <option value="">Todas as categorias</option>{CATEGORIAS.map((s) => <option key={s}>{s}</option>)}
        </select>
      </div>
      {ehRH && situacao === 'historico' && (
        <div className="flex flex-wrap items-center gap-2 mb-3 text-xs">
          <label className="flex items-center gap-1">De
            <input type="date" value={de} onChange={(e) => setDe(e.target.value)} className="px-2 py-1.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border-color)]" />
          </label>
          <label className="flex items-center gap-1">Até
            <input type="date" value={ate} onChange={(e) => setAte(e.target.value)} className="px-2 py-1.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border-color)]" />
          </label>
          {(de || ate) && <button onClick={() => { setDe(''); setAte(''); }} className="underline text-[var(--text-muted)]">limpar datas</button>}
        </div>
      )}
      {lista.map((t) => (
        <button key={t.id} onClick={() => abrirTicket(t.id)}
          className={`w-full text-left rounded-2xl border p-4 ${aberto?.id === t.id ? 'border-amber-600 bg-[var(--bg-card)]' : 'border-[var(--border-color)] bg-[var(--bg-card)]'}`}>
          <div className="flex flex-wrap items-center gap-2">
            <strong className="text-sm">{t.numero}</strong>
            <span className="text-xs px-2 py-0.5 rounded-full text-white" style={{ background: corStatus(t.status) }}>{t.status}</span>
            <span className="text-xs font-bold" style={{ color: corPri(t.prioridade) }}>{t.prioridade}</span>
            {t.sla_estourado && <span className="text-xs font-bold text-red-700">⏰ SLA estourado</span>}
            <span className="ml-auto text-[11px] text-[var(--text-muted)]">{t.categoria} · {t.mensagens} msgs</span>
          </div>
          <p className="text-sm font-medium text-[var(--text-main)] mt-1 truncate">{t.titulo}</p>
          <p className="text-[11px] text-[var(--text-muted)]">{t.nome_solicitante} · {new Date(t.atualizado_em).toLocaleString('pt-BR')}</p>
        </button>
      ))}
      {!lista.length && <p className="text-sm text-[var(--text-muted)]">{ehRH && situacao === 'historico' ? 'Nenhum ticket concluído neste filtro.' : 'Nenhum ticket. Abra um pelo botão acima.'}</p>}
    </div>
  );

  const detalheEl = !aberto ? (
    <div className="hidden md:grid place-items-center rounded-2xl border border-[var(--border-color)] min-h-[400px] text-[var(--text-muted)] text-sm">
      Selecione um ticket para conversar.
    </div>
  ) : (
    <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] flex flex-col min-h-[400px] max-h-[75vh]">
      <div className="px-4 py-3 border-b border-[var(--border-color)]">
        <div className="flex flex-wrap items-center gap-2">
          <strong>{aberto.numero}</strong>
          <span className="text-xs px-2 py-0.5 rounded-full text-white" style={{ background: corStatus(aberto.status) }}>{aberto.status}</span>
          {ehRH ? (
            <>
              <select value={aberto.status} onChange={(e) => mudarStatus('status', e.target.value)} className="text-xs px-2 py-1 rounded-lg border border-[var(--border-color)]">
                {STATUS.map((s) => <option key={s}>{s}</option>)}
              </select>
              <select value={aberto.prioridade} onChange={(e) => mudarStatus('prioridade', e.target.value)} className="text-xs px-2 py-1 rounded-lg border border-[var(--border-color)]">
                {PRIORIDADES.map((s) => <option key={s}>{s}</option>)}
              </select>
              {aberto.status === 'Concluído'
                ? <button onClick={() => mudarStatus('status', 'Atendendo')} className="text-xs px-2 py-1 rounded-lg bg-amber-600 text-white font-bold flex items-center gap-1"><RotateCcw size={13} /> Reabrir</button>
                : <button onClick={() => mudarStatus('status', 'Concluído')} className="text-xs px-2 py-1 rounded-lg bg-emerald-600 text-white font-bold flex items-center gap-1"><CheckCircle2 size={13} /> Concluir</button>}
            </>
          ) : <span className="text-xs font-bold" style={{ color: corPri(aberto.prioridade) }}>{aberto.prioridade}</span>}
          <button onClick={imprimir} className="ml-auto p-1.5 rounded-lg hover:bg-[var(--bg-main)]" title="Exportar em PDF (imprimir)"><Printer size={16} /></button>
          <button onClick={() => setAberto(null)} className="text-xs underline md:hidden">voltar</button>
        </div>
        <p className="text-sm font-medium mt-1">{aberto.titulo}</p>
        <p className="text-[11px] text-[var(--text-muted)]">{aberto.categoria} · SLA até {aberto.prazo_sla ? new Date(aberto.prazo_sla).toLocaleString('pt-BR') : '—'}</p>
        {!!aberto.descricao && <p className="text-xs mt-1 whitespace-pre-wrap">{aberto.descricao}</p>}
      </div>
      <div className="flex-1 overflow-auto px-4 py-3 space-y-2">
        {(aberto.mensagens || []).map((m) => {
          const minha = Number(m.usuario_id) === Number(user.id);
          return (
            <div key={m.id} className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${minha ? 'ml-auto bg-amber-600 text-white' : 'bg-[var(--bg-main)]'}`}>
              <p className={`text-[11px] font-bold ${minha ? 'text-amber-100' : 'text-[var(--text-muted)]'}`}>{minha ? 'Você' : m.nome_autor}</p>
              {!!m.texto && <p className="whitespace-pre-wrap">{m.texto}</p>}
              {!!m.anexo_url && (
                <div className="mt-1">
                  {ehImagem(m) && <a href={`${API}${m.anexo_url}`} target="_blank" rel="noreferrer"><img src={`${API}${m.anexo_url}`} alt={m.anexo_nome} className="max-w-full rounded-lg" /></a>}
                  {ehAudio(m) && <audio controls src={`${API}${m.anexo_url}`} className="w-full" />}
                  {ehVideo(m) && <video controls src={`${API}${m.anexo_url}`} className="max-w-full rounded-lg" />}
                  {!ehImagem(m) && !ehAudio(m) && !ehVideo(m) && <a href={`${API}${m.anexo_url}`} target="_blank" rel="noreferrer" className="underline">📎 {m.anexo_nome || 'anexo'}</a>}
                </div>
              )}
              <p className={`text-[10px] mt-1 ${minha ? 'text-amber-100' : 'text-[var(--text-muted)]'}`}>{new Date(m.criado_em).toLocaleString('pt-BR')}</p>
            </div>
          );
        })}
        <div ref={fimRef} />
      </div>
      {aberto.status === 'Concluído' && !ehRH ? (
        <p className="px-4 py-3 border-t border-[var(--border-color)] text-xs text-[var(--text-muted)]">Ticket concluído. Abra um novo se precisar de ajuda.</p>
      ) : (
        <form onSubmit={enviarMsg} className="px-3 py-2 border-t border-[var(--border-color)]">
          {!!anexo && <p className="text-xs mb-1">📎 {anexo.name} <button type="button" onClick={() => setAnexo(null)} className="underline">remover</button></p>}
          <div className="flex items-center gap-1">
            <label className="p-2 rounded-lg hover:bg-[var(--bg-main)] cursor-pointer" title="Anexar (PDF, DOCX, XLSX, JPG, PNG, MP4, áudio — até 50MB)">
              <Paperclip size={18} /><input type="file" className="hidden" onChange={(e) => setAnexo(e.target.files?.[0] || null)} />
            </label>
            <button type="button" onClick={gravarAudio} className={`p-2 rounded-lg hover:bg-[var(--bg-main)] ${gravando ? 'text-red-600' : ''}`} title="Gravar áudio">
              {gravando ? <Square size={18} /> : <Mic size={18} />}
            </button>
            <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Escreva…"
              className="flex-1 px-3 py-2 rounded-xl border border-[var(--border-color)] bg-[var(--bg-main)] text-sm" />
            <button className="p-2 rounded-xl bg-amber-600 text-white" title="Enviar"><Send size={18} /></button>
          </div>
        </form>
      )}
    </div>
  );

  const conteudo = (
    <>
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <h1 className="text-2xl font-bold text-[var(--text-main)] flex items-center gap-2"><MessageCircle size={24} /> Atendimento {ehRH ? '' : '· meus tickets'}</h1>
        <button onClick={() => setNovo(true)} className="ml-auto px-4 py-2 rounded-xl bg-amber-600 text-white text-sm font-bold flex items-center gap-2"><Plus size={16} /> Novo ticket</button>
      </div>
      {msg && <p className="text-sm text-[var(--text-muted)] mb-3">{msg}</p>}
      <div className="grid md:grid-cols-[340px_1fr] gap-4 items-start">
        {(!aberto || window.innerWidth >= 768) && listaEl}
        {detalheEl}
      </div>
      {novo && (
        <form onSubmit={criarTicket} className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <div className="bg-[var(--bg-card)] rounded-2xl p-6 w-full max-w-md space-y-3 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-lg text-[var(--text-main)]">Novo ticket</h2>
              <button type="button" onClick={() => setNovo(false)} className="p-1 rounded-lg hover:bg-[var(--bg-main)]"><X size={18} /></button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="block text-sm">Categoria
                <select value={form.categoria} onChange={(e) => setForm((v) => ({ ...v, categoria: e.target.value }))} className={campo}>
                  {CATEGORIAS.map((c) => <option key={c}>{c}</option>)}
                </select>
              </label>
              <label className="block text-sm">Prioridade
                <select value={form.prioridade} onChange={(e) => setForm((v) => ({ ...v, prioridade: e.target.value }))} className={campo}>
                  {PRIORIDADES.map((c) => <option key={c}>{c}</option>)}
                </select>
              </label>
            </div>
            <label className="block text-sm">Assunto *
              <input value={form.titulo} onChange={(e) => setForm((v) => ({ ...v, titulo: e.target.value }))} required className={campo} />
            </label>
            <label className="block text-sm">Descrição
              <textarea value={form.descricao} onChange={(e) => setForm((v) => ({ ...v, descricao: e.target.value }))} rows={4} className={campo} />
            </label>
            <label className="block text-sm">Anexo (opcional)
              <input type="file" onChange={(e) => setArquivoNovo(e.target.files?.[0] || null)}
                className="mt-1 block w-full text-xs file:mr-3 file:px-3 file:py-2 file:rounded-lg file:border-0 file:bg-amber-600 file:text-white file:font-bold" />
              <span className="text-[11px] text-[var(--text-muted)]">PDF, DOCX, XLSX, imagem, vídeo ou áudio — até 50MB.</span>
            </label>
            {!!arquivoNovo && <p className="text-xs">📎 {arquivoNovo.name} <button type="button" onClick={() => setArquivoNovo(null)} className="underline">remover</button></p>}
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setNovo(false)} className="px-4 py-2 rounded-xl border border-[var(--border-color)]">Cancelar</button>
              <button className="px-4 py-2 rounded-xl bg-amber-600 text-white font-bold">Abrir ticket</button>
            </div>
          </div>
        </form>
      )}
    </>
  );

  if (perfil === 'leitor') {
    return <div className="min-h-screen bg-[var(--bg-main)]"><LeitorTopbar titulo="Atendimento" /><main className="p-4 sm:p-10 max-w-6xl">{conteudo}</main></div>;
  }
  return <div className="min-h-screen bg-[var(--bg-main)] flex"><Sidebar /><main className="flex-1 min-w-0 p-4 sm:p-10">{conteudo}</main></div>;
}
