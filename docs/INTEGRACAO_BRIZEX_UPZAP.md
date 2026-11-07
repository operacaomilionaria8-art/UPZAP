# CONTRATO OFICIAL DE INTEGRAÇÃO — BRIZEX ➔ UPZAP (CRM & LOGÍSTICA)

## 1. Arquitetura do Fluxo

```
[ Logzz ] ➔ [ Brizex ] ➔ [ UpZap ]
 (Origem)   (Gateway)    (CRM & WhatsApp)
```

- **Logzz:** Origem dos pedidos de compras e autoridade oficial sobre os status logísticos.
- **Brizex:** Sistema intermediário responsável por receber os pedidos da Logzz e despachá-los em tempo real via HTTP Webhook para o UpZap.
- **UpZap:** Aplicação central que unifica o CRM de Pedidos e a Automação de WhatsApp, registrando, deduplicando, armazenando e sinalizando os pedidos para o acompanhamento humanizado da equipe.

---

## 2. Endpoints Oficiais de Recebimento

- **URL Principal:** `POST /api/integrations/brizex/orders`
- **Alias de Compatibilidade:** `POST /api/orders/webhook`
- **Content-Type:** `application/json`

---

## 3. Autenticação e Segurança

A comunicação Brizex ➔ UpZap é autenticada através de Bearer Token ou cabeçalho dedicado.

O UpZap aceita o token em qualquer um dos seguintes headers:
1. `Authorization: Bearer <SEU_TOKEN_INTEGRACAO>`
2. `x-brizex-token: <SEU_TOKEN_INTEGRACAO>`
3. `x-api-key: <SEU_TOKEN_INTEGRACAO>`

O token é configurável no UpZap via variável de ambiente `BRIZEX_INTEGRATION_TOKEN` ou pelo painel do CRM em `Configurações da Integração Brizex` (persistido em `data/brizex-config.json`).
*Importante: O token de autenticação nunca é exposto publicamente no código client-side do navegador.*

---

## 4. Campos do Payload JSON

### 4.1 Campos Obrigatórios

| Campo | Tipo | Descrição |
|---|---|---|
| `logzzOrderId` (ou `idLogzz`, `id_logzz`, `order_id`) | String / Number | Identificador único do pedido na Logzz. **Chave primária de deduplicação**. |
| `cliente.telefone` (ou `telefone`, `celular`, `phone`) | String | Telefone/WhatsApp do cliente com DDD (ex: `"11999998888"` ou `"5511999998888"`). |
| `status` (ou `statusLogistico`, `logisticStatus`) | String | Status logístico atual (deve ser um dos 8 status oficiais ou sinônimo mapeável). |

### 4.2 Campos Opcionais / Recomendados

| Campo | Tipo | Descrição |
|---|---|---|
| `brizexOrderId` (ou `idBrizex`, `id_brizex`) | String | ID do pedido no ecossistema da Brizex. |
| `cliente.nome` (ou `nome`, `nome_cliente`) | String | Nome completo da cliente. |
| `cliente.cpf` | String | CPF do destinatário para emissão/validação. |
| `cliente.email` | String | E-mail da cliente. |
| `endereco.logradouro` | String | Rua / Avenida. |
| `endereco.numero` | String | Número do imóvel. |
| `endereco.complemento` | String | Apartamento, bloco, casa, etc. |
| `endereco.bairro` | String | Bairro de entrega. |
| `endereco.cidade` | String | Cidade de destino. |
| `endereco.uf` | String | Sigla do estado (ex: `"SP"`, `"RJ"`). |
| `endereco.cep` | String | Código de Endereçamento Postal. |
| `endereco.referencia` | String | Ponto de referência para o entregador. |
| `itens` (ou `items`, `produtos`) | Array | Lista de produtos: `[{ nome, quantidade, valorUnitario, sku, kit, tamanho, cor }]`. |
| `valorTotal` (ou `total`, `valor`) | Number | Valor total do pedido em Reais (BRL). |
| `valorFrete` | Number | Valor cobrado pelo frete. |
| `metodoPagamento` | String | Forma de pagamento (ex: `"Pix na entrega"`, `"Cartão na entrega"`). |
| `dataCriacao` | String (ISO) | Data/hora em que a compra foi realizada. |
| `dataAgendamento` | String (Data/ISO) | Data agendada para a entrega física pelo operador da Logzz. |
| `observacao` | String | Notas operacionais da Logzz/Brizex sobre a entrega. |
| `motivoCancelamento` | String | Motivo preenchido quando status for `"Cancelado"`. |
| `motivoFalha` | String | Motivo preenchido quando status for `"Frustrado"`. |
| `motivoReagendamento` | String | Motivo preenchido quando status for `"A Reagendar"`. |

---

## 5. Status Logísticos Oficiais (Exatamente 8)

O UpZap valida e padroniza rigorosamente os status recebidos:

1. **`Agendado`**: Pedido registrado e programado para entrega.
   - *Regra Crucial:* O fluxo comercial automatizado do WhatsApp (Aurora) é **automaticamente pausado** para este cliente. O atendimento é transferido para acompanhamento humano no CRM.
