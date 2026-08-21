import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { UserPlus, Trash2, KeyRound, Pencil, Copy, Wand2 } from "lucide-react";
import Sidebar from "../components/Sidebar";

const nomePerfil = (perfil) => ({ leitor: "Funcionário", editor: "Líder", gerente: "Gerente", administrador: "Administrador" }[String(perfil || "").toLowerCase()] || perfil);

export default function Usuarios() {
  const [usuarios, setUsuarios] = useState([]);
  const [modelos, setModelos] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [perfil, setPerfil] = useState("Leitor");
  const [liderId, setLiderId] = useState("");
  const [modeloId, setModeloId] = useState("");
  const [categoriaId, setCategoriaId] = useState("");
  const [mostrarModal, setMostrarModal] = useState(false);
  const [editandoUsuarioId, setEditandoUsuarioId] = useState(null);
  const [usuarioSenha, setUsuarioSenha] = useState(null);
  const [senhaTemporaria, setSenhaTemporaria] = useState("");
  const [senhaRedefinida, setSenhaRedefinida] = useState(false);

  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const host = window.location.hostname;

  const carregarUsuarios = async () => {
    try {
      const res = await axios.get(`http://${host}:7001/api/usuarios`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      setUsuarios(res.data);
      const modelosRes = await axios.get(
        `http://${host}:7001/api/modelos-avaliacao`,
        {
          headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
        },
      );
      setModelos(modelosRes.data);
      const categoriasRes = await axios.get(`http://${host}:7001/api/categorias-acesso`, { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } });
      setCategorias(categoriasRes.data);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (user.perfil !== "Administrador") {
      navigate("/dashboard");
      return;
    }
    carregarUsuarios();
  }, []);

  const handleCriar = async (e) => {
    e.preventDefault();
    try {
      await axios[editandoUsuarioId ? "put" : "post"](
        `http://${host}:7001/api/usuarios${editandoUsuarioId ? `/${editandoUsuarioId}` : ""}`,
        {
          nome,
          email,
          ...(editandoUsuarioId ? {} : { senha }),
          perfil,
          lider_id: ["Leitor", "Editor"].includes(perfil) ? Number(liderId) : null,
          modelo_avaliacao_id: modeloId ? Number(modeloId) : null,
          categoria_acesso_id: categoriaId ? Number(categoriaId) : null,
        },
        {
          headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
        },
      );
      setMostrarModal(false);
      setNome("");
      setEmail("");
      setSenha("");
      setPerfil("Leitor");
      setLiderId("");
      setModeloId("");
      setCategoriaId("");
      setEditandoUsuarioId(null);
      carregarUsuarios();
    } catch (err) {
      alert(err.response?.data?.error || "Erro ao criar usuário.");
    }
  };

  const abrirNovo = () => { setEditandoUsuarioId(null);setNome("");setEmail("");setSenha("");setPerfil("Leitor");setLiderId("");setModeloId("");setCategoriaId("");setMostrarModal(true); };
  const abrirEdicao = (u) => { setEditandoUsuarioId(u.id);setNome(u.nome||"");setEmail(u.email||"");setSenha("");setPerfil(u.perfil||"Leitor");setLiderId(String(u.lider_id||""));setModeloId(String(u.modelo_avaliacao_id||""));setCategoriaId(String(u.categoria_acesso_id||""));setMostrarModal(true); };

  const handleExcluir = async (id) => {
    if (!confirm("Deseja realmente excluir este usuário?")) return;
    try {
      await axios.delete(`http://${host}:7001/api/usuarios/${id}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      carregarUsuarios();
    } catch (err) {
      alert(err.response?.data?.error || "Erro ao excluir usuário.");
    }
  };

  const redefinirSenha = async (e) => {
    e.preventDefault();
    try {
      await axios.put(`http://${host}:7001/api/usuarios/${usuarioSenha.id}/redefinir-senha`, { senha_temporaria: senhaTemporaria }, { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } });
      setSenhaRedefinida(true); carregarUsuarios();
    } catch (err) { alert(err.response?.data?.error || "Erro ao redefinir senha."); }
  };

  return (
    <div className="min-h-screen bg-[var(--bg-main)] text-[var(--text-main)] flex">
      <Sidebar />

      <main className="flex-1 p-6 sm:p-10">
        <header className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold">Gerenciamento de Usuários</h1>
            <p className="text-[var(--text-muted)] text-sm">
              Controle de acessos e permissões do sistema.
            </p>
          </div>
          <button
            onClick={abrirNovo}
            className="flex items-center bg-[var(--primary)] text-white px-5 py-2.5 rounded-xl hover:bg-[var(--primary-hover)] font-medium transition-colors shadow-md"
          >
            <UserPlus size={20} className="mr-2" /> Novo Usuário
          </button>
        </header>

        {mostrarModal && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
            <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl p-6 w-full max-w-md shadow-xl">
              <h3 className="text-xl font-bold mb-4">{editandoUsuarioId ? "Editar usuário" : "Cadastrar novo usuário"}</h3>
              <form onSubmit={handleCriar} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1 text-[var(--text-muted)]">
                    Nome
                  </label>
                  <input
                    required
                    type="text"
                    className="w-full p-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-main)] text-[var(--text-main)] outline-none focus:ring-2 focus:ring-[var(--primary)]"
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                    placeholder="Nome completo"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 text-[var(--text-muted)]">
                    Usuário de Acesso (Login)
                  </label>
                  <input
                    required
                    type="text"
                    className="w-full p-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-main)] text-[var(--text-main)] outline-none focus:ring-2 focus:ring-[var(--primary)]"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="ex: joao.silva"
                  />
                </div>
                {!editandoUsuarioId && <div>
                  <label className="block text-sm font-medium mb-1 text-[var(--text-muted)]">
                    Senha Temporária
                  </label>
                  <input
                    required
                    type="password"
                    className="w-full p-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-main)] text-[var(--text-main)] outline-none focus:ring-2 focus:ring-[var(--primary)]"
                    value={senha}
                    onChange={(e) => setSenha(e.target.value)}
                    placeholder="******"
                  />
                </div>}
                <div>
                  <label className="block text-sm font-medium mb-1 text-[var(--text-muted)]">
                    Perfil de Permissão
                  </label>
                  <select
                    className="w-full p-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-main)] text-[var(--text-main)] outline-none focus:ring-2 focus:ring-[var(--primary)]"
                    value={perfil}
                    onChange={(e) => setPerfil(e.target.value)}
                  >
                    <option value="Leitor">Funcionário (consulta e recebe avaliações)</option>
                    <option value="Editor">Líder (MIPs e sua equipe)</option>
                    <option value="Gerente">Gerente (acesso a todas as avaliações)</option>
                    <option value="Administrador">
                      Administrador (Acesso Total)
                    </option>
                  </select>
                </div>
                {["Leitor", "Editor"].includes(perfil) && (
                  <div>
                    <label className="block text-sm font-medium mb-1 text-[var(--text-muted)]">
                      Responsável pela avaliação
                    </label>
                    <select
                      required
                      value={liderId}
                      onChange={(e) => setLiderId(e.target.value)}
                      className="w-full p-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-main)] text-[var(--text-main)]"
                    >
                      <option value="">{perfil === "Leitor" ? "Selecione um Líder" : perfil === "Editor" ? "Selecione um Gerente ou Administrador" : "Selecione um Administrador"}</option>
                      {usuarios
                        .filter((u) => {
                          const p = u.perfil?.toLowerCase();
                          const permitido = perfil === "Leitor" ? p === "editor" : perfil === "Editor" ? ["gerente","administrador"].includes(p) : p === "administrador";
                          return permitido && u.id !== editandoUsuarioId;
                        })
                        .map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.nome}
                          </option>
                        ))}
                    </select>
                  </div>
                )}
                {["Leitor", "Editor"].includes(perfil) && <div>
                  <label className="block text-sm font-medium mb-1 text-[var(--text-muted)]">
                    Função / modelo de avaliação
                  </label>
                  <select
                    required={["Leitor", "Editor"].includes(perfil)}
                    value={modeloId}
                    onChange={(e) => setModeloId(e.target.value)}
                    className="w-full p-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-main)] text-[var(--text-main)]"
                  >
                    <option value="">Selecione o modelo</option>
                    {modelos.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.nome}
                      </option>
                    ))}
                  </select>
                </div>}
                <div><label className="block text-sm font-medium mb-1 text-[var(--text-muted)]">Categoria adicional de acesso</label><select value={categoriaId} onChange={e=>setCategoriaId(e.target.value)} className="w-full p-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-main)] text-[var(--text-main)]"><option value="">Somente permissões do perfil</option>{categorias.map(c=><option key={c.id} value={c.id}>{c.nome}</option>)}</select><p className="text-xs text-[var(--text-muted)] mt-1">Categorias são criadas na Central de configurações.</p></div>
                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setMostrarModal(false)}
                    className="flex-1 bg-[var(--bg-main)] border border-[var(--border-color)] hover:opacity-80 p-3 rounded-xl font-medium transition-opacity"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="flex-1 bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white p-3 rounded-xl font-medium transition-colors"
                  >
                    {editandoUsuarioId ? "Salvar alterações" : "Salvar"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {usuarioSenha && <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50"><div className="panel-card w-full max-w-md"><h3 className="text-xl font-bold">Redefinir senha de {usuarioSenha.nome}</h3><p className="text-sm text-[var(--text-muted)] mt-1 mb-4">A senha pessoal não pode ser recuperada. Defina uma senha temporária visível para entregar ao usuário; ele deverá trocá-la no próximo acesso.</p><form onSubmit={redefinirSenha} className="space-y-4"><label className="block text-sm font-semibold">Senha temporária<div className="flex gap-2"><input required minLength="6" type="text" className="field" value={senhaTemporaria} onChange={e=>{setSenhaTemporaria(e.target.value);setSenhaRedefinida(false);}} /><button type="button" title="Gerar senha" onClick={()=>{setSenhaTemporaria(`Nova${Math.random().toString(36).slice(2,8)}!`);setSenhaRedefinida(false);}} className="mt-1.5 px-3 border border-[var(--border-color)] rounded-xl"><Wand2 size={18}/></button><button type="button" title="Copiar senha" onClick={()=>navigator.clipboard?.writeText(senhaTemporaria)} className="mt-1.5 px-3 border border-[var(--border-color)] rounded-xl"><Copy size={18}/></button></div></label>{senhaRedefinida&&<p className="bg-emerald-50 text-emerald-800 p-3 rounded-xl text-sm font-semibold">Senha temporária salva. Copie-a antes de fechar esta janela.</p>}<div className="flex gap-3"><button type="button" onClick={()=>{setUsuarioSenha(null);setSenhaTemporaria("");setSenhaRedefinida(false);}} className="flex-1 border border-[var(--border-color)] p-3 rounded-xl">Fechar</button><button className="flex-1 bg-amber-600 text-white p-3 rounded-xl font-bold">Redefinir</button></div></form></div></div>}

        <div className="bg-[var(--bg-card)] border border-[var(--border-color)] rounded-2xl shadow-sm overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[var(--border-color)] bg-[var(--bg-main)]">
                <th className="p-4 font-bold text-[var(--text-muted)] text-sm">
                  Nome
                </th>
                <th className="p-4 font-bold text-[var(--text-muted)] text-sm">
                  Login
                </th>
                <th className="p-4 font-bold text-[var(--text-muted)] text-sm">
                  Perfil
                </th>
                <th className="p-4 font-bold text-[var(--text-muted)] text-sm">
                  Função / modelo
                </th>
                <th className="p-4 font-bold text-[var(--text-muted)] text-sm">
                  Líder
                </th>
                <th className="p-4 font-bold text-[var(--text-muted)] text-sm">
                  Modelo
                </th>
                <th className="p-4 font-bold text-[var(--text-muted)] text-sm">Categoria de acesso</th>
                <th className="p-4 font-bold text-[var(--text-muted)] text-sm text-right">
                  Ações
                </th>
              </tr>
            </thead>
            <tbody>
              {usuarios.map((u) => (
                <tr
                  key={u.id}
                  className="border-b border-[var(--border-color)]/50 hover:bg-[var(--bg-main)] transition-colors"
                >
                  <td className="p-4 font-medium">{u.nome}</td>
                  <td className="p-4 text-[var(--text-muted)]">{u.email}{u.deve_alterar_senha && <span className="block text-xs text-amber-700 font-bold mt-1">Troca de senha pendente</span>}</td>
                  <td className="p-4">
                    <span className="px-2.5 py-1 bg-[var(--primary)]/10 text-[var(--primary)] rounded-lg text-xs font-semibold">
                      {nomePerfil(u.perfil)}
                    </span>
                  </td>
                  <td className="p-4 text-[var(--text-muted)]">
                    {u.modelo_avaliacao_nome || "—"}
                  </td>
                  <td className="p-4 text-[var(--text-muted)]">{u.categoria_acesso_nome || "—"}</td>
                  <td className="p-4 text-[var(--text-muted)]">
                    {u.lider_nome || "—"}
                  </td>
                  <td className="p-4 text-[var(--text-muted)]">
                    {u.modelo_avaliacao_nome || "—"}
                  </td>
                  <td className="p-4 text-right">
                    <button title="Editar usuário" onClick={() => abrirEdicao(u)} className="p-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/30 rounded-lg transition-colors"><Pencil size={18} /></button>
                    <button title="Redefinir senha" onClick={() => {setUsuarioSenha(u);setSenhaTemporaria("");setSenhaRedefinida(false);}} className="p-2 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/30 rounded-lg transition-colors"><KeyRound size={18} /></button>
                    <button
                      onClick={() => handleExcluir(u.id)}
                      className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-colors"
                    >
                      <Trash2 size={18} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
