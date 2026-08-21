import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Calculator, Printer, Plus, Trash, ArrowLeft, Save, Search, Pencil, History } from 'lucide-react';
import Sidebar from '../components/Sidebar';
import LeitorTopbar from '../components/LeitorTopbar';

export default function Receitas() {
  const [receitas, setReceitas] = useState([]);
  const [busca, setBusca] = useState('');
  const [receitaAtiva, setReceitaAtiva] = useState(null);
  const [quantidadeDesejada, setQuantidadeDesejada] = useState('');
  const [modoCriacao, setModoCriacao] = useState(false);
  const [editandoId, setEditandoId] = useState(null);
  const [versoes, setVersoes] = useState([]);
  const [mostrarVersoes, setMostrarVersoes] = useState(false);
  const [titulo, setTitulo] = useState('');
  const [rendimentoBase, setRendimentoBase] = useState('');
  const [ingredientes, setIngredientes] = useState([{ nome: '', quantidade: '' }]);
  
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const host = window.location.hostname;
  const isLeitor = user.perfil?.toLowerCase() === 'leitor';

  const carregarReceitas = async () => {
    try {
      const res = await axios.get(`http://${host}:7001/api/receitas`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      setReceitas(res.data);
    } catch (err) { console.error('Erro ao carregar receitas'); }
  };

  useEffect(() => { carregarReceitas(); }, []);

  const calcularQuantidade = (qtdBase) => {
    if (!quantidadeDesejada) return Math.round(Number(qtdBase)).toLocaleString('pt-BR');
    const porUnidade = Number(qtdBase) / Number(receitaAtiva.rendimento_base);
    const resultado = porUnidade * Number(quantidadeDesejada);
    return Math.round(resultado).toLocaleString('pt-BR');
  };

  const handleSalvar = async (e) => {
    e.preventDefault();
    try {
      await axios[editandoId ? 'put' : 'post'](`http://${host}:7001/api/receitas${editandoId ? `/${editandoId}` : ''}`, {
        titulo, rendimento_base: Number(rendimentoBase), ingredientes
      }, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
      setModoCriacao(false);
      setTitulo(''); setRendimentoBase(''); setIngredientes([{ nome: '', quantidade: '' }]); setEditandoId(null);
      carregarReceitas();
    } catch (err) { alert(err.response?.data?.error || 'Erro ao salvar receita.'); }
  };

  const iniciarEdicao = () => { setEditandoId(receitaAtiva.id); setTitulo(receitaAtiva.titulo); setRendimentoBase(String(receitaAtiva.rendimento_base)); setIngredientes(receitaAtiva.ingredientes.map(i=>({...i}))); setReceitaAtiva(null); setModoCriacao(true); };
  const abrirHistorico = async () => { try { const r=await axios.get(`http://${host}:7001/api/receitas/${receitaAtiva.id}/versoes`,{headers:{Authorization:`Bearer ${localStorage.getItem('token')}`}});setVersoes(r.data);setMostrarVersoes(true); } catch { alert('Erro ao carregar histórico.'); } };

  const handleExcluirReceita = async (id) => {
    if (!confirm('Deseja realmente excluir esta receita? Esta ação não pode ser desfeita.')) return;
    try {
      await axios.delete(`http://${host}:7001/api/receitas/${id}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      setReceitaAtiva(null);
      carregarReceitas();
    } catch (err) { alert('Erro ao excluir receita. Verifique o servidor.'); }
  };

  const addIngrediente = () => setIngredientes([...ingredientes, { nome: '', quantidade: '' }]);
  const removeIngrediente = (index) => setIngredientes(ingredientes.filter((_, i) => i !== index));
  const updateIngrediente = (index, field, value) => {
    const novos = [...ingredientes];
    novos[index][field] = value;
    setIngredientes(novos);
  };

  const receitasFiltradas = receitas.filter(r => r.titulo.toLowerCase().includes(busca.toLowerCase()));

  // ==========================================
  // LAYOUT EXCLUSIVO DO LEITOR (Sem Sidebar)
  // ==========================================
  if (isLeitor) {
    return (
      <div className="min-h-screen bg-[var(--bg-main)] text-[var(--text-main)]">
        <LeitorTopbar titulo="Calculadora de receitas" />
        <main className="p-4 sm:p-10 max-w-5xl mx-auto">

        {receitaAtiva ? (
          <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl p-6 sm:p-10 shadow-sm">
            <div className="flex justify-between items-center mb-8 print:hidden">
              <button onClick={() => { setReceitaAtiva(null); setQuantidadeDesejada(''); }} className="flex items-center text-[var(--primary)] font-semibold hover:underline">
                <ArrowLeft size={20} className="mr-2" /> Voltar às Receitas
              </button>
              <button onClick={() => window.print()} className="flex items-center bg-[var(--sidebar-bg)] text-[var(--sidebar-text)] px-5 py-2.5 rounded-xl hover:opacity-90 font-medium transition-opacity">
                <Printer size={20} className="mr-2" /> Imprimir
              </button>
            </div>

            <div className="text-center mb-10">
              <h1 className="text-3xl sm:text-4xl font-bold mb-2">{receitaAtiva.titulo}</h1>
              <p className="text-[var(--text-muted)] text-base">Receita Base calculada para <strong className="text-[var(--text-main)]">{receitaAtiva.rendimento_base}</strong> unidades</p>
            </div>

            <div className="bg-[var(--bg-main)] border border-[var(--border-color)] p-6 rounded-2xl mb-10 print:hidden flex flex-col sm:flex-row items-center justify-between gap-4">
              <div>
                <h3 className="font-bold text-[var(--text-main)] text-lg flex items-center mb-1"><Calculator size={22} className="mr-2 text-[var(--primary)]"/> Calculadora de Produção</h3>
                <p className="text-[var(--text-muted)] text-sm">Digite quantos pães deseja produzir hoje:</p>
              </div>
              <input type="number" min="1" placeholder={receitaAtiva.rendimento_base} className="w-full sm:w-36 text-center text-2xl font-bold p-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] text-[var(--text-main)] outline-none focus:ring-2 focus:ring-[var(--primary)]" value={quantidadeDesejada} onChange={(e) => setQuantidadeDesejada(e.target.value)} />
            </div>

            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b-2 border-[var(--border-color)]">
                  <th className="py-4 px-3 font-bold text-[var(--text-muted)] uppercase tracking-wider text-sm">Ingrediente</th>
                  <th className="py-4 px-3 font-bold text-[var(--text-muted)] uppercase tracking-wider text-right text-sm">Peso Calculado</th>
                </tr>
              </thead>
              <tbody>
                {receitaAtiva.ingredientes.map((ing, i) => (
                  <tr key={i} className="border-b border-[var(--border-color)] hover:bg-[var(--bg-main)] transition-colors">
                    <td className="py-4 px-3 text-base sm:text-lg font-semibold">{ing.nome}</td>
                    <td className="py-4 px-3 text-base sm:text-lg font-bold text-right text-[var(--primary)]">
                      {calcularQuantidade(ing.quantidade)} g
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div>
            <div className="mb-6 flex gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-4 top-3.5 text-[var(--text-muted)]" size={20} />
                <input type="text" placeholder="Pesquisar receita..." className="w-full pl-12 pr-4 py-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] text-[var(--text-main)] outline-none focus:ring-2 focus:ring-[var(--primary)]" value={busca} onChange={(e) => setBusca(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {receitasFiltradas.map((rec) => (
                <div key={rec.id} onClick={() => setReceitaAtiva(rec)} className="bg-[var(--bg-card)] border border-[var(--border-color)] p-6 rounded-2xl cursor-pointer hover:border-[var(--primary)] hover:shadow-lg transition-all">
                  <h3 className="text-xl font-bold mb-1">{rec.titulo}</h3>
                  <p className="text-[var(--text-muted)] text-sm">Base: {rec.rendimento_base} unidades</p>
                </div>
              ))}
              {receitasFiltradas.length === 0 && <p className="col-span-full text-center py-10 text-[var(--text-muted)]">Nenhuma receita encontrada.</p>}
            </div>
          </div>
        )}</main>
      </div>
    );
  }

  // ==========================================
  // LAYOUT ADMIN/EDITOR (Com Sidebar Unificada)
  // ==========================================
  return (
    <div className="min-h-screen bg-[var(--bg-main)] text-[var(--text-main)] flex">
      <Sidebar />

      <main className="flex-1 p-6 sm:p-10 max-w-6xl mx-auto">
        {modoCriacao ? (
          <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl p-6 shadow-sm">
            <div className="flex justify-between items-center mb-6">
              <button onClick={() => { setModoCriacao(false); setEditandoId(null); setTitulo(''); setRendimentoBase(''); setIngredientes([{ nome: '', quantidade: '' }]); }} className="flex items-center text-[var(--primary)] font-semibold">
                <ArrowLeft size={20} className="mr-2" /> Voltar
              </button>
              <h2 className="text-2xl font-bold">{editandoId ? 'Editar Receita' : 'Nova Receita Padrão'}</h2>
            </div>
            
            <form onSubmit={handleSalvar} className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1 text-[var(--text-muted)]">Nome da Receita</label>
                  <input required type="text" className="w-full p-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-main)] text-[var(--text-main)] outline-none focus:ring-2 focus:ring-[var(--primary)]" value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="Ex: Pão Doce 50g" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 text-[var(--text-muted)]">Rendimento Base (Unidades)</label>
                  <input required type="number" className="w-full p-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-main)] text-[var(--text-main)] outline-none focus:ring-2 focus:ring-[var(--primary)]" value={rendimentoBase} onChange={e => setRendimentoBase(e.target.value)} placeholder="Ex: 200" />
                </div>
              </div>

              <div>
                <h3 className="font-bold text-lg mb-3">Ingredientes e Pesos (Receita Completa)</h3>
                {ingredientes.map((ing, idx) => (
                  <div key={idx} className="flex gap-4 mb-3 items-center">
                    <input required placeholder="Ingrediente (ex: Farinha de Trigo)" className="flex-1 p-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-main)] text-[var(--text-main)] outline-none" value={ing.nome} onChange={e => updateIngrediente(idx, 'nome', e.target.value)} />
                    <input required type="number" placeholder="Peso Base (g ou ml)" className="w-40 p-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-main)] text-[var(--text-main)] outline-none" value={ing.quantidade} onChange={e => updateIngrediente(idx, 'quantidade', e.target.value)} />
                    {ingredientes.length > 1 && (
                      <button type="button" onClick={() => removeIngrediente(idx)} className="p-3 text-red-500 hover:bg-red-500/10 rounded-xl transition-colors">
                        <Trash size={20} />
                      </button>
                    )}
                  </div>
                ))}
                <button type="button" onClick={addIngrediente} className="mt-2 text-[var(--primary)] font-semibold hover:underline">+ Adicionar Ingrediente</button>
              </div>

              <button type="submit" className="w-full flex items-center justify-center bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white p-4 rounded-xl font-bold transition-colors">
                <Save size={20} className="mr-2" /> {editandoId ? 'Salvar nova versão' : 'Salvar Receita no Sistema'}
              </button>
            </form>
          </div>
        ) : receitaAtiva ? (
          <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl p-6 sm:p-10 shadow-sm print:border-none print:shadow-none">
            <div className="flex justify-between items-center mb-8 print:hidden">
              <button onClick={() => { setReceitaAtiva(null); setQuantidadeDesejada(''); }} className="flex items-center text-[var(--primary)] font-semibold">
                <ArrowLeft size={20} className="mr-2" /> Voltar às Receitas
              </button>
              
              <div className="flex gap-3">
                {['administrador','editor','gerente'].includes(user.perfil?.toLowerCase()) && (
                  <><button onClick={iniciarEdicao} className="flex items-center text-amber-700 px-4 py-2.5 rounded-xl font-medium"><Pencil size={18} className="mr-2"/>Editar</button><button onClick={abrirHistorico} className="flex items-center text-blue-700 px-4 py-2.5 rounded-xl font-medium"><History size={18} className="mr-2"/>Versões</button><button onClick={() => handleExcluirReceita(receitaAtiva.id)} className="flex items-center text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 px-4 py-2.5 rounded-xl font-medium transition-colors">
                    <Trash size={20} className="mr-2" /> Excluir Receita
                  </button></>
                )}
                <button onClick={() => window.print()} className="flex items-center bg-[var(--sidebar-bg)] text-[var(--sidebar-text)] px-5 py-2.5 rounded-xl hover:opacity-90 font-medium transition-opacity">
                  <Printer size={20} className="mr-2" /> Imprimir
                </button>
              </div>
            </div>

            <div className="text-center mb-10">
              <h1 className="text-4xl font-bold mb-2">{receitaAtiva.titulo}</h1>
              <p className="text-[var(--text-muted)] text-lg">Receita Base calculada para <strong className="text-[var(--text-main)]">{receitaAtiva.rendimento_base}</strong> unidades</p>
            </div>

            <div className="bg-[var(--bg-main)] border border-[var(--border-color)] p-6 rounded-2xl mb-10 print:hidden flex items-center justify-between">
              <div>
                <h3 className="font-bold text-[var(--text-main)] text-lg flex items-center mb-1"><Calculator size={22} className="mr-2 text-[var(--primary)]"/> Calculadora de Produção</h3>
                <p className="text-[var(--text-muted)] text-sm">Digite quantos pães deseja produzir hoje:</p>
              </div>
              <input type="number" min="1" placeholder={receitaAtiva.rendimento_base} className="w-36 text-center text-2xl font-bold p-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] text-[var(--text-main)] outline-none focus:ring-4 focus:ring-[var(--primary)]" value={quantidadeDesejada} onChange={(e) => setQuantidadeDesejada(e.target.value)} />
            </div>

            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b-2 border-[var(--border-color)]">
                  <th className="py-4 px-3 font-bold text-[var(--text-muted)] uppercase tracking-wider">Ingrediente</th>
                  <th className="py-4 px-3 font-bold text-[var(--text-muted)] uppercase tracking-wider text-right">Peso Calculado</th>
                </tr>
              </thead>
              <tbody>
                {receitaAtiva.ingredientes.map((ing, i) => (
                  <tr key={i} className="border-b border-[var(--border-color)] hover:bg-[var(--bg-main)] transition-colors">
                    <td className="py-4 px-3 text-lg font-semibold">{ing.nome}</td>
                    <td className="py-4 px-3 text-lg font-bold text-right text-[var(--primary)]">
                      {calcularQuantidade(ing.quantidade)} g
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div>
            <div className="flex justify-between items-center mb-8">
              <h1 className="text-3xl font-bold">Calculadora de Receitas</h1>
              {['administrador','editor','gerente'].includes(user.perfil?.toLowerCase()) && (
                <button onClick={() => setModoCriacao(true)} className="flex items-center bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white px-5 py-2.5 rounded-xl font-medium transition-colors">
                  <Plus size={20} className="mr-2" /> Nova Receita
                </button>
              )}
            </div>

            <div className="mb-6 flex gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-4 top-3.5 text-[var(--text-muted)]" size={20} />
                <input type="text" placeholder="Pesquisar por nome da receita..." className="w-full pl-12 pr-4 py-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] text-[var(--text-main)] outline-none focus:ring-2 focus:ring-[var(--primary)]" value={busca} onChange={(e) => setBusca(e.target.value)} />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {receitasFiltradas.map((rec) => (
                <div key={rec.id} onClick={() => setReceitaAtiva(rec)} className="bg-[var(--bg-card)] border border-[var(--border-color)] p-6 rounded-2xl cursor-pointer hover:border-[var(--primary)] hover:shadow-lg transition-all group">
                  <div className="w-12 h-12 bg-[var(--bg-main)] rounded-xl flex items-center justify-center text-[var(--primary)] mb-4 group-hover:scale-110 transition-transform">
                    <Calculator size={24} />
                  </div>
                  <h3 className="text-xl font-bold mb-1">{rec.titulo}</h3>
                  <p className="text-[var(--text-muted)] text-sm">{rec.ingredientes.length} ingredientes (Base: {rec.rendimento_base} un)</p>
                </div>
              ))}
              {receitasFiltradas.length === 0 && <p className="col-span-full text-center py-10 text-[var(--text-muted)]">Nenhuma receita encontrada.</p>}
            </div>
          </div>
        )}
      </main>
      {mostrarVersoes && <div className="fixed inset-0 bg-black/60 z-50 grid place-items-center p-4"><div className="bg-[var(--bg-card)] rounded-2xl p-6 max-w-3xl w-full max-h-[85vh] overflow-auto"><div className="flex justify-between mb-4"><div><h2 className="text-xl font-bold">Histórico da receita</h2><p className="text-sm text-[var(--text-muted)]">Alterações de rendimento e ingredientes por versão.</p></div><button onClick={()=>setMostrarVersoes(false)}>Fechar</button></div>{versoes.map(v=><article key={v.id} className="border-t border-[var(--border-color)] py-5"><div className="flex justify-between"><strong>Alteração da versão {v.numero_versao}</strong><span className="text-xs text-[var(--text-muted)]">{new Date(v.criado_em).toLocaleString('pt-BR')}</span></div><p className="text-sm text-[var(--text-muted)] mb-3">Alterado por {v.alterado_por_nome||'Sistema'}</p><div className="space-y-2">{(v.alteracoes||[]).map((a,i)=><div key={`${a.campo}-${i}`} className="bg-[var(--bg-main)] rounded-xl p-3 text-sm"><strong className="text-[var(--primary)]">{a.campo}</strong><div className="grid sm:grid-cols-2 gap-2 mt-1"><p><span className="text-xs text-[var(--text-muted)] block">Antes</span>{a.de}</p><p><span className="text-xs text-[var(--text-muted)] block">Depois</span>{a.para}</p></div></div>)}{!(v.alteracoes||[]).length&&<p className="text-sm text-[var(--text-muted)]">Nenhuma diferença identificada.</p>}</div></article>)}{!versoes.length&&<p>Nenhuma alteração registrada.</p>}</div></div>}
    </div>
  );
}
