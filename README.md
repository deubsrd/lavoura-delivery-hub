# Lavoura Delivery Hub

Quero criar um sistema de gestão de delivery para uma rede de lavanderias self-service chamada Lavoura, com duas telas: um formulário público de pedido e um painel interno para a atendente gerenciar os pedidos. Use Supabase como backend.

IDENTIDADE VISUAL Verde escuro #394f3e, laranja queimado #e17c4c, off-white #fdfdfd. Tipografia: Bebas Neue para títulos e Lato ou DM Sans para o corpo de texto. Estilo limpo e confiável, mobile-first (a maioria dos clientes vai acessar pelo celular).

CONTEXTO GERAL Cada unidade da rede (ex: Boa Vista, futuras franquias) tem sua própria fila de pedidos, prazo de retorno configurado e login de atendente. O formulário público é acessado por uma URL com o slug da unidade, ex: /boa-vista/pedido.

TELA 1 — FORMULÁRIO DE PEDIDO (pública, sem login)

Campos:

Nome completo (obrigatório)

Telefone/WhatsApp (obrigatório, com máscara)

Endereço dividido em: rua, número, bairro, complemento (opcional), ponto de referência (opcional)

Quantidade aproximada de cestos (seletor numérico, obrigatório)

Tipo de serviço (obrigatório, escolha única): "Só busca" (motoboy busca as roupas na casa do cliente), "Só entrega" (motoboy leva as roupas prontas até o cliente), ou "Busca e entrega"

Horário preferido (opcional): manhã, tarde ou sem preferência

Observações (opcional, campo livre)

Campo condicional importante: quando o tipo de serviço escolhido for "Busca e entrega", exibir a pergunta "O endereço de entrega é o mesmo da coleta?" (Sim/Não, obrigatório responder). Se a resposta for "Não", exibir um segundo bloco de endereço com os mesmos campos (rua, número, bairro, complemento, referência) para o endereço de entrega. Se for "Sim", não duplicar os campos. Esse campo não deve aparecer quando o serviço for só busca ou só entrega, já que nesses casos existe apenas um endereço envolvido.

Comportamento: ao carregar a página, buscar a unidade pelo slug da URL e exibir o prazo médio de retorno configurado para aquela unidade (ex: "Suas roupas ficam prontas em até 48h após a busca"). Ao enviar o formulário, calcular a data prevista de retorno somando esse prazo ao momento do envio, e salvar o pedido com status inicial "recebido". Depois do envio, mostrar uma tela de confirmação com o resumo do pedido e o prazo estimado.

TELA 2 — PAINEL DA ATENDENTE (interna, com login)

Visualização em formato Kanban, com uma coluna por status do pedido:

Pedido recebido

Motoboy a caminho (busca) — pular essa etapa se o tipo de serviço for só entrega

Na lavanderia / em processamento

Prontas para entrega

Motoboy a caminho (entrega) — pular essa etapa se o tipo de serviço for só busca

Entregue / Concluído

Mais uma coluna separada, fora do fluxo principal: Cancelado (ao mover um pedido para cá, exigir que a atendente informe o motivo).

Cada card do Kanban deve mostrar: nome do cliente, telefone com botão de atalho para abrir o WhatsApp (link wa.me), endereço resumido, quantidade de cestos, tipo de serviço (com ícone ou badge), e há quanto tempo o pedido foi feito. Se o pedido estiver atrasado em relação ao prazo previsto, destacar visualmente o card (ex: borda vermelha).

Ao clicar em um card, abrir uma visão detalhada com o histórico completo de mudanças de status (com data e hora de cada mudança) e um campo para atribuir o nome do motoboy responsável. Se o endereço de entrega for diferente do de coleta, mostrar os dois endereços claramente separados nessa visão detalhada, para o motoboy não confundir.

O painel também precisa ter: filtro por status, por data e por tipo de serviço; busca por nome ou telefone do cliente; e atualização em tempo real quando qualquer atendente mudar o status de um pedido, sem precisar recarregar a página.

MODELO DE DADOS

Tabela unidades: id, nome, slug (único, usado na URL do pedido público), cidade, prazo_padrao_horas.

Tabela pedidos_delivery: id, unidade_id (referência a unidades), nome_completo, telefone, rua, numero, bairro, complemento, referencia, mesmo_endereco_entrega (booleano, só relevante quando o tipo de serviço é busca e entrega), rua_entrega, numero_entrega, bairro_entrega, complemento_entrega, referencia_entrega, quantidade_cestos, tipo_servico (busca / entrega / busca_e_entrega), horario_preferido (manha / tarde / sem_preferencia), observacoes, status (recebido / motoboy_busca / processando / pronto / motoboy_entrega / entregue / cancelado), motivo_cancelamento, motoboy_nome, data_pedido, data_prevista_retorno, data_entrega_efetiva, created_at, updated_at.

Tabela pedido_status_historico: id, pedido_id (referência a pedidos_delivery), status, timestamp. Toda mudança de status feita no painel deve gravar uma nova linha nessa tabela.

AUTENTICAÇÃO O painel interno precisa de login via Supabase Auth (email e senha), com cada usuário/atendente vinculado a uma unidade específica. Use Row Level Security para garantir que cada atendente só veja os pedidos da própria unidade. O formulário público não precisa de login, mas deve ter alguma proteção básica contra spam de pedidos falsos.

FORA DO ESCOPO POR ENQUANTO Não implemente: notificação automática por WhatsApp (isso será conectado depois por fora do Lovable), otimização de rota para múltiplos endereços, app dedicado para o motoboy, e cobrança ou pagamento integrado ao pedido.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/632dcc02-ae2c-4a0d-96b9-a9afadf340f7).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
