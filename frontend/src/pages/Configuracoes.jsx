import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { Image, Save } from "lucide-react";
import Sidebar from "../components/Sidebar";

export default function Configuracoes() {
  const [form, setForm] = useState({ nome_site: "Portal MIPs", logo_site: "", logo_avaliacao: "" });
  const [salvando, setSalvando] = useState(false);
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const headers = { Authorization: `Bearer ${localStorage.getItem("token")}` };
  const api = `http://${window.location.hostname}:7001/api`;

  useEffect(() => {
    if (user.perfil?.toLowerCase() !== "administrador") return navigate("/dashboard");
    axios.get(`${api}/configuracoes-portal`).then(r=>setForm(r.data));
  }, []);

  async function enviarLogo(campo, arquivo) {
    if (!arquivo) return;
    if (!arquivo.type.startsWith("image/")) return alert("Selecione uma imagem válida.");
    const dados = new FormData(); dados.append("image", arquivo);
    try {
      const r = await axios.post(`${api}/upload`, dados, { headers });
      setForm(v=>({ ...v, [campo]: r.data.url }));
    } catch (e) { alert(e.response?.data?.error || "Erro ao enviar imagem."); }
  }

  async function salvar(e) {
    e.preventDefault(); setSalvando(true);
    try {
      const r = await axios.put(`${api}/configuracoes-portal`, form, { headers });
      localStorage.setItem("branding", JSON.stringify(r.data));
      document.title = r.data.nome_site;
      alert("Identidade visual atualizada.");
    } catch (e) { alert(e.response?.data?.error || "Erro ao salvar configurações."); }
    finally { setSalvando(false); }
  }

  const Logo = ({ campo, titulo, descricao }) => <div className="border border-[var(--border-color)] rounded-2xl p-4">
    <h2 className="font-bold">{titulo}</h2><p className="text-sm text-[var(--text-muted)] mb-3">{descricao}</p>
    <div className="h-28 bg-white border border-dashed border-stone-300 rounded-xl grid place-items-center overflow-hidden mb-3">{form[campo] ? <img src={form[campo]} alt={titulo} className="max-h-24 max-w-full object-contain" /> : <Image className="text-stone-400" />}</div>
    <input accept="image/png,image/jpeg,image/webp,image/svg+xml" type="file" onChange={e=>enviarLogo(campo,e.target.files?.[0])} className="block w-full text-sm" />
    {form[campo] && <button type="button" onClick={()=>setForm(v=>({...v,[campo]:""}))} className="text-red-600 text-sm font-bold mt-3">Remover logo</button>}
  </div>;

  return <div className="min-h-screen bg-[var(--bg-main)] flex"><Sidebar /><main className="flex-1 p-6 sm:p-10"><h1 className="text-3xl font-bold">Personalização do portal</h1><p className="text-[var(--text-muted)] mb-7">Altere o nome e os logos exibidos no sistema e nas avaliações.</p><form onSubmit={salvar} className="panel-card max-w-4xl space-y-6"><label className="block font-semibold">Nome do site<input required className="field" value={form.nome_site} onChange={e=>setForm({...form,nome_site:e.target.value})} /></label><div className="grid md:grid-cols-2 gap-5"><Logo campo="logo_site" titulo="Logo do site" descricao="Aparece no login e no menu lateral." /><Logo campo="logo_avaliacao" titulo="Logo da avaliação" descricao="Aparece no cabeçalho do relatório impresso." /></div><button disabled={salvando} className="bg-amber-600 text-white px-6 py-3 rounded-xl font-bold flex items-center"><Save size={18} className="mr-2" />{salvando?"Salvando...":"Salvar personalização"}</button></form></main></div>;
}
