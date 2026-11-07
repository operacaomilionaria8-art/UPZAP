/**
 * SUÍTE DE TESTES DE REGRESSÃO — CORREÇÃO CRÍTICA DE TRANSFERÊNCIA INDEVIDA
 * UPZAP AUTOMATION & ATTENDANCE MODE INTEGRITY
 * 
 * Cobertura Completa de Testes Obrigatórios (A até I):
 * - Teste A: Seleção numérica de menu ("1", "2", "3", "4", "1.", "#1", "opcao 1")
 * - Teste B: Mensagens com atraso/delay sem transferência espúria
 * - Teste C: Ação "Devolver para o robô" persistente e reativação automática
 * - Teste D: Proteção contra eventos obsoletos e concorrência (modeChangedAt guard)
 * - Teste E: Deduplicação de mensagens Baileys
 * - Teste F: Transferência legítima para equipe humana (somente gatilhos explícitos)
 * - Teste G: Tratamento de opções inválidas sem transferência indevida
 * - Teste H: Persistência durável em disco (data/conversation_states.json)
 * - Teste I: Concorrência de múltiplos contatos sem vazamento de estado
 */

import { automationEngineService } from '../server/automation-engine.service.js';
import { conversationsService } from '../server/conversations.service.js';
import * as fs from 'fs';
import * as path from 'path';

