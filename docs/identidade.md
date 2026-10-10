# Identidade visual: "Relógio de ponto"

Escolhida em 10/10/2026 entre três opções (a amostra das três está em `identidades-amostra.html`;
a escolhida é a **A**). É a base da interface da fase 8.

**Ideia:** o cartão de ponto da fábrica. Papel creme, tinta preta, números grandes em fonte de
máquina e um carimbo vermelho para o que está ocupado. Reservar é "bater o ponto" no seu horário.

| Papel | Valor | Uso |
|---|---|---|
| `--papel` | `#f3ecdc` | fundo |
| `--tinta` | `#1b1a17` | texto, bordas, botão principal, horário escolhido |
| `--carimbo` | `#b3261e` | só para "ocupado", erros e o "LIVRE" da tela de início |
| `--fio` | `#d8ccb2` | linhas tracejadas entre os horários |
| hover | `#ebe1cb` | horário livre sob o mouse |

**Fontes:** Archivo Narrow (700, maiúsculas com espaçamento largo) nos títulos e botões;
IBM Plex Mono no resto, inclusive nos horários. Servidas localmente na fase 8.

**Peças:**
- Tela de início com um relógio grande ("09:30" + "LIVRE" em vermelho), título em duas linhas
  ("Bata o ponto no seu horário.") e o botão "Reservar horário".
- Cabeçalho do dia como o topo do cartão: caixa com borda de 2 px, negócio e data em destaque,
  profissional, serviço e preço em letras pequenas.
- Horários em duas colunas, cada um com um furo (círculo): vazio = livre, cheio = ocupado (com o
  carimbo "OCUPADO" inclinado), invertido (fundo tinta) = escolhido.
- Horário pego por outra pessoa ao vivo (fase 7): contorno vermelho que some em ~1 s; se era o
  escolhido, aviso "Alguém reservou HH:MM antes de você. Escolha outro horário."
- Cliente nunca vê o nome de outro cliente: só "ocupado".
