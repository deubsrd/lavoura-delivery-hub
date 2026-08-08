# Deploy na Oracle Cloud (VM Ampere "Always Free")

Guia passo a passo pra você rodar sozinho. Custo: **R$ 0** (tier Always
Free da Oracle — não é trial, não expira, mas peça o cartão pra
verificação de identidade; não é cobrado se você ficar dentro da cota
free).

## a. Criar a conta e a VM

1. Acesse https://www.oracle.com/cloud/free/ e crie uma conta ("Start for
   free"). Vai pedir cartão de crédito só pra verificação — não é
   cobrado automaticamente, e dá pra travar isso em "Always Free" nas
   configurações da conta depois de criada.
2. **Região**: escolha uma perto do Brasil quando o cadastro pedir (ex.
   `São Paulo` ou `Vinhedo`, se disponível pra sua conta — a
   disponibilidade de Always Free varia por conta/região; se São Paulo
   não tiver capacidade Ampere livre no momento, tente outra região da
   América do Sul/EUA leste). Depois de escolhida, a região não muda
   sem recriar tudo, então escolha com calma.
3. No menu ☰ → **Compute → Instances → Create Instance**.
4. **Name**: `whatsapp-worker` (ou o nome que quiser).
5. **Image and shape**:
   - Clique em "Edit" na imagem e escolha **Canonical Ubuntu** (22.04 ou
     mais recente).
   - Clique em "Edit" no shape → aba **Ampere** → escolha
     `VM.Standard.A1.Flex`. Configure **1 OCPU e 6 GB de RAM** (a cota
     Always Free dá até 4 OCPU/24GB no total, mas 1 OCPU/6GB já sobra
     bastante pra rodar Node + poucas sessões Baileys).
6. **Networking**: deixe criar uma VCN nova (padrão). Marque "Assign a
   public IPv4 address" — precisa de IP público pra você conseguir
   conectar via SSH (mas lembre: **não** vamos abrir porta nenhuma pro
   worker em si, só SSH).
7. **Add SSH keys**: escolha "Generate a key pair for me" e **baixe a
   chave privada** (`.key` ou `.pem`) — é sua única forma de entrar na
   VM depois. Guarde em lugar seguro.
8. Clique em **Create**. Aguarde o status virar "Running" (1-2 min).
9. Anote o **IP público** da instância (aparece na página de detalhes).

### Firewall (Network Security)

Por padrão a Oracle já bloqueia tudo exceto SSH (porta 22) de entrada —
exatamente o que você quer, já que o worker não precisa de porta nenhuma
aberta (só conexões de **saída**, que não passam por regra de firewall de
entrada). Não precisa mexer em nada aqui além do padrão. Se algum dia
precisar abrir alguma porta, é em **VCN → Security Lists** (regra de rede
da Oracle) **e** no firewall do próprio Ubuntu (`ufw`) — os dois
bloqueiam por padrão, então normalmente é preciso liberar nos dois
lugares, mas pra este projeto não é necessário.

## b. Subir o script na VM

### Conectar via SSH

No seu computador (Windows, usando PowerShell ou WSL):

```bash
chmod 600 caminho/para/sua-chave.key
ssh -i caminho/para/sua-chave.key ubuntu@SEU_IP_PUBLICO
```

