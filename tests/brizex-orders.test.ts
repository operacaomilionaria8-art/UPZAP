import { ordersService, OFFICIAL_LOGZZ_STATUSES } from '../server/orders.service';
import { conversationsService } from '../server/conversations.service';

async function runBrizexOrdersTests() {
  console.log('====================================================');
  console.log('📦 TESTES DE INTEGRAÇÃO BRIZEX & CRM DE PEDIDOS');
  console.log('====================================================\n');

  // 1. Verificação de Tokens de Autenticação e Cabeçalhos Aceitos
  console.log('--- 1. Validação de Token de Autenticação ---');
  const currentConfig = ordersService.getConfig();
  const secret = currentConfig.webhookSecret;

  if (!ordersService.validateAuthToken(secret)) {
    throw new Error('Falha: segredo direto configurado deve ser aceito');
  }
  if (!ordersService.validateAuthToken(`Bearer ${secret}`)) {
    throw new Error('Falha: cabeçalho com prefixo Bearer deve ser aceito');
  }
  if (ordersService.validateAuthToken('token_errado_invalido')) {
    throw new Error('Falha: token errado não deve ser aceito');
  }
  if (ordersService.validateAuthToken('')) {
    throw new Error('Falha: token vazio não deve ser aceito');
  }
  console.log('✅ Validação de tokens de autenticação (direto e Bearer) aprovada.');

  // 2. Normalização Estrita dos 8 Status Oficiais Logzz
  console.log('\n--- 2. Normalização Estrita dos 8 Status Oficiais Logzz ---');
  for (const status of OFFICIAL_LOGZZ_STATUSES) {
    const normalized = ordersService.normalizeStatus(status);
    if (normalized !== status) {
      throw new Error(`Falha: status oficial "${status}" normalizado incorretamente como "${normalized}"`);
    }
  }

  // Mapeamentos legítimos e divergência "O Reagenda" vs "A Reagendar"
  const legitimateCases: [string, string][] = [
    ['em transito', 'Em Rota'],
    ['saiu_para_entrega', 'Em Rota'],
    ['separando itens', 'Em Separação'],
    ['preparando_envio', 'Em Separação'],
    ['coleta', 'Em Separação'],
    ['tentativa de entrega sem sucesso', 'Frustrado'],
    ['destinatario ausente', 'Frustrado'],
    ['pedido cancelado pelo cliente', 'Cancelado'],
    ['solicitado reagendamento', 'A Reagendar'],
    ['O Reagenda', 'A Reagendar'],
    ['A Reagendar', 'A Reagendar'],
    ['entregue com sucesso', 'Completo'],
    ['finalizado', 'Completo']
  ];

  for (const [input, expected] of legitimateCases) {
    const res = ordersService.normalizeStatus(input);
    if (res !== expected) {
      throw new Error(`Falha na normalização: "${input}" resultou em "${res}", esperado "${expected}"`);
    }
  }

  // Status sem regra documentada NÃO devem ser convertidos arbitrariamente
  const unmappedCases = [
    'aguardando_pagamento',
    'pedido_pago',
    'status_inexistente_xyz',
    'analise_de_credito'
  ];

  for (const input of unmappedCases) {
    const res = ordersService.normalizeStatus(input);
    if (res !== null) {
      throw new Error(`Falha: status não documentado "${input}" deveria retornar null, mas retornou "${res}"`);
    }
  }
  console.log('✅ Normalização estrita dos 8 status oficiais e remoção de conversões infundadas comprovadas.');

  // 3. Rejeição de Payloads Malformados
  console.log('\n--- 3. Validação e Rejeição de Payload Malformado ---');
  const malformedPayload = {
    // Faltando logzzOrderId e cliente.telefone
    valorTotal: 100
  };
  const malformedResult = ordersService.processBrizexOrderPayload(malformedPayload, {
    ip: '127.0.0.1',
    origin: 'brizex'
  });
  if (malformedResult.success) {
    throw new Error('Falha: payload sem identificador ou telefone deveria ser rejeitado');
  }
  console.log('✅ Payload malformado rejeitado com erro 400 e mensagens detalhadas.');

  // 4. Criação de Novo Pedido Válido via Webhook
  console.log('\n--- 4. Processamento de Pedido Novo via Webhook ---');
  const testPhone = '5511977776655';
  const testLogzzId = `LOGZZ_AUDIT_${Date.now()}`;

  conversationsService.resetConversationForTest(testPhone);
  conversationsService.setConversationAttendanceMode(testPhone, 'auto', 'teste_inicio');

  const payloadNovo = {
    logzzOrderId: testLogzzId,
    brizexOrderId: `BRZ_${Date.now()}`,
    cliente: {
      nome: 'Renata Vasconcelos',
      telefone: testPhone,
      cpf: '123.456.789-00'
    },
    endereco: {
      rua: 'Av Paulista',
      numero: '1000',
      bairro: 'Bela Vista',
      cidade: 'São Paulo',
      estado: 'SP',
      cep: '01310-100'
    },
    itens: [
      {
        nome: 'Calcinha Cinta Modeladora Brizex - Bege G',
        quantidade: 2,
        valorUnitario: 83.95
      }
    ],
    valorTotal: 167.90,
    status: 'Em Separação'
  };

  const processResult = ordersService.processBrizexOrderPayload(payloadNovo, {
    ip: '127.0.0.1',
    origin: 'brizex'
  });

  if (!processResult.success || processResult.action !== 'created') {
    throw new Error(`Falha ao criar pedido: ${processResult.message}`);
  }
  console.log(`✅ Pedido ${testLogzzId} cadastrado com status "Em Separação".`);

  // 5. Preservação de Status Existente quando Status Recebido for Desconhecido
  console.log('\n--- 5. Preservação de Status Existente com Status Desconhecido ---');
  const payloadStatusDesconhecido = {
    ...payloadNovo,
    status: 'analise_de_credito_externa' // status não mapeado
  };

  const resDesconhecido = ordersService.processBrizexOrderPayload(payloadStatusDesconhecido, {
    ip: '127.0.0.1',
    origin: 'brizex'
  });

  if (!resDesconhecido.success) {
    throw new Error('Falha ao processar atualização com status desconhecido');
  }

  const orderMantido = ordersService.getOrderById(testLogzzId);
  if (orderMantido?.status !== 'Em Separação') {
    throw new Error(`Falha: status deveria ser mantido como "Em Separação", mas foi alterado para "${orderMantido?.status}"`);
  }

  // Verifica se a nota de auditoria foi registrada nas observações
  const hasWarningNote = orderMantido.observacoesInternas?.some((n) =>
    n.texto.includes('analise_de_credito_externa')
  );
  if (!hasWarningNote) {
    throw new Error('Falha: nota de auditoria do status não mapeado não foi registrada');
  }
  console.log('✅ Status anterior ("Em Separação") preservado e nota de auditoria registrada.');

  // 6. Atualização para "Agendado" e Interrupção Automática do Bot Comercial
  console.log('\n--- 6. Atualização para "Agendado" e Interrupção Automática do Bot Comercial ---');
  const payloadAgendado = {
    ...payloadNovo,
    status: 'Agendado'
  };

  const updateResult = ordersService.processBrizexOrderPayload(payloadAgendado, {
    ip: '127.0.0.1',
    origin: 'brizex'
  });

  if (!updateResult.success || updateResult.action !== 'updated') {
    throw new Error(`Falha ao atualizar pedido para Agendado: ${updateResult.message}`);
  }

  const convState = conversationsService.getConversation(testPhone);
  if (convState?.attendanceMode !== 'manual') {
    throw new Error(`Falha: modo de atendimento deveria ser 'manual', mas está '${convState?.attendanceMode}'`);
  }
  console.log('✅ Modo de atendimento do cliente alterado para "manual" ao entrar legitimamente em "Agendado".');

  // 7. Verificação dos Logs de Sincronização
  console.log('\n--- 7. Verificação dos Logs de Sincronização ---');
  const logs = ordersService.getSyncLogs(10);
  const relevantLog = logs.find((l) => l.logzzOrderId === testLogzzId);

  if (!relevantLog || !relevantLog.sucesso) {
    throw new Error('Falha: log de sincronização para o pedido não foi gravado corretamente.');
  }
  console.log(`✅ Log de sincronização registrado com sucesso (ID: ${relevantLog.id}, Operação: ${relevantLog.tipoOperacao}).`);

  console.log('\n====================================================');
  console.log('🎉 TODOS OS TESTES BRIZEX & CRM PASSARAM COM SUCESSO!');
  console.log('====================================================\n');
}

runBrizexOrdersTests().catch((err) => {
  console.error('❌ ERRO NO TESTE BRIZEX/PEDIDOS:', err);
  process.exit(1);
});
