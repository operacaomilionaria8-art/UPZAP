import { automationEngineService } from '../server/automation-engine.service';
import { ordersService } from '../server/orders.service';
import { conversationsService } from '../server/conversations.service';
import { UpZapRule, LinearFlow, UpZapOrder } from '../src/types/upzap';

async function runRulesFlowsBrizexTests() {
  console.log('====================================================');
  console.log('🚀 UPZAP: TESTES DE REGRAS, MÚLTIPLOS FLUXOS E BRIZEX');
  console.log('====================================================\n');

  // ----------------------------------------------------
  // 1. TESTE DO SISTEMA DE REGRAS (CRUD & DUPLICAÇÃO)
  // ----------------------------------------------------
  console.log('--- 1. Gestão de Regras Independentes ---');

  const testRule: Partial<UpZapRule> = {
    nome: 'Regra Teste Pedido Agendado',
    descricao: 'Dispara quando pedido for agendado na Brizex',
    tipoGatilho: 'pedido_agendado',
    statusPedido: 'Agendado',
    prioridade: 'Alta',
    ativo: true,
    resposta: 'Olá {{nome}}! Seu pedido #{{pedido}} foi confirmado no valor de R$ {{valor}}.',
    palavras: ['confirmar', 'agendado']
  };

  const createdRule = automationEngineService.createRule(testRule);
  console.log(`✅ Regra criada: ${createdRule.id} - "${createdRule.nome}"`);

  if (!createdRule.id || createdRule.nome !== testRule.nome) {
    throw new Error('Falha ao criar regra');
  }

  // Duplicar regra
  const duplicatedRule = automationEngineService.duplicateRule(createdRule.id);
  if (!duplicatedRule || !duplicatedRule.nome.includes('(Cópia)')) {
    throw new Error('Falha ao duplicar regra');
  }
  console.log(`✅ Regra duplicada com sucesso: "${duplicatedRule.nome}"`);

  // Alternar ativo
  const toggledRule = automationEngineService.toggleRuleActive(createdRule.id);
  if (!toggledRule || toggledRule.ativo !== false) {
    throw new Error('Falha ao desativar regra');
  }
  automationEngineService.toggleRuleActive(createdRule.id);
  console.log('✅ Alternância de status ativo/inativo da regra aprovada.');

  // ----------------------------------------------------
  // 2. TESTE DO SISTEMA DE FLUXOS (CRUD, VINCULAÇÃO DE REGRA E BLOCOS)
  // ----------------------------------------------------
  console.log('\n--- 2. Gestão de Múltiplos Fluxos e Blocos ---');

  const testFlowData: Partial<LinearFlow> = {
    nome: 'Fluxo Acompanhamento de Pedido',
    descricao: 'Fluxo acionado pelo webhook de pedidos',
    ativo: true,
    regraGatilhoId: createdRule.id,
    regraGatilhoNome: createdRule.nome,
    blocos: [
      {
        id: 'b_regra_1',
        tipo: 'regra',
        regraId: createdRule.id,
        regraNome: createdRule.nome,
        conteudo: 'Ponto de entrada pela regra'
      },
      {
        id: 'b_msg_1',
        tipo: 'mensagem',
        conteudo: 'Olá, {{nome}}! Recebemos seu pedido #{{pedido}} (Status: {{status}}). Valor: R$ {{valor}}.',
        delay: 1.0
      },
      {
        id: 'b_delay_1',
        tipo: 'delay',
        delay: 2.0,
        conteudo: 'Aguardar processamento'
      },
      {
        id: 'b_tag_1',
        tipo: 'tag',
        tag: 'cliente_brizex_agendado'
      },
      {
        id: 'b_fim_1',
        tipo: 'encerrar',
        conteudo: 'Finalização do fluxo de aviso'
      }
    ]
  };

  const createdFlow = automationEngineService.createFlow(testFlowData);
  console.log(`✅ Fluxo criado: ${createdFlow.id} - "${createdFlow.nome}" com ${createdFlow.blocos.length} blocos`);

  // Atualizar regra com fluxo vinculado
  automationEngineService.updateRule(createdRule.id, {
    fluxoId: createdFlow.id,
    fluxoNome: createdFlow.nome
  });

  // Duplicar fluxo
  const duplicatedFlow = automationEngineService.duplicateFlow(createdFlow.id);
  if (!duplicatedFlow || !duplicatedFlow.nome.includes('(Cópia)')) {
    throw new Error('Falha ao duplicar fluxo');
  }
  console.log(`✅ Fluxo duplicado com sucesso: "${duplicatedFlow.nome}"`);

  // Alternar ativo do fluxo
  const toggledFlow = automationEngineService.toggleFlowActive(createdFlow.id);
  if (!toggledFlow || toggledFlow.ativo !== false) {
    throw new Error('Falha ao desativar fluxo');
  }
  automationEngineService.toggleFlowActive(createdFlow.id);
  console.log('✅ Alternância de status ativo/inativo do fluxo aprovada.');

  // ----------------------------------------------------
  // 3. EXECUÇÃO DO FLUXO COM INTERPOLAÇÃO DE VARIÁVEIS
  // ----------------------------------------------------
  console.log('\n--- 3. Execução do Fluxo e Interpolação de Variáveis ---');

  const testPhone = '5511999887766';
  const testContactName = 'Marina Silva';
  const { conversation: conv } = conversationsService.registerOrUpdateIncomingMessage(
    testPhone,
    'Olá, quero saber do meu pedido',
    testContactName
  );

  const extraVars = {
    pedido: 'BZ-9921',
    status: 'Agendado',
    valor: '167,90',
    rastreio: 'BR992188X',
    itens: '2x Calcinha Cinta Modeladora Bege (G)'
  };

  const execResult = automationEngineService.executeFlow(
    createdFlow.id,
    conv,
    testContactName,
    0,
    undefined,
    extraVars
  );

  console.log(`Resultados da execução: ${execResult.responseTexts.length} mensagens`);
  const replyMessage = execResult.responseTexts[0] || '';
  console.log(`Mensagem gerada: "${replyMessage}"`);

  if (!replyMessage.includes('Marina Silva') || !replyMessage.includes('BZ-9921') || !replyMessage.includes('167,90')) {
    throw new Error('Falha na interpolação de variáveis no fluxo');
  }
  console.log('✅ Interpolação de variáveis {{nome}}, {{pedido}}, {{valor}} no fluxo aprovada.');

  // ----------------------------------------------------
  // 4. TESTE DO DISPARO DO EVENTO DE PEDIDOS BRIZEX
  // ----------------------------------------------------
  console.log('\n--- 4. Disparo de Evento de Pedidos Brizex e Deduplicação ---');

  const sampleOrder: UpZapOrder = {
    id: 'upz_ord_9921',
    logzzOrderId: 'BZ-9921',
    cliente: {
      nome: 'Marina Silva',
      telefone: testPhone,
      email: 'marina@example.com'
    },
    endereco: {
      cep: '01001-000',
      logradouro: 'Praça da Sé',
      numero: '100',
      bairro: 'Sé',
      cidade: 'São Paulo',
      uf: 'SP'
    },
    itens: [
      { nome: 'Kit 2 Cintas', quantidade: 1, valorUnitario: 167.9, valorTotal: 167.9 }
    ],
    status: 'Agendado',
    valorTotal: 167.9,
    statusHistory: [],
    observacoesInternas: [],
    dataCriacao: new Date().toISOString(),
    ultimaAtualizacao: new Date().toISOString(),
    origem: 'brizex'
  };

  // 1º Disparo: deve acionar a regra e o fluxo
  const executions1 = await automationEngineService.triggerOrderEventRules(sampleOrder, 'Agendado');

  if (!executions1 || executions1.length === 0) {
    throw new Error('Falha: webhook de pedido com status Agendado deveria acionar fluxo/regra vinculada');
  }
  console.log(`✅ 1º Disparo de pedido executado: ${executions1[0].ruleName} ➔ ${executions1[0].flowName}`);

  // 2º Disparo imediato com o MESMO pedido e status: deduplicação deve bloquear reenvio
  const executions2 = await automationEngineService.triggerOrderEventRules(sampleOrder, 'Agendado');

  if (executions2 && executions2.length > 0) {
    throw new Error('Falha: deduplicação deveria impedir disparo duplicado do mesmo pedido e status');
  }
  console.log(`✅ Deduplicação confirmada: evento repetido foi ignorado com sucesso (0 novas execuções).`);

  // ----------------------------------------------------
  // 5. TESTE DO HISTÓRICO DE EXECUÇÕES
  // ----------------------------------------------------
  console.log('\n--- 5. Histórico de Execuções e Trilha de Auditoria ---');

  const executions = automationEngineService.getExecutions();
  console.log(`Total de execuções registradas: ${executions.length}`);

  const lastExec = executions.find((e) => e.orderId === 'BZ-9921');
  if (!lastExec) {
    throw new Error('Falha: execução do pedido BZ-9921 não foi gravada em data/flow_executions.json');
  }

  if (lastExec.status !== 'Concluído') {
    throw new Error(`Falha: status da execução esperado "Concluído", recebido "${lastExec.status}"`);
  }

  if (!lastExec.stepsLog || lastExec.stepsLog.length === 0) {
    throw new Error('Falha: trilha de passos (stepsLog) vazia na execução');
  }

  console.log(`✅ Execução registrada com ${lastExec.stepsLog.length} passos de auditoria.`);

  // ----------------------------------------------------
  // 6. VERIFICAÇÃO DE ZERO REFERÊNCIAS A "AURORA"
  // ----------------------------------------------------
  console.log('\n--- 6. Verificação de Eliminação de "Aurora" ---');

  const allRules = automationEngineService.getRules();
  const allFlows = automationEngineService.getFlows();

  for (const r of allRules) {
    const text = JSON.stringify(r);
    if (text.toLowerCase().includes('aurora')) {
      throw new Error(`Inconsistência: regra ${r.id} ainda contém referência a "Aurora"`);
    }
  }

  for (const f of allFlows) {
    const text = JSON.stringify(f);
    if (text.toLowerCase().includes('aurora')) {
      throw new Error(`Inconsistência: fluxo ${f.id} ainda contém referência a "Aurora"`);
    }
  }

  console.log('✅ Nenhuma referência a "Aurora" encontrada nas regras ou fluxos.');

  // Limpeza dos objetos criados no teste
  automationEngineService.deleteRule(createdRule.id);
  automationEngineService.deleteRule(duplicatedRule.id);
  automationEngineService.deleteFlow(createdFlow.id);
  automationEngineService.deleteFlow(duplicatedFlow.id);

  console.log('\n====================================================');
  console.log('🎉 TODOS OS TESTES PASSARAM COM 100% DE SUCESSO!');
  console.log('====================================================');
  process.exit(0);
}

runRulesFlowsBrizexTests().catch((err) => {
  console.error('\n❌ ERRO NO TESTE:', err);
  process.exit(1);
});
