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
- [x] **2. Contas e papéis:** cadastro e login (senha com scrypt), token de acesso de 15 min + token de renovação rotativo em cookie httpOnly com detecção de reuso, papéis de dono e cliente, limite de tentativas por IP
- [ ] **3. Catálogo:** negócio, profissionais, serviços (duração e preço), horário de funcionamento e bloqueios (folga, feriado)
- [ ] **4. Disponibilidade:** cálculo dos horários livres do dia (guardado em UTC, mostrado no fuso de São Paulo)
- [ ] **5. Reservas:** restrição de exclusão no Postgres contra horários sobrepostos, `Idempotency-Key` contra clique duplo, cancelamento com antecedência mínima e teste com pedidos simultâneos
- [ ] **6. Lembretes:** fila (BullMQ + Redis) com o aviso agendado para 24 h antes; cancelar a reserva tira o aviso da fila
- [ ] **7. Tempo real:** WebSocket: quem está olhando o dia vê o horário sumir quando outra pessoa reserva
- [ ] **8. Interface:** React + Vite (renovação do token em fila única entre as abas), com identidade visual própria ("Relógio de ponto", ver [docs/identidade.md](docs/identidade.md)); tela do cliente, painel do dono e um negócio de demonstração
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
| `JWT_SEGREDO` | (obrigatório) | assina os tokens de acesso; pelo menos 32 caracteres (`openssl rand -hex 32`) |
| `PEDIDOS_DE_CONTA_POR_MINUTO` | `10` | pedidos por IP a cada minuto em **cada** rota de conta (cadastro, entrar, renovar); o excesso leva `429` |
| `CONFIANCA_NO_PROXY` | `loopback` | de quem aceitar o `X-Forwarded-For` (o IP real usado no limite e nos logs): `loopback`, `uniquelocal`, IPs ou sub-redes separados por vírgula. Com o Caddy em container, use a sub-rede do Docker; sem isso, todo mundo divide o mesmo limite |

## Contas

| Rota | O que faz |
|---|---|
| `POST /auth/cadastro` | `{nome, email, senha, papel?}` (papel `cliente` por padrão, ou `dono`) → `201` |
| `POST /auth/entrar` | `{email, senha}` → `200`; senha errada e e-mail sem conta dão a mesma resposta `401`, no mesmo tempo |
| `POST /auth/renovar` | usa o cookie → `200` com token de acesso novo e cookie novo |
| `POST /auth/sair` | encerra a sessão deste aparelho e apaga o cookie → `204` |
| `GET /auth/eu` | o usuário do token |

Cadastro, login e renovação respondem `{usuario, tokenDeAcesso, expiraEm}`. O token de acesso
(JWT HS256, 15 min) vai no cabeçalho `Authorization: Bearer ...` e a interface o guarda só na
memória. O **token de renovação** nunca aparece no corpo: vai num cookie `httpOnly`,
`SameSite=Strict`, restrito a `/auth` e `Secure` em produção, e o banco guarda só o SHA-256 dele.

**Rotação com detecção de reuso:** cada renovação gasta o token e entrega o próximo da mesma
"família" (uma família por login). Se um token já gasto aparece de novo, alguém tem uma cópia
dele, e a família inteira é revogada: o ladrão perde o acesso e o dono de verdade entra de novo
com a senha. Duas exceções de bom senso:

- O mesmo token de novo **em até 30 s** é o próprio navegador (duas abas abrindo juntas, ou uma
  resposta que se perdeu na rede): em vez de derrubar a sessão, o token emitido antes é revogado
  e sai um novo no lugar. A regra é **um único token válido por família**; quem aparecer depois
  com um token revogado de uma família ainda viva também conta como roubo. A linha do token é
  trancada (`SELECT ... FOR UPDATE`), então pedidos simultâneos entram em fila (o teste dispara 5
  ao mesmo tempo e confere que só um token sobra valendo). Troca consciente: se as respostas de
  duas abas chegarem fora de ordem, o navegador fica com o token revogado e a pessoa entra de
  novo; a interface (fase 8) evita isso fazendo as abas renovarem uma de cada vez
  (`navigator.locks`).
- Cada renovação empurra o prazo para 30 dias, mas uma família **vive no máximo 90 dias**: um
  token roubado não vale para sempre.

**CSRF:** além do `SameSite=Strict`, os `POST` de `/auth` exigem `Content-Type: application/json`
(`415` sem ele). Um formulário de outro site não consegue mandar esse cabeçalho, e um `fetch` de
outra origem com ele precisa de CORS, que a API não libera.

**Escolha consciente:** o login não revela quais e-mails têm conta, mas o cadastro responde `409`
para e-mail repetido (para a pessoa saber que deve entrar em vez de se cadastrar). O limite de
pedidos por IP deixa uma varredura lenta.

Toda rota exige login, a não ser as marcadas com `@Publica()` (o guard é global, então esquecer o
decorador fecha a rota em vez de abri-la). `@Papeis('dono')` limita a rota a um papel (`403`
para os outros). Qualquer pessoa pode se cadastrar como dono (é assim que um negócio novo entra),
então **o papel não basta**: a partir da fase 3, toda ação de dono confere também que o negócio é
dele.

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
