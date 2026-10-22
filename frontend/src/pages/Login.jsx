import { useEffect, useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import axios from 'axios';
import { Lock, User, LogIn, BookOpen, ChefHat, ClipboardCheck, MessageCircle } from 'lucide-react';
import useBranding from '../useBranding';
import API from '../api';

import { obterSessao } from '../auth';

const recursos = [
  { icone: BookOpen, titulo: 'MIPs e manuais', texto: 'Procedimentos sempre atualizados.' },
  { icone: ChefHat, titulo: 'Receitas', texto: 'Fichas técnicas da produção.' },
  { icone: ClipboardCheck, titulo: 'Avaliações', texto: 'Desempenho da equipe.' },
  { icone: MessageCircle, titulo: 'Reclamações', texto: 'Acompanhamento de clientes.' },
];

export default function Login() {
  const [usuario, setUsuario] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [fotoOk, setFotoOk] = useState(true);
  const navigate = useNavigate();
  const branding = useBranding();
  const fotoLogin = branding.imagem_login && fotoOk ? branding.imagem_login : '';
  // Pré-carrega a foto: se falhar, volta sozinho para o painel padrão com texto.
  useEffect(() => {
    if (!branding.imagem_login) return;
    setFotoOk(true);
    const teste = new Image();
    teste.onload = () => setFotoOk(true);
    teste.onerror = () => setFotoOk(false);
    teste.src = branding.imagem_login;
  }, [branding.imagem_login]);

  // Se já existe sessão válida (token não expirado), não exibe o login.
  const sessaoAtiva = obterSessao();
  if (sessaoAtiva) {
    return <Navigate to={sessaoAtiva.user?.deve_alterar_senha ? '/alterar-senha' : '/dashboard'} replace />;
  }

  const handleLogin = async (e) => {
    e.preventDefault();
    setErro('');

    try {
      const response = await axios.post(`${API}/api/auth/login`, {
        usuario,
        senha
      });

      localStorage.setItem('token', response.data.token);
      localStorage.setItem('user', JSON.stringify(response.data.user));
      const chaveModal = `avaliacao_modal_visto_${response.data.user.id}`;
      if (['leitor','editor','gerente'].includes(response.data.user.perfil?.toLowerCase()) && localStorage.getItem(chaveModal) !== '1') sessionStorage.setItem('mostrar_avaliacoes_modal', '1');
      navigate(response.data.deve_alterar_senha ? '/alterar-senha' : '/dashboard');
    } catch (err) {
      setErro(err.response?.data?.error || 'Erro ao fazer login. Verifique suas credenciais.');
    }
  };

  return (
    <div className="min-h-screen bg-[var(--bg-main)] flex">
      <div className="w-full lg:max-w-[520px] shrink-0 flex items-center justify-center p-6 sm:p-12 bg-[var(--bg-card)]">
        <div className="w-full max-w-sm">
          <div className="mb-8">
            {branding.logo_site
              ? <img src={branding.logo_site} alt={branding.nome_site} className="max-h-60 sm:max-h-72 w-auto max-w-full object-contain" />
              : <h1 className="text-3xl font-bold text-[var(--text-main)]">{branding.nome_site}</h1>}
          </div>

          <h2 className="text-xl font-bold text-[var(--text-main)]">Acesse sua conta</h2>
          <p className="text-[var(--text-muted)] text-sm mt-1 mb-6">Informe seus dados para entrar no portal</p>

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

      <div className={`hidden lg:flex flex-1 relative overflow-hidden ${fotoLogin ? 'bg-stone-950' : 'bg-gradient-to-br from-amber-700 via-amber-800 to-stone-950 text-white'}`}>
        {fotoLogin
          ? <div aria-hidden="true" style={{ position: 'absolute', inset: 0, backgroundImage: `url("${fotoLogin}")`, backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat', backgroundColor: '#0c0a09' }} />
          : <><div className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-white/10" />
        <div className="absolute -bottom-32 -left-16 w-[28rem] h-[28rem] rounded-full bg-black/20" />
        <div className="relative m-auto max-w-xl px-12 py-16">
          <p className="uppercase tracking-widest text-amber-200 text-sm font-bold mb-4">Portal - Nova Esperança</p>
          <h1 className="text-4xl xl:text-5xl font-bold leading-tight mb-4">Tudo da padaria em um só lugar</h1>
          <p className="text-amber-100/90 mb-8">Manuais, receitas, avaliações e reclamações organizados para a equipe.</p>
          <ul className="space-y-4">
            {recursos.map(({ icone: Icone, titulo, texto }) => (
              <li key={titulo} className="flex items-center gap-4">
                <span className="w-11 h-11 shrink-0 rounded-xl bg-white/15 grid place-items-center"><Icone size={22} /></span>
                <span><strong className="block">{titulo}</strong><small className="text-amber-100/80">{texto}</small></span>
              </li>
            ))}
          </ul>
        </div></>}
      </div>
    </div>
  );
}
