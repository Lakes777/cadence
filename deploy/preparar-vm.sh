#!/usr/bin/env bash
# Prepara a VM uma vez só (rodar de novo não estraga nada): cria o banco e o usuário da demonstração
# no Postgres do Beacon, o .env com os segredos (gerados na VM, ficam só lá) e põe o Cadence no cron
# que repõe as demonstrações de hora em hora.
# Uso: deploy/preparar-vm.sh
set -euo pipefail

VM="${VM:-ubuntu@159.112.189.95}"
CHAVE_SSH="${CHAVE_SSH:-$HOME/.ssh/oracle_bot}"

ssh -i "$CHAVE_SSH" "$VM" bash -s <<'REMOTO'
set -euo pipefail
mkdir -p ~/cadence
if [ -f ~/cadence/.env ]; then
	echo "O ~/cadence/.env já existe: banco e .env ficam como estão."
else
	senha=$(openssl rand -hex 24)
	cd ~/beacon
	# Pela entrada padrão (e não como argumento): a senha não aparece na lista de processos
	docker compose exec -T banco psql -U beacon -d beacon -v ON_ERROR_STOP=1 -q <<SQL
create role cadence_demo login password '$senha';
create database cadence_demo owner cadence_demo;
revoke connect on database cadence_demo from public;
SQL
	rede=$(docker network inspect -f '{{range .IPAM.Config}}{{.Subnet}}{{end}}' beacon_interna)
	umask 077
	cat > ~/cadence/.env <<ENV
DATABASE_URL=postgresql://cadence_demo:$senha@beacon-banco:5432/cadence_demo
REDIS_URL=redis://fila:6379
JWT_SEGREDO=$(openssl rand -hex 32)
CADENCE_DEMO=true
CONFIANCA_NO_PROXY=$rede
ENV
	echo "Banco cadence_demo e .env criados (rede do Caddy: $rede)."
fi

# A reposição de hora em hora: uma linha a mais no script que já repõe as outras demonstrações
if ! grep -q cadence ~/repor-demos.sh; then
	cat >> ~/repor-demos.sh <<'LINHA'
cd ~/cadence && docker compose exec -T api node dist/demo/semear.js
LINHA
	echo "Cadence incluído no ~/repor-demos.sh."
fi
REMOTO
