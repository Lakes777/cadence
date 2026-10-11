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
- [x] **3. Catálogo:** negócio com endereço público, profissionais, serviços (duração e preço), quem faz o quê, horário semanal (o banco recusa intervalos sobrepostos) e bloqueios (folga, feriado); cada dono só enxerga o que é dele
- [x] **4. Disponibilidade:** horários livres do dia por serviço, no fuso do negócio (conversão feita à mão com `Intl`, testada nos dias de horário de verão), com bloqueios, antecedência mínima e janela de 60 dias
- [x] **5. Reservas:** restrição de exclusão no Postgres contra horários sobrepostos, `Idempotency-Key` contra clique duplo, cancelamento com antecedência mínima, agenda do dono e teste com 50 pedidos simultâneos no mesmo horário
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
| `PEDIDOS_PUBLICOS_POR_MINUTO` | `120` | pedidos por IP a cada minuto em cada rota pública (vitrine, disponibilidade, reservar); limite separado do de conta |
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

## Catálogo

Rotas do dono (token de dono; `403` para cliente). Tudo que vem depois de `/negocios/:id` confere
que o negócio é de quem pede: o de outro dono responde `404`, igual a um id que não existe, para
não confirmar que ele existe. Profissional, serviço e bloqueio também precisam ser **daquele**
negócio (trocar só o id na URL não alcança os dados de outro dono; há teste para cada caso).

| Rota | O que faz |
|---|---|
| `POST /negocios` | `{nome, slug?, fuso?}`; sem `slug`, ele sai do nome ("Barbearia São João" → `barbearia-sao-joao`, com sufixo se já existir); fuso padrão `America/Sao_Paulo` |
| `GET /negocios` | os negócios de quem está logado |
| `PATCH /negocios/:id` | muda nome, endereço ou fuso |
| `GET/POST /negocios/:id/profissionais` | lista (com serviços e horários) e cria |
| `PATCH /negocios/:id/profissionais/:pid` | muda o nome ou desativa (`{"ativo": false}`); não há apagar, por causa das reservas |
| `PUT /negocios/:id/profissionais/:pid/servicos` | `{servicoIds: [...]}`: troca a lista do que ele faz |
| `PUT /negocios/:id/profissionais/:pid/horarios` | `{horarios: [{diaDaSemana, inicio: "09:00", fim: "12:00"}]}`: troca a semana inteira |
| `GET/POST /negocios/:id/servicos`, `PATCH .../:sid` | duração de 5 a 480 min (múltipla de 5), preço em centavos |
| `GET/POST /negocios/:id/bloqueios`, `DELETE .../:bid` | `{profissionalId?, inicio, fim, motivo?}`; sem profissional, vale para o negócio todo; `GET` aceita `?de=&ate=` (no máximo 1 ano por consulta e 500 bloqueios; sem nada, o próximo ano; só com um dos dois, o ano a partir de `de` ou até `ate`) |

E a vitrine pública, sem login: `GET /negocios/:slug` devolve o nome, o fuso, os profissionais
ativos e os serviços ativos que algum profissional ativo faz (com quem faz cada um). Nada do dono
aparece.

**Horas:** o horário semanal é hora local do negócio (o fuso dele, gravado com o nome canônico
IANA), guardado como minutos desde a meia-noite; `24:00` fecha o dia. Trocar o fuso do negócio
muda o sentido de todos os horários ("09:00" passa a ser 09:00 do fuso novo); a partir da fase 5,
com reservas marcadas, essa troca vai precisar de cuidado. Bloqueios são instantes absolutos: a API exige data e hora com
fuso (`2026-12-25T00:00:00-03:00`) e guarda em UTC. Fica para a fase 4 juntar os dois no cálculo
dos horários livres.

**No banco:** além das validações da API, o Postgres tem as próprias regras (`CHECK` para
duração, preço, formato do endereço, dia e intervalo) e uma restrição de exclusão
(`EXCLUDE USING gist`, extensão `btree_gist`) que não deixa dois intervalos do mesmo profissional
se sobreporem no mesmo dia. As ligações também não misturam negócios no banco: a tabela de "quem
faz o quê" tem chaves estrangeiras compostas com o `negocio_id`, e um gatilho confere que o
profissional de um bloqueio é do mesmo negócio. Duas trocas de horário ao mesmo tempo entram em fila
(`SELECT ... FOR UPDATE` no profissional); o teste dispara 6 juntas.

## Disponibilidade

`GET /negocios/:slug/disponibilidade?servicoId=...&data=2026-10-12[&profissionalId=...]`, sem
login, devolve os horários livres daquele dia para o serviço:

```json
{
  "data": "2026-10-12",
  "fuso": "America/Sao_Paulo",
  "servico": { "id": "...", "nome": "Corte", "duracaoMin": 30 },
  "horarios": [
    { "inicio": "2026-10-12T12:00:00.000Z", "fim": "2026-10-12T12:30:00.000Z",
      "hora": "09:00", "profissionalIds": ["..."] }
  ]
}
```

