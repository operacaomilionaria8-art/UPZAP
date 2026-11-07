# UPZAP — MANUAL OFICIAL DE UTILIZAÇÃO, OPERAÇÃO E ARQUITETURA

Bem-vindo ao **Manual Oficial da UpZap**, a plataforma integrada de atendimento comercial inteligente e automação determinística via WhatsApp para a marca **Brizex** e a **Calcinha Cinta Modeladora**.

---

## 1. VISÃO GERAL E ARQUITETURA DO SISTEMA

A UpZap opera como uma máquina de estados determinística aliada a um motor de mensageria em tempo real, conectada diretamente ao WhatsApp através da biblioteca `@whiskeysockets/baileys` (protocolo Multi-Device Web) e a uma interface administrativa completa em React 19 + TypeScript.

### 1.1 Ciclo de Vida da Mensagem (Do Envio ao Recebimento)
```
Cliente no WhatsApp
        ↓
Conexão Baileys (MultiFileAuthState)
        ↓
`messages.upsert` (Extração de texto, botões, JID e remetente)
        ↓
ConversationsService (Registro de novo cliente / Atendimento ativo 🟢)
        ↓
AutomationEngineService
  ├── 1. Extração de Influenciadora (ex: inf_0006)
  ├── 2. Verificação de Atendimento Humano ou Pausa Global
  ├── 3. Resolução de Palavras Especiais (menu, atendente, sair)
  ├── 4. Resolução de Menu Ativo (por ID do botão, número ou texto)
  ├── 5. Fluxo de Boas-vindas (se primeiro contato)
  └── 6. Avaliação de Regras Determinísticas por Prioridade (P1 > P2 > P3 > P4)
        ↓
Execução de Fluxo ou Ação
  ├── Delays Humanizados (com status "waiting_delay")
  ├── Digitação em Tempo Real ('composing' presence)
  ├── Resolução de Itens Dinâmicos da Biblioteca
  └── Verificação contra Loops Cíclicos
        ↓
Serviço de Envio (WhatsAppDirectService)
  ├── Envio de Texto / Mídia / Menu com Fallback Numerado
  └── Status atualizado para "transport_ack" (Aceita pelo transporte)
        ↓
Baileys `messages.update`
  ├── SERVER_ACK ➔ "transport_ack"
  ├── DELIVERY_ACK ➔ "delivered" (Entregue no aparelho)
  └── READ / PLAYED ➔ "read" (Lida pelo cliente)
```

---

## 2. COMPATIBILIDADE DO BAILEYS E BOTÕES INTERATIVOS

### 2.1 Análise Técnica da Biblioteca Baileys
- **Versão Instalada:** `@whiskeysockets/baileys: ^7.0.0-rc14`
- **Protocolo Utilizado:** WhatsApp Web Multi-Device (MD).
- **Limitação da Meta (WhatsApp):** O Meta descontinuou oficialmente o suporte a mensagens com botões interativos (`quick_reply`, `buttonsMessage` e `listMessage`) originadas de clientes Web não-oficiais (pessoais ou pequenas empresas conectadas via QR Code).
- **Comportamento Observado:** Quando um robô não-oficial envia um `interactiveMessage` nativo sem fallback, os servidores do WhatsApp descartam a mensagem silenciosamente para usuários de iOS (iPhone), WhatsApp Web e versões recentes de desktop. O painel pode registrar como disparado, mas o cliente **nunca recebe nada no celular**.

