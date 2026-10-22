import { useState, useRef, useMemo, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import { Save, ArrowLeft } from 'lucide-react';
import TransformFoto from '../components/TransformFoto';
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
  const quillRef = useRef(null);

  // Transform direto nas fotos do texto: clicar numa foto abre a caixa de
  // seleção com alças (cantos = proporcional, laterais = largura, topo/base
  // = altura) e arrastar o corpo move a foto no texto. O ajuste é gravado
  // como estilo inline + data-tam/data-ali no <img>, então vale no editor e
  // na visualização (DetalheMIP) — e sobrevive a salvar/editar, pois o HTML
  // é o que vai ao banco.
  const [fotoSel, setFotoSel] = useState(null); // {src, ali}
  const fotoSrc = useRef(null);
  const editorBox = useRef(null);

  const lerAli = (img) => {
    const fl = img.style.cssFloat || img.style.float || '';
    return fl === 'left' ? 'esq' : fl === 'right' ? 'dir' : 'centro';
  };

  // Re-localiza a foto pelo src a cada interação (o ReactQuill pode trocar o
  // nó do DOM ao sincronizar o valor — por src o transform nunca perde a foto).
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

  // Sincroniza o estado com o HTML real do editor. Lê o DOM ao vivo (que
  // inclui os ajustes diretos nas fotos) e alinha o cache interno do
  // ReactQuill com esse mesmo HTML — sem isso, ele recria o conteúdo a
  // partir do modelo e apaga os ajustes (era por isso que "não aplicava").
  const syncDoModelo = () => {
    const compQ = quillRef.current;
    const quill = compQ?.getEditor();
    if (!quill) return;
    const html = quill.root.innerHTML;
    try { compQ.value = html; } catch { /* mantém o fluxo */ }
    setConteudo(html);
  };

  // O onChange do ReactQuill entrega o HTML do modelo (sem os ajustes
  // diretos); aqui sempre vale o DOM ao vivo, que é a verdade completa.
  const aoMudarTexto = () => syncDoModelo();

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
    syncDoModelo();
    // A caixa do transform se reancora sozinha (persegue a foto pelo src).
    setFotoSel((s) => s && ({ ...s, ali }));
  };

  const removerFoto = () => {
    const img = acharFoto();
    if (img) img.remove();
    syncDoModelo();
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
        setFotoSel({ src: fotoSrc.current, ali: lerAli(alvo) });
      } else {
        fotoSrc.current = null;
        setFotoSel(null);
      }
    };
    const aoDigitar = (_d, _o, origem) => {
      // Só fecha por digitação real; atualização via transform usa origem 'api'.
      if (origem === 'user') { fotoSrc.current = null; setFotoSel(null); }
    };
    const aoRolar = () => { fotoSrc.current = null; setFotoSel(null); };
    // O arrasto da foto é manual (transform próprio): o nativo do navegador
    // só atrapalharia, então fica desligado dentro do editor.
    const aoArrastar = (e) => {
      if (e.target && e.target.tagName === 'IMG') e.preventDefault();
    };
    root.querySelectorAll('img').forEach((img) => img.setAttribute('draggable', 'false'));
    root.addEventListener('click', aoClicar);
    root.addEventListener('dragstart', aoArrastar);
    quill.on('text-change', aoDigitar);
    editorBox.current?.addEventListener('scroll', aoRolar, true);
    return () => {
      root.removeEventListener('click', aoClicar);
      root.removeEventListener('dragstart', aoArrastar);
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
      if (file) inserirImagemDireta(file);
    };
  };

  // Converte/comprime a foto (máx. 1920px, JPEG/PNG) sem perguntar nada:
  // GIF e SVG entram como estão para não quebrar animação/vetor.
  const converterFoto = (file) => new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const k = Math.min(1, 1920 / Math.max(img.naturalWidth, img.naturalHeight));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.naturalWidth * k));
        canvas.height = Math.max(1, Math.round(img.naturalHeight * k));
        const ctx = canvas.getContext('2d');
        const ehPng = file.type === 'image/png';
        if (!ehPng) { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height); }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        canvas.toBlob((blob) => {
          if (!blob) { reject(new Error('conversão')); return; }
          const semExt = String(file.name || 'foto').replace(/\.[a-z0-9]+$/i, '') || 'foto';
          resolve(new File([blob], `${semExt}.${ehPng ? 'png' : 'jpg'}`, { type: ehPng ? 'image/png' : 'image/jpeg' }));
        }, ehPng ? 'image/png' : 'image/jpeg', 0.92);
      } catch (err) {
        URL.revokeObjectURL(url);
        reject(err);
      }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('leitura')); };
    img.src = url;
  });

  // Inserção direta: sem modal de corte — o ajuste é feito depois, com as
  // alças do transform sobre a foto (a caixa já abre selecionada).
  const inserirImagemDireta = async (file) => {
    if (!file) return;
    let envio = file;
    if (!/^image\/(gif|svg)/.test(String(file.type || ''))) {
      try { envio = await converterFoto(file); } catch { envio = file; }
    }

    const data = new FormData();
    data.append('image', envio);

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
      const nova = quill.root.querySelector(`img[src="${CSS.escape(imageUrl)}"]`);
      if (nova) nova.setAttribute('draggable', 'false');
      syncDoModelo();
      setFotoSel({ src: imageUrl, ali: 'centro' });
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
      // Lê o DOM ao vivo: é a verdade completa (inclui ajustes nas fotos).
      const htmlFinal = quillRef.current?.getEditor()?.root.innerHTML ?? conteudo;
      await axios[id ? 'put' : 'post'](`${API}/api/mips${id ? `/${id}` : ''}`, { ...formData, conteudo: htmlFinal }, {
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
        <div className="flex flex-wrap justify-between items-center gap-3 mb-6">
          <button onClick={() => navigate('/dashboard')} className="flex items-center text-[var(--text-muted)] hover:text-amber-600 font-medium transition-colors">
            <ArrowLeft size={20} className="mr-2" /> Voltar
          </button>
          <h1 className="text-xl sm:text-2xl font-bold text-[var(--text-main)]">{id ? 'Editar MIP' : 'Criar Nova MIP'}</h1>
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
                <ReactQuill ref={quillRef} theme="snow" value={conteudo} onChange={aoMudarTexto} modules={modules} className="h-64 mb-12" />
                {fotoSel && (
                  <TransformFoto
                    src={fotoSel.src}
                    ali={fotoSel.ali}
                    editor={quillRef.current?.getEditor()}
                    caixa={editorBox.current}
                    onAlinhar={definirAlinhamento}
                    onRemover={removerFoto}
                    onMudar={syncDoModelo}
                    onFechar={() => { fotoSrc.current = null; setFotoSel(null); }}
                  />
                )}
              </div>
            </div>
            <p className="text-xs text-[var(--text-muted)] mt-1">Dica: clique numa foto para ajustar pelas alças, ou arraste a foto para outro ponto do texto.</p>
          </div>

          <div className="flex justify-end pt-4 border-t border-[var(--border-color)]">
            <button type="submit" className="flex items-center bg-amber-600 text-white px-6 py-3 rounded-xl hover:bg-amber-700 shadow-md font-medium transition-colors">
              <Save size={20} className="mr-2" /> {id ? 'Salvar nova versão' : 'Salvar MIP'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
