import { useEffect, useMemo, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { getColorFromName, getUnitForProduct, divide, formatDate } from '../utils/etiqueta';

const PRESETS = {
  igarata: [
    { id: 'frances', name: 'PÃO FRANCÊS', shortName: 'Pão francês', packageSize: 50, unitSingular: 'pão', unitPlural: 'pães', color: '#d95d20' },
    { id: 'leite', name: 'PÃO DE LEITE', shortName: 'Pão de leite', packageSize: 30, unitSingular: 'pão', unitPlural: 'pães', color: '#2f6b4f' },
    { id: 'integral', name: 'PÃO FRANCÊS INTEGRAL', shortName: 'Francês integral', packageSize: 50, unitSingular: 'pão', unitPlural: 'pães', color: '#6c757d' },
    { id: 'mini-leite', name: 'MINI PÃO DE LEITE', shortName: 'Mini de leite', packageSize: 30, unitSingular: 'pão', unitPlural: 'pães', color: '#dc3545' },
    { id: 'mini-frances', name: 'MINI PÃO FRANCÊS', shortName: 'Mini francês', packageSize: 50, unitSingular: 'pão', unitPlural: 'pães', color: '#fd7e14' },
    { id: 'bolo', name: 'BOLOS', shortName: 'Bolo', packageSize: 1, unitSingular: 'unidade', unitPlural: 'unidades', color: '#6f42c1' },
  ],
  paraibuna: [
    { id: 'frances', name: 'PÃO FRANCÊS', shortName: 'Pão francês', packageSize: 50, unitSingular: 'pão', unitPlural: 'pães', color: '#d95d20' },
    { id: 'leite', name: 'PÃO DE LEITE', shortName: 'Pão de leite', packageSize: 30, unitSingular: 'pão', unitPlural: 'pães', color: '#2f6b4f' },
    { id: 'bolo', name: 'BOLOS', shortName: 'Bolo', packageSize: 1, unitSingular: 'unidade', unitPlural: 'unidades', color: '#6f42c1' },
  ],
  johnson: [
    { id: 'lanche', name: 'LANCHE COM FRIOS', shortName: 'Lanche com frios', packageSize: 50, unitSingular: 'pão', unitPlural: 'pães', color: '#d95d20' },
  ],
  margarina: [
    { id: 'leite-marg', name: 'PÃO DE LEITE C/ MARGARINA', shortName: 'Pão leite c/ margarina', packageSize: 50, unitSingular: 'pão', unitPlural: 'pães', color: '#2f6b4f' },
    { id: 'frances-marg', name: 'PÃO FRANCÊS C/ MARGARINA', shortName: 'Francês c/ margarina', packageSize: 50, unitSingular: 'pão', unitPlural: 'pães', color: '#d95d20' },
    { id: 'leite-sem', name: 'PÃO DE LEITE S/ MARGARINA', shortName: 'Pão leite s/ margarina', packageSize: 50, unitSingular: 'pão', unitPlural: 'pães', color: '#2f6b4f' },
    { id: 'frances-sem', name: 'PÃO FRANCÊS S/ MARGARINA', shortName: 'Francês s/ margarina', packageSize: 50, unitSingular: 'pão', unitPlural: 'pães', color: '#d95d20' },
  ],
  genericas: [
    { id: 'frances', name: 'PÃO FRANCÊS', shortName: 'Pão francês', packageSize: 50, unitSingular: 'pão', unitPlural: 'pães', color: '#d95d20' },
    { id: 'leite', name: 'PÃO DE LEITE', shortName: 'Pão de leite', packageSize: 30, unitSingular: 'pão', unitPlural: 'pães', color: '#2f6b4f' },
    { id: 'integral', name: 'PÃO FRANCÊS INTEGRAL', shortName: 'Francês integral', packageSize: 50, unitSingular: 'pão', unitPlural: 'pães', color: '#6c757d' },
    { id: 'bolo', name: 'BOLOS', shortName: 'Bolo', packageSize: 1, unitSingular: 'unidade', unitPlural: 'unidades', color: '#6f42c1' },
  ],
};

const STORAGE_PRESETS = 'etiquetas-presets-v2';
const STORAGE_ORDERS = 'etiquetas-orders-v2';
const OLD_PRODUCTS_KEY = 'etiquetas-paes-products';
const OLD_ORDERS_KEY = 'etiquetas-paes-orders';

export default function EtiquetasEditor() {
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  if (String(user.perfil || '').toLowerCase() !== 'administrador') return null;

  const [delivery, setDelivery] = useState('igarata');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0,10));
  const [tab, setTab] = useState('config');
  const [presets, setPresets] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_PRESETS) || '{}');
      if (Object.keys(saved).length) return saved;
      // migrar dados antigos
      const oldProducts = JSON.parse(localStorage.getItem(OLD_PRODUCTS_KEY) || 'null');
      if (oldProducts && Array.isArray(oldProducts)) {
        const mapped = oldProducts.map(p => ({
          id: p.id,
          name: p.name || p.shortName || 'Produto',
          shortName: p.shortName || p.name || 'Produto',
          packageSize: p.packageSize || 50,
          unitSingular: p.unitSingular || p.unit || getUnitForProduct(p.name || '').singular,
          unitPlural: p.unitPlural || (p.unitSingular ? p.unitSingular + 's' : getUnitForProduct(p.name || '').plural),
          color: p.color || getColorFromName(p.name || p.shortName || 'Produto')
        }));
        return { igarata: mapped };
      }
      return {};
    } catch { return {}; }
  });
  const [orders, setOrders] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_ORDERS) || '{}');
      if (Object.keys(saved).length) return saved;
      // migrar pedidos antigos
      const oldOrders = JSON.parse(localStorage.getItem(OLD_ORDERS_KEY) || 'null');
      if (oldOrders && Array.isArray(oldOrders)) {
        const map = {};
        oldOrders.forEach(o => {
          const key = `${o.delivery || 'igarata'}::${o.date || '2026-01-01'}`;
          if (!map[key]) map[key] = [];
          map[key].push({
            id: o.id || Date.now() + Math.random(),
            productId: o.productId,
            destination: o.destination,
            total: o.total,
            shift: o.shift,
            afternoon: o.afternoon
          });
        });
        return map;
      }
      return {};
    } catch { return {}; }
  });

  const products = useMemo(() => {
    const p = presets[delivery];
    if (p && p.length) return p;
    return PRESETS[delivery] || [];
  }, [presets, delivery]);

  const [selectedProductId, setSelectedProductId] = useState('');
  const [dest, setDest] = useState('');
  const [qty, setQty] = useState('');
  const [shift, setShift] = useState('manha');
  const [afternoon, setAfternoon] = useState(false);
  const [error, setError] = useState('');
  const [showNewProd, setShowNewProd] = useState(false);
  const [newProd, setNewProd] = useState({ name:'', shortName:'', packageSize:50, unitSingular:'unidade', unitPlural:'unidades', color:'#d95d20' });

  useEffect(() => {
    localStorage.setItem(STORAGE_PRESETS, JSON.stringify(presets));
    // limpa chaves antigas após migrar
    localStorage.removeItem(OLD_PRODUCTS_KEY);
    localStorage.removeItem(OLD_ORDERS_KEY);
  }, [presets]);

  useEffect(() => {
    localStorage.setItem(STORAGE_ORDERS, JSON.stringify(orders));
  }, [orders]);

  // inicializa preset quando muda entrega
  useEffect(() => {
    setPresets(prev => {
      if (prev[delivery]) return prev;
      return { ...prev, [delivery]: JSON.parse(JSON.stringify(PRESETS[delivery] || [])) };
    });
    setSelectedProductId('');
    setDest('');
    setQty('');
    setError('');
  }, [delivery]);

  const saveProducts = (list) => {
    setPresets(prev => ({ ...prev, [delivery]: list }));
  };

  const updateProduct = (id, patch) => {
    saveProducts(products.map(p => p.id === id ? { ...p, ...patch } : p));
  };

  const handleAddProduct = () => {
    if (!newProd.name.trim()) { setError('Informe o nome do produto'); return; }
    const color = newProd.color || getColorFromName(newProd.name);
    saveProducts([...products, {
      id: `custom-${uuidv4()}`,
      name: newProd.name.toUpperCase(),
      shortName: newProd.shortName || newProd.name,
      packageSize: parseInt(newProd.packageSize)||50,
      unitSingular: newProd.unitSingular,
      unitPlural: newProd.unitPlural,
      color
    }]);
    setShowNewProd(false);
    setNewProd({ name:'', shortName:'', packageSize:50, unitSingular:'unidade', unitPlural:'unidades', color:'#d95d20' });
    setError('');
  };

  const removeProduct = (id) => {
    if (!confirm('Remover produto?')) return;
    saveProducts(products.filter(p => p.id !== id));
  };

  const orderKey = `${delivery}::${date}`;
  const currentOrders = orders[orderKey] || [];

  const addOrder = (e) => {
    e.preventDefault();
    setError('');
    if (!date) return setError('Informe a data da entrega');
    if (!selectedProductId) return setError('Selecione um produto');
    if (!dest.trim()) return setError('Informe setor/local');
    const total = parseInt(qty,10);
    if (!Number.isInteger(total) || total <= 0) return setError('Quantidade inválida');

    const product = products.find(p => p.id === selectedProductId);
    if (!product) return setError('Produto não encontrado');

    const newOrder = {
      id: Date.now(),
      productId: product.id,
      destination: dest.trim(),
      total,
      shift,
      afternoon,
    };
    setOrders(prev => ({
      ...prev,
      [orderKey]: [...(prev[orderKey] || []), newOrder]
    }));
    setDest('');
    setQty('');
  };

  const removeOrder = (id) => {
    setOrders(prev => ({
      ...prev,
      [orderKey]: (prev[orderKey] || []).filter(o => o.id !== id)
    }));
  };

  const totals = useMemo(() => {
    const map = {};
    currentOrders.forEach(o => {
      const p = products.find(p => p.id === o.productId);
      const key = p?.shortName || o.productId;
      map[key] = (map[key] || 0) + o.total;
    });
    return map;
  }, [currentOrders, products]);

  const downloadPdf = () => {
    if (!window.jspdf?.jsPDF) {
      alert('jsPDF não carregado');
      return;
    }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter', compress: true });
    const labelW = 44.4, labelH = 12.7, stepX = 47.5, left = 14.5, top = 12.7;

    const allLabels = [];
    currentOrders.forEach(order => {
      const product = products.find(p => p.id === order.productId);
      if (!product) return;
      const packageSize = product.packageSize || 50;
      const parts = divide(order.total, packageSize);
      parts.forEach((q, idx) => {
        allLabels.push({
          id: `${order.id}-${idx}`,
          destination: order.destination,
          product: product.shortName,
          productId: product.id,
          color: product.color,
          quantity: q,
          shift: order.shift,
          afternoon: order.afternoon,
          unitPlural: product.unitPlural,
        });
      });
    });

    if (!allLabels.length) {
      alert('Nenhum pedido para gerar etiquetas');
      return;
    }

    allLabels.forEach((label, i) => {
      if (i > 0 && i % 80 === 0) doc.addPage();
      const local = i % 80;
      const col = local % 4;
      const row = Math.floor(local / 4);
      const x = left + col * stepX;
      const y = top + row * labelH;
      const cx = x + labelW / 2;

      if (label.afternoon) {
        doc.setFillColor(255,235,59);
        doc.rect(x, y, labelW, labelH, 'F');
      }

      const head = `${label.destination}${label.shift ? ' • ' + label.shift : ''}${label.afternoon ? ' • TARDE' : ''}`.toUpperCase();
      doc.setFontSize(6);
      doc.setFont('helvetica','bold');
      doc.text(doc.splitTextToSize(head, labelW-3).slice(0,2), cx, y+3, { align:'center', lineHeightFactor:1.05 });

      doc.setFontSize(7.5);
      doc.setFont('helvetica','bold');
      doc.text(`${label.quantity} ${label.unitPlural}`, cx, y+8, { align:'center' });

      if (label.color) {
        const hex = label.color.replace('#','');
        doc.setTextColor(parseInt(hex.slice(0,2),16), parseInt(hex.slice(2,4),16), parseInt(hex.slice(4,6),16));
      }
      doc.setFontSize(5.5);
      doc.setFont('helvetica','normal');
      doc.text(label.product, cx, y+10.5, { align:'center' });
      doc.setTextColor(0,0,0);
    });

    doc.save(`etiquetas_${delivery}_${formatDate(date)}.pdf`);
  };

  const needsShift = ['johnson','margarina'].includes(delivery);
  const needsAfternoon = delivery === 'igarata';

  return (
    <div className="min-h-screen bg-[var(--bg-main)] text-[var(--text-main)]">
      <div className="max-w-6xl mx-auto p-4 md:p-6">
        <div className="flex flex-wrap items-end gap-3 mb-4">
          <div>
            <label className="text-xs">Entrega</label>
            <select value={delivery} onChange={e=>setDelivery(e.target.value)} className="mt-1 w-full rounded-md border border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-2">
              <option value="igarata">Igaratá</option>
              <option value="paraibuna">Paraibuna</option>
              <option value="johnson">Johnson</option>
              <option value="margarina">Margarina</option>
              <option value="genericas">Genéricas</option>
            </select>
          </div>
          <div>
            <label className="text-xs">Data da entrega</label>
            <input type="date" value={date} onChange={e=>setDate(e.target.value)} className="mt-1 w-full rounded-md border border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-2" />
          </div>
          <div className="ml-auto flex gap-2">
            {['config','pedido','pedidos','pdf'].map(t => (
              <button key={t} onClick={()=>setTab(t)} className={`px-3 py-1.5 rounded-lg border text-sm ${tab===t?'bg-[var(--primary)] text-white border-[var(--primary)]':'border-[var(--border-color)] bg-[var(--bg-card)]'}`}>
                {t==='config'?'Configurações':t==='pedido'?'Novo Pedido':t==='pedidos'?'Pedidos':'Gerar PDF'}
              </button>
            ))}
          </div>
        </div>

        {error && <div className="mb-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">{error}</div>}

        {tab==='config' && (
          <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">Produtos para {delivery}</h3>
              <button onClick={()=>setShowNewProd(true)} className="text-sm px-3 py-1 rounded bg-orange-600 text-white">+ Novo produto</button>
            </div>
            {showNewProd && (
              <div className="mb-4 border rounded p-3 bg-[var(--bg-main)] grid md:grid-cols-3 gap-2">
                <input placeholder="Nome completo" value={newProd.name} onChange={e=>setNewProd({...newProd, name:e.target.value})} className="rounded border px-2 py-1 bg-[var(--bg-card)]"/>
                <input placeholder="Nome curto" value={newProd.shortName} onChange={e=>setNewProd({...newProd, shortName:e.target.value})} className="rounded border px-2 py-1 bg-[var(--bg-card)]"/>
                <input type="number" placeholder="Qtd por pacote" value={newProd.packageSize} onChange={e=>setNewProd({...newProd, packageSize:e.target.value})} className="rounded border px-2 py-1 bg-[var(--bg-card)]"/>
                <input placeholder="Unidade singular" value={newProd.unitSingular} onChange={e=>setNewProd({...newProd, unitSingular:e.target.value})} className="rounded border px-2 py-1 bg-[var(--bg-card)]"/>
                <input placeholder="Unidade plural" value={newProd.unitPlural} onChange={e=>setNewProd({...newProd, unitPlural:e.target.value})} className="rounded border px-2 py-1 bg-[var(--bg-card)]"/>
                <div className="flex items-center gap-2">
                  <input type="color" value={newProd.color} onChange={e=>setNewProd({...newProd, color:e.target.value})} className="w-10 h-8 p-0 border-0 rounded"/>
                  <button onClick={handleAddProduct} className="px-3 py-1 bg-green-600 text-white rounded text-sm">Salvar</button>
                  <button onClick={()=>setShowNewProd(false)} className="px-3 py-1 bg-gray-300 rounded text-sm">Cancelar</button>
                </div>
              </div>
            )}
            <div className="grid md:grid-cols-2 gap-3">
              {products.map(p => (
                <div key={p.id} className="border rounded-lg p-3 bg-[var(--bg-main)]">
                  <div className="flex items-start gap-3">
                    <input type="color" value={p.color} onChange={e=>updateProduct(p.id,{color:e.target.value})} className="w-8 h-8 p-0 border-0 rounded" />
                    <div className="flex-1 grid grid-cols-2 gap-2 text-sm">
                      <input value={p.shortName} onChange={e=>updateProduct(p.id,{shortName:e.target.value})} placeholder="Nome curto" className="col-span-2 rounded border px-2 py-1 bg-[var(--bg-card)]"/>
                      <input value={p.name} onChange={e=>updateProduct(p.id,{name:e.target.value})} placeholder="Nome completo" className="col-span-2 rounded border px-2 py-1 bg-[var(--bg-card)]"/>
                      <input type="number" value={p.packageSize} onChange={e=>updateProduct(p.id,{packageSize:parseInt(e.target.value)||0})} className="rounded border px-2 py-1 bg-[var(--bg-card)]"/>
                      <input value={p.unitSingular} onChange={e=>updateProduct(p.id,{unitSingular:e.target.value})} className="rounded border px-2 py-1 bg-[var(--bg-card)]"/>
                      <input value={p.unitPlural} onChange={e=>updateProduct(p.id,{unitPlural:e.target.value})} className="col-span-2 rounded border px-2 py-1 bg-[var(--bg-card)]"/>
                    </div>
                    <button onClick={()=>removeProduct(p.id)} className="text-xs text-red-600">Remover</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab==='pedido' && (
          <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-4">
            <h3 className="font-semibold mb-3">Novo pedido</h3>
            <form onSubmit={addOrder} className="grid md:grid-cols-3 gap-3">
              <select value={selectedProductId} onChange={e=>setSelectedProductId(e.target.value)} className="rounded border px-3 py-2 bg-[var(--bg-main)]">
                <option value="">Selecione produto</option>
                {products.map(p=> <option key={p.id} value={p.id}>{p.shortName}</option>)}
              </select>
              <input placeholder="Setor / Local" value={dest} onChange={e=>setDest(e.target.value)} className="rounded border px-3 py-2 bg-[var(--bg-main)]"/>
              <input type="number" min="1" placeholder="Quantidade" value={qty} onChange={e=>setQty(e.target.value)} className="rounded border px-3 py-2 bg-[var(--bg-main)]"/>
              {needsShift && (
                <select value={shift} onChange={e=>setShift(e.target.value)} className="rounded border px-3 py-2 bg-[var(--bg-main)]">
                  <option value="manha">Manhã</option>
                  <option value="tarde">Tarde</option>
                </select>
              )}
              {needsAfternoon && (
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={afternoon} onChange={e=>setAfternoon(e.target.checked)} />
                  Tarde
                </label>
              )}
              <button className="md:col-span-3 bg-orange-600 text-white rounded px-4 py-2">Adicionar pedido</button>
            </form>
          </div>
        )}

        {tab==='pedidos' && (
          <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-4">
            <h3 className="font-semibold mb-3">Pedidos de {formatDate(date)}</h3>
            {currentOrders.length===0 && <p className="text-sm opacity-70">Nenhum pedido ainda.</p>}
            <div className="space-y-2">
              {currentOrders.map(o=>{
                const p = products.find(pp=>pp.id===o.productId);
                return (
                  <div key={o.id} className="flex items-center justify-between border rounded p-2 bg-[var(--bg-main)]">
                    <div className="text-sm">
                      <b>{o.destination}</b> — {p?.shortName || o.productId} — {o.total} {p?.unitPlural}
                      {o.shift && ` • ${o.shift}`}{o.afternoon && ' • TARDE'}
                    </div>
                    <button onClick={()=>removeOrder(o.id)} className="text-xs text-red-600">Remover</button>
                  </div>
                );
              })}
            </div>
            {Object.keys(totals).length>0 && (
              <div className="mt-4 text-sm">
                <b>Totais:</b>
                <ul className="list-disc ml-5">
                  {Object.entries(totals).map(([k,v])=> <li key={k}>{k}: {v}</li>)}
                </ul>
              </div>
            )}
          </div>
        )}

        {tab==='pdf' && (
          <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-4">
            <h3 className="font-semibold mb-3">Gerar PDF</h3>
            <p className="text-sm opacity-80 mb-3">Etiquetas Pimaco 6187 • 80 por folha. Total de etiquetas: {currentOrders.reduce((s,o)=>s+Math.ceil(o.total/ (products.find(p=>p.id===o.productId)?.packageSize||50)),0)}</p>
            <button onClick={downloadPdf} className="bg-gray-800 text-white px-4 py-2 rounded">Baixar PDF</button>
          </div>
        )}
      </div>
    </div>
  );
}