### 2.2 Solução Implementada na UpZap: Envio com Fallback Numerado Bulletproof
1. Toda mensagem que possui menu é estruturada para apresentar o texto descritivo e as opções numeradas claras (ex: `1. Preços e kits`, `2. Tamanhos e cores`).
2. Se o cliente clicar no botão interativo (caso seu aparelho renderize), o Baileys captura o `selectedButtonId` ou `nativeFlowResponseMessage` (ex: `opt_1`) e aciona o fluxo correspondente.
3. Se o cliente responder apenas o número (`1`, `2`, `3`) ou o nome da opção, o motor determinístico reconhece a escolha com a mesma precisão cirúrgica.
4. **Quando a API Oficial do WhatsApp é necessária?** Para exibir botões gráficos 100% nativos garantidos em qualquer modelo de smartphone (incluindo iPhone e Web) sem risco de descarte pelo Meta, é exigido o uso da **WhatsApp Cloud API Oficial**. A UpZap já está arquitetada para que, caso você migre futuramente, os mesmos fluxos e regras continuem operando perfeitamente.

---

## 3. REGRA FUNDAMENTAL: ESTADOS CONFIÁVEIS DE ENVIO

Na UpZap, uma mensagem **nunca** é considerada "enviada" apenas porque um bloco de código foi executado. O sistema implementa uma máquina de estados rigorosa:

| Status no Sistema | Significado Técnico | Ícone no Painel |
| :--- | :--- | :---: |
| `scheduled` | Agendada para processamento futuro. | 🗓️ Agendada |
| `waiting_delay` | Aguardando o tempo humanizado configurado no bloco (ex: 1.5s). Se um humano assumir a conversa durante o delay, o envio é **cancelado imediatamente**. | ⏳ Aguardando delay |
| `sending` | Em processo de transmissão pelo socket ativo do Baileys. | 📤 Enviando... |
| `transport_ack` | Mensagem aceita com sucesso pelos servidores do WhatsApp (Key ID confirmado). | ✔ Aceita |
| `delivered` | Confirmação física de recebimento no aparelho do cliente (`DELIVERY_ACK`). | ✔✔ Entregue |
| `read` | Mensagem aberta e visualizada pelo cliente (`READ`). | 👁 Lida |
| `failed` | Falha na transmissão (ex: WhatsApp desconectado, número inválido ou queda de rede). O erro técnico exato é registrado no painel. | ❌ Falha no envio |

---

## 4. ESTRUTURA COMERCIAL OFICIAL DA BRIZEX

A UpZap vem pré-configurada e protegida com as ofertas e regras comerciais oficiais da **Calcinha Cinta Modeladora Brizex**:

### 4.1 Tabela de Ofertas Oficiais
1. **1 Unidade:** R$ 97,90 (Entrada / Teste)
2. **2 Unidades:** R$ 167,90 (🔥 Mais Vendida — Maior custo-benefício)
3. **3 Unidades:** R$ 197,90 (Super Desconto)
4. **6 Unidades:** R$ 297,90 (Kit Família Econômico)

### 4.2 Grade de Medidas e Cores
- **Tamanhos:** M, G e GG.
- **Cores Oficiais:** Bege e Preto.

### 4.3 Rastreamento de Influenciadoras (UTM / Tag)
- O motor analisa continuamente se mensagens de entrada contêm padrões como `inf_0006`, `inf_0099`, etc.
- Ao detectar o código, ele é **armazenado permanentemente** na memória da conversa (`convState.influencerCode`) e mantido durante todas as transições de menu e fechamento da compra.
- O código da influenciadora **nunca** é exposto em comissões ou cálculos visíveis para o cliente final.

---

## 5. GUIA OPERACIONAL DO PAINEL

### 5.1 Conectando o WhatsApp Real
1. Acesse o menu lateral **WhatsApp**.
2. Clique em **Gerar QR Code** ou aguarde o carregamento da tela de pareamento.
3. No seu WhatsApp do celular (Android ou iPhone), vá em **Aparelhos Conectados** ➔ **Conectar um aparelho**.
4. Aponte a câmera para o QR Code gerado na UpZap.
5. Em instantes, o painel exibirá o status **🟢 Conectado** e os dados do número e nome da linha.
6. A sessão é persistida em `data/baileys_auth`, permitindo que o servidor seja reiniciado sem exigir novo escaneamento.

