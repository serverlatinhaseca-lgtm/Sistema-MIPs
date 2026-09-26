import { useEffect, useRef, useState } from 'react';

// Tela de corte reutilizável em todos os uploads de imagem.
// Modelo: a foto fica parada e o RETÂNGULO de corte se ajusta —
// arraste o corpo para mover, os 8 pontos de ancoragem para redimensionar
// (cantos e bordas) e use +/− para aproximar (encolhe o recorte).
// Só a área dentro do retângulo será enviada.
// aspecto: número (largura/altura) ou null (livre).
const MIN = 48;

const ALCAS = [
  { t: 'nw', fx: 0, fy: 0, cursor: 'nwse-resize' },
  { t: 'n', fx: 0.5, fy: 0, cursor: 'ns-resize' },
  { t: 'ne', fx: 1, fy: 0, cursor: 'nesw-resize' },
  { t: 'e', fx: 1, fy: 0.5, cursor: 'ew-resize' },
  { t: 'se', fx: 1, fy: 1, cursor: 'nwse-resize' },
  { t: 's', fx: 0.5, fy: 1, cursor: 'ns-resize' },
  { t: 'sw', fx: 0, fy: 1, cursor: 'nesw-resize' },
  { t: 'w', fx: 0, fy: 0.5, cursor: 'ew-resize' },
];

