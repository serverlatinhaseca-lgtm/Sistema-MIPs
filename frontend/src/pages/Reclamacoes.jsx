import { useEffect, useState } from 'react';
import axios from 'axios';
import { AlertTriangle, BarChart3, Paperclip, Plus, Trash2 } from 'lucide-react';
import Sidebar from '../components/Sidebar';
import LeitorTopbar from '../components/LeitorTopbar';

export default function Reclamacoes() {
  const api=`http://${window.location.hostname}:7001/api`;
  const user=JSON.parse(localStorage.getItem('user')||'{}');
  const perfil=user.perfil?.toLowerCase();
  const podeRegistrar=['administrador','editor','gerente'].includes(perfil)||(user.permissoes||[]).includes('reclamacoes.registrar');
  const headers={Authorization:`Bearer ${localStorage.getItem('token')}`};
  const [catalogos,setCatalogos]=useState({clientes:[],tipos:[],lideres:[]});
  const [metricas,setMetricas]=useState({total:0,por_tipo:[],por_lider:[],por_mes:[]});
  const [itens,setItens]=useState([]),[formAberto,setFormAberto]=useState(false),[salvando,setSalvando]=useState(false);
  const [form,setForm]=useState({cliente_id:'',tipo_id:'',lider_responsavel_id:'',descricao:'',anexos:[]});

  async function carregar(){
    const chamadas=[axios.get(`${api}/reclamacoes/catalogos`,{headers}),axios.get(`${api}/reclamacoes/metricas`,{headers})];
    if(podeRegistrar)chamadas.push(axios.get(`${api}/reclamacoes`,{headers}));
    const [c,m,r]=await Promise.all(chamadas);setCatalogos(c.data);setMetricas(m.data);if(r)setItens(r.data);
  }
  useEffect(()=>{carregar().catch(()=>{});},[]);
  const maxTipo=Math.max(1,...metricas.por_tipo.map(x=>x.total));
  const maxMes=Math.max(1,...metricas.por_mes.map(x=>x.total));
  const ultimoMes=metricas.por_mes.at(-1)?.total||0;
  const principal=metricas.por_tipo[0];

  async function anexar(arquivos){
    const novos=[];
    for(const arquivo of [...arquivos].slice(0,10-form.anexos.length)){
      const dados=new FormData();dados.append('image',arquivo);
      const r=await axios.post(`${api}/upload`,dados,{headers});novos.push({nome:arquivo.name,url:r.data.url,tipo:arquivo.type});
    }
    setForm(v=>({...v,anexos:[...v.anexos,...novos]}));
  }
  async function salvar(e){e.preventDefault();setSalvando(true);try{await axios.post(`${api}/reclamacoes`,form,{headers});setForm({cliente_id:'',tipo_id:'',lider_responsavel_id:'',descricao:'',anexos:[]});setFormAberto(false);await carregar();}catch(err){alert(err.response?.data?.error||'Erro ao registrar reclamação.');}finally{setSalvando(false);}}
  async function excluir(id){if(!confirm('Excluir definitivamente esta reclamação?'))return;await axios.delete(`${api}/reclamacoes/${id}`,{headers});carregar();}

  const conteudo=<main className="flex-1 p-4 sm:p-8 max-w-7xl w-full mx-auto">
    <header className="flex flex-col sm:flex-row justify-between gap-4 mb-7"><div><p className="section-label">Qualidade e atendimento</p><h1 className="text-3xl font-bold">Reclamações</h1><p className="text-[var(--text-muted)]">Registro centralizado e indicadores para acompanhamento da qualidade.</p></div>{podeRegistrar&&<button onClick={()=>setFormAberto(true)} className="bg-[var(--primary)] text-white px-5 py-3 rounded-xl font-bold flex items-center h-fit"><Plus className="mr-2"/>Nova reclamação</button>}</header>
    <section className="grid sm:grid-cols-3 gap-4 mb-5"><div className="metric-card"><AlertTriangle className="text-[var(--primary)]"/><div><span>Total registrado</span><strong>{metricas.total}</strong></div></div><div className="metric-card"><BarChart3 className="text-emerald-600"/><div><span>No último mês</span><strong>{ultimoMes}</strong></div></div><div className="metric-card"><AlertTriangle className="text-red-600"/><div><span>Tipo mais frequente</span><strong className="!text-lg">{principal?.nome||'Sem dados'}</strong></div></div></section>
    <section className="grid lg:grid-cols-2 gap-5 mb-5"><div className="panel-card"><h2 className="section-title mb-4">Reclamações por tipo</h2><div className="space-y-3">{metricas.por_tipo.map(x=><div key={x.nome}><div className="flex justify-between text-sm mb-1"><span>{x.nome}</span><strong>{x.total}</strong></div><div className="h-3 bg-[var(--bg-main)] rounded-full overflow-hidden"><div className="h-full bg-[var(--primary)] rounded-full" style={{width:`${x.total/maxTipo*100}%`}}/></div></div>)}{!metricas.por_tipo.length&&<p className="text-[var(--text-muted)]">Ainda não existem reclamações.</p>}</div></div><div className="panel-card"><h2 className="section-title mb-4">Evolução mensal</h2><div className="h-56 flex items-end gap-3 border-b border-[var(--border-color)]">{metricas.por_mes.map(x=><div key={x.mes} className="flex-1 min-w-8 text-center"><strong className="text-xs">{x.total}</strong><div className="bg-[#a65526] rounded-t-lg mx-auto min-h-1" style={{height:`${Math.max(4,x.total/maxMes*170)}px`}}/><small className="text-[10px] text-[var(--text-muted)]">{x.mes.slice(5)}/{x.mes.slice(2,4)}</small></div>)}</div></div></section>
    {podeRegistrar&&<section className="panel-card"><h2 className="section-title mb-4">Registros</h2><div className="space-y-3">{itens.map(r=><article key={r.id} className="border border-[var(--border-color)] rounded-xl p-4"><div className="flex justify-between gap-3"><div><strong>{r.cliente_nome}</strong><p className="text-sm text-[var(--primary)] font-semibold">{r.tipo_nome}</p></div>{perfil==='administrador'&&<button onClick={()=>excluir(r.id)} className="text-red-600"><Trash2 size={18}/></button>}</div><p className="mt-3 whitespace-pre-wrap">{r.descricao}</p><div className="flex flex-wrap gap-2 mt-3">{(r.anexos||[]).map((a,i)=><a key={i} href={a.url} target="_blank" rel="noreferrer" className="text-sm text-blue-700 font-semibold flex items-center"><Paperclip size={14} className="mr-1"/>{a.nome}</a>)}</div><p className="text-xs text-[var(--text-muted)] mt-3">Responsável: {r.lider_nome} · Registrado por {r.criado_por_nome||'Sistema'} em {new Date(r.criado_em).toLocaleString('pt-BR')}</p></article>)}</div></section>}
    {formAberto&&<div className="fixed inset-0 bg-black/60 z-50 grid place-items-center p-4"><form onSubmit={salvar} className="panel-card max-w-3xl w-full max-h-[92vh] overflow-auto"><div className="flex justify-between mb-5"><div><h2 className="text-2xl font-bold">Registrar reclamação</h2><p className="text-sm text-[var(--text-muted)]">Informe o ocorrido e o Líder responsável pela tratativa.</p></div><button type="button" onClick={()=>setFormAberto(false)}>Fechar</button></div><div className="grid sm:grid-cols-2 gap-4"><label className="font-semibold text-sm">Cliente<select required className="field" value={form.cliente_id} onChange={e=>setForm({...form,cliente_id:e.target.value})}><option value="">Selecione</option>{catalogos.clientes.map(x=><option key={x.id} value={x.id}>{x.nome}</option>)}</select></label><label className="font-semibold text-sm">Tipo de reclamação<select required className="field" value={form.tipo_id} onChange={e=>setForm({...form,tipo_id:e.target.value})}><option value="">Selecione</option>{catalogos.tipos.map(x=><option key={x.id} value={x.id}>{x.nome}</option>)}</select></label><label className="font-semibold text-sm sm:col-span-2">Líder responsável<select required className="field" value={form.lider_responsavel_id} onChange={e=>setForm({...form,lider_responsavel_id:e.target.value})}><option value="">Selecione</option>{catalogos.lideres.map(x=><option key={x.id} value={x.id}>{x.nome}</option>)}</select></label><label className="font-semibold text-sm sm:col-span-2">Descrição<textarea required rows="6" className="field" value={form.descricao} onChange={e=>setForm({...form,descricao:e.target.value})}/></label><label className="font-semibold text-sm sm:col-span-2">Anexos (até 10 arquivos, 10 MB cada)<input type="file" multiple className="field" onChange={e=>anexar(e.target.files)}/><div className="flex flex-wrap gap-2 mt-2">{form.anexos.map((a,i)=><span key={i} className="text-xs border border-[var(--border-color)] rounded-lg p-2">{a.nome}</span>)}</div></label></div><button disabled={salvando} className="w-full mt-5 bg-[var(--primary)] text-white p-3 rounded-xl font-bold">{salvando?'Salvando...':'Salvar reclamação'}</button></form></div>}
  </main>;
  return perfil==='leitor'?<div className="min-h-screen bg-[var(--bg-main)]"><LeitorTopbar titulo="Métricas de reclamações"/>{conteudo}</div>:<div className="min-h-screen bg-[var(--bg-main)] flex"><Sidebar/>{conteudo}</div>;
}
