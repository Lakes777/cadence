# Cadence

**Cadence · agenda de reservas sem reserva dupla.**

[![CI](https://github.com/Lakes777/cadence/actions/workflows/ci.yml/badge.svg)](https://github.com/Lakes777/cadence/actions/workflows/ci.yml)

Uma API de agendamento para negócios que atendem com hora marcada (barbearia, quadra, estúdio):
o dono cadastra profissionais, serviços e horários; o cliente escolhe um horário livre e reserva.
O ponto central é que **dois clientes nunca ficam com o mesmo horário**, nem clicando no mesmo
milissegundo. **Em construção:** as fases abaixo mostram o que já está pronto.

É o meu primeiro projeto em **NestJS** (TypeScript).

## Fases

- [x] **1. Esqueleto:** NestJS 12 com TypeScript `strict`, configuração validada na partida (zod), PostgreSQL com Prisma, `/saude`, logs estruturados (pino) com id por pedido, testes com Testcontainers, CI com lint
- [ ] **2. Contas e papéis:** cadastro e login, token de acesso curto + refresh rotativo em cookie httpOnly, papéis de dono e cliente
- [ ] **3. Catálogo:** negócio, profissionais, serviços (duração e preço), horário de funcionamento e bloqueios (folga, feriado)
- [ ] **4. Disponibilidade:** cálculo dos horários livres do dia (guardado em UTC, mostrado no fuso de São Paulo)
- [ ] **5. Reservas:** restrição de exclusão no Postgres contra horários sobrepostos, `Idempotency-Key` contra clique duplo, cancelamento com antecedência mínima e teste com pedidos simultâneos
- [ ] **6. Lembretes:** fila (BullMQ + Redis) com o aviso agendado para 24 h antes; cancelar a reserva tira o aviso da fila
- [ ] **7. Tempo real:** WebSocket: quem está olhando o dia vê o horário sumir quando outra pessoa reserva
- [ ] **8. Interface:** React + Vite, com identidade visual própria; tela do cliente, painel do dono e um negócio de demonstração
- [ ] **9. Publicação:** Docker Compose numa VM da Oracle, com HTTPS e vigiado pelo [Vigil](https://github.com/Lakes777/vigil)

## Rodando

Precisa de Node 24 e Docker.

```bash
npm ci
npm run gerar               # cliente do Prisma a partir de prisma/schema.prisma
cp .env.exemplo .env
docker compose up -d        # Postgres de desenvolvimento na porta 5434
npm run migrar
npm run start:dev           # http://localhost:3000/saude
```

## Configuração

Lida do ambiente e validada na partida: se algo estiver errado, a API não sobe e diz o que falta
(sem mostrar os valores).

| Variável | Padrão | Para quê |
|---|---|---|
| `DATABASE_URL` | (obrigatória) | `postgresql://...` |
| `PORTA` | `3000` | porta HTTP |
| `NODE_ENV` | `production` | `development` mostra os logs legíveis (o `.env.exemplo` já vem assim); os outros, em JSON |
| `NIVEL_DO_LOG` | `info` | `fatal` a `trace`, ou `silent` |

## Saúde

`GET /saude` responde `200 {"status":"ok","banco":"ok"}` quando o Postgres responde e `503` quando
não: em até 5 s, mesmo com o banco congelado (a consulta tem limite de tempo). A resposta não expõe
o erro do banco; o motivo vai para o log do servidor. O `/saude` não entra no log de pedidos,
porque o Vigil chama a cada minuto.

Todo pedido ganha um `X-Request-Id` na resposta e nos logs; se quem chamou já mandou um válido
(até 64 letras, números, `_` ou `-`), ele é mantido, para seguir o mesmo pedido pelo proxy e pela API.

## Testes

```bash
npm test            # unidade (sem banco)
npm run test:e2e    # ponta a ponta: o Testcontainers sobe um Postgres 18 e aplica as migrações
```

O CI roda formatação (Prettier), lint (oxlint com tipos), `tsc`, build e as duas suítes.