export default function CropModal({ arquivo, aspecto, passo, onConfirmar, onFechar }) {
  const [url, setUrl] = useState(() => URL.createObjectURL(arquivo));
  const molduraRef = useRef(null);
  const imgRef = useRef(null);
  const arrasto = useRef(null);
  const iniciado = useRef(false);
  const [nat, setNat] = useState({ w: 0, h: 0 });
  const [caixa, setCaixa] = useState({ w: 0, h: 0 });
  const [ret, setRet] = useState(null); // {x,y,w,h} em px da moldura
  const [zoom, setZoom] = useState(1);
  const [livre, setLivre] = useState(false); // destravar proporção (só onde há aspecto fixo)
  const [processando, setProcessando] = useState(false);
  const ouvintes = useRef(null);

  // Troca de arquivo com o modal aberto (fila de anexos): gera nova URL e zera o ajuste.
  useEffect(() => {
    const nova = URL.createObjectURL(arquivo);
    setUrl(prev => { URL.revokeObjectURL(prev); return nova; });
    setNat({ w: 0, h: 0 });
    setRet(null);
    iniciado.current = false;
    setZoom(1);
    setLivre(false);
    return () => URL.revokeObjectURL(nova);
  }, [arquivo]);
  useEffect(() => {
    const t = e => { if (e.key === 'Escape') onFechar(); };
    window.addEventListener('keydown', t);
    return () => window.removeEventListener('keydown', t);
  }, [onFechar]);

  const proporcao = aspecto || (nat.w && nat.h ? nat.w / nat.h : 16 / 10);
  const travado = Boolean(aspecto) && !livre;

  useEffect(() => {
    const el = molduraRef.current;
    if (!el) return;
    const medir = () => { if (el.clientWidth) setCaixa({ w: el.clientWidth, h: el.clientHeight }); };
    medir();
    const t = setTimeout(medir, 60);
    let ob = null;
    if (typeof ResizeObserver !== 'undefined') { ob = new ResizeObserver(medir); ob.observe(el); }
    else window.addEventListener('resize', medir);
    return () => { clearTimeout(t); if (ob) ob.disconnect(); else window.removeEventListener('resize', medir); };
  }, [proporcao]);

  // Foto ajustada inteira na moldura (contain) + retângulo da foto em px da moldura.
  const f = nat.w && caixa.w && caixa.h ? Math.min(caixa.w / nat.w, caixa.h / nat.h) : 0;
  const foto = f ? { w: nat.w * f, h: nat.h * f, x: (caixa.w - nat.w * f) / 2, y: (caixa.h - nat.h * f) / 2 } : null;

  const retInicial = () => {
    if (!foto) return null;
    if (!aspecto) return { ...foto };
    let w = foto.h * aspecto, h = foto.h;
    if (w > foto.w) { w = foto.w; h = w / aspecto; }
    return { w, h, x: foto.x + (foto.w - w) / 2, y: foto.y + (foto.h - h) / 2 };
  };
  useEffect(() => {
    if (foto && !iniciado.current) { iniciado.current = true; setRet(retInicial()); }
  }); // eslint-disable-line react-hooks/exhaustive-deps

  // Encaixa um retângulo dentro da foto (tamanho mínimo + limites).
  const encaixar = r => {
    if (!foto) return r;
    let { x, y, w, h } = r;
    w = Math.max(MIN, Math.min(w, foto.w));
    h = travado ? w / aspecto : Math.max(MIN, Math.min(h, foto.h));
    if (travado && h > foto.h) { h = foto.h; w = h * aspecto; }
    x = Math.min(Math.max(x, foto.x), foto.x + foto.w - w);
    y = Math.min(Math.max(y, foto.y), foto.y + foto.h - h);
    return { x, y, w, h };
  };

  const redimensionar = (tipo, dx, dy, base) => {
    if (!foto) return base;
    let l = base.x, t = base.y, r = base.x + base.w, b = base.y + base.h;
    if (tipo.includes('e')) r = base.x + base.w + dx;
    if (tipo.includes('s')) b = base.y + base.h + dy;
    if (tipo.includes('w')) l = base.x + dx;
    if (tipo.includes('n')) t = base.y + dy;
    if (travado) {
      if (tipo.length === 2) {
        // Canto: ancora no canto oposto, proporção travada (sem inverter o lado).
        const ax = tipo.includes('e') ? base.x : base.x + base.w;
        const ay = tipo.includes('s') ? base.y : base.y + base.h;
        const px = Math.min(foto.x + foto.w, Math.max(foto.x, tipo.includes('e') ? r : l));
        const py = Math.min(foto.y + foto.h, Math.max(foto.y, tipo.includes('s') ? b : t));
        const ex = tipo.includes('e') ? 1 : -1, ey = tipo.includes('s') ? 1 : -1;
        let nw = Math.max(0, ex * (px - ax));
        const nhMax = Math.max(0, ey * (py - ay));
        nw = Math.min(nw, nhMax * aspecto);
        const nh = nw / aspecto;
        l = ex > 0 ? ax : ax - nw;
        t = ey > 0 ? ay : ay - nh;
        return encaixar({ x: l, y: t, w: nw, h: nh });
      } else if (tipo === 'e' || tipo === 'w') {
        const cy = base.y + base.h / 2;
        const nw = r - l, nh = nw / aspecto;
        return encaixar({ x: l, y: cy - nh / 2, w: nw, h: nh });
      } else {
        const cx = base.x + base.w / 2;
        const nh = b - t, nw = nh * aspecto;
        return encaixar({ x: cx - nw / 2, y: t, w: nw, h: nh });
      }
    }
    return encaixar({ x: l, y: t, w: r - l, h: b - t });
  };

  const iniciar = (e, tipo) => {
    e.stopPropagation();
    e.preventDefault();
    if (!ret) return;
    arrasto.current = { tipo, x: e.clientX, y: e.clientY, base: { ...ret } };
    // Listeners na janela: o arrasto não se perde mesmo se o ponteiro sair da moldura.
    const mv = ev => mover(ev);
    const up = () => soltar();
    ouvintes.current = { mv, up };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };
  const soltar = () => {
    arrasto.current = null;
    if (ouvintes.current) {
      window.removeEventListener('pointermove', ouvintes.current.mv);
      window.removeEventListener('pointerup', ouvintes.current.up);
      window.removeEventListener('pointercancel', ouvintes.current.up);
      ouvintes.current = null;
    }
  };
  useEffect(() => () => {
    if (ouvintes.current) {
      window.removeEventListener('pointermove', ouvintes.current.mv);
      window.removeEventListener('pointerup', ouvintes.current.up);
      window.removeEventListener('pointercancel', ouvintes.current.up);
    }
  }, []);
  const mover = e => {
    const a = arrasto.current;
    if (!a || !ret) return;
    const dx = e.clientX - a.x, dy = e.clientY - a.y;
    if (a.tipo === 'mover') {
      setRet(encaixar({ x: a.base.x + dx, y: a.base.y + dy, w: a.base.w, h: a.base.h }));
    } else {
      const novo = redimensionar(a.tipo, dx, dy, a.base);
      setRet(novo);
      setZoom(Math.min(3, Math.max(1, foto.w / novo.w)));
    }
  };
  // Zoom = tamanho do recorte: 100% foto inteira, 300% recorte em 1/3.
  const mudarZoom = z => {
    if (!foto) return;
    const nz = Math.min(3, Math.max(1, Number(z) || 1));
    const cx = ret ? ret.x + ret.w / 2 : foto.x + foto.w / 2;
    const cy = ret ? ret.y + ret.h / 2 : foto.y + foto.h / 2;
    let w = Math.max(MIN, foto.w / nz);
    let h = travado ? w / aspecto : Math.max(MIN, foto.h / nz);
    if (travado && h > foto.h) { h = foto.h; w = h * aspecto; }
    setZoom(nz);
    setRet(encaixar({ x: cx - w / 2, y: cy - h / 2, w, h }));
  };

  // Destravar permite remodelar livremente (sem a proporção sugerida do campo).
  const alternarTrava = () => {
    if (!aspecto || !foto) return;
    if (travado) { setLivre(true); return; }
    setLivre(false);
    if (ret) {
      const w = Math.min(ret.w, ret.h * aspecto), h = w / aspecto;
      setRet(encaixar({ x: ret.x + (ret.w - w) / 2, y: ret.y + (ret.h - h) / 2, w, h }));
    }
  };

  function confirmar() {
    const img = imgRef.current;
    if (!img || !nat.w || !ret || !f) { alert('Aguarde a foto terminar de carregar.'); return; }
    setProcessando(true);
    try {
      let cx = (ret.x - foto.x) / f, cy = (ret.y - foto.y) / f, cw = ret.w / f, ch = ret.h / f;
      cx = Math.max(0, Math.min(nat.w - 1, cx));
      cy = Math.max(0, Math.min(nat.h - 1, cy));
      cw = Math.max(1, Math.min(cw, nat.w - cx));
      ch = Math.max(1, Math.min(ch, nat.h - cy));
      const k = Math.min(1, 1920 / Math.max(cw, ch));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(cw * k));
      canvas.height = Math.max(1, Math.round(ch * k));
      const ctx = canvas.getContext('2d');
      const ehPng = arquivo.type === 'image/png';
      if (!ehPng) { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height); }
      ctx.drawImage(img, cx, cy, cw, ch, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(blob => {
        setProcessando(false);
        if (!blob) { alert('Não foi possível cortar a imagem.'); return; }
        const semExt = String(arquivo.name || 'imagem').replace(/\.[a-z0-9]+$/i, '') || 'imagem';
        onConfirmar(new File([blob], `${semExt}.${ehPng ? 'png' : 'jpg'}`, { type: ehPng ? 'image/png' : 'image/jpeg' }));
      }, ehPng ? 'image/png' : 'image/jpeg', 0.92);
    } catch {
      setProcessando(false);
      alert('Não foi possível cortar a imagem.');
    }
  }

  return (
    <div className="fixed inset-0 z-[60] bg-black/70 grid place-items-center p-4">
      <div className="panel-card max-w-2xl w-full max-h-[92vh] overflow-auto">
        <h2 className="text-xl font-bold">Ajustar imagem{passo ? ` (${passo})` : ''}</h2>
        <p className="text-sm text-[var(--text-muted)] mt-1 mb-1"><strong>1.</strong> Arraste os <strong>pontos brancos</strong> para redimensionar{travado ? ' (proporção do campo mantida)' : ''} · <strong>2.</strong> Arraste o centro para mover · <strong>3.</strong> Use <strong>+</strong>/<strong>−</strong> para aproximar · <strong>4.</strong> Confirme</p>
        <p className="text-sm text-[var(--text-muted)] mb-4">Só a área dentro do retângulo será enviada.</p>
        <div ref={molduraRef} className="crop-moldura relative w-full overflow-hidden rounded-xl bg-black select-none" style={{ aspectRatio: String(proporcao), touchAction: 'none' }}
          onPointerDown={e => iniciar(e, 'mover')}>
          <img ref={imgRef} src={url} alt="" draggable={false}
            onLoad={e => setNat({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
            style={foto
              ? { position: 'absolute', left: foto.x, top: foto.y, width: foto.w, height: foto.h, maxWidth: 'none' }
              : { position: 'absolute', left: 0, top: 0, width: '100%', opacity: 0 }} />
          {!foto && (
            <div className="absolute inset-0 grid place-items-center text-white/70 text-sm">Carregando foto...</div>
          )}
          {ret && (
            <div className="absolute" style={{ left: ret.x, top: ret.y, width: ret.w, height: ret.h, boxShadow: '0 0 0 9999px rgba(0,0,0,0.55)' }}>
              <div className="absolute inset-0 border-2 border-white/90 rounded-[2px]" />
              <div className="absolute inset-y-0 left-1/3 w-px bg-white/40" />
              <div className="absolute inset-y-0 left-2/3 w-px bg-white/40" />
              <div className="absolute inset-x-0 top-1/3 h-px bg-white/40" />
              <div className="absolute inset-x-0 top-2/3 h-px bg-white/40" />
              {ALCAS.map(a => (
                <span key={a.t} data-alca={a.t} onPointerDown={e => iniciar(e, a.t)}
                  className="absolute w-[22px] h-[22px] bg-white/95 border-[3px] border-[var(--primary)] rounded-full shadow-md"
                  style={{ left: a.fx * ret.w, top: a.fy * ret.h, transform: 'translate(-50%,-50%)', cursor: a.cursor, touchAction: 'none' }} />
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-3 mt-4">
          <button type="button" onClick={() => mudarZoom(1)} disabled={zoom <= 1} className="w-10 h-10 shrink-0 rounded-xl border border-[var(--border-color)] font-bold text-lg disabled:opacity-40" title="Afastar tudo">−</button>
          <input type="range" min="1" max="3" step="0.1" value={zoom} onChange={e => mudarZoom(e.target.value)} className="flex-1" aria-label="Aproximação" />
          <button type="button" onClick={() => mudarZoom(3)} disabled={zoom >= 3} className="w-10 h-10 shrink-0 rounded-xl border border-[var(--border-color)] font-bold text-lg disabled:opacity-40" title="Aproximar tudo">+</button>
          <span className="w-14 text-center font-bold tabular-nums">{Math.round(zoom * 100)}%</span>
          {aspecto && <button type="button" onClick={alternarTrava} title={travado ? 'Permitir qualquer formato' : 'Voltar à proporção sugerida do campo'} className={`text-sm font-bold whitespace-nowrap px-3 py-1.5 rounded-xl border border-[var(--border-color)] ${travado ? '' : 'bg-amber-100 text-amber-800'}`}>{travado ? '🔒 Proporção' : '🔓 Livre'}</button>}
          <button type="button" onClick={() => { setZoom(1); setRet(retInicial()); }} className="text-sm text-[var(--text-muted)] underline whitespace-nowrap">Centralizar</button>
        </div>
        <div className="flex flex-wrap justify-end gap-2 mt-5">
          <button type="button" onClick={onFechar} className="px-5 py-2.5 rounded-xl border border-[var(--border-color)] font-bold">Cancelar</button>
          <button type="button" onClick={() => onConfirmar(arquivo)} className="px-5 py-2.5 rounded-xl border border-[var(--border-color)] font-bold">Usar original</button>
          <button type="button" onClick={confirmar} disabled={processando || !ret} className="px-5 py-2.5 rounded-xl bg-[var(--primary)] text-white font-bold disabled:opacity-50">{processando ? 'Cortando...' : 'Confirmar corte'}</button>
        </div>
      </div>
    </div>
  );
}
