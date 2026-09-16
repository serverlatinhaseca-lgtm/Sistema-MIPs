import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import ListaMIPs from './pages/ListaMIPs';
import CriarMIP from './pages/CriarMIP';
import DetalheMIP from './pages/DetalheMIP';
import Usuarios from './pages/Usuarios';
import Receitas from './pages/Receitas';
import Avaliacoes from './pages/Avaliacoes';
import AvaliacaoCompartilhada from './pages/AvaliacaoCompartilhada';
import AlterarSenha from './pages/AlterarSenha';
import Configuracoes from './pages/Configuracoes';
import MeuDesempenho from './pages/MeuDesempenho';
import AvaliacaoLoginModal from './components/AvaliacaoLoginModal';
import FerramentasAdmin from './pages/FerramentasAdmin';
import Reclamacoes from './pages/Reclamacoes';
import MipNotifications from './components/MipNotifications';
import InstallPrompt from './components/InstallPrompt';
import MobileNav from './components/MobileNav';

import { obterSessao } from './auth';

function RotaPrivada({ children, perfisPermitidos }) {
  const sessao = obterSessao();
  if (!sessao) return <Navigate to="/" replace />;
  const perfil = String(sessao.perfil || '').toLowerCase();
  if (perfisPermitidos && !perfisPermitidos.map((p) => String(p).toLowerCase()).includes(perfil)) {
    return <Navigate to="/dashboard" replace />;
  }
  const user = sessao.user || {};
  if (user.deve_alterar_senha && window.location.pathname !== '/alterar-senha') return <Navigate to="/alterar-senha" replace />;
  return <><AvaliacaoLoginModal /><MipNotifications />{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <InstallPrompt />
      <MobileNav />
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/avaliacoes/compartilhada/:token" element={<AvaliacaoCompartilhada />} />
        <Route path="/dashboard" element={<RotaPrivada><Dashboard /></RotaPrivada>} />
        <Route path="/mips" element={<RotaPrivada><ListaMIPs /></RotaPrivada>} />
        <Route path="/mips/nova" element={<RotaPrivada><CriarMIP /></RotaPrivada>} />
        <Route path="/mips/:id/editar" element={<RotaPrivada><CriarMIP /></RotaPrivada>} />
        <Route path="/mips/:id" element={<RotaPrivada><DetalheMIP /></RotaPrivada>} />
        <Route path="/usuarios" element={<RotaPrivada perfisPermitidos={['administrador']}><Usuarios /></RotaPrivada>} />
        <Route path="/receitas" element={<RotaPrivada><Receitas /></RotaPrivada>} />
        <Route path="/avaliacoes" element={<RotaPrivada><Avaliacoes /></RotaPrivada>} />
        <Route path="/alterar-senha" element={<RotaPrivada><AlterarSenha /></RotaPrivada>} />
        <Route path="/configuracoes" element={<RotaPrivada perfisPermitidos={['administrador']}><Configuracoes /></RotaPrivada>} />
        <Route path="/meu-desempenho" element={<RotaPrivada><MeuDesempenho /></RotaPrivada>} />
        <Route path="/reclamacoes" element={<RotaPrivada><Reclamacoes /></RotaPrivada>} />
        <Route path="/ferramentas/etiquetas" element={<RotaPrivada perfisPermitidos={['administrador']}><FerramentasAdmin /></RotaPrivada>} />
        <Route path="/ferramentas/caixas" element={<RotaPrivada perfisPermitidos={['administrador']}><FerramentasAdmin /></RotaPrivada>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
