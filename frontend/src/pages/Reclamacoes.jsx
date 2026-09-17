import { useEffect, useState } from 'react';
import axios from 'axios';
import { BarChart3, CheckCircle2, Clock3, Download, Image, Paperclip, Pencil, Plus, RotateCcw, Trash2, X } from 'lucide-react';
import Sidebar from '../components/Sidebar';
import LeitorTopbar from '../components/LeitorTopbar';
import API from '../api';

const cores={verde:{nome:'Não urgente',cor:'#15803d',fundo:'#dcfce7'},amarelo:{nome:'Média',cor:'#a16207',fundo:'#fef9c3'},vermelho:{nome:'Imediata',cor:'#b91c1c',fundo:'#fee2e2'}};
const ehImagem=a=>String(a.tipo||'').startsWith('image/')||/\.(png|jpe?g|gif|webp)$/i.test(a.url||'');
const formatarPrazo=min=>min>=60&&min%60===0?`${min/60} hora${min/60===1?'':'s'}`:`${min} minutos`;
const restante=(fim,agora)=>{const ms=new Date(fim)-agora,atrasado=ms<0,total=Math.abs(ms),h=Math.floor(total/3600000),m=Math.floor((total%3600000)/60000);return{atrasado,texto:`${h}h ${String(m).padStart(2,'0')}min`};};

