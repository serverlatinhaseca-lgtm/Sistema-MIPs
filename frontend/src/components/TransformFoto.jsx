import { useEffect, useRef, useState } from 'react';
import { AlignLeft, AlignCenter, AlignRight, Trash2 } from 'lucide-react';

// Transform direto na foto dentro do texto (estilo Photoshop): caixa de
// seleção sobre a imagem com 8 alças para redimensionar e arrasto do corpo
// para mover a foto para outro ponto do texto. O ajuste é gravado como
// estilo inline + data-tam/data-ali no <img>, então vale no editor e na
// visualização (o HTML é o que vai ao banco).
//
// A foto é sempre re-localizada pelo src (o ReactQuill pode trocar o nó do
// DOM ao sincronizar o valor), e um loop de medição mantém a caixa grudada
// nela — inclusive após alinhar/mover.

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

const MIN = 24;
const ALTURA_MAX = 1600;
const EMBED = new Set(['IMG', 'IFRAME', 'VIDEO', 'HR']);
const BLOCO = new Set(['P', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'PRE', 'DIV']);

// Faixa nativa (ponto do mouse -> Range) nos navegadores suportados.
function faixaNoPonto(x, y) {
  try {
    if (document.caretRangeFromPoint) return document.caretRangeFromPoint(x, y);
    if (document.caretPositionFromPoint) {
      const p = document.caretPositionFromPoint(x, y);
      if (!p) return null;
      const r = document.createRange();
      r.setStart(p.offsetNode, p.offset);
      r.collapse(true);
      return r;
    }
  } catch { /* fora da janela: sem ponto de soltura */ }
  return null;
}

// Comprimento em "índice Quill" de um nó: texto vale os caracteres, embed
// vale 1, e cada bloco (p, li, títulos...) conta +1 da quebra de linha.
function comp(no) {
  if (!no) return 0;
  if (no.nodeType === 3) return no.data.length;
  if (no.nodeType !== 1) return 0;
  const tg = no.tagName;
  if (EMBED.has(tg)) return 1;
  if (tg === 'BR') return 0;
  let s = 0;
  no.childNodes.forEach((f) => { s += comp(f); });
  if (BLOCO.has(tg)) {
    const uteis = [...no.childNodes].filter((f) => !(f.nodeType === 3 && !f.data.length));
    if (uteis.length === 1 && uteis[0].tagName === 'BR') return 1; // linha vazia
    return s + 1;
  }
  return s;
}

// Índice Quill do ponto (nó + deslocamento) dentro da raiz do editor.
function varrer(pai, base, alvoNo, alvoOff) {
  const filhos = pai.childNodes;
  for (let i = 0; i < filhos.length; i++) {
    const f = filhos[i];
    if (f === alvoNo) {
      if (f.nodeType === 3) return base + Math.min(alvoOff, f.data.length);
      let s = 0;
      const ate = Math.min(alvoOff, f.childNodes.length);
      for (let k = 0; k < ate; k++) s += comp(f.childNodes[k]);
      return base + s;
    }
    if (f.nodeType === 1 && f.contains(alvoNo)) {
      const r = varrer(f, base, alvoNo, alvoOff);
      if (r !== null && r !== undefined) return r;
    }
    base += comp(f);
  }
  return null;
}

function indiceDoPonto(raiz, x, y) {
  const faixa = faixaNoPonto(x, y);
  if (!faixa) return null;
  const no = faixa.startContainer;
  if (!raiz.contains(no)) return null;
  // closest() só existe em elementos: para nó de texto, sobe ao elemento pai.
  const el = no.nodeType === 3 ? no.parentElement : no;
  if (el && el !== raiz && !(el.closest && el.closest('p,li,h1,h2,h3,h4,h5,h6,blockquote,pre,ul,ol'))) return null;
  return varrer(raiz, 0, no, faixa.startOffset);
}

