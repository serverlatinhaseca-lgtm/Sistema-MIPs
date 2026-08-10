import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { UserPlus, Trash2 } from 'lucide-react';
import Sidebar from '../components/Sidebar';

export default function Usuarios() {
  const [usuarios, setUsuarios] = useState([]);
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [perfil, setPerfil] = useState('Leitor');
  const [mostrarModal, setMostrarModal] = useState(false);

  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const host = window.location.hostname;

  const carregarUsuarios = async () => {
    try {
      const res = await axios.get(`http://${host}:7001/api/usuarios`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      setUsuarios(res.data);
    } catch (err) { console.error(err); }
  };

  useEffect(() => {
    if (user.perfil !== 'Administrador') {
      navigate('/dashboard');
      return;
    }
    carregarUsuarios();
  }, []);

  const handleCriar = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`http://${host}:7001/api/usuarios`, {
        nome, email, senha, perfil
      }, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
      setMostrarModal(false);
      setNome(''); setEmail(''); setSenha(''); setPerfil('Leitor');
      carregarUsuarios();
    } catch (err) { alert('Erro ao criar usuário.'); }
  };

  const handleExcluir = async (id) => {
    if (!confirm('Deseja realmente excluir este usuário?')) return;
    try {
      await axios.delete(`http://${host}:7001/api/usuarios/${id}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      carregarUsuarios();
    } catch (err) { alert(err.response?.data?.error || 'Erro ao excluir usuário.'); }
  };

  return (
    <div className="min-h-screen bg-[var(--bg-main)] text-[var(--text-main)] flex">
      <Sidebar />

      <main className="flex-1 p-6 sm:p-10">
        <header className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold">Gerenciamento de Usuários</h1>
            <p className="text-[var(--text-muted)] text-sm">Controle de acessos e permissões do sistema.</p>
          </div>
          <button onClick={() => setMostrarModal(true)} className="flex items-center bg-[var(--primary)] text-white px-5 py-2.5 rounded-xl hover:bg-[var(--primary-hover)] font-medium transition-colors shadow-md">
            <UserPlus size={20} className="mr-2" /> Novo Usuário
          </button>
        </header>

        {mostrarModal && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
            <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl p-6 w-full max-w-md shadow-xl">
              <h3 className="text-xl font-bold mb-4">Cadastrar Novo Usuário</h3>
              <form onSubmit={handleCriar} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1 text-[var(--text-muted)]">Nome</label>
                  <input required type="text" className="w-full p-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-main)] text-[var(--text-main)] outline-none focus:ring-2 focus:ring-[var(--primary)]" value={nome} onChange={e => setNome(e.target.value)} placeholder="Nome completo" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 text-[var(--text-muted)]">Usuário de Acesso (Login)</label>
                  <input required type="text" className="w-full p-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-main)] text-[var(--text-main)] outline-none focus:ring-2 focus:ring-[var(--primary)]" value={email} onChange={e => setEmail(e.target.value)} placeholder="ex: joao.silva" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 text-[var(--text-muted)]">Senha Temporária</label>
                  <input required type="password" className="w-full p-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-main)] text-[var(--text-main)] outline-none focus:ring-2 focus:ring-[var(--primary)]" value={senha} onChange={e => setSenha(e.target.value)} placeholder="******" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 text-[var(--text-muted)]">Perfil de Permissão</label>
                  <select className="w-full p-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-main)] text-[var(--text-main)] outline-none focus:ring-2 focus:ring-[var(--primary)]" value={perfil} onChange={e => setPerfil(e.target.value)}>
                    <option value="Leitor">Leitor (Visualização e Receitas)</option>
                    <option value="Editor">Editor (Cria MIPs)</option>
                    <option value="Administrador">Administrador (Acesso Total)</option>
                  </select>
                </div>
                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={() => setMostrarModal(false)} className="flex-1 bg-[var(--bg-main)] border border-[var(--border-color)] hover:opacity-80 p-3 rounded-xl font-medium transition-opacity">Cancelar</button>
                  <button type="submit" className="flex-1 bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white p-3 rounded-xl font-medium transition-colors">Salvar</button>
                </div>
              </form>
            </div>
          </div>
        )}

        <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl shadow-sm overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[var(--border-color)] bg-[var(--bg-main)]">
                <th className="p-4 font-bold text-[var(--text-muted)] text-sm">Nome</th>
                <th className="p-4 font-bold text-[var(--text-muted)] text-sm">Login</th>
                <th className="p-4 font-bold text-[var(--text-muted)] text-sm">Perfil</th>
                <th className="p-4 font-bold text-[var(--text-muted)] text-sm text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {usuarios.map(u => (
                <tr key={u.id} className="border-b border-[var(--border-color)]/50 hover:bg-[var(--bg-main)] transition-colors">
                  <td className="p-4 font-medium">{u.nome}</td>
                  <td className="p-4 text-[var(--text-muted)]">{u.email}</td>
                  <td className="p-4">
                    <span className="px-2.5 py-1 bg-[var(--primary)]/10 text-[var(--primary)] rounded-lg text-xs font-semibold">{u.perfil}</span>
                  </td>
                  <td className="p-4 text-right">
                    <button onClick={() => handleExcluir(u.id)} className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-colors">
                      <Trash2 size={18} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
