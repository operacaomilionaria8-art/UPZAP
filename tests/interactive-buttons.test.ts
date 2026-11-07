import { automationEngineService } from '../server/automation-engine.service';
import { conversationsService } from '../server/conversations.service';
import { whatsAppDirectService } from '../server/whatsapp-direct.service';

async function runInteractiveTests() {
  console.log('====================================================');
  console.log('🔘 BATERIA DE TESTES DE BOTÕES E MENUS INTERATIVOS');
  console.log('====================================================');

  const testPhone = '5511999998888';
  conversationsService.resetConversationForTest(testPhone);

  // 1. Mensagem inicial com UTM de influenciadora
  console.log('\n--- 1 & 2. Mensagem Inicial e Menu Interativo de Boas-vindas ---');
  const res1 = await automationEngineService.processIncomingMessage({
    phone: testPhone,
    text: 'Olá! Vi o anúncio da inf_0006',
    contactName: 'Juliana Teste',
    isSimulator: true
  });

  const conv1 = conversationsService.getConversation(testPhone);
  console.log(`[Teste] Status: ${res1.status}, Tipo: ${res1.matchedType}, Menu Ativo: ${res1.activeMenu ? 'SIM' : 'NÃO'}`);
  console.log(`[Teste] Opções no menu: ${res1.activeMenu?.opcoes.length}`);
  console.log(`[Teste] Influenciadora detectada: ${conv1?.influencerCode}`);

  if (res1.activeMenu && res1.activeMenu.opcoes.length > 0) {
    console.log('✅ [PASS] Teste 1: Menu de boas-vindas interativo gerado com sucesso');
  } else {
    throw new Error('Falha no Teste 1');
  }

  // 2. Clique em botão por ID estável ('opt_1')
  console.log('\n--- 3, 4 & 5. Recebimento de Clique de Botão (opt_1) ---');
  const res2 = await automationEngineService.processIncomingMessage({
    phone: testPhone,
    text: 'opt_1', // Simula o clique do botão que envia o ID estável interno
    contactName: 'Juliana Teste',
    isSimulator: true
  });

  const conv2 = conversationsService.getConversation(testPhone);
  console.log(`[Teste] Tipo: ${res2.matchedType}, Nome: ${res2.matchedName}, Fluxo: ${res2.flowName}`);

  if (res2.matchedType === 'active_menu' && res2.flowName === 'Preços e Kits') {
    console.log('✅ [PASS] Teste 2: Clique no botão opt_1 executou deterministamente o fluxo "Preços e Kits"');
  } else {
    throw new Error('Falha no Teste 2');
  }

  // 3. Abertura de lista com quatro kits e seleção do kit de 2 unidades
  console.log('\n--- 6 & 7. Abertura de Lista de Kits e Registro do Kit Selecionado ---');
  // O fluxo de Preços e Kits apresenta opções dos kits:
  // 1: 1 unidade (R$ 97,90)
  // 2: 2 unidades (R$ 167,90)
  // 3: 3 unidades (R$ 197,90)
  // 4: 6 unidades (R$ 297,90)
  const res3 = await automationEngineService.processIncomingMessage({
    phone: testPhone,
    text: 'opt_2', // Clique no botão/item da lista do Kit 2 unidades
    contactName: 'Juliana Teste',
    isSimulator: true
  });

  const conv3 = conversationsService.getConversation(testPhone);
  console.log(`[Teste] Kit registrado na conversa: "${conv3?.selectedKit}"`);
  console.log(`[Teste] Fluxo seguinte: ${res3.flowName}`);

  if (conv3?.selectedKit && conv3.selectedKit.includes('2 unidades')) {
    console.log('✅ [PASS] Teste 3: Kit de 2 unidades registrado na memória da conversa');
  } else {
    throw new Error('Falha no Teste 3');
  }

  // 4. Retorno ao Menu Principal
  console.log('\n--- 8. Retorno ao Menu Principal ---');
  const res4 = await automationEngineService.processIncomingMessage({
    phone: testPhone,
    text: 'menu',
    contactName: 'Juliana Teste',
    isSimulator: true
  });

  const conv4 = conversationsService.getConversation(testPhone);
  console.log(`[Teste] Tipo: ${res4.matchedType}, Nome: ${res4.matchedName}`);

  if (
    res4.flowName === 'Boas-vindas Principal' || res4.matchedName?.includes('Voltar ao Início') || res4.matchedName?.includes('Boas-vindas')
  ) {
    console.log('✅ [PASS] Teste 4: Retorno ao menu principal concluído preservando histórico');
  } else {
    throw new Error('Falha no Teste 4');
  }

  // 5. Fallback numerado: resposta como "1" ou "2" sem botões
  console.log('\n--- 10. Fallback Numerado para Aparelhos sem Suporte a Botões ---');
  const res5 = await automationEngineService.processIncomingMessage({
    phone: testPhone,
    text: '1', // Usuário digitando 1 no WhatsApp clássico
    contactName: 'Juliana Teste',
    isSimulator: true
  });

  if (res5.matchedType === 'active_menu' && res5.flowName === 'Preços e Kits') {
    console.log('✅ [PASS] Teste 5: Resposta numérica clássica "1" executa a mesma ação determinística que o botão');
  } else {
    throw new Error('Falha no Teste 5');
  }

  // 6. Ausência de respostas duplicadas
  console.log('\n--- 12. Ausência de Respostas Duplicadas ---');
  if (res5.responseTexts.length <= 2) {
    console.log(`✅ [PASS] Teste 6: Apenas as mensagens configuradas foram disparadas (${res5.responseTexts.length} respostas, sem duplicação)`);
  } else {
    throw new Error('Respostas duplicadas detectadas');
  }

  console.log('\n====================================================');
  console.log('🎉 TODOS OS TESTES INTERATIVOS PASSARAM COM SUCESSO!');
  console.log('====================================================\n');
}

runInteractiveTests().catch((err) => {
  console.error('❌ ERRO NO TESTE:', err);
  process.exit(1);
});