export default function Reclamacoes(){
  const api=`${API}/api`,user=JSON.parse(localStorage.getItem('user')||'{}'),perfil=user.perfil?.toLowerCase(),headers={Authorization:`Bearer ${localStorage.getItem('token')}`};
  const podeRegistrar=['administrador','editor','gerente'].includes(perfil)||(user.permissoes||[]).includes('reclamacoes.registrar');
  const [catalogos,setCatalogos]=useState({clientes:[],tipos:[],lideres:[],setores:[],prazos:{prazo_verde_min:1440,prazo_amarelo_min:180,prazo_vermelho_min:60}}),[metricas,setMetricas]=useState({por_tipo:[],por_lider:[],por_setor:[],por_mes:[],por_cliente:[],por_prioridade:[]});
  const [itens,setItens]=useState([]),[formAberto,setFormAberto]=useState(false),[editandoId,setEditandoId]=useState(null),[salvando,setSalvando]=useState(false),[foto,setFoto]=useState(null),[agora,setAgora]=useState(new Date()),[filtro,setFiltro]=useState('todos');
  const filtrosVazios=()=>({mes:'',setor:'',lider_id:'',tipo_id:'',cliente_id:''});
  const [filtros,setFiltros]=useState(filtrosVazios);
  const [form,setForm]=useState({cliente_id:'',cliente_busca:'',tipo_id:'',tipo_busca:'',lider_responsavel_id:'',setor_id:'',descricao:'',anexos:[],prioridade:'verde'});
  function queryFiltros(f){
    const p=new URLSearchParams();
    if(f.mes)p.set('mes',f.mes);
    if(f.setor.trim())p.set('setor',f.setor.trim());
    if(f.lider_id)p.set('lider_id',f.lider_id);
    if(f.tipo_id)p.set('tipo_id',f.tipo_id);
    if(f.cliente_id)p.set('cliente_id',f.cliente_id);
    const s=p.toString();
    return s?`?${s}`:'';
  }
  async function carregar(f){
    const q=queryFiltros(f||filtros);
    const chamadas=[axios.get(`${api}/reclamacoes/catalogos`,{headers}),axios.get(`${api}/reclamacoes/metricas${q}`,{headers})];
    if(podeRegistrar)chamadas.push(axios.get(`${api}/reclamacoes${q}`,{headers}));
    const[c,m,r]=await Promise.all(chamadas);
    setCatalogos({clientes:c.data.clientes||[],tipos:c.data.tipos||[],lideres:c.data.lideres||[],setores:c.data.setores||[],prazos:c.data.prazos||{}});
    setMetricas(m.data);
    if(r)setItens(r.data);
  }
  useEffect(()=>{const t=setTimeout(()=>{carregar(filtros).catch(()=>{});},filtros.setor?400:0);return()=>clearTimeout(t);},[filtros.mes,filtros.setor,filtros.lider_id,filtros.tipo_id,filtros.cliente_id]);
  useEffect(()=>{const i=setInterval(()=>setAgora(new Date()),30000);return()=>clearInterval(i);},[]);
  async function anexar(arquivos){const novos=[];for(const arquivo of [...arquivos].slice(0,10-form.anexos.length)){const dados=new FormData();dados.append('image',arquivo);const r=await axios.post(`${api}/upload`,dados,{headers});novos.push({nome:arquivo.name,url:r.data.url,tipo:arquivo.type});}setForm(v=>({...v,anexos:[...v.anexos,...novos]}));}
  function formVazio(){return {cliente_id:'',cliente_busca:'',tipo_id:'',tipo_busca:'',lider_responsavel_id:'',setor_id:'',descricao:'',anexos:[],prioridade:'verde'};}
  async function salvar(e){e.preventDefault();setSalvando(true);try{if(editandoId)await axios.put(`${api}/reclamacoes/${editandoId}`,form,{headers});else await axios.post(`${api}/reclamacoes`,form,{headers});setForm(formVazio());setEditandoId(null);setFormAberto(false);await carregar(filtros);}catch(err){alert(err.response?.data?.error||'Erro ao salvar reclamação.');}finally{setSalvando(false);}}
  async function mudarStatus(id,status){try{await axios.post(`${api}/reclamacoes/${id}/${status==='concluido'?'concluir':'reabrir'}`,{},{headers});setItens(v=>v.map(x=>x.id===id?{...x,status,concluido_em:status==='concluido'?new Date().toISOString():null}:x));await carregar(filtros);}catch(err){alert(err.response?.data?.error||'Não foi possível alterar a reclamação.');}}
  function editar(r){setEditandoId(r.id);setForm({cliente_id:String(r.cliente_id),cliente_busca:r.cliente_nome||'',tipo_id:String(r.tipo_id),tipo_busca:r.tipo_nome||'',lider_responsavel_id:String(r.lider_responsavel_id),setor_id:r.setor_id?String(r.setor_id):'',descricao:r.descricao||'',anexos:Array.isArray(r.anexos)?r.anexos:[],prioridade:r.prioridade||'verde'});setFormAberto(true);}
  async function excluir(id){if(confirm('Excluir definitivamente esta reclamação?')){await axios.delete(`${api}/reclamacoes/${id}`,{headers});carregar(filtros);}}
  function exportarPDF(){
    const esc=s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    const periodo=filtros.mes?filtros.mes.split('-').reverse().join('/'):'Todos os meses';
    const nomeDe=(lista,id)=>lista.find(x=>String(x.id)===String(id))?.nome||'';
    const partesFiltro=[];
    if(filtros.mes)partesFiltro.push(`Mês: ${periodo}`);
    if(filtros.setor.trim())partesFiltro.push(`Setor contém: "${filtros.setor.trim()}"`);
    if(filtros.lider_id)partesFiltro.push(`Líder: ${nomeDe(catalogos.lideres,filtros.lider_id)}`);
    if(filtros.tipo_id)partesFiltro.push(`Tipo: ${nomeDe(catalogos.tipos,filtros.tipo_id)}`);
    if(filtros.cliente_id)partesFiltro.push(`Cliente: ${nomeDe(catalogos.clientes,filtros.cliente_id)}`);
    const total=Number(metricas.total||0),concl=Number(metricas.concluidas||0);
    const taxa=total?Math.round(concl/total*100):0;
    const maxBar=d=>Math.max(1,...(d||[]).map(x=>x.total));
    const svgBarras=(dados,corFn)=>{
      const lista=(dados||[]).slice(0,12),m=maxBar(lista),H=Math.max(40,lista.length*30);
      const linhas=lista.map((x,i)=>{
        const y=8+i*30,w=Math.max(2,Math.round(x.total/m*430));
        return `<text x="0" y="${y+11}" font-size="11" fill="#444">${esc(String(x.nome).slice(0,32))}</text><rect x="150" y="${y}" width="${w}" height="16" rx="4" fill="${corFn(x)}"/><text x="${156+w}" y="${y+12}" font-size="11" font-weight="bold" fill="#222">${x.total}</text>`;
      }).join('');
      return `<svg width="620" height="${H}" xmlns="http://www.w3.org/2000/svg">${linhas||'<text x="0" y="20" font-size="12" fill="#888">Sem dados.</text>'}</svg>`;
    };
    const svgMeses=()=>{
      const lista=(metricas.por_mes||[]).slice(-12),m=maxBar(lista),W=620,bw=Math.min(46,Math.floor((W-20)/Math.max(1,lista.length))-8);
      const cols=lista.map((x,i)=>{
        const h=Math.max(4,Math.round(x.total/m*150)),x0=10+i*(bw+8);
        return `<text x="${x0+bw/2}" y="${170-h-6}" font-size="10" font-weight="bold" text-anchor="middle" fill="#222">${x.total}</text><rect x="${x0}" y="${170-h}" width="${bw}" height="${h}" rx="3" fill="#a65526"/><text x="${x0+bw/2}" y="186" font-size="9" text-anchor="middle" fill="#666">${esc(x.mes.slice(5))}/${esc(x.mes.slice(2,4))}</text>`;
      }).join('');
      return `<svg width="620" height="195" xmlns="http://www.w3.org/2000/svg"><line x1="0" y1="170" x2="620" y2="170" stroke="#ccc"/>${cols||'<text x="0" y="20" font-size="12" fill="#888">Sem dados.</text>'}</svg>`;
    };
    const blocoGraf=(titulo,svg)=>`<div class="graf"><h2>${titulo}</h2>${svg}</div>`;
    const tabela=(titulo,lista,mapNome)=>`<div class="bloco"><h2>${titulo}</h2><table><thead><tr><th>Item</th><th class="num">Qtd</th><th class="num">%</th></tr></thead><tbody>${(lista||[]).map(x=>{const p=total?Math.round(x.total/total*100):0;return `<tr><td>${esc(mapNome?mapNome(x):x.nome)}</td><td class="num"><strong>${x.total}</strong></td><td class="num">${p}%</td></tr>`;}).join('')||'<tr><td colspan="3">Sem dados.</td></tr>'}</tbody></table></div>`;
    const nomePri=x=>(cores[x.nome]?.nome||x.nome);
    const corPri=x=>(cores[x.nome]?.cor||'#a65526');
    const linhasDetalhe=(podeRegistrar?itens:[]).map((r,i)=>{
      const aberta=r.status==='aberto',atrasada=aberta&&r.prazo_em&&new Date(r.prazo_em)<new Date();
      return `<tr class="${atrasada?'atrasada':''}"><td>${i+1}</td><td>${esc(new Date(r.criado_em).toLocaleDateString('pt-BR'))}</td><td>${esc(r.cliente_nome||'')}</td><td>${esc(r.tipo_nome||'')}</td><td>${esc(r.setor_nome||'—')}</td><td>${esc(r.lider_nome||'')}</td><td>${esc(nomePri({nome:r.prioridade}))}</td><td>${aberta?(atrasada?'Em aberto (atrasada)':'Em aberto'):'Concluída'}</td></tr>`;
    }).join('');
    const html=`<html><head><meta charset="utf-8"><title>Relatório de reclamações — ${esc(periodo)}</title><style>
      body{font-family:Arial,sans-serif;padding:28px 32px;color:#222;font-size:13px}
      h1{font-size:22px;margin:0 0 4px}h2{font-size:15px;margin:0 0 8px;color:#7c3f12}
      .sub{color:#666;margin:0 0 12px}.kpis{display:flex;gap:10px;flex-wrap:wrap;margin:14px 0}
      .kpi{border:1px solid #ddd;border-left:5px solid #a65526;border-radius:8px;padding:8px 14px;min-width:120px}
      .kpi small{color:#666;text-transform:uppercase;font-size:10px}.kpi strong{font-size:22px;display:block}
      .kpi.verde{border-left-color:#15803d}.kpi.amarelo{border-left-color:#d97706}.kpi.vermelho{border-left-color:#b91c1c}.kpi.azul{border-left-color:#2563eb}
      .graf,.bloco{margin:18px 0;page-break-inside:avoid}
      table{width:100%;border-collapse:collapse;margin-bottom:10px}
      th{background:#f5f0e8;text-align:left;padding:6px;font-size:12px}td{border-bottom:1px solid #e5e5e5;padding:5px 6px;font-size:12px}
      .num{text-align:right}.atrasada td{background:#fef2f2}.rodape{font-size:11px;color:#888;margin-top:16px}
      @media print{.graf,.bloco{page-break-inside:avoid}}
    </style></head><body>
    <h1>Relatório de reclamações</h1>
    <p class="sub">Período: <strong>${esc(periodo)}</strong>${partesFiltro.length?` · Filtros: ${esc(partesFiltro.join(' · '))}`:' · Sem filtros (base completa)'}</p>
    <div class="kpis">
      <div class="kpi"><small>Total</small><strong>${total}</strong></div>
      <div class="kpi amarelo"><small>Em aberto</small><strong>${metricas.abertas||0}</strong></div>
      <div class="kpi vermelho"><small>Atrasadas</small><strong>${metricas.atrasadas||0}</strong></div>
      <div class="kpi verde"><small>Concluídas</small><strong>${concl}</strong></div>
      <div class="kpi azul"><small>Taxa de conclusão</small><strong>${taxa}%</strong></div>
      <div class="kpi"><small>Tempo médio</small><strong>${metricas.media_horas||0}h</strong></div>
    </div>
    ${blocoGraf('Reclamações por setor',svgBarras(metricas.por_setor,()=>'#b45309'))}
    ${blocoGraf('Por líder responsável',svgBarras(metricas.por_lider,()=>'#1d4ed8'))}
    ${blocoGraf('Por tipo de reclamação',svgBarras(metricas.por_tipo,()=>'#0f766e'))}
    ${blocoGraf('Por cliente',svgBarras(metricas.por_cliente,()=>'#6d28d9'))}
    ${blocoGraf('Por prioridade',svgBarras(metricas.por_prioridade.map(x=>({nome:nomePri(x),total:x.total,cor:corPri(x)})),x=>x.cor||'#a65526'))}
    ${blocoGraf('Evolução mensal (últimos 12 meses)',svgMeses())}
    ${tabela('Detalhamento por setor',metricas.por_setor)}
    ${tabela('Detalhamento por líder',metricas.por_lider)}
    ${tabela('Detalhamento por tipo',metricas.por_tipo)}
    ${tabela('Detalhamento por cliente',metricas.por_cliente)}
    ${podeRegistrar?`<div class="bloco"><h2>Reclamações do período (${(itens||[]).length})</h2><table><thead><tr><th>#</th><th>Data</th><th>Cliente</th><th>Tipo</th><th>Setor</th><th>Líder</th><th>Prioridade</th><th>Status</th></tr></thead><tbody>${linhasDetalhe||'<tr><td colspan="8">Nenhuma reclamação neste filtro.</td></tr>'}</tbody></table></div>`:''}
    <p class="rodape">Gerado em ${esc(new Date().toLocaleString('pt-BR'))} por ${esc(user.nome||'')} · Sistema MIPs — Nova Esperança</p>
    <script>window.onload=()=>window.print()</script></body></html>`;
    const w=window.open('','_blank','width=1000,height=800');
    if(!w){alert('Permita pop-ups para exportar o PDF.');return;}
    w.document.write(html);
    w.document.close();
  }
  const maior=lista=>Math.max(1,...lista.map(x=>x.total)),visiveis=itens.filter(x=>filtro==='todos'||x.status===filtro);
  const Barras=({dados,prioridade=false})=><div className="space-y-3">{dados.map(x=><div key={x.nome}><div className="flex justify-between gap-3 text-sm mb-1"><span className="truncate">{cores[x.nome]?.nome||x.nome}</span><strong>{x.total}</strong></div><div className="h-3 bg-[var(--bg-main)] rounded-full overflow-hidden"><div className="h-full rounded-full" style={{width:`${x.total/maior(dados)*100}%`,background:prioridade?(cores[x.nome]?.cor||'#a65526'):'#d97706'}}/></div></div>)}{!dados.length&&<p className="text-[var(--text-muted)]">Sem dados.</p>}</div>;
  const conteudo=<main className="flex-1 p-4 sm:p-8 max-w-[1500px] w-full mx-auto">
    <header className="flex flex-col sm:flex-row justify-between gap-4 mb-7">
      <div><p className="section-label">Qualidade e atendimento</p><h1 className="text-3xl font-bold">Reclamações</h1><p className="text-[var(--text-muted)]">Prazos, ocorrências e indicadores de atendimento.</p></div>
      <div className="flex flex-wrap gap-2 items-start">
        {podeRegistrar&&<button onClick={exportarPDF} className="border border-[var(--border-color)] bg-[var(--bg-card)] px-5 py-3 rounded-xl font-bold flex items-center h-fit"><Download size={18} className="mr-2"/>Exportar PDF</button>}
        {podeRegistrar&&<button onClick={()=>{setEditandoId(null);setForm(formVazio());setFormAberto(true);}} className="bg-[var(--primary)] text-white px-5 py-3 rounded-xl font-bold flex items-center h-fit"><Plus className="mr-2"/>Nova reclamação</button>}
      </div>
    </header>
    {podeRegistrar&&<section className="panel-card mb-5">
      <h2 className="section-title mb-3">Filtros (valem para métricas, lista e PDF)</h2>
      <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <label className="font-semibold text-sm">Mês<input type="month" className="field" value={filtros.mes} onChange={e=>setFiltros(v=>({...v,mes:e.target.value}))}/></label>
        <label className="font-semibold text-sm">Setor (busca parcial)<input list="filtro-setores" className="field" placeholder="Ex.: embalagem" value={filtros.setor} onChange={e=>setFiltros(v=>({...v,setor:e.target.value}))}/><datalist id="filtro-setores">{(catalogos.setores||[]).map(x=><option key={x.id} value={x.nome}/>)}</datalist></label>
        <label className="font-semibold text-sm">Líder<select className="field" value={filtros.lider_id} onChange={e=>setFiltros(v=>({...v,lider_id:e.target.value}))}><option value="">Todos</option>{(catalogos.lideres||[]).map(x=><option key={x.id} value={x.id}>{x.nome}</option>)}</select></label>
        <label className="font-semibold text-sm">Tipo<select className="field" value={filtros.tipo_id} onChange={e=>setFiltros(v=>({...v,tipo_id:e.target.value}))}><option value="">Todos</option>{(catalogos.tipos||[]).map(x=><option key={x.id} value={x.id}>{x.nome}</option>)}</select></label>
        <label className="font-semibold text-sm">Cliente<select className="field" value={filtros.cliente_id} onChange={e=>setFiltros(v=>({...v,cliente_id:e.target.value}))}><option value="">Todos</option>{(catalogos.clientes||[]).map(x=><option key={x.id} value={x.id}>{x.nome}</option>)}</select></label>
      </div>
      <div className="flex flex-wrap items-center gap-3 mt-3">
        <button onClick={()=>setFiltros(filtrosVazios())} className="px-4 py-2 rounded-xl bg-[var(--bg-main)] font-bold text-sm">Limpar filtros</button>
        <p className="text-sm text-[var(--text-muted)]">{filtros.mes||filtros.setor.trim()||filtros.lider_id||filtros.tipo_id||filtros.cliente_id?<>Exibindo <strong>{metricas.total||0}</strong> reclamação(ões) no filtro atual.</>:'Sem filtros — base completa.'}</p>
      </div>
    </section>}
    <section className="grid sm:grid-cols-2 xl:grid-cols-5 gap-4 mb-5"><Metrica titulo="Total" valor={metricas.total||0}/><Metrica titulo="Em aberto" valor={metricas.abertas||0} cor="text-amber-600"/><Metrica titulo="Atrasadas" valor={metricas.atrasadas||0} cor="text-red-600"/><Metrica titulo="Concluídas" valor={metricas.concluidas||0} cor="text-emerald-600"/><Metrica titulo="Tempo médio" valor={`${metricas.media_horas||0}h`} cor="text-blue-600"/></section>
    <section className="grid lg:grid-cols-2 xl:grid-cols-3 gap-5 mb-5">
      <Grafico titulo="Por setor"><Barras dados={metricas.por_setor||[]}/></Grafico>
      <Grafico titulo="Por líder responsável"><Barras dados={metricas.por_lider||[]}/></Grafico>
      <Grafico titulo="Tipos de reclamação"><Barras dados={metricas.por_tipo||[]}/></Grafico>
      <Grafico titulo="Clientes com mais reclamações"><Barras dados={metricas.por_cliente||[]}/></Grafico>
      <Grafico titulo="Por prioridade"><Barras dados={metricas.por_prioridade||[]} prioridade/></Grafico>
      <Grafico titulo="Evolução mensal" classe="xl:col-span-2"><div className="h-56 flex items-end gap-3 border-b border-[var(--border-color)] overflow-x-auto">{(metricas.por_mes||[]).map(x=><div key={x.mes} className="flex-1 min-w-12 text-center"><strong className="text-xs">{x.total}</strong><div className="bg-[#a65526] rounded-t-lg mx-auto min-h-1" style={{height:`${Math.max(4,x.total/maior(metricas.por_mes)*170)}px`}}/><small className="text-[10px] text-[var(--text-muted)]">{x.mes.slice(5)}/{x.mes.slice(2,4)}</small></div>)}</div></Grafico>
    </section>
    {podeRegistrar&&<section className="panel-card"><div className="flex flex-wrap items-center justify-between gap-3 mb-5"><h2 className="section-title">Lista de reclamações</h2><div className="flex gap-2">{[['todos','Todas'],['aberto','Em aberto'],['concluido','Concluídas']].map(([v,n])=><button key={v} onClick={()=>setFiltro(v)} className={`px-3 py-2 rounded-lg text-sm font-bold ${filtro===v?'bg-[var(--primary)] text-white':'bg-[var(--bg-main)]'}`}>{n}</button>)}</div></div><div className="grid xl:grid-cols-2 gap-4">{visiveis.map(r=><Cartao key={r.id} r={r} agora={agora} perfil={perfil} setFoto={setFoto} mudarStatus={mudarStatus} excluir={excluir} editar={editar}/>)}</div>{!visiveis.length&&<p className="text-[var(--text-muted)]">Nenhum registro neste filtro.</p>}</section>}
    {formAberto&&<Formulario editando={Boolean(editandoId)} form={form} setForm={setForm} catalogos={catalogos} anexar={anexar} salvar={salvar} salvando={salvando} fechar={()=>{setFormAberto(false);setEditandoId(null);}}/>} {foto&&<div onClick={()=>setFoto(null)} className="fixed inset-0 z-[70] bg-black/85 p-5 grid place-items-center cursor-zoom-out"><button className="absolute top-5 right-5 text-white"><X size={32}/></button><img src={foto.url} alt={foto.nome} className="max-w-[94vw] max-h-[90vh] object-contain !m-0 !rounded-xl"/></div>}</main>;
  return perfil==='leitor'?<div className="min-h-screen bg-[var(--bg-main)]"><LeitorTopbar titulo="Métricas de reclamações"/>{conteudo}</div>:<div className="min-h-screen bg-[var(--bg-main)] flex"><Sidebar/>{conteudo}</div>;
}
function Metrica({titulo,valor,cor=''}){return <div className="metric-card"><BarChart3 className={cor||'text-[var(--primary)]'}/><div><span>{titulo}</span><strong className={cor}>{valor}</strong></div></div>}
function Grafico({titulo,children,classe=''}){return <div className={`panel-card ${classe}`}><h2 className="section-title mb-4">{titulo}</h2>{children}</div>}
function Cartao({r,agora,perfil,setFoto,mudarStatus,excluir,editar}){
  const p=cores[r.prioridade]||cores.verde,t=restante(r.prazo_em,agora),aberta=r.status==='aberto';
  return <article className={`rounded-2xl border p-5 ${aberta&&t.atrasado?'border-red-500':'border-[var(--border-color)]'} bg-[var(--bg-card)] shadow-sm`}>
    <div className="flex justify-between gap-3">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <strong className="text-lg">{r.cliente_nome}</strong>
          <span className="px-2 py-1 rounded-full text-xs font-bold" style={{color:p.cor,background:p.fundo}}>{p.nome}</span>
          {r.setor_nome&&<span className="px-2 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800">{r.setor_nome}</span>}
          {!aberta&&<span className="px-2 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700">Concluída</span>}
        </div>
        <p className="text-sm text-[var(--primary)] font-bold mt-1">{r.tipo_nome}</p>
      </div>
      <div className="flex gap-3"><button onClick={()=>editar(r)} className="text-amber-600 h-fit" title="Editar reclamação"><Pencil size={18}/></button>{perfil==='administrador'&&<button onClick={()=>excluir(r.id)} className="text-red-600 h-fit" title="Excluir"><Trash2 size={18}/></button>}</div>
    </div>
    <div className={`my-4 p-3 rounded-xl flex items-center gap-3 ${aberta?(t.atrasado?'bg-red-100 text-red-800':'bg-[var(--bg-main)]'):'bg-emerald-50 text-emerald-800'}`}>{aberta?<Clock3 size={20}/>:<CheckCircle2 size={20}/>}<div><strong className="block text-sm">{aberta?(t.atrasado?`Prazo excedido há ${t.texto}`:`Restam ${t.texto}`):'Retorno ao cliente concluído'}</strong><small>{aberta?`Limite: ${new Date(r.prazo_em).toLocaleString('pt-BR')}`:`Concluída em ${new Date(r.concluido_em).toLocaleString('pt-BR')}`}</small></div></div>
    <p className="whitespace-pre-wrap text-sm leading-relaxed">{r.descricao}</p>
    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mt-4">{(r.anexos||[]).map((a,i)=>ehImagem(a)?<button key={i} onClick={()=>setFoto(a)} className="relative h-24 rounded-xl overflow-hidden border border-[var(--border-color)]"><img src={a.url} alt={a.nome} className="w-full h-full object-cover !m-0 !rounded-none"/><Image size={15} className="absolute bottom-2 right-2 text-white"/></button>:<a key={i} href={a.url} target="_blank" rel="noreferrer" className="h-24 rounded-xl border border-[var(--border-color)] grid place-items-center text-center text-xs p-2"><Paperclip size={20}/><span>{a.nome}</span></a>)}</div>
    <p className="text-xs text-[var(--text-muted)] mt-4">Líder: {r.lider_nome}{r.setor_nome?` · Setor: ${r.setor_nome}`:''} · Registrado por {r.criado_por_nome||'Sistema'} em {new Date(r.criado_em).toLocaleString('pt-BR')}</p>
    <button onClick={()=>mudarStatus(r.id,aberta?'concluido':'aberto')} className={`w-full mt-4 p-3 rounded-xl font-bold flex justify-center items-center ${aberta?'bg-emerald-600 text-white':'bg-[var(--bg-main)]'}`}>{aberta?<><CheckCircle2 size={18} className="mr-2"/>Confirmar retorno e concluir</>:<><RotateCcw size={18} className="mr-2"/>Reabrir reclamação</>}</button>
  </article>;
}
function Formulario({editando,form,setForm,catalogos,anexar,salvar,salvando,fechar}){
  const prazos=catalogos.prazos||{};
  const liderAtual=(catalogos.lideres||[]).find(x=>String(x.id)===String(form.lider_responsavel_id));
  const setoresDoLider=Array.isArray(liderAtual?.setores)?liderAtual.setores:[];
  function aoTrocarLider(id){
    const lider=(catalogos.lideres||[]).find(x=>String(x.id)===String(id));
    const setores=Array.isArray(lider?.setores)?lider.setores:[];
    setForm(v=>{
      const atualAindaVale=setores.some(s=>String(s.id)===String(v.setor_id));
      return {...v,lider_responsavel_id:id,setor_id:setores.length===1?String(setores[0].id):(atualAindaVale?v.setor_id:'')};
    });
  }
  return <div className="fixed inset-0 bg-black/60 z-50 grid place-items-center p-4"><form onSubmit={salvar} className="panel-card max-w-3xl w-full max-h-[92vh] overflow-auto"><div className="flex justify-between mb-5"><div><h2 className="text-2xl font-bold">{editando?'Editar reclamação':'Registrar reclamação'}</h2><p className="text-sm text-[var(--text-muted)]">A prioridade define o prazo automaticamente. O setor é sugerido pelo líder responsável.</p></div><button type="button" onClick={fechar}>Fechar</button></div><div className="grid sm:grid-cols-2 gap-4"><Selecao titulo="Cliente" valor={form.cliente_id} mudar={v=>setForm({...form,cliente_id:v})} itens={catalogos.clientes}/><Selecao titulo="Tipo de reclamação" valor={form.tipo_id} mudar={v=>setForm({...form,tipo_id:v})} itens={catalogos.tipos}/><label className="font-semibold text-sm sm:col-span-2">Nível de importância<div className="grid sm:grid-cols-3 gap-2 mt-2">{Object.entries(cores).map(([v,p])=><button type="button" key={v} onClick={()=>setForm({...form,prioridade:v})} className={`p-3 rounded-xl border text-left ${form.prioridade===v?'ring-2 ring-offset-2':'opacity-75'}`} style={{borderColor:p.cor,background:p.fundo,color:p.cor}}><strong className="block">{p.nome}</strong><small>Retorno em {formatarPrazo(Number(prazos[`prazo_${v}_min`]||0))}</small></button>)}</div></label><label className="font-semibold text-sm sm:col-span-2">Líder responsável<select required className="field" value={form.lider_responsavel_id} onChange={e=>aoTrocarLider(e.target.value)}><option value="">Selecione</option>{(catalogos.lideres||[]).map(x=><option key={x.id} value={x.id}>{x.nome}{(x.setores||[]).length?` — ${(x.setores||[]).map(s=>s.nome).join(', ')}`:''}</option>)}</select>{setoresDoLider.length>0&&<small className="text-[var(--text-muted)]">Setor(es) de {liderAtual.nome}: {setoresDoLider.map(s=>s.nome).join(', ')}</small>}</label><label className="font-semibold text-sm sm:col-span-2">Setor<select className="field" value={form.setor_id} onChange={e=>setForm({...form,setor_id:e.target.value})}><option value="">Selecione (sugestão do líder)</option>{(catalogos.setores||[]).map(x=><option key={x.id} value={x.id}>{x.nome}</option>)}</select></label><label className="font-semibold text-sm sm:col-span-2">Descrição<textarea required rows="5" className="field" value={form.descricao} onChange={e=>setForm({...form,descricao:e.target.value})}/></label><label className="font-semibold text-sm sm:col-span-2">Fotos e anexos (até 10)<input type="file" multiple className="field" onChange={e=>anexar(e.target.files)}/><div className="flex flex-wrap gap-2 mt-2">{form.anexos.map((a,i)=><span key={i} className="text-xs border rounded-lg p-2 flex gap-2">{a.nome}<button type="button" onClick={()=>setForm({...form,anexos:form.anexos.filter((_,n)=>n!==i)})}>×</button></span>)}</div></label></div><button disabled={salvando} className="w-full mt-5 bg-[var(--primary)] text-white p-3 rounded-xl font-bold">{salvando?'Salvando...':editando?'Salvar alterações':'Salvar e iniciar prazo'}</button></form></div>;
}
function Selecao({titulo,valor,mudar,itens}){const [texto,setTexto]=useState('');useEffect(()=>{const atual=(itens||[]).find(x=>String(x.id)===String(valor));if(atual&&atual.nome!==texto)setTexto(atual.nome);if(!valor&&(itens||[]).some(x=>x.nome===texto))setTexto('');},[valor,itens]);const lista=`opcoes-${titulo.replace(/\W/g,'-')}`;return <label className="font-semibold text-sm">{titulo}<input required list={lista} className="field" placeholder="Digite para pesquisar" value={texto} onChange={e=>{const digitado=e.target.value;setTexto(digitado);const achado=(itens||[]).find(x=>x.nome.toLocaleLowerCase('pt-BR')===digitado.toLocaleLowerCase('pt-BR'));mudar(achado?String(achado.id):'');}}/><datalist id={lista}>{(itens||[]).map(x=><option key={x.id} value={x.nome}/>)}</datalist></label>}
