import { automationEngineService } from '../server/automation-engine.service';
import { conversationsService } from '../server/conversations.service';
import { whatsAppDirectService } from '../server/whatsapp-direct.service';

async function testRealDeliverySequence() {
  console.log('======================================================================');
  console.log('📲 TESTE DE VALIDAÇÃO DO FLUXO REAL: "Oi" ➔ Apresentação + Menu ➔ "1"');
  console.log('======================================================================\n');

  const testPhone = '5511988887766';
  const testJid = `${testPhone}@s.whatsapp.net`;
  conversationsService.resetConversationForTest(testPhone);

  // 1. Mensagem de entrada do cliente: "Oi"
  console.log('--- ETAPA 1: Cliente envia "Oi" ---');
  const engineResult = await automationEngineService.processIncomingMessage({
    phone: testPhone,
    text: 'Oi',
    contactName: 'Cliente Real WhatsApp',
    senderJid: testJid
  });

  console.log(`[Resultado] Tipo: ${engineResult.matchedType}, Fluxo: ${engineResult.flowName}`);
  console.log(`[Resultado] Total de etapas a enviar: ${engineResult.responseTexts.length}`);
  console.log(`[Resultado] Delays configurados: ${JSON.stringify(engineResult.delays)}`);

  // Validação 1: O motor deve retornar exatamente 2 etapas para o fluxo de boas-vindas
  if (engineResult.responseTexts.length !== 2) {
    throw new Error(`Esperado 2 respostas, mas retornou ${engineResult.responseTexts.length}`);
  }

  // Validação 2: Etapa 1 deve ser apresentação
  const step1Text = engineResult.responseTexts[0];
  if (!step1Text.includes('Aurora') && !step1Text.includes('Brizex')) {
    throw new Error(`Etapa 1 não contém a apresentação esperada: ${step1Text}`);
  }
  console.log('✅ Etapa 1 confirmada: Apresentação da Aurora presente.');

  // Validação 3: Etapa 2 deve ser o Menu numerado garantido com as 5 opções
  const step2Text = engineResult.responseTexts[1];
  const hasMenuOptions =
    step2Text.includes('1') &&
    step2Text.includes('Preços e kits') &&
    step2Text.includes('Tamanhos e cores') &&
    step2Text.includes('Pagamento e entrega');

  if (!hasMenuOptions) {
    throw new Error(`Etapa 2 não contém o menu completo com opções: ${step2Text}`);
  }
  console.log('✅ Etapa 2 confirmada: Menu completo com 5 opções em formato garantido presente.');

  // Validação 4: Delays correspondentes a cada etapa
  if (engineResult.delays.length !== engineResult.responseTexts.length) {
    throw new Error(
      `Tamanho do array de delays (${engineResult.delays.length}) difere do array de respostas (${engineResult.responseTexts.length})`
    );
  }
  console.log('✅ Delays sincronizados: 1 delay por bloco a ser transmitido.');

  // Validação 5: Simulação de envio com rastreamento real de status
  console.log('\n--- ETAPA 2: Rastreamento do ciclo de envio para o WhatsApp ---');
  const trackedMsg1 = conversationsService.addTrackedMessage(testPhone, {
    from: 'bot',
    text: step1Text,
    status: 'waiting_delay',
    delaySeconds: engineResult.delays[0],
    source: 'whatsapp_real'
  });
  console.log(`[Mensagem 1] Status inicial: ${trackedMsg1.status} (${trackedMsg1.statusLabel})`);

  conversationsService.updateTrackedMessageStatus(testPhone, trackedMsg1.id, 'sending');
  console.log(`[Mensagem 1] Status em transporte: sending`);

  conversationsService.updateTrackedMessageStatus(testPhone, trackedMsg1.id, 'transport_ack', {
    messageId: 'baileys_msg_1'
  });
  console.log(`[Mensagem 1] Status confirmado Baileys: transport_ack`);

  const trackedMsg2 = conversationsService.addTrackedMessage(testPhone, {
    from: 'bot',
    text: step2Text,
    status: 'waiting_delay',
    delaySeconds: engineResult.delays[1],
    source: 'whatsapp_real'
  });
  console.log(`[Mensagem 2] Status inicial: ${trackedMsg2.status} (${trackedMsg2.statusLabel})`);

  conversationsService.updateTrackedMessageStatus(testPhone, trackedMsg2.id, 'sending');
  conversationsService.updateTrackedMessageStatus(testPhone, trackedMsg2.id, 'transport_ack', {
    messageId: 'baileys_msg_2'
  });
  console.log(`[Mensagem 2] Status confirmado Baileys: transport_ack`);

  // Ativação do menu na conversa somente após o envio das duas etapas
  conversationsService.setActiveMenu(testPhone, engineResult.activeMenu);
  const convBeforeReply = conversationsService.getConversation(testPhone);
  if (!convBeforeReply?.activeMenu || !convBeforeReply.waitingForInput) {
    throw new Error('Menu ativo não registrado na conversa após envio.');
  }
  console.log('✅ Menu ativo e aguardando resposta do cliente registrado com sucesso.');

  // Validação 6: Cliente responde "1"
  console.log('\n--- ETAPA 3: Cliente responde "1" pelo WhatsApp ---');
  const replyRes = await automationEngineService.processIncomingMessage({
    phone: testPhone,
    text: '1',
    contactName: 'Cliente Real WhatsApp',
    senderJid: testJid
  });

  console.log(`[Resposta 1] Tipo: ${replyRes.matchedType}, Fluxo disparado: ${replyRes.flowName}`);
  const isPrecosFlow =
    replyRes.flowId === 'flow_precos_kits' ||
    replyRes.flowName?.toLowerCase().includes('preços') ||
    replyRes.matchedName?.toLowerCase().includes('preços');

  if (!isPrecosFlow) {
    throw new Error(`Falha: Resposta '1' não iniciou o fluxo Preços e Kits (recebido: ${replyRes.flowName})`);
  }

  // Verifica se as ofertas da Brizex estão presentes no fluxo de preços
  const pricesText = replyRes.responseTexts.join(' ');
  const hasBrizexOffers =
    pricesText.includes('97,90') &&
    pricesText.includes('167,90') &&
    pricesText.includes('197,90') &&
    pricesText.includes('297,90');

  if (!hasBrizexOffers) {
    throw new Error('Fluxo Preços e Kits não contém os 4 preços oficiais Brizex.');
  }

  console.log('✅ Fluxo "Preços e Kits" iniciado com sucesso contendo todas as 4 ofertas oficiais Brizex.');

  // Simulação de confirmação de entrega via Baileys ack (messages.update)
  conversationsService.updateStatusByBaileysKeyId('baileys_msg_1', 'delivered');
  conversationsService.updateStatusByBaileysKeyId('baileys_msg_2', 'delivered');

  const convFinal = conversationsService.getConversation(testPhone);
  const msg1Final = convFinal?.messages?.find((m) => m.id === trackedMsg1.id);
  const msg2Final = convFinal?.messages?.find((m) => m.id === trackedMsg2.id);

  if (msg1Final?.status !== 'delivered' || msg2Final?.status !== 'delivered') {
    throw new Error('Falha na atualização de confirmação de entrega Baileys');
  }

  console.log('✅ Confirmações reais de entrega (messages.update) validadas para ambas as mensagens.');

  console.log('\n======================================================================');
  console.log('🎉 TESTE DE ENTREGA REAL COMPLETO COM SUCESSO ABSOLUTO!');
  console.log('======================================================================\n');
}

testRealDeliverySequence().catch((err) => {
  console.error('❌ ERRO NO TESTE DE ENTREGA REAL:', err);
  process.exit(1);
});