### Instalar Node.js e PM2

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs git
node --version   # confirme v20.x
sudo npm install -g pm2
```

### Trazer o código

Mais simples: só copie a pasta `whatsapp-worker/` do seu repositório pra
VM (não precisa clonar o projeto inteiro, e definitivamente não precisa
do app principal rodando lá).

Do seu computador:

```bash
scp -i caminho/para/sua-chave.key -r whatsapp-worker ubuntu@SEU_IP_PUBLICO:~/whatsapp-worker
```

(Alternativa: se preferir manter atualizado via git, dá pra clonar o repo
inteiro na VM com `git clone` e rodar só dentro da pasta
`whatsapp-worker/` — funciona igual, é só mais disco usado à toa com o
resto do app que não roda aí.)

### Instalar dependências e configurar

Já conectado na VM:

```bash
cd ~/whatsapp-worker
npm install
cp .env.example .env
nano .env
```

Preencha:

```
SUPABASE_URL=https://SEU-PROJETO.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...   # Painel do Supabase > Project Settings > API > service_role secret
SESSIONS_DIR=./sessions
```

Salve (`Ctrl+O`, Enter, `Ctrl+X` no nano).

⚠️ A `service_role` key dá acesso total ao banco, ignorando RLS — trate
como senha de root. Nunca a coloque em `.env.example`, nunca a
commite, nunca a mande em mensagem.

### Rodar 24/7 com PM2 (reinicia sozinho se cair)

```bash
pm2 start src/index.js --name whatsapp-worker
pm2 save
pm2 startup
```

O último comando (`pm2 startup`) imprime um comando `sudo env PATH=...`
— **copie e rode esse comando exato** que ele imprimir. Isso registra o
PM2 pra subir sozinho quando a VM reiniciar (por manutenção da Oracle,
queda de energia, etc.).

Comandos úteis daqui pra frente:

```bash
pm2 logs whatsapp-worker      # ver logs em tempo real
pm2 restart whatsapp-worker   # reiniciar manualmente
pm2 status                    # ver se está rodando
```

## c. Pareamento inicial via QR code

1. No app principal, entre como admin de uma unidade → menu **WhatsApp →
   Conexão**.
2. Clique em **"Conectar WhatsApp"**.
3. Em alguns segundos (confira `pm2 logs whatsapp-worker` na VM se
   demorar), o QR code aparece na tela do app.
4. No celular com o número que vai atender essa unidade: **WhatsApp →
   Configurações (⋮ ou engrenagem) → Aparelhos conectados → Conectar um
   aparelho** → aponte a câmera pro QR code na tela do app.
5. A tela deve mudar pra "Conectado" com o número aparecendo. Isso já
   confirma que a VM conseguiu: (1) ler o comando do Supabase, (2) gerar
   e gravar o QR, (3) completar o handshake do WhatsApp.

Se o WhatsApp usado já estiver logado em muitos aparelhos (limite do
WhatsApp é ~4 aparelhos vinculados por número), desvincule algum antigo
antes de tentar de novo.

## d. Teste de ponta a ponta

1. **Pedido muda de status → mensagem chega no WhatsApp do cliente**:
   pelo painel, faça um pedido de teste avançar pra "Pronto" (ou use o
   fluxo público de pedido pra criar um pedido novo, que já dispara
   "recebido"). Confira:
   - `pm2 logs whatsapp-worker` deve mostrar a mensagem sendo processada
     pela fila.
   - O WhatsApp do número de teste (o celular do "cliente") deve receber
     a mensagem em poucos segundos.
2. **Cliente responde → aparece no chat do painel**: responda a mensagem
   pelo WhatsApp do celular de teste. Vá em **WhatsApp → Conversas** no
   app — a resposta deve aparecer na conversa daquele número em tempo
   real (a tela usa Supabase Realtime, não precisa recarregar a página).
3. **Enviar manualmente pelo chat**: na mesma tela de Conversas, digite
   uma mensagem e mande — deve chegar no WhatsApp do celular de teste.

Se algum desses passos não funcionar, o primeiro lugar pra olhar é sempre
`pm2 logs whatsapp-worker` — todo envio/recebimento/erro é logado ali.

## Problemas comuns

- **QR não aparece**: confira se o worker está rodando (`pm2 status`) e
  se `whatsapp_conexoes` tem uma linha pra essa unidade com
  `comando='conectar'` (Supabase Studio → Table Editor). Veja
  `pm2 logs` por erro de conexão com o Supabase (URL/chave erradas).
- **Desconecta sozinho depois de um tempo**: normal acontecer volta e
  meia (o próprio WhatsApp derruba sessões às vezes) — o worker
  reconecta sozinho na maioria dos casos, sem precisar de QR novo. Se
  aparecer "Sessão desconectada pelo WhatsApp (deslogado no celular)" na
  tela de Conexão, alguém desvinculou o aparelho pelo celular — precisa
  conectar de novo do zero.
- **VM ficou sem memória**: `free -h` pra conferir. Cada sessão Baileys
  usa bem pouco (algumas dezenas de MB), mas se a rede crescer muito,
  considere aumentar OCPU/RAM da instância (ainda dentro da cota Always
  Free, até 4 OCPU/24GB total) ou separar em mais de uma VM.
