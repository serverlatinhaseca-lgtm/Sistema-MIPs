import { useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { KeyRound } from "lucide-react";
import Sidebar from "../components/Sidebar";
import LeitorTopbar from "../components/LeitorTopbar";

export default function AlterarSenha() {
  const [senhaAtual, setSenhaAtual] = useState("");
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const obrigatoria = Boolean(user.deve_alterar_senha);
  const leitor = user.perfil?.toLowerCase() === "leitor";

  async function salvar(e) {
    e.preventDefault();
    if (novaSenha !== confirmacao) return setErro("A confirmação não corresponde à nova senha.");
    setSalvando(true); setErro("");
    try {
      await axios.put(`http://${window.location.hostname}:7001/api/usuarios/me/senha`, { senha_atual: senhaAtual, nova_senha: novaSenha }, { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } });
      const atualizado = { ...user, deve_alterar_senha: false };
      localStorage.setItem("user", JSON.stringify(atualizado));
      alert("Senha alterada com sucesso.");
      navigate(user.perfil?.toLowerCase() === "leitor" ? "/avaliacoes" : "/dashboard");
    } catch (e) { setErro(e.response?.data?.error || "Erro ao alterar senha."); }
    finally { setSalvando(false); }
  }

  return <div className={`min-h-screen bg-[var(--bg-main)] ${leitor ? "" : "flex"}`}>
    {!obrigatoria && (leitor ? <LeitorTopbar titulo="Segurança da conta" /> : <Sidebar />)}
    <main className="flex-1 grid place-items-center p-4">
      <section className="panel-card w-full max-w-md">
        <KeyRound size={36} className="text-amber-600 mb-3" />
        <h1 className="text-2xl font-bold">{obrigatoria ? "Crie sua senha pessoal" : "Alterar minha senha"}</h1>
        <p className="text-sm text-[var(--text-muted)] mt-1 mb-5">{obrigatoria ? "Digite a senha temporária recebida e escolha uma nova senha." : "Confirme sua senha atual antes de definir uma nova."}</p>
        <form onSubmit={salvar} className="space-y-4">
          <label className="block text-sm font-semibold">Senha atual ou temporária<input required type="password" className="field" value={senhaAtual} onChange={e=>setSenhaAtual(e.target.value)} /></label>
          <label className="block text-sm font-semibold">Nova senha<input required minLength="6" type="password" className="field" value={novaSenha} onChange={e=>setNovaSenha(e.target.value)} /></label>
          <label className="block text-sm font-semibold">Confirmar nova senha<input required minLength="6" type="password" className="field" value={confirmacao} onChange={e=>setConfirmacao(e.target.value)} /></label>
          {erro && <p className="text-red-600 text-sm">{erro}</p>}
          <button disabled={salvando} className="w-full bg-amber-600 text-white p-3 rounded-xl font-bold">{salvando ? "Salvando..." : "Alterar senha"}</button>
        </form>
      </section>
    </main>
  </div>;
}
