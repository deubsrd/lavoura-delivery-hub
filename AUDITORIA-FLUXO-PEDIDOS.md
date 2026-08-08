# Auditoria do fluxo de pedidos — Lavoura Delivery

Escopo: criação do pedido (`$slug.pedido.tsx`, `pedidos.functions.ts`), agendamento (`usar_proximo_dia_util`), aceite/recusa e mudanças de status no painel da atendente (`painel.tsx`), notificações (`notificacoes.server.ts`) e o schema/RLS/triggers em `supabase/migrations/`.

## Resumo do modelo atual

Não existe uma etapa dedicada de "aceitar pedido". Todo pedido novo entra direto com `status = "recebido"` e já aparece na primeira coluna do Kanban. "Aceitar" = a atendente clicar no botão que avança pro próximo status do fluxo (`recebido → motoboy_busca/processando → pronto → motoboy_entrega → entregue`). "Recusar" = usar o botão genérico "Cancelar" (disponível em qualquer status não-final), que abre um modal pedindo o motivo. Pedidos agendados pro próximo dia útil (`usar_proximo_dia_util`) passam pelo mesmo caminho — só muda a `data_prevista_retorno`, o status inicial também é `"recebido"`.

Essa falta de uma etapa "aceitar/recusar" explícita foi o ponto que mais gerou ambiguidade ao implementar o alerta sonoro (item 2 abaixo) e vale decisão do time do produto.

## Crítico

**1. Cliente não é avisado quando o pedido é recusado/cancelado.**
`StatusNotificavel` em `src/lib/notificacoes.server.ts` só aceita `"recebido" | "pronto" | "entregue"`. `notificarMudancaStatus` (chamada pelo painel) só dispara para `"pronto"` e `"entregue"`. Quando a atendente cancela um pedido — inclusive um pedido novo que está recusando —, nenhum webhook de WhatsApp é chamado. O cliente fica sem saber que o pedido foi recusado, a não ser que a atendente mande mensagem manual pelo botão de WhatsApp do card.

**2. Sem máquina de estados no banco — só a UI impede status inválido.**
A policy `pedidos_update_unidade` (migração `20260804183438...sql`) só verifica `unidade_id = minha_unidade_id()`. Não há `CHECK` constraint nem trigger validando transições. Qualquer atendente autenticada pode, via chamada direta ao Supabase (não só pela UI), setar `status` para qualquer valor — pular etapas, voltar de "entregue" pra "recebido", etc. Hoje isso só não acontece porque o `painel.tsx` restringe os botões; não há defesa no servidor/banco.

**3. Condição de corrida entre atendentes da mesma unidade.**
`mudarStatus` faz um `UPDATE` incondicional, sem checar o status atual esperado antes de escrever (nada de `.eq("status", statusEsperado)` nem optimistic locking). Como o realtime tem uma janela de atraso, duas atendentes na mesma unidade podem colidir: uma avança um pedido enquanto a tela da outra ainda mostra o status antigo, e o segundo clique sobrescreve silenciosamente sem nenhum aviso de conflito pra ninguém.

**4. Ações irreversíveis em um clique só, sem confirmação.**
Avançar o card (inclusive para "Entregue", que dispara notificação ao cliente) é um único clique, sem diálogo de confirmação. Um toque no card errado — fácil de acontecer numa lista densa — manda uma notificação incorreta pro cliente ("seu pedido foi entregue") e não existe "desfazer" nem botão de voltar etapa.

## Importante

**5. Feedback ao cliente depende de uma env var opcional e não tem página de acompanhamento.**
`WHATSAPP_WEBHOOK_URL` é opcional (ver `.env.example`); se não configurada, a chamada é simplesmente pulada, sem erro visível em lugar nenhum pra atendente. Fora os 3 pontos de notificação, não existe link/página onde o cliente possa consultar o status do próprio pedido — o silêncio entre "pedido recebido" e a entrega depende 100% do WhatsApp funcionar e da atendente usar o botão manual.

