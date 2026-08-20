import { Navigate, useLocation } from 'react-router-dom';
import Sidebar from '../components/Sidebar';

const FERRAMENTAS = {
  '/ferramentas/etiquetas': { titulo: 'Gerador de Etiquetas', arquivo: '/admin-tools/etiquetas.html' },
  '/ferramentas/caixas': { titulo: 'Calculadora de Pacotes e Caixas', arquivo: '/admin-tools/caixas.html' }
};

export default function FerramentasAdmin() {
  const location = useLocation();
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const ferramenta = FERRAMENTAS[location.pathname];

  if (String(user.perfil || '').toLowerCase() !== 'administrador') return <Navigate to="/mips" replace />;
  if (!ferramenta) return <Navigate to="/dashboard" replace />;

  return (
    <div className="flex min-h-screen bg-[var(--background)]">
      <Sidebar />
      <main className="flex-1 min-w-0 p-4 md:p-6">
        <div className="mb-4">
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">{ferramenta.titulo}</h1>
          <p className="text-sm text-[var(--text-secondary)]">Dados compartilhados e protegidos no banco do portal.</p>
        </div>
        <iframe
          title={ferramenta.titulo}
          src={ferramenta.arquivo}
          className="w-full rounded-2xl border border-[var(--border-color)] bg-white shadow-sm"
          style={{ height: 'calc(100vh - 120px)', minHeight: 720 }}
        />
      </main>
    </div>
  );
}
