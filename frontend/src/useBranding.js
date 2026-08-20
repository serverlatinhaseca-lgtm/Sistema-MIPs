import { useEffect, useState } from "react";
import axios from "axios";

const padrao = { nome_site: "Portal MIPs", logo_site: "", logo_avaliacao: "" };

export default function useBranding() {
  const [branding, setBranding] = useState(() => {
    try { return { ...padrao, ...JSON.parse(localStorage.getItem("branding") || "{}") }; }
    catch { return padrao; }
  });

  useEffect(() => {
    axios.get(`http://${window.location.hostname}:7001/api/configuracoes-portal`)
      .then(({ data }) => {
        const atual = { ...padrao, ...data };
        setBranding(atual);
        localStorage.setItem("branding", JSON.stringify(atual));
        document.title = atual.nome_site;
      })
      .catch(() => {});
  }, []);

  return branding;
}