**6. Sem forma de corrigir um avanço acidental.**
Depois que a atendente avança um status, não há botão de "voltar" no Kanban. Na prática isso empurra atendentes a usar "Cancelar" como um "desfazer" informal, o que suja o histórico com cancelamentos que não são recusas de verdade — e, combinado com o item 1, ainda soma um pedido "perdido" sem notificação nenhuma pro cliente.

**7. Limite de 1 pedido por telefone em 3 min é global, não por unidade.**
Em `criarPedido`, a contagem de `pedidos_delivery` por `telefone` nos últimos 3 minutos não filtra por `unidade_id`. Um cliente que peça em duas unidades diferentes da rede dentro de 3 minutos é bloqueado incorretamente.

**8. Rate limit por IP pode punir clientes legítimos atrás de IP compartilhado.**
5 pedidos/15min por IP (`ip_origem`) — clientes atrás do mesmo CGNAT/proxy corporativo dividem esse limite entre si sem saber.

**9. Histórico de status não registra autoria.**
`pedido_status_historico` grava `status`, `observacao` (só preenchida em cancelamento) e `timestamp`, mas não qual atendente fez a mudança. Não dá pra auditar quem cancelou ou avançou um pedido específico, só quando.

## Nice-to-have

**10.** `garantirVinculoAtendente()` roda toda vez que a query `["atendente"]` refaz fetch (inclusive refetch automático do React Query ao focar a janela) — chamada ao servidor desnecessária pra algo que quase nunca muda.

**11.** Filtro "Todo o histórico" carrega todos os pedidos da unidade de uma vez (`select("*")` sem paginação/limit) — pode pesar em unidades antigas com muito volume.

**12.** A query `["atendente"]` está duplicada entre `painel.tsx` e `use-atendente-admin.ts` — mesmo código, dois lugares pra manter em sincronia.

**13.** Mudanças de status feitas por outra atendente (via realtime) não geram nenhum toast local — só a atendente que clicou o botão vê a confirmação "Pedido movido para X"; quem só recebeu o `invalidateQueries` do canal realtime não é avisada de que um colega já tratou aquele pedido.

## Priorização sugerida

| Prioridade | Item |
|---|---|
| Crítico | 1, 2, 3, 4 |
| Importante | 5, 6, 7, 8, 9 |
| Nice-to-have | 10, 11, 12, 13 |

O item 1 (cliente não sabe que foi recusado) é o mais barato de corrigir com maior impacto — é só estender `StatusNotificavel` e o `switch`/`if` em `notificarMudancaStatus` pra cobrir `"cancelado"`. Os itens 2 e 3 (falta de máquina de estados no banco e corrida entre atendentes) são os mais estruturais e valem uma constraint/trigger de transição + um `.eq("status", esperado)` no update antes de tratar qualquer um dos outros.

---

# Notificação sonora em loop (implementada)

## O que foi feito

Novo hook `src/hooks/use-order-alert-sound.ts`, consumido em `src/routes/_authenticated/painel.tsx`.

- **Som sintetizado via Web Audio API** — dois tons curtos em sequência ("ding-dong", 880 Hz + 660 Hz) gerados na hora com `OscillatorNode` + `GainNode` (envelope de ataque/decaimento pra não estalar). Não depende de nenhum arquivo de áudio — o projeto não tinha nenhum, e a task pedia exatamente essa alternativa.
- **Loop, não toque único** — enquanto houver pelo menos 1 pedido com `status === "recebido"` (novo pedido ou agendamento pro próximo dia útil — ambos entram nesse status), o alerta toca a cada 1,5s. Só para quando esse número volta a zero, ou seja, quando a atendente aceita (avança) ou recusa (cancela) todos os pedidos pendentes.
- **Realtime existente reaproveitado** — o hook não abre nenhuma conexão nova; ele só observa `pedidos.data`, que já é mantido atualizado pela subscription `postgres_changes` que já existia em `painel.tsx`.
- **Múltiplos pedidos em sequência** — um único `setInterval` fica ativo por vez (`iniciar()` é no-op se já estiver tocando), então vários pedidos chegando não empilham vários loops simultâneos. E nenhum é perdido: o alerta é dirigido pela *contagem* de pedidos pendentes, não por eventos individuais, então mesmo que dois pedidos cheguem quase juntos ou a aba fique em segundo plano por um tempo, assim que os dados forem revalidados o alerta reflete a realidade.
- **Botão "Silenciar"** — pausa o som do lote atual sem mexer nos pedidos (banner vermelho no topo do painel, com contador). Se chegar um pedido novo enquanto estiver silenciado, o alerta volta a tocar sozinho — silenciar nunca faz perder a notificação de um pedido que ainda não existia.
- **Política de autoplay do navegador** — `AudioContext` é criado sob demanda e há um listener de `click`/`keydown` na página inteira pra destravar o áudio no primeiro gesto da atendente, cobrindo o caso do pedido chegar antes de qualquer interação na aba. Se mesmo assim o navegador bloquear, o banner mostra um aviso pedindo pra clicar em qualquer lugar da página.
- **Reforço visual** — além do som: banner vermelho pulsante com contador de pedidos pendentes, toast individual por pedido novo (nome + tipo de serviço + cestos), e o título da aba passa a piscar "🔔 Novo pedido!" enquanto o alerta está ativo — assim a atendente percebe mesmo se o áudio estiver bloqueado, mudo no sistema, ou o painel estiver numa aba em segundo plano.