2. **`Em Separação`**: Preparação iniciada no centro de distribuição.
   - *Alerta de Atraso:* Se permanecer por **mais de 24 horas** neste status, o sistema sinaliza com alerta visual para análise humana, sem alterar o status automaticamente.
3. **`Separado`**: Pedido preparado e aguardando saída do CD.
   - *Alerta de Atraso:* Se permanecer por **mais de 24 horas** neste status, o sistema sinaliza com alerta visual para análise humana, sem alterar o status automaticamente.
4. **`Em Rota`**: Pedido coletado pelo entregador e em processo de entrega no endereço da cliente.
5. **`Cancelado`**: Entrega cancelada na Logzz.
6. **`A Reagendar`**: Entrega que precisa de nova data acordada com a cliente.
7. **`Frustrado`**: Tentativa de entrega não concluída (destinatário ausente, endereço não localizado, etc.).
8. **`Completo`**: Entrega e recebimento confirmados pela Logzz.

---

## 6. Exemplos de Payloads

### 6.1 Exemplo de Criação de Pedido (`Agendado`)

```json
POST /api/integrations/brizex/orders
Headers:
  Content-Type: application/json
  Authorization: Bearer brizex_live_secret_upzap2026

{
  "logzzOrderId": "LGZ-892410",
  "brizexOrderId": "BRZ-2026-4401",
  "status": "Agendado",
  "dataCriacao": "2026-10-29T10:30:00.000Z",
  "dataAgendamento": "2026-10-31",
  "valorTotal": 197.90,
  "valorFrete": 0.00,
  "metodoPagamento": "Pix na entrega",
  "cliente": {
    "nome": "Juliana Mendes Silva",
    "telefone": "11998765432",
    "cpf": "123.456.789-00",
    "email": "juliana.mendes@gmail.com"
  },
  "endereco": {
    "logradouro": "Rua das Flores",
    "numero": "350",
    "complemento": "Apto 42 Bloco B",
    "bairro": "Jardim Paulista",
    "cidade": "São Paulo",
    "uf": "SP",
    "cep": "01419-001",
    "referencia": "Próximo à padaria Bela Vista"
  },
  "itens": [
    {
      "nome": "Calcinha Cinta Modeladora Brizex",
      "quantidade": 3,
      "kit": "Kit 3 Unidades",
      "tamanho": "G",
      "cor": "Bege / Preto / Chocolate",
      "valorUnitario": 65.97,
      "valorTotal": 197.90,
      "sku": "BRZ-CINTA-KIT3-G"
    }
  ]
}
```

### 6.2 Exemplo de Atualização de Status (`Em Rota`)

```json
POST /api/integrations/brizex/orders
Headers:
  Content-Type: application/json
  Authorization: Bearer brizex_live_secret_upzap2026

{
  "logzzOrderId": "LGZ-892410",
  "status": "Em Rota",
  "observacao": "Entregador Carlos coletou o pacote no CD de Barueri.",
  "cliente": {
    "telefone": "11998765432"
  }
}
```

---

## 7. Respostas do Servidor (Códigos HTTP)

- **`200 OK`**: Pedido criado ou atualizado com sucesso.
```json
{
  "success": true,
  "action": "created", // ou "updated" ou "unchanged"
  "message": "Pedido LGZ-892410 processado com sucesso [created]. Status: Agendado.",
  "order": {
    "id": "upz_ord_1788839000_a1b2",
    "logzzOrderId": "LGZ-892410",
    "status": "Agendado",
    "alertaAtraso": false,
    "precisaAcompanhamentoHumano": false
  }
}
```

- **`400 Bad Request`**: Payload ausente ou campos obrigatórios faltantes (`logzzOrderId` ou `cliente.telefone`).
```json
{
  "success": false,
  "error": "Campo obrigatório ausente: identificador do pedido na Logzz (logzzOrderId / id_logzz)."
}
```

- **`401 Unauthorized`**: Token de autenticação ausente ou inválido.
```json
{
  "success": false,
  "error": "Acesso não autorizado. Token da integração Brizex inválido ou ausente."
}
```

- **`500 Internal Server Error`**: Erro inesperado ao gravar ou processar no servidor.

---

## 8. Regras de Integridade e Deduplicação

1. **Deduplicação Obrigatória:** O envio repetido do mesmo payload não cria pedidos duplicados.
2. **Preservação de Histórico:** O array `statusHistory` armazena cronologicamente cada transição recebida com timestamp ISO e observação.
3. **Preservação de Notas Internas:** Observações e responsabilidades atribuídas pela equipe de atendimento no CRM são estritamente preservadas mesmo após sucessivas atualizações enviadas pela Brizex.
4. **Sem Disparos Automáticos Não Solicitados:** O UpZap não envia mensagens automáticas de entrega/expedição ao receber status logísticos; todo o acompanhamento é visual e operado pela equipe humana através da interface do CRM.
