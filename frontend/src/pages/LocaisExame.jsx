import { useEffect, useState } from 'react';
import axios from 'axios';
import { Building2, Pencil, Plus, Trash2 } from 'lucide-react';
import Sidebar from '../components/Sidebar';
import API from '../api';

const vazio = () => ({ nome: '', cnpj: '', endereco: '', cidade: '', uf: '', cep: '', telefone: '', email: '', responsavel: '', observacoes: '' });

export default function LocaisExame() {
  const api = `${API}/api`;
  const headers = { Authorization: `Bearer ${localStorage.getItem('token')}` };
  const [itens, setItens] = useState([]);
  const [busca, setBusca] = useState('');
  const [situacao, setSituacao] = useState('ativos');
  const [form, setForm] = useState(vazio());
  const [editandoId, setEditandoId] = useState(null);
  const [aberto, setAberto] = useState(false);
  const [msg, setMsg] = useState('');

  async function carregar() {
    const q = new URLSearchParams({ situacao });
    if (busca.trim()) q.set('busca', busca.trim());
    const { data } = await axios.get(`${api}/locais-exame?${q}`, { headers });
    setItens(data || []);
  }

  useEffect(() => { carregar().catch(() => {}); }, [situacao]);
  useEffect(() => {
    const t = setTimeout(() => carregar().catch(() => {}), busca ? 400 : 0);
    return () => clearTimeout(t);
  }, [busca]);

  function novo() { setForm(vazio()); setEditandoId(null); setAberto(true); }
  function editar(l) {
    setEditandoId(l.id);
    setForm({ nome: l.nome || '', cnpj: l.cnpj || '', endereco: l.endereco || '', cidade: l.cidade || '', uf: l.uf || '', cep: l.cep || '', telefone: l.telefone || '', email: l.email || '', responsavel: l.responsavel || '', observacoes: l.observacoes || '' });
    setAberto(true);
  }

  async function salvar(e) {
    e.preventDefault();
    try {
      if (editandoId) await axios.put(`${api}/locais-exame/${editandoId}`, form, { headers });
      else await axios.post(`${api}/locais-exame`, form, { headers });
      setAberto(false);
      setMsg('');
      carregar();
    } catch (err) { setMsg(err.response?.data?.error || 'Erro ao salvar local.'); }
  }

  async function excluir(l) {
    if (!confirm(`Excluir "${l.nome}"?`)) return;
    try {
      await axios.delete(`${api}/locais-exame/${l.id}`, { headers });
      carregar();
    } catch (err) {
      if (err.response?.status === 409) {
        if (confirm(`${err.response.data.error} Deseja inativar agora?`)) {
          await axios.put(`${api}/locais-exame/${l.id}`, { nome: l.nome, ativo: false }, { headers });
          carregar();
        }
      } else setMsg(err.response?.data?.error || 'Erro ao excluir.');
    }
  }

  async function alternarAtivo(l) {
    await axios.put(`${api}/locais-exame/${l.id}`, { nome: l.nome, ativo: !l.ativo }, { headers });
    carregar();
  }

  return (
    <div className="min-h-screen bg-[var(--bg-main)] flex">
      <Sidebar />
      <main className="flex-1 p-6 sm:p-10">
        <div className="flex flex-wrap items-center gap-3 mb-6">
          <h1 className="text-2xl font-bold text-[var(--text-main)] flex items-center gap-2"><Building2 size={24} /> Locais de Exame</h1>
          <button onClick={novo} className="ml-auto px-4 py-2 rounded-xl bg-amber-600 text-white font-bold flex items-center gap-2"><Plus size={16} /> Novo local</button>
        </div>
        <div className="flex flex-wrap gap-2 mb-4">
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome ou cidade…"
            className="flex-1 min-w-52 px-4 py-2 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] text-sm" />
          <select value={situacao} onChange={(e) => setSituacao(e.target.value)}
            className="px-4 py-2 rounded-xl bg-[var(--bg-card)] border border-[var(--border-color)] text-sm">
            <option value="ativos">Ativos</option>
            <option value="inativos">Inativos</option>
            <option value="todos">Todos</option>
          </select>
        </div>
        {msg && <p className="text-sm text-red-600 mb-3">{msg}</p>}
        <div className="overflow-x-auto rounded-2xl border border-[var(--border-color)]">
          <table className="w-full text-sm min-w-[760px]">
            <thead>
              <tr className="bg-[var(--bg-card)] text-left text-[var(--text-muted)]">
                {['Nome', 'Cidade/UF', 'Telefone', 'Responsável', 'Situação', 'Ações'].map((h) => <th key={h} className="px-3 py-2">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {itens.map((l) => (
                <tr key={l.id} className="border-t border-[var(--border-color)]">
                  <td className="px-3 py-2 font-medium text-[var(--text-main)]">{l.nome}</td>
                  <td className="px-3 py-2">{[l.cidade, l.uf].filter(Boolean).join('/') || '—'}</td>
                  <td className="px-3 py-2">{l.telefone || '—'}</td>
                  <td className="px-3 py-2">{l.responsavel || '—'}</td>
                  <td className="px-3 py-2">{l.ativo ? '✅ Ativo' : '⏸️ Inativo'}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <button onClick={() => editar(l)} className="mr-2 p-1.5 rounded-lg hover:bg-[var(--bg-main)]" title="Editar"><Pencil size={16} /></button>
                    <button onClick={() => alternarAtivo(l)} className="mr-2 text-xs underline" title="Ativar/Inativar">{l.ativo ? 'inativar' : 'ativar'}</button>
                    <button onClick={() => excluir(l)} className="p-1.5 rounded-lg hover:bg-[var(--bg-main)] text-red-600" title="Excluir"><Trash2 size={16} /></button>
                  </td>
                </tr>
              ))}
              {!itens.length && <tr><td colSpan={6} className="px-3 py-6 text-center text-[var(--text-muted)]">Nenhum local encontrado.</td></tr>}
            </tbody>
          </table>
        </div>
        {aberto && (
          <form onSubmit={salvar} className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4 overflow-y-auto">
            <div className="bg-[var(--bg-card)] rounded-2xl p-6 w-full max-w-lg space-y-3 my-8">
              <h2 className="font-bold text-lg text-[var(--text-main)]">{editandoId ? 'Editar local' : 'Novo local'}</h2>
              {[['nome', 'Nome *'], ['cnpj', 'CNPJ'], ['endereco', 'Endereço'], ['cidade', 'Cidade'], ['uf', 'UF'],
                ['cep', 'CEP'], ['telefone', 'Telefone'], ['email', 'E-mail'], ['responsavel', 'Responsável'], ['observacoes', 'Observações']]
                .map(([k, t]) => (
                  <label key={k} className="block text-sm">{t}
                    <input value={form[k] || ''} onChange={(e) => setForm((v) => ({ ...v, [k]: e.target.value }))}
                      className="mt-1 w-full px-3 py-2 rounded-xl border border-[var(--border-color)] bg-[var(--bg-main)]" />
                  </label>
                ))}
              <div className="flex gap-2 justify-end">
                <button type="button" onClick={() => setAberto(false)} className="px-4 py-2 rounded-xl border border-[var(--border-color)]">Cancelar</button>
                <button className="px-4 py-2 rounded-xl bg-amber-600 text-white font-bold">Salvar</button>
              </div>
            </div>
          </form>
        )}
      </main>
    </div>
  );
}
