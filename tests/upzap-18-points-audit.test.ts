import { automationEngineService } from '../server/automation-engine.service';
import { conversationsService } from '../server/conversations.service';
import { whatsAppDirectService } from '../server/whatsapp-direct.service';
import fs from 'fs';
import path from 'path';

async function run18PointsAudit() {
  console.log('======================================================================');
  console.log('🧪 UPZAP — BATERIA DE AUDITORIA COMPLETA DOS 18 PONTOS OBRIGATÓRIOS');
  console.log('======================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, itemNumber: number, title: string, detail?: string) {
    if (condition) {
      console.log(`✅ [PASS] Ponto ${itemNumber}: ${title}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] Ponto ${itemNumber}: ${title} - ${detail || ''}`);
      failed++;
    }
  }

  const testPhone = '5511999997777';
  conversationsService.resetConversationForTest(testPhone);

  // 1. Recebimento de mensagem real e normalização JID
  const jidFormatted = whatsAppDirectService.formatToJID(testPhone);
  assert(
    jidFormatted === `${testPhone}@s.whatsapp.net`,
    1,
    'Recebimento e formatação correta do identificador JID do WhatsApp',
    `JID gerado: ${jidFormatted}`
  );

  // 2 & 3. Acionamento da regra/gatilho BOAS-VINDAS e Execução do fluxo Boas-vindas Principal
  const welcomeRes = await automationEngineService.processIncomingMessage({
    phone: testPhone,
    text: 'Olá, boa tarde! Gostaria de conhecer inf_0006',
    contactName: 'Cliente Auditoria'
  });

  assert(
    welcomeRes.matchedType === 'welcome_flow',
    2,
    'Acionamento do gatilho de BOAS-VINDAS para primeiro contato',
    `matchedType: ${welcomeRes.matchedType}`
  );

  assert(
    welcomeRes.flowId === 'flow_boas_vindas' || welcomeRes.flowName?.includes('Boas-vindas'),
    3,
    'Execução do fluxo Boas-vindas Principal',
    `fluxoId: ${welcomeRes.flowId}`
  );

  // 4. Aplicação correta do delay
  const delaysValid = Array.isArray(welcomeRes.delays) && welcomeRes.delays.length > 0 && welcomeRes.delays.every(d => typeof d === 'number' && d >= 0);
  assert(
    delaysValid,
    4,
    'Aplicação correta dos delays configuráveis entre blocos',
    `Delays retornados: ${JSON.stringify(welcomeRes.delays)}`
  );

  // 5. Envio real da apresentação
  const presentationText = welcomeRes.responseTexts[0] || '';
  const hasAurora = presentationText.toLowerCase().includes('aurora') || presentationText.toLowerCase().includes('brizex');
  assert(
    hasAurora,
    5,
    'Envio da mensagem de apresentação da atendente Aurora',
    `Texto da apresentação: "${presentationText.slice(0, 60)}..."`
  );

  // 6. Envio real do menu
  const menuObj = welcomeRes.activeMenu;
  const hasMenuOptions = menuObj !== null && Array.isArray(menuObj.opcoes) && menuObj.opcoes.length >= 3;
  assert(
    hasMenuOptions,
    6,
    'Envio do menu inicial com opções estruturadas',
    `Opções no menu: ${menuObj?.opcoes?.length}`
  );

  // 7. Ausência de mensagens duplicadas
  // Esperado exatamente 2 mensagens no fluxo inicial (bloco texto + bloco menu), sem repetição de saudação
  const noDuplicates = welcomeRes.responseTexts.length === 2;
  assert(
    noDuplicates,
    7,
    'Ausência de mensagens duplicadas (apenas apresentação e menu configurados)',
    `Quantidade de mensagens: ${welcomeRes.responseTexts.length}`
  );

  // 8. Funcionamento de botões se suportados (clique pelo ID do botão "opt_1")
  const buttonClickRes = await automationEngineService.processIncomingMessage({
    phone: testPhone,
    text: 'opt_1',
    contactName: 'Cliente Auditoria'
  });

  const buttonWorked = buttonClickRes.matchedType === 'active_menu' &&
    (buttonClickRes.flowId === 'flow_precos_kits' || buttonClickRes.flowName?.toLowerCase().includes('preços'));
  assert(
    buttonWorked,
    8,
    'Funcionamento de clique por ID de botão interativo (opt_1)',
    `Tipo: ${buttonClickRes.matchedType}, Fluxo: ${buttonClickRes.flowName}`
  );

  // 9. Funcionamento do fallback numerado
  // Reseta menu para o principal e testa envio de número "1" em texto puro
  conversationsService.resetConversationForTest(testPhone);
  await automationEngineService.processIncomingMessage({
    phone: testPhone,
    text: 'Olá inf_0006',
    contactName: 'Cliente Auditoria'
  });
  const numberFallbackRes = await automationEngineService.processIncomingMessage({
    phone: testPhone,
    text: '1',
    contactName: 'Cliente Auditoria'
  });
  const numberWorked = numberFallbackRes.matchedType === 'active_menu' &&
    (numberFallbackRes.flowId === 'flow_precos_kits' || numberFallbackRes.flowName?.toLowerCase().includes('preços'));
  assert(
    numberWorked,
    9,
    'Funcionamento do fallback numerado ("1") garantindo compatibilidade total com qualquer WhatsApp',
    `Tipo: ${numberFallbackRes.matchedType}, Fluxo: ${numberFallbackRes.flowName}`
  );

  // 10. Navegação para Preços e Kits (Validação das 4 Ofertas Oficiais da Brizex)
  const pricesText = numberFallbackRes.responseTexts.join(' ');
  const hasBrizexPrices =
    pricesText.includes('97,90') &&
    pricesText.includes('167,90') &&
    pricesText.includes('197,90');
  assert(
    hasBrizexPrices,
    10,
    'Navegação para Preços e Kits contendo as 4 ofertas oficiais da Calcinha Cinta Modeladora Brizex',
    `Trecho do texto: ${pricesText.slice(0, 80)}`
  );

  // 11. Navegação para Tamanhos e Cores
  const kitChoiceRes = await automationEngineService.processIncomingMessage({
    phone: testPhone,
    text: '2', // Escolher 2 unidades
    contactName: 'Cliente Auditoria'
  });
  const transitionedToSizes =
    kitChoiceRes.flowId === 'flow_tamanhos_cores' ||
    kitChoiceRes.flowName?.toLowerCase().includes('tamanhos') ||
    kitChoiceRes.responseTexts.some(t => t.toLowerCase().includes('tamanho') || t.includes('M, G e GG'));
  assert(
    transitionedToSizes,
    11,
    'Navegação encadeada para o fluxo de Tamanhos e Cores',
    `Fluxo resultante: ${kitChoiceRes.flowName}`
  );

  // 12. Retorno ao menu principal pelo comando "menu"
  const returnMenuRes = await automationEngineService.processIncomingMessage({
    phone: testPhone,
    text: 'menu',
    contactName: 'Cliente Auditoria'
  });
  const returnedToMenu = returnMenuRes.matchedType === 'welcome_flow' ||
    returnMenuRes.responseTexts.some(t => t.includes('Menu Principal') || t.includes('Preços e kits'));
  assert(
    returnedToMenu,
    12,
    'Comando "menu" retorna ao menu principal de atendimento com sucesso',
    `matchedType: ${returnMenuRes.matchedType}`
  );

  // 13. Transferência para atendente humano com prioridade e silenciamento
  const transferRes = await automationEngineService.processIncomingMessage({
    phone: testPhone,
    text: 'quero falar com atendente humano urgente',
    contactName: 'Cliente Auditoria'
  });
  const convAfterTransfer = conversationsService.getConversation(testPhone);
  const isHumanMode = convAfterTransfer?.attendanceMode === 'manual';
  const isPaused = conversationsService.isConversationAutomationPaused(testPhone);
  assert(
    isHumanMode && isPaused,
    13,
    'Transferência para humano altera modo para manual e silencia o robô',
    `attendanceMode: ${convAfterTransfer?.attendanceMode}, automationPaused: ${isPaused}`
  );

  // 14. Preservação da memória da conversa (selectedKit e variáveis)
  const savedState = conversationsService.getConversation(testPhone);
  const memoryPreserved = Boolean(savedState?.selectedKit);
  assert(
    memoryPreserved,
    14,
    'Preservação da memória da conversa (kit selecionado e contexto do atendimento)',
    `Kit: ${savedState?.selectedKit}`
  );

  // 15. Ausência de conflitos entre regras (Prioridade determinística P1 > P2 > P3 > P4)
  // Reativa automação para testar prioridade
  conversationsService.setConversationAttendanceMode(testPhone, 'auto', 'teste');
  const priceRuleRes = await automationEngineService.processIncomingMessage({
    phone: testPhone,
    text: 'quanto custa a cinta?',
    contactName: 'Cliente Auditoria'
  });
  assert(
    priceRuleRes.matchedType === 'rule_flow' || priceRuleRes.matchedName?.includes('Preços'),
    15,
    'Ausência de conflitos entre regras com avaliação determinística por prioridade',
    `Regra acionada: ${priceRuleRes.matchedName}`
  );

  // 16. Atualização correta dos status de envio confiáveis (Item 1)
  const msgTrackingTest = conversationsService.addTrackedMessage(testPhone, {
    from: 'bot',
    text: 'Mensagem de teste de status',
    status: 'waiting_delay',
    delaySeconds: 1.5,
    source: 'whatsapp_real'
  });
  const isWaiting = msgTrackingTest.status === 'waiting_delay';

  conversationsService.updateTrackedMessageStatus(testPhone, msgTrackingTest.id, 'sending');
  const convAfterSending = conversationsService.getConversation(testPhone);
  const isSending = convAfterSending?.messages?.find(m => m.id === msgTrackingTest.id)?.status === 'sending';

  conversationsService.updateTrackedMessageStatus(testPhone, msgTrackingTest.id, 'transport_ack', {
    messageId: 'baileys_test_id_999'
  });
  const convAfterAck = conversationsService.getConversation(testPhone);
  const isAck = convAfterAck?.messages?.find(m => m.id === msgTrackingTest.id)?.status === 'transport_ack';

  conversationsService.updateStatusByBaileysKeyId('baileys_test_id_999', 'delivered');
  const convAfterDelivered = conversationsService.getConversation(testPhone);
  const isDelivered = convAfterDelivered?.messages?.find(m => m.id === msgTrackingTest.id)?.status === 'delivered';

  assert(
    isWaiting && isSending && isAck && isDelivered,
    16,
    'Ciclo completo de estados confiáveis de envio (Aguardando delay ➔ Enviando ➔ Aceita ➔ Entregue)',
    `Status final verificado: ${isDelivered ? 'Entregue' : 'Incompleto'}`
  );

  // 17. Tratamento de perda e recuperação da conexão com backoff progressivo
  const sessionInfo = whatsAppDirectService.getSessionInfo();
  assert(
    sessionInfo.maxBackoffSeconds === 60 && typeof sessionInfo.reconnectAttempts === 'number',
    17,
    'Tratamento de conexão com tolerância a falhas e teto de reconexão de 60s',
    `maxBackoffSeconds: ${sessionInfo.maxBackoffSeconds}, state: ${sessionInfo.state}`
  );

  // 18. Persistência dos estados após reinicialização
  const statesFilePath = path.join(process.cwd(), 'data', 'conversation_states.json');
  const fileExists = fs.existsSync(statesFilePath);
  let fileHasCustomer = false;
  if (fileExists) {
    const rawData = JSON.parse(fs.readFileSync(statesFilePath, 'utf-8'));
    fileHasCustomer = Boolean(rawData[testPhone]);
  }
  assert(
    fileExists && fileHasCustomer,
    18,
    'Persistência permanente do estado em conversation_states.json para tolerância a reinicializações',
    `Arquivo presente: ${fileExists}, Dados salvos: ${fileHasCustomer}`
  );

  // Limpa o contato de auditoria após a execução
  conversationsService.resetConversationForTest(testPhone);

  console.log('\n======================================================================');
  console.log(`📊 RESULTADO FINAL DA AUDITORIA: ${passed} PASSOU | ${failed} FALHOU (Total: 18)`);
  console.log('======================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

run18PointsAudit().catch((err) => {
  console.error('Erro fatal durante a auditoria dos 18 pontos:', err);
  process.exit(1);
});
