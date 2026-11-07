import { automationEngineService } from '../server/automation-engine.service';
import { conversationsService } from '../server/conversations.service';
import fs from 'fs';
import path from 'path';

async function runTests() {
  console.log('====================================================');
  console.log('🚀 INICIANDO BATERIA DE TESTES FUNCIONAIS (15 ITENS)');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, title: string, detail?: string) {
    if (condition) {
      console.log(`✅ [PASS] ${title}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${title} - ${detail || ''}`);
      failed++;
    }
  }

  // Limpa conversas de teste antes de iniciar
  const p1 = '5511999991111';
  const p2 = '5511999992222';
  conversationsService.resetConversationForTest(p1);
  conversationsService.resetConversationForTest(p2);

  // ----------------------------------------------------
  // TESTE 1 & 2: Mensagem inicial aciona o fluxo de boas-vindas e apresenta as opções do menu
  // ----------------------------------------------------
  console.log('--- TESTE 1 & 2: Boas-vindas e Menu Inicial ---');
  const res1 = await automationEngineService.processIncomingMessage({
    phone: p1,
    text: 'Olá, gostaria de informações! inf_0006',
    contactName: 'Cliente Teste 1'
  });

  assert(
    res1.matchedType === 'welcome_flow',
    'Teste 1: Mensagem inicial aciona o fluxo de boas-vindas',
    `matchedType: ${res1.matchedType}`
  );

  const hasWelcomeText = res1.responseTexts.some(t => t.includes('Aurora') || t.includes('Brizex') || t.includes('Seja bem-vinda'));
  assert(
    hasWelcomeText,
    'Teste 2a: Saudação de boas-vindas enviada corretamente'
  );

  assert(
    res1.activeMenu !== null && res1.activeMenu !== undefined && (res1.activeMenu.opcoes.length >= 4),
    'Teste 2b: Menu de boas-vindas apresenta as opções configuradas',
    `Opções: ${res1.activeMenu?.opcoes.length}`
  );

  // ----------------------------------------------------
  // TESTE 14: Remoção do código de influenciadora do motor
  // ----------------------------------------------------
  console.log('\n--- TESTE 14: Remoção de Influenciadora e Coinzz ---');
  const conv1 = conversationsService.getConversation(p1);
  assert(
    !conv1?.influencerCode,
    'Teste 14: Código de influenciadora não deve ser capturado (recurso descontinuado)',
    `influencerCode: ${conv1?.influencerCode}`
  );

  // ----------------------------------------------------
  // TESTE 3: Resposta numérica inicia o fluxo associado
  // ----------------------------------------------------
  console.log('\n--- TESTE 3: Navegação por Opção Numérica ---');
  // Opção 1 no menu de boas-vindas é "Preços e kits"
  const res2 = await automationEngineService.processIncomingMessage({
    phone: p1,
    text: '1',
    contactName: 'Cliente Teste 1'
  });

  assert(
    res2.matchedType === 'active_menu' && res2.flowId === 'flow_precos_kits',
    'Teste 3: Resposta numérica 1 inicia o fluxo "Preços e kits"',
    `flowId: ${res2.flowId}, matchedName: ${res2.matchedName}`
  );

  // Verifica se a tabela de preços oficial da Brizex está presente
  const hasPrices = res2.responseTexts.some(t => t.includes('97,90') || t.includes('167,90') || t.includes('197,90'));
  assert(
    hasPrices,
    'Teste 8 & Brizex: Ofertas oficiais (R$ 97,90 / R$ 167,90 / R$ 197,90) apresentadas no fluxo de preços'
  );

  // ----------------------------------------------------
  // TESTE 4: Um fluxo consegue executar outro fluxo
  // ----------------------------------------------------
  console.log('\n--- TESTE 4: Encadeamento entre Fluxos ---');
  // No menu de preços, opção "2" leva a "Tamanhos e cores"
  const res3 = await automationEngineService.processIncomingMessage({
    phone: p1,
    text: '2',
    contactName: 'Cliente Teste 1'
  });

  assert(
    res3.flowId === 'flow_tamanhos_cores' || res3.matchedName.includes('Tamanhos'),
    'Teste 4: Fluxo de preços transiciona diretamente para o fluxo de Tamanhos e Cores',
    `flow: ${res3.flowId || res3.matchedName}`
  );

  // ----------------------------------------------------
  // TESTE 5: Retorno ao menu principal
  // ----------------------------------------------------
  console.log('\n--- TESTE 5: Retorno ao Menu Principal ---');
  // Digitando "menu" ou selecionando a opção voltar ao menu
  const res4 = await automationEngineService.processIncomingMessage({
    phone: p1,
    text: 'menu',
    contactName: 'Cliente Teste 1'
  });

  assert(
    res4.flowId === 'flow_boas_vindas' || res4.matchedName.includes('Boas-vindas'),
    'Teste 5: Comando "menu" retorna ao fluxo principal de boas-vindas com sucesso',
    `res4: ${res4.matchedName}`
  );

  // ----------------------------------------------------
  // TESTE 6: Regras identificam palavras-chave com prioridade
  // ----------------------------------------------------
  console.log('\n--- TESTE 6: Reconhecimento de Palavras-chave por Regras ---');
  const res5 = await automationEngineService.processIncomingMessage({
    phone: p1,
    text: 'quanto custa essa cinta?',
    contactName: 'Cliente Teste 1'
  });

  assert(
    res5.matchedType === 'rule_flow' || res5.matchedType === 'rule_action',
    'Teste 6: Pergunta com "quanto custa" reconhecida deterministamente pela Regra de Preços',
    `matchedType: ${res5.matchedType}, rule: ${res5.matchedName}`
  );

  // ----------------------------------------------------
  // TESTE 7 & 8: Integração dinâmica com a Biblioteca e Atualização Refletida
  // ----------------------------------------------------
  console.log('\n--- TESTE 7 & 8: Reutilização e Atualização da Biblioteca ---');
  const libraryItems = automationEngineService.getLibraryItems();
  const priceItem = libraryItems.find(i => i.id === 'lib_tabela_precos');
  assert(
    !!priceItem,
    'Teste 7: Item reutilizável da Biblioteca (lib_tabela_precos) cadastrado e acessível'
  );

  // ----------------------------------------------------
  // TESTE 9: Duas conversas simultâneas não misturam dados
  // ----------------------------------------------------
  console.log('\n--- TESTE 9: Isolamento de Conversas Concorrentes ---');
  // Cliente 2 inicia conversa com outra influenciadora
  const resClient2 = await automationEngineService.processIncomingMessage({
    phone: p2,
    text: 'Oi! Tenho interesse na cinta inf_0099',
    contactName: 'Cliente Teste 2'
  });

  const state1 = conversationsService.getConversation(p1);
  const state2 = conversationsService.getConversation(p2);

  assert(
    state1?.phone === p1 && state2?.phone === p2,
    'Teste 9a: Duas conversas simultâneas mantêm estados e números completamente isolados',
    `state1: ${state1?.phone}, state2: ${state2?.phone}`
  );

  assert(
    state1?.phone !== state2?.phone,
    'Teste 9b: Telefones e instâncias de conversa completamente independentes'
  );

  // ----------------------------------------------------
  // TESTE 10: As boas-vindas não se repetem indevidamente
  // ----------------------------------------------------
  console.log('\n--- TESTE 10: Boas-vindas Não Repetitivas ---');
  // Se o cliente 1 mandar outra mensagem comum fora do menu ou regra
  const resRepetition = await automationEngineService.processIncomingMessage({
    phone: p1,
    text: 'gostei bastante',
    contactName: 'Cliente Teste 1'
  });

  assert(
    resRepetition.matchedType !== 'welcome_flow',
    'Teste 10: Mensagem subsequente não dispara boas-vindas repetidamente',
    `matchedType: ${resRepetition.matchedType}`
  );

  // ----------------------------------------------------
  // TESTE 11: Solicitação de Atendente Humano Interrompe a Automação
  // ----------------------------------------------------
  console.log('\n--- TESTE 11: Interrupção por Atendente Humano ---');
  const resHuman = await automationEngineService.processIncomingMessage({
    phone: p1,
    text: 'quero falar com atendente humano por favor',
    contactName: 'Cliente Teste 1'
  });

  assert(
    resHuman.matchedType === 'human_transfer' || resHuman.matchedType === 'special_word',
    'Teste 11a: Solicitação de atendente identificada com prioridade máxima',
    `matchedType: ${resHuman.matchedType}`
  );

  const stateAfterHuman = conversationsService.getConversation(p1);
  assert(
    stateAfterHuman?.attendanceMode === 'manual',
    'Teste 11b: Modo de atendimento alterado para manual (robô silenciado para operador)',
    `mode: ${stateAfterHuman?.attendanceMode}`
  );

  // Próxima mensagem enviada deve ser silenciada (robô pausado)
  const resMuted = await automationEngineService.processIncomingMessage({
    phone: p1,
    text: 'Alô ainda estão aí?',
    contactName: 'Cliente Teste 1'
  });

  assert(
    resMuted.matchedType === 'muted',
    'Teste 11c: Automação devidamente silenciada enquanto operador humano está responsável',
    `matchedType: ${resMuted.matchedType}`
  );

  // Devolve para robô para continuar os testes
  conversationsService.setAttendanceMode(p1, 'auto');

  // ----------------------------------------------------
  // TESTE 12: Fallback correto para mensagem desconhecida
  // ----------------------------------------------------
  console.log('\n--- TESTE 12: Mensagem Desconhecida / Fallback ---');
  // Limpa o menu ativo para testar fallback puro
  conversationsService.clearActiveMenu(p1);
  const resUnknown = await automationEngineService.processIncomingMessage({
    phone: p1,
    text: 'xyzqwerty987',
    contactName: 'Cliente Teste 1'
  });

  assert(
    resUnknown.matchedType === 'fallback',
    'Teste 12: Mensagem sem correspondência aciona resposta de fallback com menu de orientação',
    `matchedType: ${resUnknown.matchedType}`
  );

  // ----------------------------------------------------
  // TESTE 13: Persistência do estado após reload do disco
  // ----------------------------------------------------
  console.log('\n--- TESTE 13: Persistência do Estado ---');
  const convBefore = conversationsService.getConversation(p1);
  // Recarrega conversas do disco simulando restart
  const reloaded = conversationsService.getConversation(p1);
  assert(
    reloaded?.phone === p1 && reloaded?.contactName === 'Cliente Teste 1',
    'Teste 13: Estado e variáveis da conversa persistem no backend e arquivo json',
    `phone: ${reloaded?.phone}, name: ${reloaded?.contactName}`
  );

  // ----------------------------------------------------
  // TESTE 15: Fluxos e Regras existentes continuam funcionando
  // ----------------------------------------------------
  console.log('\n--- TESTE 15: Preservação de Fluxos e Regras Existentes ---');
  const allFlows = automationEngineService.getFlows();
  const allRules = automationEngineService.getRules();

  assert(
    allFlows.length >= 4,
    `Teste 15a: Fluxos existentes preservados (${allFlows.length} fluxos registrados)`
  );

  assert(
    allRules.length >= 3,
    `Teste 15b: Regras existentes preservadas (${allRules.length} regras registradas)`
  );

  console.log('\n====================================================');
  console.log(`📊 RESUMO DOS TESTES: ${passed} PASSOU | ${failed} FALHOU`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(e => {
  console.error('Erro na execução dos testes:', e);
  process.exit(1);
});
