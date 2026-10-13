#!/usr/bin/env bash
# Publica uma versão nova na VM: monta a imagem aqui, aplica as migrações, manda a imagem pela
# conexão SSH, reinicia e repõe a demonstração. A VM não precisa do código nem do Node, só do Docker.
# Uso: deploy/publicar.sh
set -euo pipefail

VM="${VM:-ubuntu@159.112.189.95}"
CHAVE_SSH="${CHAVE_SSH:-$HOME/.ssh/oracle_bot}"
DOMINIO="${DOMINIO:-cadence.159-112-189-95.sslip.io}"
PORTA_DO_TUNEL="${PORTA_DO_TUNEL:-15433}"
cd "$(dirname "$0")/.."
SSH=(ssh -i "$CHAVE_SSH" -o BatchMode=yes)

# Só publica o que está no git: a imagem leva o commit, e dá para saber o que está no ar
if [ -n "$(git status --porcelain)" ]; then
	echo "Há mudanças sem commit. Faça o commit antes de publicar." >&2
	exit 1
fi
commit=$(git rev-parse --short HEAD)

if ! "${SSH[@]}" "$VM" "test -f cadence/.env"; then
	echo "Falta o ~/cadence/.env na VM. Rode deploy/preparar-vm.sh antes." >&2
	exit 1
fi

echo "Montando a imagem ARM ($commit)..."
docker buildx build -q --load --platform linux/arm64 --build-arg COMMIT="$commit" -t cadence:latest -t "cadence:$commit" .

# As migrações rodam daqui, pelo Prisma do projeto, num túnel SSH até o Postgres do Beacon: a imagem
# não precisa levar o Prisma CLI (nem o motor nativo dele) só para isso. O túnel é fechado no fim.
echo "Aplicando as migrações..."
ip_do_banco=$("${SSH[@]}" "$VM" "docker inspect -f '{{(index .NetworkSettings.Networks \"beacon_interna\").IPAddress}}' beacon-banco-1")
controle=$(mktemp -u)
"${SSH[@]}" -M -S "$controle" -o ExitOnForwardFailure=yes -fN -L "127.0.0.1:$PORTA_DO_TUNEL:$ip_do_banco:5432" "$VM"
trap '"${SSH[@]}" -S "$controle" -O exit "$VM" 2>/dev/null' EXIT
# A URL (com a senha) passa só pela memória deste script, nunca pela tela nem por argumento
url=$("${SSH[@]}" "$VM" "grep '^DATABASE_URL=' cadence/.env | cut -d= -f2-")
url="${url/@banco:5432/@127.0.0.1:$PORTA_DO_TUNEL}"
if ! saida=$(DATABASE_URL="$url" node node_modules/prisma/build/index.js migrate deploy 2>&1); then
	echo "$saida" | grep -vF "$url" >&2
	echo "As migrações falharam: nada foi publicado." >&2
	exit 1
fi
unset url
echo "$saida" | grep -E "migrations? (found|have been applied)|No pending" || true

echo "Enviando para a VM (comprimida)..."
docker save cadence:latest | gzip | "${SSH[@]}" "$VM" "gunzip | docker load -q"
scp -q -i "$CHAVE_SSH" deploy/compose.yaml "$VM:cadence/"
sed "s/DOMINIO_CADENCE/$DOMINIO/g" deploy/cadence.caddy | "${SSH[@]}" "$VM" "cat > beacon/sites/cadence.caddy"

echo "Reiniciando..."
"${SSH[@]}" "$VM" "cd cadence && docker compose up -d --remove-orphans && docker image prune -f >/dev/null \
	&& cd ../beacon && docker compose exec -T caddy caddy reload --config /etc/caddy/Caddyfile"

echo "Conferindo a saúde..."
for _ in $(seq 1 30); do
	estado=$("${SSH[@]}" "$VM" "docker inspect -f '{{.State.Health.Status}}' cadence-api-1" 2>/dev/null || true)
	if [ "$estado" = healthy ]; then
		"${SSH[@]}" "$VM" "cd cadence && docker compose exec -T api node dist/demo/semear.js"
		echo "No ar: https://$DOMINIO ($commit)"
		exit 0
	fi
	sleep 3
done
echo "O Cadence não respondeu. Veja: ssh ... 'cd cadence && docker compose logs api --tail 50'" >&2
exit 1
