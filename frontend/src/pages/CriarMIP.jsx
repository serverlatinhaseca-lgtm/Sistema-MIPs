import { useState, useRef, useMemo, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import { Save, ArrowLeft, AlignLeft, AlignCenter, AlignRight, Trash2, X } from 'lucide-react';
import CropModal from '../components/CropModal';
import API from '../api';

export default function CriarMIP() {
  const navigate = useNavigate();
  const { id } = useParams();
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const [formData, setFormData] = useState({ 
    codigo: '', 
    titulo: '', 
    resumo: '', 
    objetivo: '', 
    status: 'Em Revisão' 
  });
  const [conteudo, setConteudo] = useState('');
  const [erro, setErro] = useState('');
  const [corte, setCorte] = useState(null);
  const quillRef = useRef(null);

  // Ajuste de fotos dentro do texto (29/09/2026): clicar numa foto abre um
  // painel com tamanho e posição. O ajuste é gravado como estilo inline +
  // data-tam/data-ali no <img>, então vale no editor e na visualização
  // (DetalheMIP) — e sobrevive a salvar/editar, pois o HTML é o que vai ao banco.
  const [fotoSel, setFotoSel] = useState(null); // {top, left, tam, ali}
  const fotoSrc = useRef(null);
  const editorBox = useRef(null);

  const lerFoto = (img) => {
    const w = img.style.width || '';
    const tam = ['300px', '500px', '800px', '100%'].includes(w) ? w : '';
    const fl = img.style.cssFloat || img.style.float || '';
    const ali = fl === 'left' ? 'esq' : fl === 'right' ? 'dir' : 'centro';
    return { tam, ali };
  };

  const posicionarPainel = (img) => {
    const caixa = editorBox.current?.getBoundingClientRect();
    if (!caixa) return { top: 40, left: 8 };
    const r = img.getBoundingClientRect();
    return {
      top: r.bottom - caixa.top + 6,
      left: Math.max(8, Math.min(r.left - caixa.left, caixa.width - 252)),
    };
  };

  // Re-localiza a foto pelo src a cada clique (o ReactQuill pode trocar o nó
  // do DOM ao sincronizar o valor — por src o painel nunca perde a foto).
  const acharFoto = () => {
    const quill = quillRef.current?.getEditor();
    const src = fotoSrc.current;
    if (!quill || !src) return null;
    try {
      return quill.root.querySelector(`img[src="${CSS.escape(src)}"]`);
    } catch {
      return null;
    }
  };

  const gravarFoto = () => {
    const quill = quillRef.current?.getEditor();
    if (quill) setConteudo(quill.root.innerHTML);
  };

  const definirTamanho = (tam) => {
    const img = acharFoto();
    if (!img) { setFotoSel(null); return; }
    if (!tam) { img.style.removeProperty('width'); img.removeAttribute('data-tam'); }
    else { img.style.width = tam; img.setAttribute('data-tam', tam); }
    gravarFoto();
    setFotoSel((s) => s && ({ ...s, ...posicionarPainel(img), tam }));
  };

  const definirAlinhamento = (ali) => {
    const img = acharFoto();
    if (!img) { setFotoSel(null); return; }
    img.style.removeProperty('float');
    img.style.removeProperty('margin');
    img.style.removeProperty('display');
    if (ali === 'esq') { img.style.float = 'left'; img.style.margin = '8px 16px 12px 0'; }
    else if (ali === 'dir') { img.style.float = 'right'; img.style.margin = '8px 0 12px 16px'; }
    else { img.style.display = 'block'; img.style.margin = '15px auto'; }
    img.setAttribute('data-ali', ali);
    gravarFoto();
    setFotoSel((s) => s && ({ ...s, ...posicionarPainel(img), ali }));
  };

  const removerFoto = () => {
    const img = acharFoto();
    if (img) img.remove();
    gravarFoto();
    fotoSrc.current = null;
    setFotoSel(null);
  };

  useEffect(() => {
    const quill = quillRef.current?.getEditor();
    if (!quill) return;
    const root = quill.root;
    const aoClicar = (e) => {
      const alvo = e.target;
      if (alvo && alvo.tagName === 'IMG') {
        e.stopPropagation();
        fotoSrc.current = alvo.getAttribute('src');
        setFotoSel({ ...posicionarPainel(alvo), ...lerFoto(alvo) });
      } else {
        fotoSrc.current = null;
        setFotoSel(null);
      }
    };
    const aoDigitar = (_d, _o, origem) => {
      // Só fecha por digitação real; atualização via painel usa origem 'api'.
      if (origem === 'user') { fotoSrc.current = null; setFotoSel(null); }
    };
    const aoRolar = () => { fotoSrc.current = null; setFotoSel(null); };
    root.addEventListener('click', aoClicar);
    quill.on('text-change', aoDigitar);
    editorBox.current?.addEventListener('scroll', aoRolar, true);
    return () => {
      root.removeEventListener('click', aoClicar);
      quill.off('text-change', aoDigitar);
      editorBox.current?.removeEventListener('scroll', aoRolar, true);
    };
  }, []);

  useEffect(() => {
    if (!id) return;
    axios.get(`${API}/api/mips/${id}`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } })
      .then(({data}) => { setFormData({codigo:data.codigo,titulo:data.titulo,resumo:data.resumo||'',objetivo:data.objetivo||'',status:data.status}); setConteudo(data.conteudo||''); })
      .catch(() => setErro('Não foi possível carregar a MIP para edição.'));
  }, [id]);

  const imageHandler = () => {
    const input = document.createElement('input');
    input.setAttribute('type', 'file');
    input.setAttribute('accept', 'image/*');
    input.click();

    input.onchange = () => {
      const file = input.files[0];
      if (file) setCorte(file);
    };
  };

  const inserirImagemCortada = async (file) => {
    setCorte(null);
    if (!file) return;

    const data = new FormData();
    data.append('image', file);

    try {
      const token = localStorage.getItem('token');
      const res = await axios.post(`${API}/api/upload`, data, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'multipart/form-data'
        }
      });

      const imageUrl = res.data.url;
      const quill = quillRef.current.getEditor();
      const range = quill.getSelection(true);
      quill.insertEmbed(range.index, 'image', imageUrl);
    } catch (err) {
      alert('Erro ao enviar imagem para o servidor.');
    }
  };

  const modules = useMemo(() => {
    return {
      toolbar: {
        container: [
          [{ 'header': [1, 2, 3, false] }],
          ['bold', 'italic', 'underline', 'strike'],
          [{'list': 'ordered'}, {'list': 'bullet'}],
          ['link', 'image', 'video'],
          ['clean']
        ],
        handlers: {
          image: imageHandler
        }
      }
    };
  }, []);

  const handleSalvar = async (e) => {
    e.preventDefault();
    setErro('');

    if (formData.codigo.length > 20) {
      setErro('O código da MIP deve ter no máximo 20 caracteres.');
      return;
    }

    try {
      const token = localStorage.getItem('token');
      await axios[id ? 'put' : 'post'](`${API}/api/mips${id ? `/${id}` : ''}`, { ...formData, conteudo }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      navigate('/mips');
    } catch (err) {
      setErro(err.response?.data?.error || 'Erro ao salvar a MIP.');
    }
  };

  return (
    <div className="min-h-screen bg-[var(--bg-main)] p-4 sm:p-8">
      <div className="max-w-4xl mx-auto bg-[var(--bg-card)] border border-[var(--border-color)] p-6 sm:p-10 rounded-2xl shadow-sm">
        <div className="flex justify-between items-center mb-6">
          <button onClick={() => navigate('/dashboard')} className="flex items-center text-[var(--text-muted)] hover:text-amber-600 font-medium transition-colors">
            <ArrowLeft size={20} className="mr-2" /> Voltar
          </button>
          <h1 className="text-2xl font-bold text-[var(--text-main)]">{id ? 'Editar MIP' : 'Criar Nova MIP'}</h1>
        </div>

        {erro && <div className="mb-6 p-4 bg-red-100 dark:bg-red-950/30 text-red-700 dark:text-red-400 rounded-xl text-sm leading-relaxed border border-red-200 dark:border-red-900">{erro}</div>}

        <form onSubmit={handleSalvar} className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-[var(--text-muted)] mb-1">Código Curto (Máx. 20 caracteres)</label>
              <input type="text" maxLength="20" required placeholder="MIP-01" className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-main)] text-[var(--text-main)] p-3 outline-none" value={formData.codigo} onChange={(e) => setFormData({...formData, codigo: e.target.value})} />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--text-muted)] mb-1">Status Inicial</label>
              <select disabled={Boolean(id)} className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-main)] text-[var(--text-main)] p-3 outline-none disabled:opacity-60" value={id ? 'Em Revisão' : formData.status} onChange={(e) => setFormData({...formData, status: e.target.value})}>
                <option value="Em Revisão">Em Revisão (Aguardando Aprovação)</option>
                <option value="Rascunho">Rascunho</option>
                {user.perfil === 'Administrador' && <option value="Publicado">Publicado Diretamente</option>}
              </select>
              {id && <p className="text-xs text-amber-700 mt-1 font-semibold">Ao salvar uma edição, a MIP volta para aprovação do Administrador.</p>}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--text-muted)] mb-1">Título do Processo / Receita</label>
            <input type="text" required className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-main)] text-[var(--text-main)] p-3 outline-none" value={formData.titulo} onChange={(e) => setFormData({...formData, titulo: e.target.value})} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-[var(--text-muted)] mb-1">Resumo Breve</label>
              <textarea rows="3" className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-main)] text-[var(--text-main)] p-3 outline-none" value={formData.resumo} onChange={(e) => setFormData({...formData, resumo: e.target.value})} />
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--text-muted)] mb-1">Objetivo</label>
              <textarea rows="3" className="w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-main)] text-[var(--text-main)] p-3 outline-none" value={formData.objetivo} onChange={(e) => setFormData({...formData, objetivo: e.target.value})} />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--text-muted)] mb-2">Conteúdo Principal (Passo a Passo com Fotos)</label>
            <div className="bg-white text-slate-800 rounded-xl border border-[var(--border-color)]">
              <div ref={editorBox} className="relative">
                <ReactQuill ref={quillRef} theme="snow" value={conteudo} onChange={setConteudo} modules={modules} className="h-64 mb-12" />
                {fotoSel && (
                  <div className="absolute z-20 w-60 max-w-[calc(100%-16px)] bg-white border border-stone-200 rounded-xl shadow-xl p-3 text-slate-800" style={{ top: fotoSel.top, left: fotoSel.left }} onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-bold">Foto selecionada</p>
                      <button type="button" onClick={() => { fotoSrc.current = null; setFotoSel(null); }} className="p-1 rounded-lg hover:bg-stone-100" title="Fechar"><X size={15} /></button>
                    </div>
                    <p className="text-[11px] font-semibold text-stone-500 mb-1">Tamanho</p>
                    <div className="flex flex-wrap gap-1 mb-2">
                      {[
                        { rotulo: 'Original', valor: '' },
                        { rotulo: 'P', valor: '300px' },
                        { rotulo: 'M', valor: '500px' },
                        { rotulo: 'G', valor: '800px' },
                        { rotulo: 'Total', valor: '100%' },
                      ].map((op) => (
                        <button key={op.rotulo} type="button" onClick={() => definirTamanho(op.valor)} title={op.valor ? `Largura de ${op.valor}` : 'Tamanho original da foto'}
                          className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border ${fotoSel.tam === op.valor ? 'bg-amber-600 text-white border-amber-600' : 'border-stone-200 hover:bg-stone-100'}`}>
                          {op.rotulo}
                        </button>
                      ))}
                    </div>
                    <p className="text-[11px] font-semibold text-stone-500 mb-1">Posição no texto</p>
                    <div className="flex gap-1 mb-2">
                      {[
                        { rotulo: 'Esquerda', valor: 'esq', Icone: AlignLeft },
                        { rotulo: 'Centro', valor: 'centro', Icone: AlignCenter },
                        { rotulo: 'Direita', valor: 'dir', Icone: AlignRight },
                      ].map((op) => (
                        <button key={op.valor} type="button" onClick={() => definirAlinhamento(op.valor)} title={`Foto à ${op.rotulo.toLowerCase()}${op.valor === 'centro' ? ' (texto não contorna)' : ' (texto contorna a foto)'}`}
                          className={`flex-1 flex items-center justify-center gap-1 px-1 py-1.5 rounded-lg text-xs font-bold border ${fotoSel.ali === op.valor ? 'bg-amber-600 text-white border-amber-600' : 'border-stone-200 hover:bg-stone-100'}`}>
                          <op.Icone size={14} />{op.rotulo}
                        </button>
                      ))}
                    </div>
                    <button type="button" onClick={removerFoto} className="w-full flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-xs font-bold text-red-700 border border-red-200 hover:bg-red-50">
                      <Trash2 size={14} />Remover foto
                    </button>
                  </div>
                )}
              </div>
            </div>
            <p className="text-xs text-[var(--text-muted)] mt-1">Dica: clique em uma foto do texto para ajustar tamanho e posição.</p>
          </div>

          <div className="flex justify-end pt-4 border-t border-[var(--border-color)]">
            <button type="submit" className="flex items-center bg-amber-600 text-white px-6 py-3 rounded-xl hover:bg-amber-700 shadow-md font-medium transition-colors">
              <Save size={20} className="mr-2" /> {id ? 'Salvar nova versão' : 'Salvar MIP'}
            </button>
          </div>
        </form>
      </div>
      {corte && <CropModal arquivo={corte} aspecto={null} onFechar={() => setCorte(null)} onConfirmar={inserirImagemCortada} />}
    </div>
  );
}