export default function TransformFoto({ src, ali, editor, caixa, onAlinhar, onRemover, onMudar, onFechar }) {
  const [quadro, setQuadro] = useState(null); // {x,y,w,h} em px da caixa
  const gesto = useRef(null);
  const fecharRef = useRef(onFechar);
  fecharRef.current = onFechar;
  const mudarRef = useRef(onMudar);
  mudarRef.current = onMudar;

  const localizar = () => {
    const raiz = editor?.root;
    if (!raiz || !src) return null;
    try {
      return raiz.querySelector(`img[src="${CSS.escape(src)}"]`);
    } catch {
      return null;
    }
  };

  const medir = () => {
    const img = localizar();
    const box = caixa?.getBoundingClientRect();
    if (!img || !box) return false;
    const r = img.getBoundingClientRect();
    if (!r.width || !r.height) return true; // foto oculta: mantém quadro atual
    const q = { x: r.left - box.left, y: r.top - box.top, w: r.width, h: r.height };
    setQuadro((a) => (
      !a || Math.abs(a.x - q.x) > 0.5 || Math.abs(a.y - q.y) > 0.5
      || Math.abs(a.w - q.w) > 0.5 || Math.abs(a.h - q.h) > 0.5
    ) ? q : a);
    return true;
  };
  const medirRef = useRef(medir);
  medirRef.current = medir;

  // Loop de medição: a caixa persegue a foto (inclusive se o ReactQuill
  // trocar o nó). Se a foto sumir (removida), o transform se fecha sozinho.
  useEffect(() => {
    let vivo = true;
    let raf = 0;
    const volta = () => {
      if (!vivo) return;
      if (!medirRef.current()) {
        fecharRef.current();
        return;
      }
      raf = requestAnimationFrame(volta);
    };
    raf = requestAnimationFrame(volta);
    return () => { vivo = false; cancelAnimationFrame(raf); };
  }, [src, editor, caixa]);

  // Escape fecha sem aplicar nada além do já gravado.
  useEffect(() => {
    const t = (e) => { if (e.key === 'Escape') fecharRef.current(); };
    window.addEventListener('keydown', t);
    return () => window.removeEventListener('keydown', t);
  }, []);

  const larguraMaxima = () => Math.max(MIN, (editor?.root?.clientWidth || 800) - 2);

  // Tamanho via ATRIBUTOS nativos (width/height) — o Quill entende esses
  // formatos no modelo, então o ajuste sobrevive a digitar, salvar e
  // reabrir. A altura vai também em estilo inline porque o height:auto do
  // preflight do Tailwind venceria o atributo sozinho na renderização.
  const aplicarTamanho = (img, w, h, alturaExplicita) => {
    const nw = Math.round(Math.max(MIN, Math.min(w, larguraMaxima())));
    img.setAttribute('width', String(nw));
    img.setAttribute('data-tam', `${nw}px`);
    img.style.removeProperty('width');
    if (alturaExplicita) {
      const nh = Math.round(Math.max(MIN, Math.min(h, ALTURA_MAX)));
      img.setAttribute('height', String(nh));
      img.style.height = `${nh}px`;
    } else {
      img.removeAttribute('height');
      img.style.removeProperty('height');
    }
  };

  const soltarGesto = () => {
    const g = gesto.current;
    gesto.current = null;
    if (g?.limpar) {
      window.removeEventListener('pointermove', g.mv);
      g.limpar();
    }
  };

  // ---- Redimensionar pelas alças ----
  const iniciarAjuste = (e, tipo) => {
    e.preventDefault();
    e.stopPropagation();
    const img = localizar();
    if (!img || gesto.current) return;
    const r = img.getBoundingClientRect();
    const g = {
      modo: 'tam', tipo,
      x: e.clientX, y: e.clientY,
      w: r.width, h: r.height,
      mv: null, limpar: null,
    };
    g.mv = (ev) => {
      const dx = ev.clientX - g.x;
      const dy = ev.clientY - g.y;
      const atual = localizar();
      if (!atual) return;
      const ehCanto = tipo.length === 2;
      const mexeH = tipo.includes('n') || tipo.includes('s');
      if (ehCanto) {
        // Cantos: proporcional. Sem altura manual, só a largura basta (a
        // altura acompanha sozinha e a foto segue responsiva); com altura
        // manual, escala as duas para manter o formato escolhido.
        const base = tipo.includes('e') ? g.w + dx : g.w - dx;
        const razao = g.h / Math.max(1, g.w);
        const temAltura = atual.hasAttribute('height');
        aplicarTamanho(atual, base, base * razao, temAltura);
      } else if (mexeH) {
        // Topo/base: só altura (esticar vertical, como no Photoshop livre).
        const base = tipo.includes('s') ? g.h + dy : g.h - dy;
        const wNow = atual.getBoundingClientRect().width;
        aplicarTamanho(atual, wNow, base, true);
      } else {
        // Laterais: só largura (altura acompanha sozinha, salvo altura manual).
        const base = tipo.includes('e') ? g.w + dx : g.w - dx;
        const temAltura = atual.hasAttribute('height');
        const hNow = atual.getBoundingClientRect().height;
        aplicarTamanho(atual, base, hNow, temAltura);
      }
      medirRef.current();
    };
    const up = () => {
      window.removeEventListener('pointermove', g.mv);
      gesto.current = null;
      mudarRef.current();
      medirRef.current();
    };
    gesto.current = g;
    window.addEventListener('pointermove', g.mv);
    window.addEventListener('pointerup', up, { once: true });
  };

  // ---- Arrastar a foto para outro ponto do texto ----
  const linhaSoltura = useRef(null);
  const fantasma = useRef(null);
  const raizRef = useRef(null);
  // A moldura some durante o arrasto para não tampar o ponto de soltura.
  const esconderMoldura = (esconder) => {
    if (raizRef.current) raizRef.current.style.display = esconder ? 'none' : '';
  };

  // Marcador de soltura no caret exato (linha vertical na posição precisa
  // onde a foto vai entrar), em vez de barra de largura total.
  const mostrarLinha = (x, y) => {
    const raiz = editor?.root;
    const faixa = faixaNoPonto(x, y);
    if (!raiz || !faixa || !raiz.contains(faixa.startContainer)) {
      if (linhaSoltura.current) linhaSoltura.current.style.display = 'none';
      return;
    }
    const ret = faixa.getClientRects()?.[0];
    let el = linhaSoltura.current;
    if (!el) {
      el = document.createElement('div');
      el.style.cssText = 'position:fixed;z-index:9999;width:3px;border-radius:2px;background:var(--primary,#d97706);pointer-events:none;display:none;box-shadow:0 0 0 1px rgba(255,255,255,.7);';
      document.body.appendChild(el);
      linhaSoltura.current = el;
    }
    el.style.display = 'block';
    if (ret && ret.height) {
      el.style.left = `${ret.left - 1}px`;
      el.style.top = `${ret.top}px`;
      el.style.height = `${ret.height}px`;
    } else {
      el.style.left = `${x - 1}px`;
      el.style.top = `${y - 11}px`;
      el.style.height = '22px';
    }
  };

  const esconderArrasto = () => {
    if (fantasma.current) { fantasma.current.remove(); fantasma.current = null; }
    if (linhaSoltura.current) { linhaSoltura.current.remove(); linhaSoltura.current = null; }
  };

  const concluirMover = (x, y, img) => {
    const raiz = editor?.root;
    if (!raiz) return;
    const destinoBruto = indiceDoPonto(raiz, x, y);
    const origem = varrer(raiz, 0, img, 0);
    if (destinoBruto === null || destinoBruto === undefined || origem === null || origem === undefined) return;
    let destino = destinoBruto;
    if (destino > origem) destino -= 1; // a remoção desloca o que vem depois
    if (destino === origem) return;
    const estilo = img.style.cssText;
    const extras = ['width', 'height', 'data-tam', 'data-ali', 'alt'].map((a) => [a, img.getAttribute(a)]);
    editor.deleteText(origem, 1);
    editor.insertEmbed(destino, 'image', src);
    const nova = localizar();
    if (nova) {
      nova.style.cssText = estilo;
      extras.forEach(([a, v]) => { if (v !== null && v !== undefined) nova.setAttribute(a, v); });
      nova.setAttribute('draggable', 'false');
    }
    try { editor.setSelection(destino + 1, 0, 'silent'); } catch { /* sem cursor: ok */ }
    mudarRef.current();
  };

  const iniciarMover = (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault();
    const img = localizar();
    if (!img || gesto.current) return;
    const r = img.getBoundingClientRect();
    const g = {
      modo: 'mover', ativo: false,
      x0: e.clientX, y0: e.clientY,
      dx: e.clientX - r.left, dy: e.clientY - r.top,
      img, mv: null, limpar: esconderArrasto,
    };
    g.mv = (ev) => {
      if (!g.ativo) {
        if (Math.hypot(ev.clientX - g.x0, ev.clientY - g.y0) < 4) return;
        g.ativo = true; // passou do limiar: virou arrasto de verdade
        esconderMoldura(true);
        const atual = localizar();
        if (atual) atual.style.opacity = '0.35';
        const fan = document.createElement('img');
        fan.src = src;
        fan.style.cssText = `position:fixed;z-index:9999;width:${r.width}px;max-width:40vw;opacity:.85;pointer-events:none;border-radius:8px;box-shadow:0 10px 28px rgba(0,0,0,.35);`;
        document.body.appendChild(fan);
        fantasma.current = fan;
      }
      if (fantasma.current) {
        fantasma.current.style.left = `${ev.clientX - g.dx}px`;
        fantasma.current.style.top = `${ev.clientY - g.dy}px`;
      }
      mostrarLinha(ev.clientX, ev.clientY);
    };
    const up = (ev) => {
      window.removeEventListener('pointermove', g.mv);
      gesto.current = null;
      esconderMoldura(false);
      const estavaAtivo = g.ativo;
      const alvo = localizar();
      if (alvo) alvo.style.removeProperty('opacity');
      esconderArrasto();
      if (estavaAtivo && alvo) concluirMover(ev.clientX, ev.clientY, alvo);
      else medirRef.current();
    };
    gesto.current = g;
    window.addEventListener('pointermove', g.mv);
    window.addEventListener('pointerup', up, { once: true });
  };

  useEffect(() => () => {
    // Desmontou com gesto no meio (trocou de tela): limpa rastro.
    soltarGesto();
    esconderArrasto();
    esconderMoldura(false);
  }, []);

  if (!quadro || !editor || !caixa) return null;
  const acima = quadro.y >= 52;
  const barraTop = acima ? quadro.y - 46 : quadro.y + quadro.h + 8;

  return (
    <div ref={raizRef} className="absolute inset-0 z-20 pointer-events-none" aria-hidden={false}>
      {/* Moldura de seleção sobre a foto: arrastar o corpo move a foto */}
      <div
        className="absolute pointer-events-auto rounded-[2px]"
        style={{
          left: quadro.x, top: quadro.y, width: quadro.w, height: quadro.h,
          border: '2px solid var(--primary,#d97706)',
          boxShadow: '0 0 0 1px rgba(255,255,255,.65)',
          cursor: 'move', touchAction: 'none',
        }}
        onPointerDown={iniciarMover}
        title="Arrastar para mover a foto no texto"
      >
        {ALCAS.map((a) => (
          <span
            key={a.t}
            onPointerDown={(e) => iniciarAjuste(e, a.t)}
            className="absolute w-4 h-4 bg-white border-2 rounded-[4px] shadow"
            style={{
              left: a.fx * quadro.w, top: a.fy * quadro.h,
              transform: 'translate(-50%,-50%)',
              borderColor: 'var(--primary,#d97706)',
              cursor: a.cursor, touchAction: 'none',
            }}
          />
        ))}
      </div>
      {/* Mini barra: tamanho atual + posição no texto + remover */}
      <div
        className="absolute pointer-events-auto flex items-center gap-1 bg-white border border-stone-200 rounded-xl shadow-xl px-2 py-1.5 text-slate-800"
        style={{ top: barraTop, left: Math.max(0, Math.min(quadro.x, 9999)) }}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <span className="text-[11px] font-bold tabular-nums text-stone-500 px-1 whitespace-nowrap">
          {Math.round(quadro.w)} px
        </span>
        <span className="w-px self-stretch bg-stone-200" />
        {[
          { rotulo: 'Esquerda', valor: 'esq', Icone: AlignLeft },
          { rotulo: 'Centro', valor: 'centro', Icone: AlignCenter },
          { rotulo: 'Direita', valor: 'dir', Icone: AlignRight },
        ].map((op) => (
          <button
            key={op.valor}
            type="button"
            onClick={() => onAlinhar(op.valor)}
            title={`Foto à ${op.rotulo.toLowerCase()}${op.valor === 'centro' ? ' (texto não contorna)' : ' (texto contorna a foto)'}`}
            className={`p-1.5 rounded-lg ${ali === op.valor ? 'bg-amber-600 text-white' : 'hover:bg-stone-100 text-stone-600'}`}
          >
            <op.Icone size={15} />
          </button>
        ))}
        <span className="w-px self-stretch bg-stone-200" />
        <button
          type="button"
          onClick={onRemover}
          title="Remover foto"
          className="p-1.5 rounded-lg text-red-600 hover:bg-red-50"
        >
          <Trash2 size={15} />
        </button>
      </div>
    </div>
  );
}
