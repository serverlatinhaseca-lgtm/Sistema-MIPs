#!/usr/bin/env bash
# setup-https.sh — configura HTTPS + DNS interno (mips.local) no restaurante.
# Rode UMA VEZ no servidor que hospeda o Docker, como usuário com sudo.
#
# Uso:         ./frontend/setup-https.sh [IP_DA_LAN]
# Exemplo:     ./frontend/setup-https.sh 192.168.1.100
set -euo pipefail

LAN_IP="${1:-192.168.0.143}"
echo "    IP detectado/usado: $LAN_IP"

echo "==> Instalando mkcert (se necessário)"
if ! command -v mkcert >/dev/null 2>&1; then
  # Detecta a distro para instalar certo no Arch, Ubuntu ou Debian
  if command -v pacman >/dev/null 2>&1; then
    pacman -Sy --noconfirm mkcert
  elif command -v apt-get >/dev/null 2>&1; then
    apt-get update -qq
    apt-get install -y -qq libnss3-tools
    curl -sL https://dl.filippo.io/mkcert/latest?for=linux/amd64 -o /usr/local/bin/mkcert
    chmod +x /usr/local/bin/mkcert
  else
    echo "    ERRO: não consegui detectar o gerenciador de pacotes. Instale o mkcert manualmente e rode de novo."
    exit 1
  fi
fi
echo "    mkcert OK: $(mkcert -version)"

echo "==> Criando CA local (rootCA) e certificado para mips.local"
mkcert -install || echo "    ATENÇÃO: não foi possível instalar a CA. Instale manualmente nos celulares."
mkdir -p frontend/certs
cd frontend/certs
mkcert -cert-file mips.local.pem -key-file mips.local-key.pem "mips.local" "localhost" "$LAN_IP" 127.0.0.1 ::1
cd ../..

echo "==> Atualizando dnsmasq.conf com o IP $LAN_IP"
# Regeneração idempotente: funciona na 1ª vez e nas seguintes
cat > frontend/dnsmasq.conf <<EOF
# Resolve mips.local → IP do servidor na LAN
# Gerado pelo setup-https.sh em $(date -u +%Y-%m-%dT%H:%M:%SZ) para $LAN_IP
address=/mips.local/$LAN_IP

# DNS upstream (Google, Cloudflare)
no-resolv
server=8.8.8.8
server=8.8.4.4
server=1.1.1.1

# Logs (útil para debug)
log-queries
log-facility=/var/log/dnsmasq.log
cache-size=100
EOF

echo "==> Checando pré-requisitos"
if [ ! -f .env ]; then
  echo "    ERRO: arquivo .env não encontrado. Rode antes:"
  echo "      cp .env.example .env && nano .env"
  exit 1
fi
if ss -lun 2>/dev/null | grep -q ':53 '; then
  echo "    ATENÇÃO: algo já escuta na porta 53 (provável systemd-resolved)."
  echo "    Se o dnsmasq não subir, libere a porta 53 ou ajuste o resolved."
fi
echo "==> Subindo os containers com HTTPS e DNS"
docker compose up -d --build

echo ""
echo "================= CONFIGURAÇÃO COMPLETA ================="
echo ""
echo "1) ROTEADOR — aponte o DNS do DHCP para $LAN_IP"
echo "   (assim todo celular resolve mips.local automaticamente)"
echo ""
echo "2) CELULARES — confie na CA local (UMA vez por aparelho):"
echo "   O arquivo está em: $(mkcert -CAROOT)/rootCA.pem"
echo "   - iPhone: envie o arquivo por e-mail -> abrir -> instalar perfil"
echo "              -> Ajustes > Geral > Sobre > Confiança de certificados"
echo "   - Android: transfira o arquivo -> Configurações > Segurança"
echo "              > Instalar certificado > CA"
echo ""
echo "3) ACESSO: https://mips.local  (prompt de instalação PWA funciona)"
echo "   Obs.: http://$LAN_IP:7070 redireciona para HTTPS (cert só vale p/ mips.local)."
echo ""
echo "Dica: no roteador, se não der para trocar o DNS do DHCP,"
echo "configure manualmente o DNS de cada celular para $LAN_IP."
echo "============================================================"