- Os horários começam a cada 15 min dentro do expediente de cada profissional ativo que faz o
  serviço, e só entram se o atendimento inteiro couber no expediente e não encostar em nenhum
  bloqueio (dele ou do negócio todo). Quem pode atender no mesmo horário aparece junto.
- Nada começa em menos de **30 min** a partir de agora; a agenda abre **60 dias** à frente
  (`400` depois disso); dia que já passou volta vazio.
- `data` é o dia no **fuso do negócio**; `inicio` e `fim` saem em UTC e `hora` no relógio local.

O cálculo é uma função pura (`src/disponibilidade/calculo.ts`): recebe o dia, o fuso, a duração,
os expedientes, os bloqueios, as reservas (a partir da fase 5) e "agora", e devolve os horários.
Por isso é testada sem banco e sem relógio. O relógio da API é injetado (`RELOGIO`), e os testes
de ponta a ponta o param numa segunda-feira conhecida.

**Fuso sem biblioteca:** a conversão de "09:00 de tal dia em tal fuso" para UTC usa só `Intl`
(`src/disponibilidade/fuso.ts`). Os testes cobrem os dois dias difíceis do horário de verão
(Lisboa e Nova York nos dois sentidos, Santiago com a meia-noite que não existe): quando o relógio pula, a hora que não existe não é oferecida; quando
volta, a hora repetida é oferecida uma vez só, e a duração é sempre a real (30 min são 30 min,
mesmo atravessando a mudança). Se o fim do expediente cair na hora que não existe, ele acaba no
pulo do relógio. As rotas públicas têm limite de pedidos por IP (`PEDIDOS_PUBLICOS_POR_MINUTO`).

## Reservas

| Rota | Quem | O que faz |
|---|---|---|
| `POST /negocios/:slug/reservas` | qualquer pessoa logada | `{servicoId, profissionalId?, inicio}` com o cabeçalho `Idempotency-Key` → `201` |
| `GET /reservas` | quem reservou | as próprias reservas; `?periodo=proximas` (padrão) ou `anteriores` |
| `POST /reservas/:id/cancelar` | quem reservou ou o dono | cancela → `200` |
| `GET /negocios/:id/agenda` | dono | as reservas do negócio com o nome e o e-mail de quem reservou; `?de=&ate=` (até 1 ano) |

**Sem reserva dupla, em duas camadas.** A API só aceita um `inicio` que a disponibilidade
ofereceria naquele momento (mesmo cálculo da fase 4, agora descontando as reservas). Mas entre
conferir e gravar há uma janela, e dois pedidos podem passar juntos pela conferência. Quem fecha
essa janela é o Postgres:

```sql
ALTER TABLE reservas ADD CONSTRAINT reservas_sem_sobreposicao
    EXCLUDE USING gist (profissional_id WITH =, tstzrange(inicio, fim, '[)') WITH &&)
    WHERE (status = 'confirmada');
```

Duas reservas confirmadas do mesmo profissional não podem se sobrepor (encostar pode: `[)`),
seja qual for o serviço. Quem chega depois recebe o erro `23P01` e a API responde `409`. Sem
profissional escolhido, a API tenta o próximo que estava livre. Reserva cancelada não ocupa.
O teste dispara **50 clientes no mesmo horário ao mesmo tempo** e confere que exatamente um
consegue (e que o banco tem uma reserva só); com duas profissionais livres, exatamente dois
conseguem, um com cada.

**Clique duplo (`Idempotency-Key`).** Toda reserva exige o cabeçalho (a interface gera um UUID
por tentativa). O mesmo cliente repetindo a mesma chave com o mesmo pedido recebe a **mesma**
reserva com `200`, em vez de criar outra; a mesma chave com outro pedido é `422`. A chave fica
gravada na reserva (única por cliente). O teste manda 10 cópias simultâneas e confere que sai uma
reserva só. Foi esse teste que mostrou que a cópia atrasada pode esbarrar primeiro na própria
reserva que a outra acabou de criar (não na chave), por isso todo conflito confere a chave antes
de responder `409`.

**Cancelamento:** o cliente cancela até **2 h antes**; depois disso só o dono, e ninguém depois
que o atendimento começou (`422`). Quem não é o cliente nem o dono recebe `404`. Cancelar de novo
devolve a reserva como está. O preço fica gravado na reserva no momento em que ela é feita.

**Escolhas conscientes:**
- A restrição vale **por profissional**: o mesmo cliente pode ter duas reservas no mesmo horário
  com profissionais diferentes (pai e filho cortando o cabelo juntos). O clique duplo é coberto
  pela `Idempotency-Key`, que a interface gera uma vez por tentativa, não por clique.
- Um bloqueio criado depois **não cancela** reservas já marcadas naquele período: o dono vê as
  duas coisas na agenda e decide o que fazer com cada cliente.
- `GET /reservas` traz as 100 próximas (ou as 100 últimas); a agenda do dono responde `400`
  pedindo um período menor se houver mais de 1000 reservas, em vez de cortar a lista calada.

**Privacidade:** a disponibilidade pública só diz que o horário não está livre, nunca quem
reservou; só o dono vê os clientes, e só os do próprio negócio.

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
