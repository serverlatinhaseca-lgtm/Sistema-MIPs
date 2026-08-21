import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Lock, User, LogIn } from 'lucide-react';
import useBranding from '../useBranding';

export default function Login() {
  const [usuario, setUsuario] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const navigate = useNavigate();
  const branding = useBranding();

  const handleLogin = async (e) => {
    e.preventDefault();
    setErro('');

    try {
      // Aponta para a porta correta unificada do backend (7001)
      const currentHost = window.location.hostname;
      const response = await axios.post(`http://${currentHost}:7001/api/auth/login`, {
        usuario,
        senha
      });

      localStorage.setItem('token', response.data.token);
      localStorage.setItem('user', JSON.stringify(response.data.user));
      const chaveModal = `avaliacao_modal_visto_${response.data.user.id}`;
      if (['leitor','editor','gerente'].includes(response.data.user.perfil?.toLowerCase()) && localStorage.getItem(chaveModal) !== '1') sessionStorage.setItem('mostrar_avaliacoes_modal', '1');
      navigate(response.data.deve_alterar_senha ? '/alterar-senha' : (response.data.user.perfil?.toLowerCase() === 'leitor' ? '/avaliacoes' : '/dashboard'));
    } catch (err) {
      setErro(err.response?.data?.error || 'Erro ao fazer login. Verifique suas credenciais.');
    }
  };

  return (
    <div className="min-h-screen bg-[var(--bg-main)] flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-[var(--bg-card)] border border-[var(--border-color)] p-8 rounded-2xl shadow-sm">
        <div className="text-center mb-8">
          {branding.logo_site && <img src={branding.logo_site} alt={branding.nome_site} className="max-h-24 mx-auto mb-4 object-contain" />}
          <h1 className="text-3xl font-bold text-[var(--text-main)] mb-2">{branding.nome_site}</h1>
          <p className="text-[var(--text-muted)] text-sm">Faça login para acessar os manuais e receitas</p>
        </div>

        {erro && <div className="mb-6 p-4 bg-red-100 dark:bg-red-950/30 text-red-700 dark:text-red-400 rounded-xl text-sm leading-relaxed border border-red-200 dark:border-red-900">{erro}</div>}

        <form onSubmit={handleLogin} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-[var(--text-muted)] mb-1">Usuário ou E-mail</label>
            <div className="relative">
              <User className="absolute left-3 top-3.5 text-[var(--text-muted)]" size={20} />
              <input type="text" required placeholder="admin" className="w-full pl-10 pr-4 py-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-main)] text-[var(--text-main)] outline-none focus:ring-2 focus:ring-amber-600" value={usuario} onChange={(e) => setUsuario(e.target.value)} />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--text-muted)] mb-1">Senha</label>
            <div className="relative">
              <Lock className="absolute left-3 top-3.5 text-[var(--text-muted)]" size={20} />
              <input type="password" required placeholder="••••••••" className="w-full pl-10 pr-4 py-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-main)] text-[var(--text-main)] outline-none focus:ring-2 focus:ring-amber-600" value={senha} onChange={(e) => setSenha(e.target.value)} />
            </div>
          </div>

          <button type="submit" className="w-full flex items-center justify-center bg-amber-600 text-white py-3 rounded-xl hover:bg-amber-700 font-medium shadow-md transition-colors">
            <LogIn size={20} className="mr-2" /> Entrar no Sistema
          </button>
        </form>
      </div>
    </div>
  );
}
