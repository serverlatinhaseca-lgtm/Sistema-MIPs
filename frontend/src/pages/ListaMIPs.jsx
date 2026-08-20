import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Search, PlusCircle } from 'lucide-react';
import Sidebar from '../components/Sidebar';
import LeitorTopbar from '../components/LeitorTopbar';

export default function ListaMIPs() {
  const [mips, setMips] = useState([]);
  const [busca, setBusca] = useState('');
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const host = window.location.hostname;
  const isLeitor = user.perfil?.toLowerCase() === 'leitor';
  
  useEffect(() => {
    const fetchMips = async () => {
      try {
        const res = await axios.get(`http://${host}:7001/api/mips`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        });
        setMips(res.data);
      } catch (err) { console.error(err); }
    };
    fetchMips();
  }, [host]);

  const mipsFiltradas = mips.filter(m => 
    m.titulo.toLowerCase().includes(busca.toLowerCase()) || 
    m.codigo.toLowerCase().includes(busca.toLowerCase())
  );

  if (isLeitor) {
    return (
      <div className="min-h-screen bg-[var(--bg-main)] text-[var(--text-main)]">
        <LeitorTopbar titulo="Manuais e procedimentos" />
        <main className="p-4 sm:p-10 max-w-7xl mx-auto">
        <div className="mb-8 flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-3.5 text-[var(--text-muted)]" size={20} />
            <input type="text" placeholder="Pesquisar por título ou código da MIP..." className="w-full pl-12 pr-4 py-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] text-[var(--text-main)] outline-none focus:ring-2 focus:ring-[var(--primary)]" value={busca} onChange={(e) => setBusca(e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {mipsFiltradas.map((mip) => (
            <div key={mip.id} onClick={() => navigate(`/mips/${mip.id}`)} className="bg-[var(--bg-card)] border border-[var(--border-color)] p-6 rounded-2xl cursor-pointer hover:border-[var(--primary)] hover:shadow-lg transition-all flex flex-col justify-between">
              <div>
                <div className="flex justify-between items-start mb-3">
                  <span className="px-3 py-1 bg-[var(--bg-main)] border border-[var(--border-color)] text-[var(--primary)] font-mono text-xs font-bold rounded-lg">{mip.codigo}</span>
                  <span className="text-xs text-[var(--text-muted)]">v{mip.versao || 1}</span>
                </div>
                <h3 className="text-xl font-bold mb-2">{mip.titulo}</h3>
                <p className="text-[var(--text-muted)] text-sm line-clamp-2 mb-4">{mip.descricao || 'Nenhuma descrição fornecida.'}</p>
              </div>
              <div className="pt-4 border-t border-[var(--border-color)] flex justify-between items-center text-xs text-[var(--text-muted)]">
                <span>Atualizado recentemente</span>
                <span className="text-[var(--primary)] font-semibold flex items-center">Ver manual &rarr;</span>
              </div>
            </div>
          ))}
          {mipsFiltradas.length === 0 && <p className="col-span-full text-center py-12 text-[var(--text-muted)]">Nenhuma MIP encontrada.</p>}
        </div></main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--bg-main)] text-[var(--text-main)] flex">
      <Sidebar />
      <main className="flex-1 p-6 sm:p-10 max-w-7xl mx-auto">
        <header className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold">Manuais e Procedimentos (MIPs)</h1>
            <p className="text-[var(--text-muted)] text-sm">Consulte ou gerencie os manuais técnicos do sistema.</p>
          </div>
          {(user.perfil?.toLowerCase() === 'administrador' || user.perfil?.toLowerCase() === 'editor') && (
            <button onClick={() => navigate('/mips/nova')} className="flex items-center bg-[var(--primary)] text-white px-5 py-2.5 rounded-xl hover:opacity-90 font-medium transition-opacity shadow-md">
              <PlusCircle size={20} className="mr-2" /> Nova MIP
            </button>
          )}
        </header>
        <div className="mb-8 flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-3.5 text-[var(--text-muted)]" size={20} />
            <input type="text" placeholder="Pesquisar..." className="w-full pl-12 pr-4 py-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] text-[var(--text-main)] outline-none focus:ring-2 focus:ring-[var(--primary)]" value={busca} onChange={(e) => setBusca(e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {mipsFiltradas.map((mip) => (
            <div key={mip.id} onClick={() => navigate(`/mips/${mip.id}`)} className="bg-[var(--bg-card)] border border-[var(--border-color)] p-6 rounded-2xl cursor-pointer hover:border-[var(--primary)] hover:shadow-lg transition-all flex flex-col justify-between">
              <div>
                <div className="flex justify-between items-start mb-3">
                  <span className="px-3 py-1 bg-[var(--bg-main)] border border-[var(--border-color)] text-[var(--primary)] font-mono text-xs font-bold rounded-lg">{mip.codigo}</span>
                </div>
                <h3 className="text-xl font-bold mb-2">{mip.titulo}</h3>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