## Como testar

1. Rodar o projeto (`npm run dev` ou `bun run dev`) e abrir o painel (`/painel`) logada como atendente.
2. Em outra aba/janela anônima, abrir `/{slug-da-unidade}/pedido` e concluir um pedido novo (ou usar o fluxo de agendamento pro próximo dia útil, respondendo "Sim, agendar" quando estiver fora do horário).
3. No painel, o card deve aparecer na coluna "Pedido recebido", o banner vermelho deve aparecer no topo, o som deve começar a tocar em loop e o título da aba deve começar a piscar.
4. Clicar em "Silenciar" — o som para, o banner some, mas os pedidos continuam lá. Criar um segundo pedido novo nesse meio tempo: o som deve voltar a tocar sozinho.
5. Clicar no botão de avançar status do card (aceitar) ou em "Cancelar" com um motivo (recusar) até não sobrar nenhum pedido em "Pedido recebido": o som deve parar, o banner deve sumir e o título da aba deve voltar ao normal.
6. Repetir criando 2–3 pedidos em sequência rápida: só deve haver um som por vez (sem sobreposição/cacofonia), e o contador do banner deve refletir a soma.

---

# Lint / type-check

Tentei rodar `eslint .` e `tsc --noEmit -p tsconfig.json` (os dois comandos usados pelo projeto). Ambos travaram sem terminar mesmo depois de várias tentativas — inclusive um teste isolado de `require('eslint')` sem nenhum código do projeto, e um teste de `require('typescript')`, que carregou em ~1s. Isolei a causa: a pasta do projeto está montada neste sandbox via FUSE (bind mount do Windows), e ler os milhares de arquivos pequenos dentro de `node_modules` (típico de projetos com TypeScript + ESLint + várias libs) por esse tipo de mount é extremamente lento aqui — copiar só o pacote `typescript` (132 arquivos, sem dependências) já levou ~10s. Um `tsc`/`eslint` completo, que precisa resolver os tipos de `react`, `@radix-ui/*`, `@tanstack/*`, `zod` etc., não termina dentro do tempo disponível neste ambiente.

Isso é uma limitação deste sandbox de execução, não um problema do código. Para compensar, revisei manualmente os dois arquivos alterados (`src/hooks/use-order-alert-sound.ts` e `src/routes/_authenticated/painel.tsx`) contra as regras estritas do `tsconfig.json` do projeto (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitReturns` etc.) e contra o `eslint.config.js` (regras de `react-hooks`, sem lint type-aware configurado) — não encontrei inconsistências de tipo, imports quebrados (os ícones `BellRing`/`VolumeX` do `lucide-react` foram conferidos manualmente no pacote instalado) ou hooks fora de regra.

Recomendo rodar, na sua máquina (fora deste sandbox, onde `node_modules` está em disco local e não deve ter esse gargalo):

```bash
npm run lint
npx tsc --noEmit -p tsconfig.json
```
