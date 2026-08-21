import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AlertTriangle, BookOpen, Calculator, ClipboardCheck, KeyRound, LogOut, Moon, Sun } from "lucide-react";
import useBranding from "../useBranding";

export default function LeitorTopbar({ titulo }) {
  const navigate = useNavigate();
  const location = useLocation();
  const branding = useBranding();
  const [dark, setDark] = useState(document.documentElement.classList.contains("dark"));

  useEffect(() => {
    const ativo = localStorage.getItem("theme") === "dark";
    document.documentElement.classList.toggle("dark", ativo);
    setDark(ativo);
  }, []);

  const alternarTema = () => {
    const ativo = document.documentElement.classList.toggle("dark");
    setDark(ativo);
    localStorage.setItem("theme", ativo ? "dark" : "light");
  };
  const sair = () => { localStorage.removeItem("token"); localStorage.removeItem("user"); sessionStorage.clear(); navigate("/"); };
  const item = (rota, Icone, texto) => <button onClick={()=>navigate(rota)} className={`reader-nav-button ${location.pathname.startsWith(rota) ? "reader-nav-active" : ""}`} title={texto}><Icone size={18}/><span>{texto}</span></button>;

  return <header className="reader-topbar no-print">
    <div className="reader-brand">
      {branding.logo_site ? <img src={branding.logo_site} alt="Logo" /> : <div className="reader-brand-mark">M</div>}
      <div><strong>{branding.nome_site}</strong><small>{titulo}</small></div>
    </div>
    <nav className="reader-nav">
      {item("/mips", BookOpen, "MIPs")}
      {item("/receitas", Calculator, "Receitas")}
      {item("/avaliacoes", ClipboardCheck, "Avaliações")}
      {item("/reclamacoes", AlertTriangle, "Reclamações")}
      {item("/alterar-senha", KeyRound, "Senha")}
      <button onClick={alternarTema} className="reader-nav-button" title={dark?"Modo claro":"Modo noturno"}>{dark?<Sun size={18}/>:<Moon size={18}/>}<span>{dark?"Claro":"Noturno"}</span></button>
      <button onClick={sair} className="reader-nav-button reader-logout" title="Sair"><LogOut size={18}/><span>Sair</span></button>
    </nav>
  </header>;
}
