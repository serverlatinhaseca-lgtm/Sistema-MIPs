import { useState, useRef, useMemo, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import { Save, ArrowLeft } from 'lucide-react';

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

  useEffect(() => {
    if (!id) return;
    axios.get(`http://${window.location.hostname}:7001/api/mips/${id}`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } })
      .then(({data}) => { setFormData({codigo:data.codigo,titulo:data.titulo,resumo:data.resumo||'',objetivo:data.objetivo||'',status:data.status}); setConteudo(data.conteudo||''); })
      .catch(() => setErro('Não foi possível carregar a MIP para edição.'));
  }, [id]);

  const imageHandler = () => {
    const input = document.createElement('input');
    input.setAttribute('type', 'file');
    input.setAttribute('accept', 'image/*');
    input.click();

    input.onchange = async () => {
      const file = input.files[0];
      if (!file) return;

      const data = new FormData();
      data.append('image', file);

      try {
        const token = localStorage.getItem('token');
        // Usa a porta 7001 padrão do backend
        const currentHost = window.location.hostname;
        const res = await axios.post(`http://${currentHost}:7001/api/upload`, data, {
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
      await axios[id ? 'put' : 'post'](`http://${window.location.hostname}:7001/api/mips${id ? `/${id}` : ''}`, { ...formData, conteudo }, {
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
              <ReactQuill ref={quillRef} theme="snow" value={conteudo} onChange={setConteudo} modules={modules} className="h-64 mb-12" />
            </div>
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
