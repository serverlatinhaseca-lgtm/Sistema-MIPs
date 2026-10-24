import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { ArrowLeft, Ghost, Send, ShieldCheck } from 'lucide-react';
import useBranding from '../useBranding';
import API from '../api';

// Página pública: aberta ANTES do login, então nada é vinculado ao usuário.
export default function Desabafo() {
  const navigate = useNavigate();
  const branding = useBranding();
  const [mensagem, setMensagem] = useState('');
  const [anexo, setAnexo] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const [enviado, setEnviado] = useState(false);
  const arquivoRef = useRef(null);

  function escolherAnexo(arquivo) {
    if (arquivo && arquivo.size > 20 * 1024 * 1024) {
      setErro('O anexo pode ter no máximo 20MB.');
      if (arquivoRef.current) arquivoRef.current.value = '';
      setAnexo(null);
      return;
    }
    setErro('');
    setAnexo(arquivo || null);
  }

  async function enviar(e) {
    e.preventDefault();
    setErro('');
    if (mensagem.trim().length < 10) {
      setErro('Escreva pelo menos 10 caracteres.');
      return;
    }
    setEnviando(true);
    try {
      const dados = new FormData();
      dados.append('mensagem', mensagem);
      if (anexo) dados.append('anexo', anexo, anexo.name || 'anexo');
      await axios.post(`${API}/api/desabafos`, dados);
      setEnviado(true);
      setMensagem('');
      setAnexo(null);
      if (arquivoRef.current) arquivoRef.current.value = '';
    } catch (err) {
      setErro(err.response?.data?.error || 'Não foi possível enviar agora. Tente novamente.');
    } finally { setEnviando(false); }
  }

  return (
    <div className="min-h-screen bg-[var(--bg-main)] text-[var(--text-main)] flex flex-col">
      <header className="p-5 sm:p-8 max-w-2xl w-full mx-auto flex items-center gap-3">
        {branding.logo_site
          ? <img src={branding.logo_site} alt={branding.nome_site} className="h-10 w-auto object-contain" />
          : <span className="font-bold text-lg">{branding.nome_site}</span>}
        <button onClick={() => navigate('/')} className="ml-auto flex items-center gap-2 text-sm font-bold text-[var(--text-muted)] hover:text-[var(--text-main)]">
          <ArrowLeft size={16} /> Voltar ao login
        </button>
      </header>

      <main className="flex-1 w-full max-w-2xl mx-auto px-5 sm:px-8 pb-12">
        <div className="flex items-center gap-3 mb-2">
          <span className="w-12 h-12 rounded-2xl bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 grid place-items-center"><Ghost size={24} /></span>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold">Desabafo anônimo</h1>
          </div>
        </div>

        <div className="flex items-start gap-3 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-4 my-5">
          <ShieldCheck size={20} className="text-emerald-600 shrink-0 mt-0.5" />
          <p className="text-sm text-[var(--text-muted)]">
            Não precisa logar. Sua mensagem será <strong>completamente anônima</strong>. Não registramos quem enviou, nem e-mail, nem login.
          </p>
        </div>

        {enviado ? (
          <section className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-8 text-center">
            <span className="w-14 h-14 rounded-2xl bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 grid place-items-center mx-auto mb-4"><ShieldCheck size={28} /></span>
            <h2 className="text-xl font-bold">Desabafo enviado em anônimo</h2>
            <p className="text-[var(--text-muted)] text-sm mt-2">Obrigado por confiar. A mensagem foi entregue.</p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center mt-6">
              <button onClick={() => setEnviado(false)} className="px-5 py-2.5 rounded-xl border border-[var(--border-color)] font-bold">Enviar outro</button>
              <button onClick={() => navigate('/')} className="px-5 py-2.5 rounded-xl bg-amber-600 text-white font-bold">Voltar ao login</button>
            </div>
          </section>
        ) : (
          <form onSubmit={enviar} className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5 sm:p-6 space-y-4">
            <label className="block text-sm font-medium">
              O que você quer dizer? *
              <textarea required value={mensagem} onChange={(e) => setMensagem(e.target.value)} rows={7} maxLength={4000}
                placeholder="Escreva com tranquilidade. Ninguém vai saber que foi você."
                className="mt-1 w-full px-3 py-2.5 rounded-xl border border-[var(--border-color)] bg-[var(--bg-main)] text-sm resize-y" />
              <span className="block text-right text-[11px] text-[var(--text-muted)]">{mensagem.length}/4000</span>
            </label>

            <label className="block text-sm font-medium">
              Anexo (opcional)
              <input ref={arquivoRef} type="file" onChange={(e) => escolherAnexo(e.target.files?.[0])}
                className="mt-1 block w-full text-xs file:mr-3 file:px-3 file:py-2 file:rounded-lg file:border-0 file:bg-amber-600 file:text-white file:font-bold" />
              <span className="text-[11px] text-[var(--text-muted)]">PDF, DOCX, XLSX, imagem, vídeo ou áudio — até 20MB.</span>
            </label>
            {!!anexo && (
              <p className="text-xs flex items-center gap-2 break-all">
                📎 {anexo.name}
                <button type="button" onClick={() => { setAnexo(null); if (arquivoRef.current) arquivoRef.current.value = ''; }} className="underline">remover</button>
              </p>
            )}

            {erro && <p className="text-sm text-red-600">{erro}</p>}
            <button disabled={enviando} className="w-full flex items-center justify-center gap-2 bg-amber-600 text-white py-3 rounded-xl font-bold hover:bg-amber-700 disabled:opacity-60 transition-colors">
              <Send size={18} /> {enviando ? 'Enviando…' : 'Enviar em anônimo'}
            </button>
          </form>
        )}
      </main>
    </div>
  );
}