let passedTests = 0;
let totalTests = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✅ [PASS] ${testName}`);
  } else {
    console.error(`  ❌ [FAIL] ${testName}${detail ? ` - ${detail}` : ''}`);
    throw new Error(`Assertion failed: ${testName}`);
  }
}

async function runRegressionSuite() {
  console.log('\n================================================================');
  console.log('🚀 INICIANDO AUDITORIA E TESTES DE REGRESSÃO DE ATENDIMENTO UPZAP');
  console.log('================================================================\n');

  // -------------------------------------------------------------------------
  // TESTE A: Resposta com opções numéricas do menu
  // -------------------------------------------------------------------------
  console.log('--- TESTE A: Seleção Numérica do Menu ---');
  const phoneA = '5511999991001';
  conversationsService.resetConversationForTest(phoneA);
  conversationsService.setConversationAttendanceMode(phoneA, 'auto', 'teste_a');

  // 1. Envia "Oi"
  const resA1 = await automationEngineService.processIncomingMessage({
    phone: phoneA,
    text: 'Oi',
    contactName: 'Mariana',
    senderJid: `${phoneA}@s.whatsapp.net`
  });

  assert(
    resA1.activeMenu !== null && resA1.activeMenu !== undefined && resA1.activeMenu.opcoes.length === 5,
    'A1: Mensagem inicial "Oi" apresenta menu com 5 opções',
    `Opções: ${resA1.activeMenu?.opcoes.length}`
  );
  assert(
    resA1.status === 'success' || resA1.matchedType === 'welcome_flow',
    'A2: Status permanece em modo robô ativo (não transferido)',
    `Status: ${resA1.status}`
  );

  // 2. Cliente envia "1"
  const resA2 = await automationEngineService.processIncomingMessage({
    phone: phoneA,
    text: '1',
    contactName: 'Mariana',
    senderJid: `${phoneA}@s.whatsapp.net`
  });

  assert(
    resA2.matchedId === 'flow_precos_kits' || resA2.matchedType === 'active_menu',
    'A3: Opção "1" executa imediatamente o fluxo de Preços e Kits',
    `Matched: ${resA2.matchedType} / ${resA2.matchedId}`
  );
  assert(
    resA2.matchedType !== 'human_transfer',
    'A4: Opção "1" NUNCA aciona transferência humana'
  );

  const convA = conversationsService.getConversation(phoneA);
  assert(
    convA?.attendanceMode === 'auto',
    'A5: Modo de atendimento permanece estritamente "auto" após escolha "1"',
    `Modo: ${convA?.attendanceMode}`
  );

  // 3. Variações de formato numérico: "2.", "#3", "opcao 4"
  const testVariations = [
    { text: '2.', expectedFlow: 'flow_tamanhos_cores', label: 'Formato "2."' },
    { text: '#3', expectedFlow: 'flow_pagamento_entrega', label: 'Formato "#3"' },
    { text: 'opcao 4', expectedFlow: 'flow_finalizar_compra', label: 'Formato "opcao 4"' }
  ];

  for (const v of testVariations) {
    // Reativa menu para testar cada variação
    await automationEngineService.processIncomingMessage({
      phone: phoneA,
      text: 'menu',
      contactName: 'Mariana',
      senderJid: `${phoneA}@s.whatsapp.net`
    });

    const resVar = await automationEngineService.processIncomingMessage({
      phone: phoneA,
      text: v.text,
      contactName: 'Mariana',
      senderJid: `${phoneA}@s.whatsapp.net`
    });

    assert(
      resVar.matchedId === v.expectedFlow,
      `A6: Reconhecimento robusto do ${v.label} direciona para ${v.expectedFlow}`,
      `Resultado: ${resVar.matchedId}`
    );
  }

  // -------------------------------------------------------------------------
  // TESTE B: Mensagens com atraso e delays simulados
  // -------------------------------------------------------------------------
  console.log('\n--- TESTE B: Mensagens com Atraso e Delays de Digitação ---');
  const phoneB = '5511999991002';
  conversationsService.resetConversationForTest(phoneB);
  conversationsService.setConversationAttendanceMode(phoneB, 'auto', 'teste_b');

  // Simula fluxo com delays configurados
  const resB = await automationEngineService.processIncomingMessage({
    phone: phoneB,
    text: 'preço',
    contactName: 'Carla',
    senderJid: `${phoneB}@s.whatsapp.net`
  });

  assert(
    resB.delays.length > 0 && resB.delays.every((d) => d >= 0 && d <= 10),
    'B1: Delays das respostas do fluxo estão no intervalo seguro',
    `Delays: ${resB.delays.join(', ')}`
  );

  // Simula atraso assíncrono de transporte
  await new Promise((r) => setTimeout(r, 200));

  const convB = conversationsService.getConversation(phoneB);
  assert(
    convB?.attendanceMode === 'auto' && !convB?.automationPaused,
    'B2: Delay não causa timeout indevido nem transferência espúria para humano',
    `Modo: ${convB?.attendanceMode}`
  );

  // -------------------------------------------------------------------------
  // TESTE C: "Devolver para o robô" e reativação automática
  // -------------------------------------------------------------------------
  console.log('\n--- TESTE C: Devolver para o Robô ---');
  const phoneC = '5511999991003';
  conversationsService.resetConversationForTest(phoneC);

  // 1. Operador assume atendimento manual
  conversationsService.assumeManualAttendance(phoneC, 'Operador Teste');
  let convC = conversationsService.getConversation(phoneC);
  assert(
    convC?.attendanceMode === 'manual',
    'C1: Atendimento colocado em modo manual com sucesso',
    `Modo: ${convC?.attendanceMode}`
  );

  // 2. Cliente envia mensagem enquanto manual -> bot deve ficar silenciado
  const resCManual = await automationEngineService.processIncomingMessage({
    phone: phoneC,
    text: 'quanto custa o kit?',
    contactName: 'Luciana',
    senderJid: `${phoneC}@s.whatsapp.net`
  });

  assert(
    resCManual.matchedType === 'muted' && resCManual.responseTexts.length === 0,
    'C2: Bot permanece rigorosamente silenciado enquanto em modo manual',
    `MatchedType: ${resCManual.matchedType}`
  );

  // 3. Operador clica em "Devolver para o robô"
  conversationsService.resumeAutoAttendance(phoneC, 'Operador Teste');
  convC = conversationsService.getConversation(phoneC);
  assert(
    convC?.attendanceMode === 'auto' && !convC?.automationPaused,
    'C3: Devolver para o robô redefine modo para "auto" e limpa pausas',
    `Modo: ${convC?.attendanceMode}`
  );

  // 4. Cliente envia nova mensagem com palavra-chave -> robô responde imediatamente
  const resCAuto = await automationEngineService.processIncomingMessage({
    phone: phoneC,
    text: 'preço',
    contactName: 'Luciana',
    senderJid: `${phoneC}@s.whatsapp.net`
  });

  assert(
    resCAuto.matchedType !== 'muted' && resCAuto.responseTexts.length > 0,
    'C4: Robô volta a responder mensagens imediatamente após ser devolvido',
    `Respostas: ${resCAuto.responseTexts.length}`
  );

  const convCAfter = conversationsService.getConversation(phoneC);
  assert(
    convCAfter?.attendanceMode === 'auto',
    'C5: Modo de atendimento permanece "auto" de forma durável (não transfere de volta)',
    `Modo pós-resposta: ${convCAfter?.attendanceMode}`
  );

  // -------------------------------------------------------------------------
  // TESTE D: Eventos obsoletos e proteção contra concorrência (modeChangedAt)
  // -------------------------------------------------------------------------
  console.log('\n--- TESTE D: Proteção contra Eventos Obsoletos (modeChangedAt Guard) ---');
  const phoneD = '5511999991004';
  conversationsService.resetConversationForTest(phoneD);

  // 1. Robô devolvido agora
  const now = Date.now();
  const timePast = new Date(now - 10000).toISOString(); // 10s no passado

  conversationsService.setConversationAttendanceMode(phoneD, 'auto', 'operador');

  // 2. Um evento assíncrono antigo (ex: webhook atrasado com timestamp de 10s atrás) tenta mudar para 'manual'
  conversationsService.updateConversation(phoneD, {
    attendanceMode: 'manual',
    modeChangedAt: timePast,
    modeChangedBy: 'evento_antigo_atrasado'
  });

  const convD = conversationsService.getConversation(phoneD);
  assert(
    convD?.attendanceMode === 'auto',
    'D1: Evento assíncrono obsoleto com timestamp antigo NÃO sobrescreve a decisão recente do operador',
    `Modo atual mantido: ${convD?.attendanceMode}`
  );

  // -------------------------------------------------------------------------
  // TESTE E: Deduplicação de mensagens
  // -------------------------------------------------------------------------
  console.log('\n--- TESTE E: Deduplicação de Mensagens Baileys ---');
  const phoneE = '5511999991005';
  conversationsService.resetConversationForTest(phoneE);

  const fakeMsgId = `BAILEYS_MSG_${Date.now()}`;
  const isFirstTime = !conversationsService.hasProcessedMessageId(fakeMsgId);
  conversationsService.markMessageIdProcessed(fakeMsgId);
  const isSecondTime = conversationsService.hasProcessedMessageId(fakeMsgId);

  assert(
    isFirstTime === true && isSecondTime === true,
    'E1: Identificador de mensagem único é registrado e deduplicado com sucesso'
  );

  // -------------------------------------------------------------------------
  // TESTE F: Transferência legítima para atendimento humano
  // -------------------------------------------------------------------------
  console.log('\n--- TESTE F: Transferência Legítima Apenas sob Gatilho Explícito ---');
  const phoneF = '5511999991006';
  conversationsService.resetConversationForTest(phoneF);
  conversationsService.setConversationAttendanceMode(phoneF, 'auto', 'teste_f');

  // 1. Mensagem explícita "falar com atendente"
  const resF1 = await automationEngineService.processIncomingMessage({
    phone: phoneF,
    text: 'gostaria de falar com atendente',
    contactName: 'Renata',
    senderJid: `${phoneF}@s.whatsapp.net`
  });

  assert(
    resF1.matchedType === 'human_transfer',
    'F1: Frase explícita "falar com atendente" aciona transferência humana com sucesso',
    `Matched: ${resF1.matchedType}`
  );

  const convF1 = conversationsService.getConversation(phoneF);
  assert(
    convF1?.attendanceMode === 'manual',
    'F2: Conversa passa legitimamente para modo manual',
    `Modo: ${convF1?.attendanceMode}`
  );

  // 2. Opção 5 do Menu Principal ("Falar com atendente")
  conversationsService.resetConversationForTest(phoneF);
  conversationsService.setConversationAttendanceMode(phoneF, 'auto', 'teste_f2');

  // Abre menu
  await automationEngineService.processIncomingMessage({
    phone: phoneF,
    text: 'menu',
    contactName: 'Renata',
    senderJid: `${phoneF}@s.whatsapp.net`
  });

  // Envia "5"
  const resF5 = await automationEngineService.processIncomingMessage({
    phone: phoneF,
    text: '5',
    contactName: 'Renata',
    senderJid: `${phoneF}@s.whatsapp.net`
  });

  assert(
    resF5.matchedType === 'human_transfer' || resF5.matchedId === 'transferir_humano' || resF5.matchedName.includes('atendente'),
    'F3: Opção 5 do menu aciona transferência legítima',
    `Matched: ${resF5.matchedType}`
  );

  const convF5 = conversationsService.getConversation(phoneF);
  assert(
    convF5?.attendanceMode === 'manual',
    'F4: Modo manual ativado após cliente escolher opção 5',
    `Modo: ${convF5?.attendanceMode}`
  );

  // -------------------------------------------------------------------------
  // TESTE G: Tratamento de opções inválidas sem transferência indevida
  // -------------------------------------------------------------------------
  console.log('\n--- TESTE G: Opções Inválidas sem Transferência Indevida ---');
  const phoneG = '5511999991007';
  conversationsService.resetConversationForTest(phoneG);
  conversationsService.setConversationAttendanceMode(phoneG, 'auto', 'teste_g');

  // Abre menu (1 a 5)
  await automationEngineService.processIncomingMessage({
    phone: phoneG,
    text: 'Oi',
    contactName: 'Fernanda',
    senderJid: `${phoneG}@s.whatsapp.net`
  });

  // Cliente digita número fora do menu: "9"
  const resG = await automationEngineService.processIncomingMessage({
    phone: phoneG,
    text: '9',
    contactName: 'Fernanda',
    senderJid: `${phoneG}@s.whatsapp.net`
  });

  assert(
    resG.matchedType === 'menu_invalid_option',
    'G1: Opção "9" é tratada como opção inválida do menu',
    `Matched: ${resG.matchedType}`
  );
  assert(
    resG.responseTexts[0].includes('1 a 5') || resG.responseTexts[0].includes('1 e 5'),
    'G2: Resposta orienta o cliente com educação sem repassar para atendente'
  );

  const convG = conversationsService.getConversation(phoneG);
  assert(
    convG?.attendanceMode === 'auto',
    'G3: Modo de atendimento permanece "auto" (NUNCA transferido para humano)',
    `Modo: ${convG?.attendanceMode}`
  );
  assert(
    convG?.activeMenu !== null && convG?.activeMenu !== undefined,
    'G4: Menu continua ativo aguardando nova escolha válida'
  );

  // -------------------------------------------------------------------------
  // TESTE H: Persistência durável em disco (data/conversation_states.json)
  // -------------------------------------------------------------------------
  console.log('\n--- TESTE H: Persistência Durável em Disco ---');
  const statesPath = path.join(process.cwd(), 'data', 'conversation_states.json');
  assert(fs.existsSync(statesPath), 'H1: Arquivo conversation_states.json existe no disco');

  const fileRaw = fs.readFileSync(statesPath, 'utf-8');
  const diskStates = JSON.parse(fileRaw);

  assert(
    diskStates[phoneA] !== undefined && diskStates[phoneA].attendanceMode === 'auto',
    'H2: Estado do contato A persiste como "auto" no arquivo físico JSON',
    `Gravado: ${diskStates[phoneA]?.attendanceMode}`
  );
  assert(
    diskStates[phoneC] !== undefined && diskStates[phoneC].attendanceMode === 'auto',
    'H3: Estado do contato C persiste como "auto" no arquivo físico JSON após Devolver ao Robô'
  );

  // -------------------------------------------------------------------------
  // TESTE I: Concorrência e isolamento entre contatos
  // -------------------------------------------------------------------------
  console.log('\n--- TESTE I: Concorrência de Múltiplos Contatos ---');
  const concurrentPhones = ['5511999992001', '5511999992002', '5511999992003', '5511999992004'];

  const results = await Promise.all(
    concurrentPhones.map(async (phone, idx) => {
      conversationsService.resetConversationForTest(phone);
      conversationsService.setConversationAttendanceMode(phone, 'auto', 'teste_i');

      // Interação 1
      await automationEngineService.processIncomingMessage({
        phone,
        text: 'Oi',
        contactName: `Cliente ${idx}`,
        senderJid: `${phone}@s.whatsapp.net`
      });

      // Interação 2 concorrente com opções diferentes
      const optionNum = String((idx % 4) + 1);
      return automationEngineService.processIncomingMessage({
        phone,
        text: optionNum,
        contactName: `Cliente ${idx}`,
        senderJid: `${phone}@s.whatsapp.net`
      });
    })
  );

  assert(
    results.every((r) => r.matchedId && r.matchedId.startsWith('flow_')),
    'I1: Todas as chamadas concorrentes processaram opções de fluxo com sucesso'
  );
  assert(
    results.every((r) => r.matchedType !== 'human_transfer'),
    'I2: NENHUMA chamada concorrente sofreu transferência indevida para humano'
  );

  for (const phone of concurrentPhones) {
    const c = conversationsService.getConversation(phone);
    assert(
      c?.attendanceMode === 'auto',
      `I3: Contato ${phone} manteve modo auto isolado`,
      `Modo: ${c?.attendanceMode}`
    );
  }

  console.log('\n================================================================');
  console.log(`🎉 TODOS OS TESTES PASSARAM! (${passedTests}/${totalTests} asserções)`);
  console.log('================================================================\n');
}

runRegressionSuite().catch((err) => {
  console.error('\n❌ ERRO NA SUÍTE DE TESTES:', err);
  process.exit(1);
});