### 5.2 Painel Atendimentos
- **Lista de Conversas:** Apresenta todos os clientes ativos em tempo real com indicador de status, última mensagem e tags de identificação.
- **Transição Automático / Manual:**
  - Clique em **Assumir** para pausar o robô e atender o cliente manualmente. A tag do atendimento mudará para `[MANUAL]`.
  - Clique em **Devolver p/ robô** para reativar o motor determinístico.
- **Encerrar e Reabrir:**
  - Clique em **Encerrar** para arquivar atendimentos finalizados.
  - Se configurado, o cliente que enviar uma nova mensagem após o encerramento poderá reabrir o atendimento automaticamente.
- **Visualização de Status Real:** Em cada balão de mensagem, confira se a mensagem está aguardando delay, enviando, aceita pelo WhatsApp ou com falha.

### 5.3 Simulador Integrado
- O Simulador opera com a mesma máquina de estados determinística do backend, mas em um ambiente seguro e controlado.
- **Banner de Distinção:** Deixa evidente que testes executados na tela de simulação **não transmitem mensagens ao WhatsApp real**.
- **Painel de Diagnóstico Técnico:** Exibe em tempo real o gatilho disparado, a regra com prioridade, o fluxo executado, os conteúdos da biblioteca carregados e o estado da memória.
- **Alternador de Clientes:** Permite simular múltiplos clientes em paralelo (Cliente A, B e C) para auditar que as conversas não misturam dados entre si.

---

## 6. REGRAS, FLUXOS E BIBLIOTECA

### 6.1 Motor de Regras com Prioridades
As regras determinísticas são avaliadas pela ordem estrita:
- **P1 (Crítica):** Solicitações de atendente humano, cancelamentos ou bloqueios urgentes.
- **P2 (Alta):** Dúvidas específicas de preço, tabela de kits e frete.
- **P3 (Média):** Dúvidas de cores, tamanhos, medidas e material.
- **P4 (Baixa):** Saudações secundárias, agradecimentos e fechamento.

### 6.2 Encadeamento de Fluxos
- Um fluxo pode chamar outro fluxo diretamente (ex: ao escolher a opção de 2 unidades no fluxo de Preços, o sistema aciona diretamente o fluxo de Tamanhos e Cores).
- O comando global `menu` sempre retorna o cliente ao menu principal de boas-vindas.
- O sistema possui **Loop Guard** integrado: se o mesmo fluxo for repetido 3 vezes consecutivas, a automação é pausada e o cliente recebe mensagem de contingência.

### 6.3 Biblioteca de Conteúdos
- Textos, fotos da cinta e tabelas de medidas cadastrados na Biblioteca podem ser reutilizados em múltiplos fluxos através do identificador do item (ex: `lib_tabela_precos`).
- Atualizações feitas na Biblioteca refletem instantaneamente em todos os fluxos e regras vinculados.

---

## 7. RESOLUÇÃO DE PROBLEMAS (TROUBLESHOOTING)

### Mensagens não chegam ao WhatsApp
1. Verifique na aba **WhatsApp** se a conexão está com status `🟢 Conectado`.
2. Se estiver desconectado, clique em **Forçar Reconexão**. O sistema possui backoff progressivo com teto máximo de 60 segundos.
3. Verifique no painel **Atendimentos** se a mensagem está marcada como `❌ Falha no envio` e confira a mensagem de erro técnico apresentada.
4. Certifique-se de que o contato não está em modo `[MANUAL]` (robô silenciado).

### Cliente não visualiza botões
- O WhatsApp Web Multi-Device não garante botões gráficos para todos os aparelhos.
- Oriente o cliente a responder com o número correspondente (`1`, `2`, `3`...). O motor interpretará o número imediatamente.

### Reiniciar o Servidor
- O servidor roda com proteção de processo para execução contínua 24/7.
- Para reiniciar em desenvolvimento:
```bash
npm run dev
```
- Para compilar para produção:
```bash
npm run build && npm start
```

---

*UpZap — Sistema Oficial de Automação Comercial Brizex. Desenvolvido para máxima confiabilidade, transparência e controle.*
