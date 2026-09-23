import { useEffect, useState } from 'react';
import axios from 'axios';
import { CalendarCheck, CalendarPlus, Download, Trash2 } from 'lucide-react';
import Sidebar from '../components/Sidebar';
import API from '../api';

function paraICSData(v) {
  const d = new Date(v);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}T${p(d.getHours())}${p(d.getMinutes())}00`;
}

export default function AgendamentosASO() {
  const api = `${API}/api`;
  const headers = { Authorization: `Bearer ${localStorage.getItem('token')}` };
  const [itens, setItens] = useState([]);
  const [asos, setAsos] = useState([]);
  const [locais, setLocais] = useState([]);
  const [form, setForm] = useState({ aso_id: '', data_hora: '', local_id: '', observacoes: '' });
  const [aberto, setAberto] = useState(false);
  const [reagendando, setReagendando] = useState(null);
  const [novaData, setNovaData] = useState('');
  const [msg, setMsg] = useState('');

  async function carregar() {
    const [a, s, l] = await Promise.all([
      axios.get(`${api}/agendamentos-aso`, { headers }),
      axios.get(`${api}/asos`, { headers }),
      axios.get(`${api}/locais-exame?situacao=ativos`, { headers }),
    ]);
    setItens(a.data || []);
    setAsos(s.data || []);
    setLocais(l.data || []);
  }

  useEffect(() => { carregar().catch((e) => setMsg(e.response?.data?.error || 'Erro ao carregar.')); }, []);

  async function salvar(e) {
    e.preventDefault();
    const aso = asos.find((x) => String(x.id) === String(form.aso_id));
    if (!aso) { setMsg('Selecione o funcionário.'); return; }
    try {
      await axios.post(`${api}/agendamentos-aso`, {
        aso_id: Number(form.aso_id),
        nome_funcionario: aso.nome_funcionario,
        data_hora: form.data_hora,
        local_id: form.local_id ? Number(form.local_id) : null,
        observacoes: form.observacoes,
      }, { headers });
      setForm({ aso_id: '', data_hora: '', local_id: '', observacoes: '' });
      setAberto(false);
      setMsg('');
      carregar();
    } catch (err) { setMsg(err.response?.data?.error || 'Erro ao agendar.'); }
  }

  async function reagendar(id) {
    if (!novaData) return;
    try {
      await axios.put(`${api}/agendamentos-aso/${id}`, { data_hora: novaData }, { headers });
      setReagendando(null);
      setNovaData('');
      carregar();
    } catch (err) { setMsg(err.response?.data?.error || 'Erro ao reagendar.'); }
  }

  async function confirmar(id, asoId) {
    try {
      await axios.post(`${api}/agendamentos-aso/${id}/confirmar`, {}, { headers });
      carregar();
    } catch (err) { setMsg(err.response?.data?.error || 'Erro ao confirmar.'); }
  }

  async function concluir(id, realizado) {
    try {
      await axios.put(`${api}/agendamentos-aso/${id}`, { realizado: !realizado }, { headers });
      carregar();
    } catch (err) { setMsg(err.response?.data?.error || 'Erro ao atualizar.'); }
  }

  async function excluir(id) {
    if (!confirm('Excluir este agendamento?')) return;
    await axios.delete(`${api}/agendamentos-aso/${id}`, { headers });
    carregar();
  }

  function exportarICS(ag) {
    const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'BEGIN:VEVENT',
      `UID:agaso-${ag.id}@mips.lan`, `DTSTART:${paraICSData(ag.data_hora)}`,
      `SUMMARY:ASO — ${ag.nome_funcionario}`, `DESCRIPTION:${(ag.observacoes || '').replace(/\n/g, ' ')}`,
      `LOCATION:${(ag.local_nome || '').replace(/\n/g, ' ')}`, 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `aso-${ag.id}.ics`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="min-h-screen bg-[var(--bg-main)] flex">
      <Sidebar />
      <main className="flex-1 p-6 sm:p-10">
        <div className="flex flex-wrap items-center gap-3 mb-6">
          <h1 className="text-2xl font-bold text-[var(--text-main)] flex items-center gap-2"><CalendarCheck size={24} /> Agendamentos de ASO</h1>
          <button onClick={() => setAberto(true)} className="ml-auto px-4 py-2 rounded-xl bg-amber-600 text-white font-bold flex items-center gap-2"><CalendarPlus size={16} /> Novo agendamento</button>
        </div>
        {msg && <p className="text-sm text-[var(--text-muted)] mb-3">{msg}</p>}
        <div className="space-y-3">
          {itens.map((ag) => (
            <div key={ag.id} className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] p-4 flex flex-wrap items-center gap-3">
              <div className="flex-1 min-w-52">
                <p className="font-bold text-[var(--text-main)]">{ag.nome_funcionario}</p>
                <p className="text-sm text-[var(--text-muted)]">
                  {new Date(ag.data_hora).toLocaleString('pt-BR')}{ag.local_nome ? ` · ${ag.local_nome}` : ''}
                  {ag.observacoes ? ` · ${ag.observacoes}` : ''}
                </p>
                <p className="text-xs mt-1">
                  {ag.realizado ? <span className="text-green-700 font-bold">✅ realizado</span>
                    : ag.presenca_confirmada ? <span className="text-green-700 font-bold">✅ presença confirmada</span>
                    : <span className="text-[var(--text-muted)]">aguardando confirmação</span>}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {!ag.realizado && <button onClick={() => { setReagendando(ag.id); setNovaData(''); }} className="text-xs underline">reagendar</button>}
                {!ag.presenca_confirmada && <button onClick={() => confirmar(ag.id)} className="text-xs underline text-green-700">confirmar presença</button>}
                <button onClick={() => concluir(ag.id, ag.realizado)} className="text-xs underline">{ag.realizado ? 'reabrir' : 'marcar realizado'}</button>
                <button onClick={() => exportarICS(ag)} className="p-1.5 rounded-lg hover:bg-[var(--bg-main)]" title="Exportar .ics"><Download size={16} /></button>
                <button onClick={() => excluir(ag.id)} className="p-1.5 rounded-lg hover:bg-[var(--bg-main)] text-red-600" title="Excluir"><Trash2 size={16} /></button>
              </div>
              {reagendando === ag.id && (
                <div className="w-full flex gap-2 items-center">
                  <input type="datetime-local" value={novaData} onChange={(e) => setNovaData(e.target.value)}
                    className="px-3 py-2 rounded-xl border border-[var(--border-color)] bg-[var(--bg-main)] text-sm" />
                  <button onClick={() => reagendar(ag.id)} className="px-4 py-2 rounded-xl bg-amber-600 text-white text-sm font-bold">Salvar</button>
                  <button onClick={() => setReagendando(null)} className="text-sm underline">cancelar</button>
                </div>
              )}
            </div>
          ))}
          {!itens.length && <p className="text-[var(--text-muted)] text-sm">Nenhum agendamento.</p>}
        </div>
        {aberto && (
          <form onSubmit={salvar} className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
            <div className="bg-[var(--bg-card)] rounded-2xl p-6 w-full max-w-md space-y-3">
              <h2 className="font-bold text-lg text-[var(--text-main)]">Novo agendamento</h2>
              <label className="block text-sm">Funcionário (ASO)
                <select value={form.aso_id} onChange={(e) => setForm((v) => ({ ...v, aso_id: e.target.value }))} required
                  className="mt-1 w-full px-3 py-2 rounded-xl border border-[var(--border-color)] bg-[var(--bg-main)]">
                  <option value="">Selecione…</option>
                  {asos.map((a) => <option key={a.id} value={a.id}>{a.nome_funcionario} — {a.faixa}</option>)}
                </select>
              </label>
              <label className="block text-sm">Data e hora
                <input type="datetime-local" value={form.data_hora} onChange={(e) => setForm((v) => ({ ...v, data_hora: e.target.value }))} required
                  className="mt-1 w-full px-3 py-2 rounded-xl border border-[var(--border-color)] bg-[var(--bg-main)]" />
              </label>
              <label className="block text-sm">Local do exame
                <select value={form.local_id} onChange={(e) => setForm((v) => ({ ...v, local_id: e.target.value }))}
                  className="mt-1 w-full px-3 py-2 rounded-xl border border-[var(--border-color)] bg-[var(--bg-main)]">
                  <option value="">Selecione…</option>
                  {locais.map((l) => <option key={l.id} value={l.id}>{l.nome}{l.cidade ? ` — ${l.cidade}` : ''}</option>)}
                </select>
              </label>
              <label className="block text-sm">Observações
                <input value={form.observacoes} onChange={(e) => setForm((v) => ({ ...v, observacoes: e.target.value }))}
                  className="mt-1 w-full px-3 py-2 rounded-xl border border-[var(--border-color)] bg-[var(--bg-main)]" />
              </label>
              <div className="flex gap-2 justify-end">
                <button type="button" onClick={() => setAberto(false)} className="px-4 py-2 rounded-xl border border-[var(--border-color)]">Cancelar</button>
                <button className="px-4 py-2 rounded-xl bg-amber-600 text-white font-bold">Agendar</button>
              </div>
            </div>
          </form>
        )}
      </main>
    </div>
  );
}
