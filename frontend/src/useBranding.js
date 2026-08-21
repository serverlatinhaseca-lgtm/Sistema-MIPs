import { useEffect, useState } from "react";
import axios from "axios";

const padrao = { nome_site: "Portal MIPs", logo_site: "", logo_avaliacao: "" };

export function aplicarBranding(branding) {
  const atual = { ...padrao, ...branding };
  document.title = atual.nome_site;

  let favicon = document.querySelector("link[rel='icon']");
  if (!favicon) {
    favicon = document.createElement("link");
    favicon.rel = "icon";
    document.head.appendChild(favicon);
  }
  favicon.href = atual.logo_site || "/nova-esperanca-logo.png";
}

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
        aplicarBranding(atual);
      })
      .catch(() => {});
  }, []);

  return branding;
}
