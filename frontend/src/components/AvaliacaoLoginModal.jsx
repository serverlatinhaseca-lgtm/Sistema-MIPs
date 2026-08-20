import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { ClipboardCheck, X } from "lucide-react";

export default function AvaliacaoLoginModal() {
  const [aberto, setAberto] = useState(false);
  const [quantidade, setQuantidade] = useState(0);
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const perfil = user.perfil?.toLowerCase();

  useEffect(() => {
    const chaveVisto = `avaliacao_modal_visto_${user.id}`;
    if (!['leitor','editor'].includes(perfil) || localStorage.getItem(chaveVisto) === '1' || sessionStorage.getItem('mostrar_avaliacoes_modal') !== '1') return;
    sessionStorage.removeItem('mostrar_avaliacoes_modal');
    localStorage.setItem(chaveVisto, '1');
    axios.get(`http://${window.location.hostname}:7001/api/minhas-avaliacoes`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } })
      .then(r => { setQuantidade(r.data.length); setAberto(true); })
      .catch(() => setAberto(true));
  }, [perfil, user.id]);

  if (!aberto) return null;
  const destino = perfil === 'leitor' ? '/avaliacoes' : '/meu-desempenho';
  return <div className="fixed inset-0 z-[100] bg-black/60 grid place-items-center p-4"><section className="bg-white text-stone-800 rounded-3xl shadow-2xl max-w-md w-full overflow-hidden"><div className="h-2 bg-[#ff8d2f]"/><div className="p-7 relative"><button onClick={()=>setAberto(false)} className="absolute right-5 top-5 text-stone-400"><X/></button><div className="w-14 h-14 rounded-2xl bg-[#fff1e6] text-[#a65526] grid place-items-center mb-4"><ClipboardCheck size={28}/></div><h2 className="font-serif text-2xl font-bold text-[#a65526]">Seu desempenho</h2><p className="text-stone-600 mt-2">{quantidade ? `Você possui ${quantidade} ${quantidade===1?'avaliação publicada':'avaliações publicadas'} no seu histórico.` : 'Quando sua avaliação for concluída, ela aparecerá aqui automaticamente.'}</p><button onClick={()=>{setAberto(false);navigate(destino);}} className="w-full mt-6 bg-[#a65526] hover:bg-[#87431e] text-white py-3 rounded-xl font-bold">{quantidade ? 'Ver minhas avaliações' : 'Abrir meu desempenho'}</button></div></section></div>;
}
