import { automationEngineService } from '../server/automation-engine.service';
import { conversationsService } from '../server/conversations.service';
import fs from 'fs';
import path from 'path';

async function runTests() {
  console.log('=== TESTE DE VALIDAÇÃO: GATILHO INICIAL, FLUXOS E REGRAS UPZAP ===\n');
  let passed = 0;
  let failed = 0;

  function assert(cond: boolean, name: string) {
    if (cond) {
      console.log(`✅ [PASS] ${name}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${name}`);
      failed++;
    }
  }

  // Backup original state
  const origRules = automationEngineService.getRules();
  const origFlows = automationEngineService.getFlows();

  try {
    // -------------------------------------------------------------
    // TESTE 1: Criar fluxo vazio sem regra predefinida
    // -------------------------------------------------------------
    console.log('--- TESTE 1: Criação de Fluxo Vazio ---');
    const emptyFlowId = `test_flow_vazio_${Date.now()}`;
    const newEmptyFlow = automationEngineService.createFlow({
      id: emptyFlowId,
      nome: 'Fluxo Livre VIP',
      descricao: 'Fluxo criado sem regra predefinida',
      ativo: true,
      status: 'Publicado',
      blocos: [],
      canvasNodes: [],
      canvasConnections: []
    });

    assert(Boolean(newEmptyFlow && newEmptyFlow.id === emptyFlowId), 'Fluxo vazio criado com sucesso');
    assert(newEmptyFlow.regraGatilhoId === undefined, 'Fluxo não possui regra vinculada por padrão');
    assert(newEmptyFlow.blocos.length === 0, 'Fluxo possui 0 blocos automáticos predefinidos');

    // -------------------------------------------------------------
    // TESTE 2: Simulação de mensagem "oi" sem regra cadastrada para essa palavra
    // -------------------------------------------------------------
    console.log('\n--- TESTE 2: Mensagem sem regra ativa correspondente ---');
    const testPhoneNoRule = '5511999990001';
    conversationsService.clearActiveMenu(testPhoneNoRule);
    
    // Temporariamente desativa regras existentes para testar ausência de regras
    automationEngineService.saveRules([]);
    const resNoRule = await automationEngineService.processIncomingMessage(testPhoneNoRule, 'oi');
    assert(
      resNoRule.status === 'no_automation' && resNoRule.responseTexts.length === 0,
      'Sem regras ativas, o recebimento de "oi" não executa nenhuma automação'
    );

    // -------------------------------------------------------------
    // TESTE 3: Criação de regra e vínculo com o fluxo desejado
    // -------------------------------------------------------------
    console.log('\n--- TESTE 3: Criar regra e vincular ao fluxo desejado ---');
    const testRuleId = `test_rule_${Date.now()}`;
    const createdRule = automationEngineService.createRule({
      id: testRuleId,
      nome: 'Regra de Teste Oferta',
      name: 'Regra de Teste Oferta',
      trigger: 'ofertax, superpromo',
      palavras: ['ofertax', 'superpromo'],
      palavrasChave: ['ofertax', 'superpromo'],
      resposta: 'Resposta direta caso sem fluxo',
      response: 'Resposta direta caso sem fluxo',
      fluxoId: emptyFlowId,
      targetFlowId: emptyFlowId,
      fluxoNome: 'Fluxo Livre VIP',
      tipoAcao: 'executar_fluxo',
      actionType: 'executar_fluxo',
      ativo: true,
      active: true
    });

    assert(Boolean(createdRule), 'Regra criada com sucesso');
    assert(createdRule.fluxoId === emptyFlowId, 'Regra vinculada ao fluxo correto');
    assert(createdRule.tipoAcao === 'executar_fluxo', 'Tipo de ação da regra configurado para executar_fluxo');

    // Adiciona um bloco de texto ao fluxo para podermos validar a execução
    automationEngineService.updateFlow(emptyFlowId, {
      blocos: [
        {
          id: 'b1',
          tipo: 'texto',
          conteudo: 'Super oferta especial desbloqueada com sucesso!',
          delay: 1.0
        }
      ]
    });

    // Envia palavra-chave 'ofertax' -> DEVE disparar o fluxo vinculado
    const testPhoneWithRule = '5511999990002';
    conversationsService.clearActiveMenu(testPhoneWithRule);
    const resRuleExec = await automationEngineService.processIncomingMessage(testPhoneWithRule, 'quero a ofertax por favor');
    assert(
      resRuleExec.status === 'success' &&
      resRuleExec.matchedType === 'rule_flow' &&
      resRuleExec.responseTexts.some(t => t.includes('Super oferta especial')),
      'Envio de palavra-chave da regra ativa dispara o fluxo vinculado'
    );

    // -------------------------------------------------------------
    // TESTE 4: Alterar/remover o vínculo entre a regra e o fluxo SEM excluir nenhum dos dois
    // -------------------------------------------------------------
    console.log('\n--- TESTE 4: Desvincular regra do fluxo sem exclusão ---');
    const unlinkedRule = automationEngineService.updateRule(testRuleId, {
      fluxoId: null as any,
      targetFlowId: null as any,
      fluxoNome: null as any,
      tipoAcao: 'resposta',
      actionType: 'resposta'
    });

    assert(Boolean(unlinkedRule), 'Regra atualizada para desvincular fluxo');
    assert(unlinkedRule?.fluxoId === undefined, 'fluxoId da regra removido com sucesso');
    assert(unlinkedRule?.tipoAcao === 'resposta', 'Ação da regra convertida para resposta de texto direta');

    // Verifica que o fluxo NÃO foi excluído
    const preservedFlow = automationEngineService.getFlowById(emptyFlowId);
    assert(Boolean(preservedFlow), 'O fluxo continua existindo no sistema após o desvínculo');

    // Verifica que a regra NÃO foi excluída
    const preservedRule = automationEngineService.getRuleById(testRuleId);
    assert(Boolean(preservedRule), 'A regra continua existindo no sistema após o desvínculo');

    // -------------------------------------------------------------
    // TESTE 5: Com a regra desvinculada, ela NÃO executa mais o fluxo
    // -------------------------------------------------------------
    console.log('\n--- TESTE 5: Execução após desvínculo ---');
    const testPhoneAfterUnlink = '5511999990003';
    conversationsService.clearActiveMenu(testPhoneAfterUnlink);
    const resAfterUnlink = await automationEngineService.processIncomingMessage(testPhoneAfterUnlink, 'ofertax');
    assert(
      resAfterUnlink.matchedType === 'rule_action' &&
      resAfterUnlink.responseTexts.some(t => t.includes('Resposta direta caso sem fluxo')) &&
      !resAfterUnlink.responseTexts.some(t => t.includes('Super oferta especial')),
      'Regra desvinculada responde com texto direto e NÃO executa o fluxo'
    );

    // -------------------------------------------------------------
    // TESTE 6: Desativar a regra
    // -------------------------------------------------------------
    console.log('\n--- TESTE 6: Regra inativa não deve disparar automação ---');
    automationEngineService.updateRule(testRuleId, {
      ativo: false,
      active: false
    });
    const testPhoneInactive = '5511999990004';
    conversationsService.clearActiveMenu(testPhoneInactive);
    const resInactive = await automationEngineService.processIncomingMessage(testPhoneInactive, 'ofertax');
    assert(
      resInactive.status === 'no_automation' && resInactive.responseTexts.length === 0,
      'Regra inativa não dispara nenhuma automação ao receber sua palavra-chave'
    );

  } finally {
    // Restaura estado original
    automationEngineService.saveRules(origRules);
    automationEngineService.saveFlows(origFlows);
  }

  console.log(`\n========================================`);
  console.log(`TOTAL: ${passed + failed} | APROVADOS: ${passed} | FALHAS: ${failed}`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Erro na execução dos testes:', err);
  process.exit(1);
});
