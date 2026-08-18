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

function RotaPrivada({ children }) {
  const token = localStorage.getItem('token');
  return token ? children : <Navigate to="/" />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/avaliacoes/compartilhada/:token" element={<AvaliacaoCompartilhada />} />
        <Route path="/dashboard" element={<RotaPrivada><Dashboard /></RotaPrivada>} />
        <Route path="/mips" element={<RotaPrivada><ListaMIPs /></RotaPrivada>} />
        <Route path="/mips/nova" element={<RotaPrivada><CriarMIP /></RotaPrivada>} />
        <Route path="/mips/:id/editar" element={<RotaPrivada><CriarMIP /></RotaPrivada>} />
        <Route path="/mips/:id" element={<RotaPrivada><DetalheMIP /></RotaPrivada>} />
        <Route path="/usuarios" element={<RotaPrivada><Usuarios /></RotaPrivada>} />
        <Route path="/receitas" element={<RotaPrivada><Receitas /></RotaPrivada>} />
        <Route path="/avaliacoes" element={<RotaPrivada><Avaliacoes /></RotaPrivada>} />
      </Routes>
    </BrowserRouter>
  );
}
