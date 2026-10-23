import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { ArrowLeft, Ghost, Send, ShieldCheck } from 'lucide-react';
import useBranding from '../useBranding';
import API from '../api';

const SETORES = ['Produção', 'Confeitaria', 'Padaria', 'Atendimento', 'Logística', 'Limpeza', 'Administrativo', 'Outro'];

// Página pública: aberta ANTES do login, então nada é vinculado ao usuário.
export default function Desabafo() {
  const navigate = useNavigate();
  const branding = useBranding();
  const [setor, setSetor] = useState('');
  const [mensagem, setMensagem] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const [enviado, setEnviado] = useState(false);

  async function enviar(e) {
    e.preventDefault();
    setErro('');
    setEnviando(true);
    try {
      await axios.post(`${API}/api/desabafos`, { setor, mensagem });
      setEnviado(true);
      setMensagem('');
      setSetor('');
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
          <span className="w-12 h-12 rounded-2xl bg-violet-100 dark:bg-violet-950/40 text-violet-600 grid place-items-center"><Ghost size={24} /></span>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold">Desabafo anônimo</h1>
            <p className="text-[var(--text-muted)] text-sm">Sua mensagem vai direto para o RH e para o Administrador.</p>
          </div>
        </div>

        <div className="flex items-start gap-3 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-4 my-5">
          <ShieldCheck size={20} className="text-emerald-600 shrink-0 mt-0.5" />
          <p className="text-sm text-[var(--text-muted)]">
            Você <strong>não precisa entrar no sistema</strong>. Não registramos quem enviou, nem e-mail, nem login.
            Escreva o que precisa ser dito — RH e Administrador recebem a mensagem sem saber a origem.
          </p>
        </div>

        {enviado ? (
          <section className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-8 text-center">
            <span className="w-14 h-14 rounded-2xl bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 grid place-items-center mx-auto mb-4"><ShieldCheck size={28} /></span>
            <h2 className="text-xl font-bold">Desabafo enviado em anônimo</h2>
            <p className="text-[var(--text-muted)] text-sm mt-2">Obrigado por confiar. O RH e o Administrador já foram avisados.</p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center mt-6">
              <button onClick={() => setEnviado(false)} className="px-5 py-2.5 rounded-xl border border-[var(--border-color)] font-bold">Enviar outro</button>
              <button onClick={() => navigate('/')} className="px-5 py-2.5 rounded-xl bg-amber-600 text-white font-bold">Voltar ao login</button>
            </div>
          </section>
        ) : (
          <form onSubmit={enviar} className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5 sm:p-6 space-y-4">
            <label className="block text-sm font-medium">
              Setor (opcional)
              <select value={setor} onChange={(e) => setSetor(e.target.value)}
                className="mt-1 w-full px-3 py-2.5 rounded-xl border border-[var(--border-color)] bg-[var(--bg-main)] text-sm">
                <option value="">Prefiro não informar</option>
                {SETORES.map((s) => <option key={s}>{s}</option>)}
              </select>
            </label>
            <label className="block text-sm font-medium">
              O que você quer dizer? *
              <textarea required value={mensagem} onChange={(e) => setMensagem(e.target.value)} rows={7} maxLength={4000}
                placeholder="Escreva com tranquilidade. Ninguém vai saber que foi você."
                className="mt-1 w-full px-3 py-2.5 rounded-xl border border-[var(--border-color)] bg-[var(--bg-main)] text-sm resize-y" />
              <span className="block text-right text-[11px] text-[var(--text-muted)]">{mensagem.length}/4000</span>
            </label>
            {erro && <p className="text-sm text-red-600">{erro}</p>}
            <button disabled={enviando} className="w-full flex items-center justify-center gap-2 bg-amber-600 text-white py-3 rounded-xl font-bold hover:bg-amber-700 disabled:opacity-60">
              <Send size={18} /> {enviando ? 'Enviando…' : 'Enviar em anônimo'}
            </button>
          </form>
        )}
      </main>
    </div>
  );
}
