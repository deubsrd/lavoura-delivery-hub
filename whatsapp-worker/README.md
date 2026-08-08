# whatsapp-worker

Script Node standalone que conecta o WhatsApp de cada unidade (via
[Baileys](https://github.com/WhiskeySockets/Baileys), sem API paga, sem
Evolution API/Twilio/Z-API) e troca mensagens com o mesmo banco Supabase do
app principal. **Não é deployado no Cloudflare** — o app principal
(TanStack Start) roda em edge/Workers, que não consegue manter o socket
persistente que o Baileys exige. Este script roda numa VM comum, 24/7.

## Como o app principal e este worker se falam

Nunca se chamam diretamente. Toda comunicação é via Postgres (Supabase),
usando duas tabelas + Realtime:

- **`whatsapp_conexoes`** (uma linha por unidade): o app grava `comando`
  ('conectar'/'desconectar'); este worker assina a tabela via Realtime,
  executa, e escreve de volta `status`, `qr_atual` (PNG em base64) e
  `telefone_conectado`.
- **`whatsapp_mensagens`**: o app grava mensagens novas com
  `direcao='enviada', status='pendente'` (tanto notificação automática de
  status de pedido quanto mensagem manual do chat — ver
  `src/lib/notificacoes.server.ts` e `src/lib/whatsapp.functions.ts` no
  app principal). Este worker assina a tabela, manda pro WhatsApp de
  verdade, e atualiza `status` pra `'enviada'`/`'falhou'`. Mensagens
  recebidas de clientes também entram aqui, com `direcao='recebida'`.

A VM **não precisa abrir nenhuma porta de entrada** — só conexão de saída
pro Supabase e pro WhatsApp. Isso simplifica bastante o firewall.

## Rodando localmente (teste antes de subir na VM)

```bash
cd whatsapp-worker
npm install
cp .env.example .env
# edite .env com SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (Painel do
# Supabase > Project Settings > API — a service_role, não a anon/publishable)
npm start
```

O worker fica escutando `whatsapp_conexoes`. Pra testar, abra o app
principal como admin de uma unidade, vá em **WhatsApp > Conexão** e clique
em "Conectar WhatsApp" — o QR code deve aparecer na tela em alguns
segundos.

## Estrutura

- `src/index.js` — ponto de entrada, sobe o `Manager`.
- `src/manager.js` — dono das sessões ativas (uma por unidade); decide
  quando abrir/fechar uma sessão a partir de `whatsapp_conexoes`.
- `src/whatsappSession.js` — uma sessão Baileys: conectar, gerar QR,
  reconectar sozinho, gravar mensagem recebida.
- `src/fila.js` — consome `whatsapp_mensagens` pendentes e manda de
  verdade.
- `src/sessionStorage.js` — backup/restauração das credenciais de sessão
  no Supabase Storage (bucket `whatsapp-sessions`), pra sobreviver a uma
  VM recriada sem precisar escanear o QR de novo.
- `src/telefone.js` — conversão entre o formato de telefone do app
  (só dígitos, sem código de país — ex. `"92991176452"`) e o JID do
  WhatsApp (`"5592991176452@s.whatsapp.net"`).

## Operação

- **Sessão local**: cada unidade tem uma pasta em `sessions/<unidade_id>/`
  com os arquivos de credencial do Baileys. Não apague isso sem querer —
  é o que evita ter que escanear o QR de novo a cada restart.
- **Um número por unidade**: o worker sobe uma sessão (socket) por
  unidade que tenha `whatsapp_conexoes.comando='conectar'` ou já esteja
  `status='conectado'`. Poucas unidades = uso de recursos baixo; se a
  rede crescer muito, cada sessão consome memória própria.
- **Guia completo de deploy na Oracle Cloud (VM Ampere Always Free)**: ver
  `DEPLOY.md`.
