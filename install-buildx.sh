#!/bin/sh
set -eu

if docker buildx version >/dev/null 2>&1; then
  echo "Docker Buildx já está instalado."
  docker buildx version
  exit 0
fi

echo "Instalando o plugin oficial Docker Buildx..."

if command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update
  sudo apt-get install -y docker-buildx-plugin
elif command -v dnf >/dev/null 2>&1; then
  sudo dnf install -y docker-buildx-plugin
elif command -v yum >/dev/null 2>&1; then
  sudo yum install -y docker-buildx-plugin
elif command -v pacman >/dev/null 2>&1; then
  sudo pacman -S --needed docker-buildx
elif command -v apk >/dev/null 2>&1; then
  sudo apk add docker-cli-buildx
else
  echo "Distribuição não reconhecida. Instale o pacote docker-buildx-plugin pelo gerenciador do sistema." >&2
  exit 1
fi

docker buildx version
echo "Buildx instalado. O aviso do Docker Compose foi removido."
