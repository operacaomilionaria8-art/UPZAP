import fs from 'fs';
import path from 'path';
import { automationEngineService } from '../server/automation-engine.service';
import { conversationsService } from '../server/conversations.service';

function getStoredLibraryFiles(): any[] {
  if (fs.existsSync(LIBRARY_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(LIBRARY_FILE, 'utf-8'));
      if (Array.isArray(data)) return data;
    } catch {}
  }
  return [];
}

const API_BASE = 'http://localhost:3000';
const MEDIA_DIR = path.resolve(process.cwd(), 'data', 'media');
const LIBRARY_FILE = path.resolve(process.cwd(), 'data', 'library.json');
const FLOWS_FILE = path.resolve(process.cwd(), 'data', 'flows_blocks.json');
const RULES_FILE = path.resolve(process.cwd(), 'data', 'rules.json');

async function runValidationTests() {
  console.log('===============================================================');
  console.log('🧪 UPZAP: VALIDAÇÃO OBRIGATÓRIA DOS 3 ERROS CORRIGIDOS');
  console.log('===============================================================\n');

  // Backup dos dados originais para não corromper o ambiente
  const originalFlows = fs.existsSync(FLOWS_FILE) ? fs.readFileSync(FLOWS_FILE, 'utf-8') : null;
  const originalRules = fs.existsSync(RULES_FILE) ? fs.readFileSync(RULES_FILE, 'utf-8') : null;
  const originalLibrary = fs.existsSync(LIBRARY_FILE) ? fs.readFileSync(LIBRARY_FILE, 'utf-8') : null;

  try {
    // =========================================================================
    // TESTE 1: EXCLUSÃO REAL DE ARQUIVOS NA BIBLIOTECA
    // =========================================================================
    console.log('--- TESTE 1: Upload e exclusão real de arquivo na Biblioteca ---');
    const testFileName = `teste_validacao_${Date.now()}.pdf`;
    const testFilePath = path.join(MEDIA_DIR, testFileName);
    const fakeContent = Buffer.from('%PDF-1.4 Mock PDF Content For Deletion Validation');

    // 1a. Upload via API
    const uploadRes = await fetch(`${API_BASE}/api/library/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: testFileName,
        fileName: testFileName,
        type: 'pdf',
        base64: fakeContent.toString('base64'),
        size: '15 KB'
      })
    });

    const uploadData = await uploadRes.json();
    console.log(`Upload status: ${uploadRes.status}, success: ${uploadData.success}`);
    if (!uploadData.success || !uploadData.file) {
      throw new Error(`Falha no upload do arquivo de teste: ${JSON.stringify(uploadData)}`);
    }

    const uploadedId = uploadData.file.id;
    if (!fs.existsSync(testFilePath)) {
      throw new Error(`Arquivo físico não foi criado no disco em: ${testFilePath}`);
    }
    console.log(`✅ Arquivo físico gravado no disco: ${testFilePath}`);

    const libAfterUpload = getStoredLibraryFiles();
    const inLib = libAfterUpload.some((f) => f.id === uploadedId || f.fileName === testFileName);
    if (!inLib) {
      throw new Error(`Arquivo não encontrado no registro library.json após upload.`);
    }
    console.log(`✅ Arquivo registrado com sucesso no library.json (ID: ${uploadedId})`);

    // 1b. Exclusão via API
    const deleteRes = await fetch(`${API_BASE}/api/library/files/${encodeURIComponent(uploadedId)}`, {
      method: 'DELETE'
    });
    const deleteData = await deleteRes.json();
    console.log(`Delete status: ${deleteRes.status}, success: ${deleteData.success}`);

    if (!deleteData.success) {
      throw new Error(`Falha ao excluir arquivo na API: ${JSON.stringify(deleteData)}`);
    }

    // 1c. Conferir remoção física do disco
    if (fs.existsSync(testFilePath)) {
      throw new Error(`Arquivo físico ainda existe no disco após exclusão! Caminho: ${testFilePath}`);
    }
    console.log(`✅ Arquivo físico REMOVIDO com sucesso do disco.`);

    // 1d. Conferir remoção do registro
    const libAfterDelete = getStoredLibraryFiles();
    const stillInLib = libAfterDelete.some((f) => f.id === uploadedId || f.fileName === testFileName);
    if (stillInLib) {
      throw new Error(`Registro do arquivo ainda permanece no library.json após exclusão!`);
    }
    console.log(`✅ Registro do arquivo REMOVIDO com sucesso de library.json.`);
    console.log('🎉 TESTE 1 APROVADO COM SUCESSO!\n');

    // =========================================================================
    // TESTE 2: CRIAÇÃO DE NOVOS FLUXOS, SALVAMENTO E PERSISTÊNCIA
    // =========================================================================
    console.log('--- TESTE 2: Criação de novo fluxo e persistência após reinício ---');
    const newFlowPayload = {
      nome: 'Fluxo Validação de Compra VIP',
      descricao: 'Fluxo criado para validar persistência e abertura no editor',
      status: 'Publicado',
      ativo: true,
      blocos: [
        {
          id: `b_text_${Date.now()}`,
          tipo: 'texto',
          conteudo: 'Olá cliente VIP! Seja bem-vindo à UpZap!',
          delay: 1.0
        },
        {
          id: `b_menu_${Date.now()}`,
          tipo: 'menu',
          conteudo: 'Selecione seu benefício:',
          opcoes: [
            { id: 'opt_vip_1', numero: 1, texto: 'Cupom 20%', acao: 'executar_fluxo' },
            { id: 'opt_vip_2', numero: 2, texto: 'Falar com Atendente VIP', acao: 'transferir_humano' }
          ]
        }
      ]
    };

    const createFlowRes = await fetch(`${API_BASE}/api/flows`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newFlowPayload)
    });

    const createFlowData = await createFlowRes.json();
    console.log(`Create flow status: ${createFlowRes.status}, success: ${createFlowData.success}`);
    if (!createFlowData.success || !createFlowData.flow) {
      throw new Error(`Falha ao criar fluxo na API: ${JSON.stringify(createFlowData)}`);
    }

    const createdFlowId = createFlowData.flow.id;
    console.log(`✅ Fluxo criado com ID: ${createdFlowId} - "${createFlowData.flow.nome}"`);

    // Verificar se foi gravado diretamente no arquivo flows_blocks.json
    const rawSavedFlows = fs.readFileSync(FLOWS_FILE, 'utf-8');
    const parsedSaved = JSON.parse(rawSavedFlows);
    const flowList = Array.isArray(parsedSaved) ? parsedSaved : parsedSaved.fluxos || [];
    const persistedFlow = flowList.find((f: any) => f.id === createdFlowId);

    if (!persistedFlow) {
      throw new Error(`Fluxo não foi persistido no arquivo flows_blocks.json!`);
    }
    console.log(`✅ Fluxo verificado no disco em flows_blocks.json com ${persistedFlow.blocos?.length || 0} blocos.`);

    // Verificar GET /api/flows
    const getFlowsRes = await fetch(`${API_BASE}/api/flows`);
    const getFlowsData = await getFlowsRes.json();
    const foundInGet = (getFlowsData.fluxos || []).some((f: any) => f.id === createdFlowId);
    if (!foundInGet) {
      throw new Error(`Fluxo criado não retornou em GET /api/flows.`);
    }
    console.log(`✅ Fluxo retornado e acessível via GET /api/flows.`);
    console.log('🎉 TESTE 2 APROVADO COM SUCESSO!\n');

    // =========================================================================
    // TESTE 3: ENVIO DE "OI" SEM NENHUMA REGRA OU FLUXO CADASTRADO
    // =========================================================================
    console.log('--- TESTE 3: Envio de "oi" sem nenhuma regra ou fluxo cadastrado ---');
    // Esvazia temporariamente regras e fluxos
    automationEngineService.saveRules([]);
    automationEngineService.saveFlows([]);

    // Limpa estado da conversa do simulador
    conversationsService.clearActiveMenu('test_simulador_vazio');

    // Execução direta no motor
    const emptyEngineResult = await automationEngineService.processIncomingMessage({
      phone: 'test_simulador_vazio',
      text: 'oi',
      contactName: 'Cliente Teste Sem Regras'
    });

    console.log('Resultado do motor com base vazia:', {
      matchedType: emptyEngineResult.matchedType,
      matchedName: emptyEngineResult.matchedName,
      status: emptyEngineResult.status,
      responsesCount: emptyEngineResult.responseTexts.length,
      responseTexts: emptyEngineResult.responseTexts
    });

    if (emptyEngineResult.responseTexts.length > 0) {
      throw new Error(
        `ERRO GRAVE: Automação executou respostas mesmo sem regras ou fluxos cadastrados! Respostas: ${JSON.stringify(emptyEngineResult.responseTexts)}`
      );
    }
    if (emptyEngineResult.status !== 'no_automation') {
      throw new Error(`Status esperado 'no_automation', recebido: ${emptyEngineResult.status}`);
    }
    console.log(`✅ Motor retornou 0 respostas e status 'no_automation' para "oi" sem regras.`);

    // Execução via endpoint do Simulador
    const simRes = await fetch(`${API_BASE}/api/simulator/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: 'oi',
        phone: 'test_simulador_vazio',
        contactName: 'Cliente Teste'
      })
    });
    const simData = await simRes.json();
    console.log('Resultado da API do Simulador com base vazia:', {
      matched: simData.matched,
      responsesCount: simData.result?.responseTexts?.length
    });

    if (simData.matched !== false || (simData.result?.responseTexts?.length || 0) > 0) {
      throw new Error(`Simulador acusou match ou retornou respostas com base vazia: ${JSON.stringify(simData)}`);
    }
    console.log(`✅ Simulador confirmou: nenhuma automação executada (matched: false, 0 respostas).`);
    console.log('🎉 TESTE 3 APROVADO COM SUCESSO!\n');

    // =========================================================================
    // TESTE 4: CRIAR REGRA ATIVA VINCULADA A UM FLUXO E CONFIRMAR EXECUÇÃO
    // =========================================================================
    console.log('--- TESTE 4: Criar regra ativa vinculada a um fluxo e validar execução ---');
    const officialFlowId = `flow_exclusivo_${Date.now()}`;
    const officialRuleId = `rule_exclusiva_${Date.now()}`;

    const validFlow = automationEngineService.createFlow({
      id: officialFlowId,
      nome: 'Fluxo Oficial de Atendimento',
      status: 'Publicado',
      ativo: true,
      blocos: [
        {
          id: 'b_f1',
          tipo: 'texto',
          conteudo: 'Olá! Você acionou a única automação oficial cadastrada.',
          delay: 1.0
        }
      ]
    });

    const validRule = automationEngineService.createRule({
      id: officialRuleId,
      nome: 'Regra Oficial Saudação',
      trigger: 'oi,ola,olá',
      palavras: ['oi', 'ola', 'olá'],
      todasPalavras: ['oi', 'ola', 'olá'],
      ativo: true,
      tipoAcao: 'executar_fluxo',
      fluxoId: officialFlowId,
      fluxoNome: validFlow.nome
    });

    console.log(`Regra criada: ${validRule.id} ligada ao Fluxo: ${validFlow.id}`);

    // Testar envio de "oi" -> DEVE EXECUTAR APENAS ESTE FLUXO
    conversationsService.clearActiveMenu('test_simulador_oficial');

    const matchedEngineResult = await automationEngineService.processIncomingMessage({
      phone: 'test_simulador_oficial',
      text: 'oi',
      contactName: 'Cliente Oficial'
    });

    console.log('Resultado do motor para "oi":', {
      matchedType: matchedEngineResult.matchedType,
      matchedName: matchedEngineResult.matchedName,
      status: matchedEngineResult.status,
      responseTexts: matchedEngineResult.responseTexts
    });

    if (matchedEngineResult.responseTexts.length !== 1) {
      throw new Error(`Esperava exatamente 1 resposta do fluxo, recebeu: ${matchedEngineResult.responseTexts.length}`);
    }
    if (!matchedEngineResult.responseTexts[0].includes('única automação oficial cadastrada')) {
      throw new Error(`Resposta incorreta recebida: "${matchedEngineResult.responseTexts[0]}"`);
    }
    console.log(`✅ Somente o fluxo vinculado à regra foi executado com sucesso!`);

    // Testar envio de frase não cadastrada -> NÃO DEVE EXECUTAR NADA
    const unmatchedEngineResult = await automationEngineService.processIncomingMessage({
      phone: 'test_simulador_oficial',
      text: 'quero saber de futebol e basquete',
      contactName: 'Cliente Oficial'
    });

    console.log('Resultado para frase desconhecida:', {
      matchedType: unmatchedEngineResult.matchedType,
      status: unmatchedEngineResult.status,
      responseTexts: unmatchedEngineResult.responseTexts
    });

    if (unmatchedEngineResult.responseTexts.length > 0) {
      throw new Error(
        `Automação executou respostas para frase não cadastrada! Respostas: ${JSON.stringify(unmatchedEngineResult.responseTexts)}`
      );
    }
    console.log(`✅ Mensagem desconhecida retornou 0 respostas (nenhum fallback indevido disparado).`);
    console.log('🎉 TESTE 4 APROVADO COM SUCESSO!\n');

    console.log('===============================================================');
    console.log('🏆 TODOS OS 4 TESTES DE VALIDAÇÃO FORAM APROVADOS COM 100% DE SUCESSO!');
    console.log('===============================================================');
  } finally {
    // Restaura os dados originais do UpZap
    if (originalFlows) fs.writeFileSync(FLOWS_FILE, originalFlows, 'utf-8');
    if (originalRules) fs.writeFileSync(RULES_FILE, originalRules, 'utf-8');
    if (originalLibrary) fs.writeFileSync(LIBRARY_FILE, originalLibrary, 'utf-8');
    console.log('\n[UpZap Test Suite] Dados originais restaurados com sucesso.');
  }
}

runValidationTests().catch((err) => {
  console.error('❌ ERRO NA EXECUÇÃO DOS TESTES:', err);
  process.exit(1);
});
