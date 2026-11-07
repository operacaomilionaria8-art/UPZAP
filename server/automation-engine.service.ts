import fs from 'fs';
import path from 'path';
import {
  LinearFlow,
  LinearFlowBlock,
  FlowMenuOption,
  ActiveMenuState,
  ActiveMenuOption,
  LibraryContentItem,
  UpZapRule,
  FlowExecution,
  FlowExecutionStepLog,
  EventFlowMapping,
  UpZapOrder
} from '../src/types/upzap';
import { conversationsService, ConversationInfo } from './conversations.service';
import { auditEventsService } from './audit-events.service';
import { whatsAppDirectService } from './whatsapp-direct.service';

export interface ProcessedEngineResult {
  matchedType:
    | 'special_word'
    | 'active_menu'
    | 'welcome_flow'
    | 'rule_flow'
    | 'rule_action'
    | 'human_transfer'
    | 'menu_invalid_option'
    | 'fallback'
    | 'muted'
    | 'unmatched'
    | 'closed';
  matchedName: string;
  matchedId?: string;
  responseTexts: string[];
  mediaAttachments: Array<{
    type: 'image' | 'video' | 'audio' | 'pdf';
    fileName: string;
    filePath?: string;
    caption?: string;
  }>;
  delays: number[];
  activeMenu?: ActiveMenuState | null;
  influencerCode?: string | null;
  flowId?: string;
  flowName?: string;
  status: 'success' | 'paused' | 'closed' | 'no_automation';
}

export class AutomationEngineService {
  private static instance: AutomationEngineService;
  private flowsFile: string;
  private rulesFile: string;
  private libraryFile: string;
  private executionsFile: string;
  private eventMappingsFile: string;
  private mediaDir: string;
  private dispatchedOrderEvents: Set<string> = new Set();

  private constructor() {
    const dataDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    this.flowsFile = path.join(dataDir, 'flows_blocks.json');
    this.rulesFile = path.join(dataDir, 'rules.json');
    this.libraryFile = path.join(dataDir, 'library.json');
    this.executionsFile = path.join(dataDir, 'flow_executions.json');
    this.eventMappingsFile = path.join(dataDir, 'event_flow_mappings.json');
    this.mediaDir = path.join(dataDir, 'media');
    if (!fs.existsSync(this.mediaDir)) {
      fs.mkdirSync(this.mediaDir, { recursive: true });
    }

    this.ensureDefaultData();
  }

  public static getInstance(): AutomationEngineService {
    if (!AutomationEngineService.instance) {
      AutomationEngineService.instance = new AutomationEngineService();
    }
    return AutomationEngineService.instance;
  }

  // ----------------------------------------------------
  // DATA ACCESS & PERSISTENCE
  // ----------------------------------------------------

  public getFlows(): LinearFlow[] {
    try {
      if (fs.existsSync(this.flowsFile)) {
        const raw = fs.readFileSync(this.flowsFile, 'utf-8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
        if (parsed && Array.isArray(parsed.fluxos)) return parsed.fluxos;
        if (parsed && Array.isArray(parsed.flows)) return parsed.flows;
      }
    } catch (e) {
      console.error('[AutomationEngine] Erro ao ler flows_blocks.json:', e);
    }
    return [];
  }

  public saveFlows(flows: LinearFlow[]): boolean {
    try {
      fs.writeFileSync(
        this.flowsFile,
        JSON.stringify({ fluxos: flows, blocos: [] }, null, 2),
        'utf-8'
      );
      return true;
    } catch (e) {
      console.error('[AutomationEngine] Erro ao salvar flows_blocks.json:', e);
      return false;
    }
  }

  public getFlowById(id: string): LinearFlow | null {
    const flows = this.getFlows();
    return flows.find((f) => f.id === id) || null;
  }

  public getWelcomeFlow(): LinearFlow | null {
    const flows = this.getFlows();
    const explicit = flows.find((f) => f.isWelcomeFlow && f.status === 'Publicado' && f.ativo !== false);
    if (explicit && explicit.blocos && explicit.blocos.length >= 1) {
      return explicit;
    }
    const byId = flows.find(
      (f) => (f.id === 'fluxo_unificado_atendimento' || f.id === 'flow_boas_vindas') && f.status === 'Publicado' && f.ativo !== false
    );
    if (byId && byId.blocos && byId.blocos.length >= 1) {
      return byId;
    }
    return null;
  }

  public createFlow(flowData: Partial<LinearFlow>): LinearFlow {
    const flows = this.getFlows();
    const id = flowData.id || `flow_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const nome = flowData.nome || `Novo Fluxo ${flows.length + 1}`;
    const newFlow: LinearFlow = {
      id,
      nome,
      descricao: flowData.descricao || '',
      status: flowData.status || 'Publicado',
      ativo: flowData.ativo !== false,
      regraGatilhoId: flowData.regraGatilhoId,
      regraGatilhoNome: flowData.regraGatilhoNome,
      isWelcomeFlow: Boolean(flowData.isWelcomeFlow),
      blocos: Array.isArray(flowData.blocos) ? flowData.blocos : [],
      canvasNodes: flowData.canvasNodes || [],
      canvasConnections: flowData.canvasConnections || [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    flows.unshift(newFlow);
    this.saveFlows(flows);
    return newFlow;
  }

  public updateFlow(id: string, flowData: Partial<LinearFlow>): LinearFlow | null {
    const flows = this.getFlows();
    const idx = flows.findIndex((f) => f.id === id);
    if (idx < 0) return null;

    const existing = flows[idx];
    const isUnlinkingRule = flowData.regraGatilhoId === null || flowData.regraGatilhoId === '';

    const updated: LinearFlow = {
      ...existing,
      ...flowData,
      id,
      updatedAt: new Date().toISOString()
    };

    if (isUnlinkingRule) {
      delete updated.regraGatilhoId;
      delete updated.regraGatilhoNome;
    }

    flows[idx] = updated;
    this.saveFlows(flows);

    // Sincroniza vínculo com regras
    const rules = this.getRules();
    let rulesModified = false;

    if (isUnlinkingRule) {
      rules.forEach((r) => {
        if (r.fluxoId === id || r.targetFlowId === id) {
          delete r.fluxoId;
          delete r.targetFlowId;
          delete r.fluxoNome;
          r.fluxosVinculados = [];
          r.tipoAcao = 'resposta';
          r.actionType = 'resposta';
          rulesModified = true;
        }
      });
    } else if (flowData.regraGatilhoId) {
      const rIdx = rules.findIndex((r) => r.id === flowData.regraGatilhoId);
      if (rIdx >= 0) {
        rules[rIdx].fluxoId = id;
        rules[rIdx].targetFlowId = id;
        rules[rIdx].fluxoNome = updated.nome;
        rules[rIdx].tipoAcao = 'executar_fluxo';
        rules[rIdx].actionType = 'executar_fluxo';
        rules[rIdx].fluxosVinculados = [id];
        rulesModified = true;
      }
    }

    if (rulesModified) {
      this.saveRules(rules);
    }

    return updated;
  }

  public deleteFlow(id: string): { success: boolean; referencingRules?: string[]; error?: string } {
    const flows = this.getFlows();
    const flow = flows.find((f) => f.id === id);
    if (!flow) return { success: false, error: 'Fluxo não encontrado' };

    const rules = this.getRules();
    const referencingRules = rules
      .filter((r) => r.fluxoId === id || r.targetFlowId === id || (Array.isArray(r.fluxosVinculados) && r.fluxosVinculados.includes(id)))
      .map((r) => r.nome || r.name);

    if (referencingRules.length > 0) {
      return {
        success: false,
        referencingRules,
        error: `Não é possível excluir o fluxo "${flow.nome}" porque ele está associado à(s) regra(s): ${referencingRules.join(', ')}.`
      };
    }

    const filtered = flows.filter((f) => f.id !== id);
    this.saveFlows(filtered);
    return { success: true };
  }

  public duplicateFlow(id: string): LinearFlow | null {
    const flow = this.getFlowById(id);
    if (!flow) return null;
    const copy: Partial<LinearFlow> = {
      ...flow,
      id: `flow_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      nome: `${flow.nome} (Cópia)`,
      isWelcomeFlow: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    return this.createFlow(copy);
  }

  public toggleFlowActive(id: string): LinearFlow | null {
    const flow = this.getFlowById(id);
    if (!flow) return null;
    const currentActive = flow.ativo !== false;
    return this.updateFlow(id, { ativo: !currentActive });
  }

  public getDefaultFlows(): LinearFlow[] {
    return [
      {
        id: 'flow_boas_vindas',
        nome: 'Boas-vindas Principal',
        descricao: 'Saudação acolhedora e menu principal da loja Brizex',
        status: 'Publicado',
        isWelcomeFlow: true,
        updatedAt: new Date().toISOString(),
        blocos: [
          {
            id: 'b_bv_1',
            tipo: 'texto',
            conteudo:
              'Olá! 💕 Seja muito bem-vinda à nossa loja Brizex! Como posso te ajudar hoje?',
            delay: 1.5
          },
          {
            id: 'b_bv_2',
            tipo: 'menu',
            conteudo: 'Menu Principal',
            opcoes: [
              {
                numero: 1,
                texto: 'Preços e kits',
                descricao: 'Conferir ofertas especiais',
                acao: 'executar_fluxo',
                fluxoId: 'flow_precos_kits'
              },
              {
                numero: 2,
                texto: 'Tamanhos e cores',
                descricao: 'Tabela de medidas M, G e GG',
                acao: 'executar_fluxo',
                fluxoId: 'flow_tamanhos_cores'
              },
              {
                numero: 3,
                texto: 'Pagamento e entrega',
                descricao: 'PIX, Cartão e frete',
                acao: 'executar_fluxo',
                fluxoId: 'flow_pagamento_entrega'
              },
              {
                numero: 4,
                texto: 'Finalizar compra',
                descricao: 'Link de checkout Coinzz',
                acao: 'executar_fluxo',
                fluxoId: 'flow_finalizar_compra'
              },
              {
                numero: 5,
                texto: 'Falar com atendente',
                descricao: 'Transferência para equipe humana',
                acao: 'transferir_humano'
              }
            ]
          }
        ]
      },
      {
        id: 'flow_precos_kits',
        nome: 'Preços e Kits',
        descricao: 'Apresenta as 4 ofertas oficiais da Calcinha Cinta Modeladora',
        status: 'Publicado',
        isWelcomeFlow: false,
        updatedAt: new Date().toISOString(),
        blocos: [
          {
            id: 'b_pk_1',
            tipo: 'texto',
            conteudo:
              '✨ *Ofertas Oficiais Calcinha Cinta Modeladora Brizex:*\n\n' +
              '1️⃣ *1 unidade:* R$ 97,90\n' +
              '2️⃣ *2 unidades:* R$ 167,90 (Mais vendida!)\n' +
              '3️⃣ *3 unidades:* R$ 197,90 (Super desconto!)\n' +
              '4️⃣ *6 unidades:* R$ 297,90 (Kit Família Econômico)',
            libraryItemId: 'lib_tabela_precos',
            delay: 1.0
          },
          {
            id: 'b_pk_2',
            tipo: 'menu',
            conteudo: 'Escolha seu kit',
            opcoes: [
              {
                numero: 1,
                texto: 'Escolher 1 unidade (R$ 97,90)',
                acao: 'executar_fluxo',
                fluxoId: 'flow_tamanhos_cores'
              },
              {
                numero: 2,
                texto: 'Escolher 2 unidades (R$ 167,90)',
                acao: 'executar_fluxo',
                fluxoId: 'flow_tamanhos_cores'
              },
              {
                numero: 3,
                texto: 'Escolher 3 unidades (R$ 197,90)',
                acao: 'executar_fluxo',
                fluxoId: 'flow_tamanhos_cores'
              },
              {
                numero: 4,
                texto: 'Escolher 6 unidades (R$ 297,90)',
                acao: 'executar_fluxo',
                fluxoId: 'flow_tamanhos_cores'
              },
              {
                numero: 5,
                texto: 'Voltar ao menu',
                acao: 'voltar_menu',
                fluxoId: 'flow_boas_vindas'
              }
            ]
          }
        ]
      },
      {
        id: 'flow_tamanhos_cores',
        nome: 'Tamanhos e Cores',
        descricao: 'Guia de medidas e opções de cores disponíveis',
        status: 'Publicado',
        isWelcomeFlow: false,
        updatedAt: new Date().toISOString(),
        blocos: [
          {
            id: 'b_tc_1',
            tipo: 'texto',
            conteudo:
              '📏 *Tabela de Medidas e Cores Brizex:*\n\n' +
              '• *M:* Veste do 36 ao 40 (Cintura: 64 a 74 cm)\n' +
              '• *G:* Veste do 42 ao 44 (Cintura: 75 a 84 cm)\n' +
              '• *GG:* Veste do 46 ao 48 (Cintura: 85 a 94 cm)\n\n' +
              '🎨 *Cores disponíveis:* Preto e Bege (Nude). Ambas discretas que não marcam na roupa!',
            delay: 1.0
          },
          {
            id: 'b_tc_2',
            tipo: 'menu',
            conteudo: 'Deseja avançar para o pedido?',
            opcoes: [
              {
                numero: 1,
                texto: 'Ver preços e kits',
                acao: 'executar_fluxo',
                fluxoId: 'flow_precos_kits'
              },
              {
                numero: 2,
                texto: 'Finalizar compra',
                acao: 'executar_fluxo',
                fluxoId: 'flow_finalizar_compra'
              },
              {
                numero: 3,
                texto: 'Voltar ao menu',
                acao: 'voltar_menu',
                fluxoId: 'flow_boas_vindas'
              }
            ]
          }
        ]
      },
      {
        id: 'flow_pagamento_entrega',
        nome: 'Pagamento e Entrega',
        descricao: 'Informações de frete rápido, prazo e formas de pagamento',
        status: 'Publicado',
        isWelcomeFlow: false,
        updatedAt: new Date().toISOString(),
        blocos: [
          {
            id: 'b_pe_1',
            tipo: 'texto',
            conteudo:
              '🚚 *Entrega e Formas de Pagamento:*\n\n' +
              '• *Frete Grátis* para todo o Brasil nesta semana!\n' +
              '• *Prazo de envio:* Despachado em até 24h úteis com código de rastreamento.\n' +
              '• *Pagamento:* PIX (aprovação imediata) ou Cartão de Crédito em até 12x.',
            delay: 1.0
          },
          {
            id: 'b_pe_2',
            tipo: 'menu',
            conteudo: 'Como deseja prosseguir?',
            opcoes: [
              {
                numero: 1,
                texto: 'Ver preços e kits',
                acao: 'executar_fluxo',
                fluxoId: 'flow_precos_kits'
              },
              {
                numero: 2,
                texto: 'Finalizar compra',
                acao: 'executar_fluxo',
                fluxoId: 'flow_finalizar_compra'
              },
              {
                numero: 3,
                texto: 'Voltar ao menu',
                acao: 'voltar_menu',
                fluxoId: 'flow_boas_vindas'
              }
            ]
          }
        ]
      },
      {
        id: 'flow_finalizar_compra',
        nome: 'Finalizar Compra',
        descricao: 'Link seguro de checkout com orientações de pagamento',
        status: 'Publicado',
        isWelcomeFlow: false,
        updatedAt: new Date().toISOString(),
        blocos: [
          {
            id: 'b_fc_1',
            tipo: 'texto',
            conteudo:
              '🎉 Excelente escolha! Para concluir seu pedido com segurança total:\n\n' +
              'Acesse nosso checkout seguro:\n{{linkCheckout}}\n\n' +
              'Assim que o pagamento for aprovado, nossa equipe já separa seu pacote com todo carinho! 💕',
            delay: 1.0
          },
          {
            id: 'b_fc_2',
            tipo: 'menu',
            conteudo: 'Opções finais',
            opcoes: [
              {
                numero: 1,
                texto: 'Voltar ao menu',
                acao: 'voltar_menu',
                fluxoId: 'flow_boas_vindas'
              },
              {
                numero: 2,
                texto: 'Falar com atendente',
                acao: 'transferir_humano'
              }
            ]
          }
        ]
      }
    ];
  }

  public getRules(): any[] {
    try {
      if (fs.existsSync(this.rulesFile)) {
        const raw = fs.readFileSync(this.rulesFile, 'utf-8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {
      console.error('[AutomationEngine] Erro ao ler rules.json:', e);
    }
    return [];
  }

  public saveRules(rules: any[]): boolean {
    try {
      fs.writeFileSync(this.rulesFile, JSON.stringify(rules, null, 2), 'utf-8');
      return true;
    } catch (e) {
      console.error('[AutomationEngine] Erro ao salvar rules.json:', e);
      return false;
    }
  }

  public getRuleById(ruleId: string): any | null {
    if (!ruleId) return null;
    const rules = this.getRules();
    return rules.find((r: any) => r.id === ruleId) || null;
  }

  public createRule(ruleData: Partial<UpZapRule>): UpZapRule {
    const rules = this.getRules();
    const id = ruleData.id || `rule_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const nome = ruleData.nome || ruleData.name || `Nova Regra ${rules.length + 1}`;
    const rawKeywords = ruleData.palavrasChave || ruleData.palavras || [];
    const kwArray = Array.isArray(rawKeywords)
      ? rawKeywords.map(k => String(k).trim().toLowerCase()).filter(Boolean)
      : typeof rawKeywords === 'string'
      ? (rawKeywords as string).split(',').map(k => k.trim().toLowerCase()).filter(Boolean)
      : [];

    const newRule: UpZapRule = {
      id,
      nome,
      name: nome,
      descricao: ruleData.descricao || '',
      tipoGatilho: ruleData.tipoGatilho || 'palavra_chave',
      statusPedido: ruleData.statusPedido,
      condicoes: ruleData.condicoes || '',
      palavrasChave: kwArray,
      palavras: kwArray,
      todasPalavras: kwArray,
      trigger: kwArray.join(', '),
      resposta: ruleData.resposta || ruleData.response || '',
      response: ruleData.resposta || ruleData.response || '',
      tempoInatividadeMinutos: ruleData.tempoInatividadeMinutos || 15,
      prioridade: (ruleData.prioridade as any) || 'Alta',
      priority: ruleData.priority || 'P2',
      ativo: ruleData.ativo !== false && ruleData.active !== false,
      active: ruleData.ativo !== false && ruleData.active !== false,
      fluxosVinculados: ruleData.fluxosVinculados || (ruleData.fluxoId ? [ruleData.fluxoId] : []),
      fluxoId: ruleData.fluxoId,
      fluxoNome: ruleData.fluxoNome,
      targetFlowId: ruleData.targetFlowId || ruleData.fluxoId,
      tipoAcao: ruleData.tipoAcao || (ruleData.fluxoId ? 'executar_fluxo' : 'resposta'),
      actionType: ruleData.actionType || (ruleData.fluxoId ? 'executar_fluxo' : 'resposta'),
      delay: ruleData.delay || 1.5,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    rules.unshift(newRule);
    this.saveRules(rules);
    return newRule;
  }

  public updateRule(id: string, updateData: Partial<UpZapRule>): UpZapRule | null {
    const rules = this.getRules();
    const idx = rules.findIndex((r) => r.id === id);
    if (idx < 0) return null;

    const existing = rules[idx];
    const isUnlinking =
      updateData.fluxoId === null ||
      updateData.fluxoId === '' ||
      updateData.targetFlowId === null;

    const nome = updateData.nome || updateData.name || existing.nome || existing.name;
    const rawKeywords = updateData.palavrasChave !== undefined ? updateData.palavrasChave : (updateData.palavras !== undefined ? updateData.palavras : existing.palavras);
    const kwArray = Array.isArray(rawKeywords)
      ? rawKeywords.map(k => String(k).trim().toLowerCase()).filter(Boolean)
      : typeof rawKeywords === 'string'
      ? (rawKeywords as string).split(',').map(k => k.trim().toLowerCase()).filter(Boolean)
      : (existing.palavras || []);

    const fluxoId = isUnlinking ? undefined : (updateData.fluxoId !== undefined ? (updateData.fluxoId || undefined) : existing.fluxoId);
    const targetFlowId = isUnlinking ? undefined : (updateData.targetFlowId !== undefined ? (updateData.targetFlowId || undefined) : (updateData.fluxoId !== undefined ? (updateData.fluxoId || undefined) : existing.targetFlowId));
    const fluxoNome = isUnlinking ? undefined : (updateData.fluxoNome !== undefined ? (updateData.fluxoNome || undefined) : (fluxoId ? existing.fluxoNome : undefined));
    const fluxosVinculados = isUnlinking ? [] : (updateData.fluxosVinculados !== undefined ? updateData.fluxosVinculados : (fluxoId ? [fluxoId] : []));
    const tipoAcao = isUnlinking ? 'resposta' : (updateData.tipoAcao || (fluxoId ? 'executar_fluxo' : (existing.tipoAcao || 'resposta')));
    const actionType = isUnlinking ? 'resposta' : (updateData.actionType || (fluxoId ? 'executar_fluxo' : (existing.actionType || 'resposta')));

    const updated: UpZapRule = {
      ...existing,
      ...updateData,
      id,
      nome,
      name: nome,
      palavrasChave: kwArray,
      palavras: kwArray,
      todasPalavras: kwArray,
      trigger: kwArray.join(', '),
      resposta: updateData.resposta !== undefined ? updateData.resposta : (updateData.response !== undefined ? updateData.response : existing.resposta),
      response: updateData.resposta !== undefined ? updateData.resposta : (updateData.response !== undefined ? updateData.response : existing.response),
      fluxoId,
      targetFlowId,
      fluxoNome,
      fluxosVinculados,
      tipoAcao,
      actionType,
      ativo: updateData.ativo !== undefined ? updateData.ativo : (updateData.active !== undefined ? updateData.active : existing.ativo),
      active: updateData.ativo !== undefined ? updateData.ativo : (updateData.active !== undefined ? updateData.active : existing.active),
      updatedAt: new Date().toISOString()
    };

    if (isUnlinking) {
      delete updated.fluxoId;
      delete updated.targetFlowId;
      delete updated.fluxoNome;
    }

    rules[idx] = updated;
    this.saveRules(rules);

    // Sincroniza vínculo bidirecional com os fluxos
    const flows = this.getFlows();
    let flowsModified = false;

    if (isUnlinking) {
      flows.forEach((f) => {
        if (f.regraGatilhoId === id) {
          delete f.regraGatilhoId;
          delete f.regraGatilhoNome;
          flowsModified = true;
        }
      });
    } else if (fluxoId) {
      flows.forEach((f) => {
        if (f.id === fluxoId) {
          f.regraGatilhoId = id;
          f.regraGatilhoNome = updated.nome;
          flowsModified = true;
        } else if (f.regraGatilhoId === id) {
          delete f.regraGatilhoId;
          delete f.regraGatilhoNome;
          flowsModified = true;
        }
      });
    }

    if (flowsModified) {
      this.saveFlows(flows);
    }

    return updated;
  }

  public deleteRule(id: string): { success: boolean; affectedFlows?: string[]; error?: string } {
    const rules = this.getRules();
    const rule = rules.find((r) => r.id === id);
    if (!rule) return { success: false, error: 'Regra não encontrada' };

    const flows = this.getFlows();
    const affectedFlows = flows
      .filter((f) => f.blocos && f.blocos.some((b) => b.tipo === 'regra' && b.regraId === id))
      .map((f) => f.nome);

    const filtered = rules.filter((r) => r.id !== id);
    this.saveRules(filtered);
    return { success: true, affectedFlows };
  }

  public duplicateRule(id: string): UpZapRule | null {
    const rule = this.getRuleById(id);
    if (!rule) return null;
    const copy: Partial<UpZapRule> = {
      ...rule,
      id: `rule_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      nome: `${rule.nome || rule.name} (Cópia)`,
      name: `${rule.nome || rule.name} (Cópia)`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    return this.createRule(copy);
  }

  public toggleRuleActive(id: string): UpZapRule | null {
    const rule = this.getRuleById(id);
    if (!rule) return null;
    const currentActive = rule.ativo !== false && rule.active !== false;
    return this.updateRule(id, { ativo: !currentActive, active: !currentActive });
  }

  // ----------------------------------------------------
  // HISTÓRICO DE EXECUÇÕES
  // ----------------------------------------------------

  public getExecutions(limit: number = 100): FlowExecution[] {
    try {
      if (fs.existsSync(this.executionsFile)) {
        const raw = fs.readFileSync(this.executionsFile, 'utf-8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed.slice(0, limit);
      }
    } catch (e) {
      console.error('[AutomationEngine] Erro ao ler flow_executions.json:', e);
    }
    return [];
  }

  public recordExecution(execution: FlowExecution): void {
    try {
      const list = this.getExecutions(500);
      list.unshift(execution);
      fs.writeFileSync(this.executionsFile, JSON.stringify(list.slice(0, 300), null, 2), 'utf-8');
    } catch (e) {
      console.error('[AutomationEngine] Erro ao salvar execução de fluxo:', e);
    }
  }

  public clearExecutions(): void {
    try {
      fs.writeFileSync(this.executionsFile, JSON.stringify([], null, 2), 'utf-8');
    } catch (e) {
      console.error('[AutomationEngine] Erro ao limpar histórico de execuções:', e);
    }
  }

  // ----------------------------------------------------
  // MAPEAMENTO DE EVENTOS BRIZEX -> REGRAS -> FLUXOS
  // ----------------------------------------------------

  public getDefaultEventMappings(): EventFlowMapping[] {
    return [
      {
        id: 'map_agendado',
        evento: 'pedido_agendado',
        nomeEvento: 'Pedido Agendado (Logzz)',
        statusLogzzCorrespondente: 'Agendado',
        ativo: true,
        descricao: 'Disparado quando o pedido é agendado para entrega'
      },
      {
        id: 'map_separacao',
        evento: 'pedido_em_separacao',
        nomeEvento: 'Pedido em Separação',
        statusLogzzCorrespondente: 'Em Separação',
        ativo: true,
        descricao: 'Disparado quando a mercadoria entra em separação'
      },
      {
        id: 'map_em_rota',
        evento: 'pedido_em_rota',
        nomeEvento: 'Pedido em Rota de Entrega',
        statusLogzzCorrespondente: 'Em Rota',
        ativo: true,
        descricao: 'Disparado quando o entregador sai para entrega ao cliente'
      },
      {
        id: 'map_entregue',
        evento: 'pedido_entregue',
        nomeEvento: 'Pedido Entregue / Completo',
        statusLogzzCorrespondente: 'Completo',
        ativo: true,
        descricao: 'Disparado quando a entrega é confirmada com sucesso'
      },
      {
        id: 'map_cancelado',
        evento: 'pedido_cancelado',
        nomeEvento: 'Pedido Cancelado',
        statusLogzzCorrespondente: 'Cancelado',
        ativo: true,
        descricao: 'Disparado quando o pedido é cancelado na Logzz'
      },
      {
        id: 'map_reagendar',
        evento: 'pedido_reagendar',
        nomeEvento: 'Pedido a Reagendar / Frustrado',
        statusLogzzCorrespondente: 'A Reagendar',
        ativo: true,
        descricao: 'Disparado quando há insucesso ou necessidade de reagendamento'
      }
    ];
  }

  public getEventMappings(): EventFlowMapping[] {
    try {
      if (fs.existsSync(this.eventMappingsFile)) {
        const raw = fs.readFileSync(this.eventMappingsFile, 'utf-8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {
      console.error('[AutomationEngine] Erro ao ler event_flow_mappings.json:', e);
    }
    return this.getDefaultEventMappings();
  }

  public saveEventMappings(mappings: EventFlowMapping[]): boolean {
    try {
      fs.writeFileSync(this.eventMappingsFile, JSON.stringify(mappings, null, 2), 'utf-8');
      return true;
    } catch (e) {
      console.error('[AutomationEngine] Erro ao salvar event_flow_mappings.json:', e);
      return false;
    }
  }

  public evaluateBlockCondition(condition: string, text: string, conv?: ConversationInfo): boolean {
    if (!condition || condition === 'sempre') return true;
    const norm = this.normalizeText(text || '');

    if (condition === 'se_objecao_preco') {
      const priceObjections = ['caro', 'muito caro', 'achei caro', 'salgado', 'desconto', 'nao tenho dinheiro', 'não tenho dinheiro', 'ta caro', 'tá caro', 'abaixar'];
      return priceObjections.some(term => norm.includes(term));
    }

    if (condition === 'se_intencao_compra') {
      const buyIntents = ['comprar', 'quero', 'link', 'checkout', 'fechar', 'finalizar', 'pagar', 'cartao', 'pix', 'pedido'];
      return buyIntents.some(term => norm.includes(term));
    }

    if (condition === 'se_duvida_tamanho') {
      const sizeQueries = ['tamanho', 'medida', 'tamanhos', 'medidas', 'peso', 'altura', 'veste', 'tabela'];
      return sizeQueries.some(term => norm.includes(term));
    }

    if (condition === 'se_duvida_entrega') {
      const deliveryQueries = ['frete', 'entrega', 'prazo', 'envio', 'dias', 'correios', 'rastreamento'];
      return deliveryQueries.some(term => norm.includes(term));
    }

    return true;
  }

  public getLibraryItems(): LibraryContentItem[] {
    try {
      if (fs.existsSync(this.libraryFile)) {
        const raw = fs.readFileSync(this.libraryFile, 'utf-8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {
      console.error('[AutomationEngine] Erro ao ler library.json:', e);
    }
    return [];
  }

  public saveLibraryItems(items: LibraryContentItem[]): boolean {
    try {
      fs.writeFileSync(this.libraryFile, JSON.stringify(items, null, 2), 'utf-8');
      return true;
    } catch (e) {
      console.error('[AutomationEngine] Erro ao salvar library.json:', e);
      return false;
    }
  }

  public getLibraryItem(idOrName: string): LibraryContentItem | null {
    const items = this.getLibraryItems();
    return (
      items.find(
        (it) => it.id === idOrName || it.name === idOrName || it.fileName === idOrName
      ) || null
    );
  }

  // ----------------------------------------------------
  // DEFAULT DATA SEEDING (BRIZEX & CALCINHA CINTA)
  // ----------------------------------------------------

  private ensureDefaultData(): void {
    const currentLibrary = this.getLibraryItems();
    if (currentLibrary.length === 0) {
      const defaultLibItems: LibraryContentItem[] = [
        {
          id: 'lib_tabela_precos',
          name: 'Tabela de Preços Oficiais Brizex',
          type: 'texto',
          category: 'Tabela de Preços',
          content:
            '✨ *Ofertas Oficiais Calcinha Cinta Modeladora Brizex:*\n\n' +
            '1️⃣ *1 unidade:* R$ 97,90 (R$ 97,90/un)\n' +
            '2️⃣ *2 unidades:* R$ 167,90 (R$ 83,95/un - Mais vendida!)\n' +
            '3️⃣ *3 unidades:* R$ 197,90 (R$ 65,96/un - Super desconto!)\n' +
            '4️⃣ *6 unidades:* R$ 297,90 (R$ 49,65/un - Kit Família Econômico)',
          size: '1 KB',
          updatedAt: new Date().toISOString()
        },
        {
          id: 'lib_tabela_medidas',
          name: 'Tabela de Tamanhos e Cores',
          type: 'texto',
          category: 'Informações de Produtos',
          content:
            '📐 *Tamanhos e Cores Disponíveis:*\n\n' +
            '• *Tamanhos:* M, G e GG (modelagem anatômica que comprime sem machucar)\n' +
            '• *Cores:* Bege (discreta para roupas claras) e Preto (clássico e elegante)',
          size: '1 KB',
          updatedAt: new Date().toISOString()
        },
        {
          id: 'lib_garantia_entrega',
          name: 'Garantia e Envio Brizex',
          type: 'texto',
          category: 'Respostas Comerciais',
          content:
            '🚚 *Frete Rápido:* Enviamos para todo o Brasil com código de rastreamento imediato no WhatsApp.\n' +
            '🔒 *Garantia Incondicional:* 7 dias para testar! Se não gostar, devolvemos seu dinheiro.',
          size: '1 KB',
          updatedAt: new Date().toISOString()
        }
      ];
      this.saveLibraryItems(defaultLibItems);
      console.log('[AutomationEngine] 📚 Biblioteca Brizex inicializada com 3 itens reutilizáveis.');
    }

    const specialWords = conversationsService.getSpecialWords();
    if (specialWords.length === 0) {
      conversationsService.saveSpecialWords([
        {
          id: 'sw_atendente',
          nome: 'Chamar Atendente Humano',
          palavras: ['atendente', 'humano', 'operador', 'falar com atendente', 'suporte humano'],
          acao: 'transferir_humano',
          resposta: 'Transferindo seu atendimento para nossa equipe humana da Brizex, {{nome}}! 💕 Aguarde um instante.',
          ativo: true,
          descricao: 'Transfere e pausa a automação imediatamente para atendimento humano'
        },
        {
          id: 'sw_encerrar',
          nome: 'Encerrar Atendimento',
          palavras: ['sair', 'cancelar', 'encerrar', 'parar'],
          acao: 'encerrar',
          resposta: 'Atendimento cancelado e encerrado. Se precisar de algo, só mandar um Oi! 💕',
          ativo: true,
          descricao: 'Encerra o atendimento ativo do cliente'
        }
      ]);
      console.log('[AutomationEngine] ⚡ Palavras especiais Brizex inicializadas.');
    }

    const currentFlows = this.getFlows();
    {
      const defaultFlows: LinearFlow[] = [
        {
          id: 'flow_boas_vindas',
          nome: 'Boas-vindas Principal',
          descricao: 'Saudação acolhedora e menu principal da loja Brizex',
          status: 'Publicado',
          isWelcomeFlow: true,
          updatedAt: new Date().toISOString(),
          blocos: [
            {
              id: 'b_bv_1',
              tipo: 'texto',
              conteudo:
                'Olá! 💕 Seja muito bem-vinda à Brizex! Como posso te ajudar hoje?',
              delay: 1.5
            },
            {
              id: 'b_bv_2',
              tipo: 'menu',
              conteudo: 'Menu Principal',
              opcoes: [
                {
                  numero: 1,
                  texto: 'Preços e kits',
                  descricao: 'Conferir ofertas especiais',
                  acao: 'executar_fluxo',
                  fluxoId: 'flow_precos_kits'
                },
                {
                  numero: 2,
                  texto: 'Tamanhos e cores',
                  descricao: 'Tabela de medidas M, G e GG',
                  acao: 'executar_fluxo',
                  fluxoId: 'flow_tamanhos_cores'
                },
                {
                  numero: 3,
                  texto: 'Pagamento e entrega',
                  descricao: 'PIX, Cartão e frete',
                  acao: 'executar_fluxo',
                  fluxoId: 'flow_pagamento_entrega'
                },
                {
                  numero: 4,
                  texto: 'Finalizar compra',
                  descricao: 'Link de checkout Coinzz',
                  acao: 'executar_fluxo',
                  fluxoId: 'flow_finalizar_compra'
                },
                {
                  numero: 5,
                  texto: 'Falar com atendente',
                  descricao: 'Transferência para equipe humana',
                  acao: 'transferir_humano'
                }
              ]
            }
          ]
        },
        {
          id: 'flow_precos_kits',
          nome: 'Preços e Kits',
          descricao: 'Apresenta as 4 ofertas oficiais da Calcinha Cinta Modeladora',
          status: 'Publicado',
          isWelcomeFlow: false,
          updatedAt: new Date().toISOString(),
          blocos: [
            {
              id: 'b_pk_1',
              tipo: 'texto',
              conteudo:
                '✨ *Ofertas Oficiais Calcinha Cinta Modeladora Brizex:*\n\n' +
                '1️⃣ *1 unidade:* R$ 97,90\n' +
                '2️⃣ *2 unidades:* R$ 167,90 (Mais vendida!)\n' +
                '3️⃣ *3 unidades:* R$ 197,90 (Super desconto!)\n' +
                '4️⃣ *6 unidades:* R$ 297,90 (Kit Família Econômico)',
              libraryItemId: 'lib_tabela_precos',
              delay: 1.0
            },
            {
              id: 'b_pk_2',
              tipo: 'menu',
              conteudo: 'Escolha seu kit',
              opcoes: [
                {
                  numero: 1,
                  texto: 'Escolher 1 unidade (R$ 97,90)',
                  acao: 'executar_fluxo',
                  fluxoId: 'flow_tamanhos_cores'
                },
                {
                  numero: 2,
                  texto: 'Escolher 2 unidades (R$ 167,90)',
                  acao: 'executar_fluxo',
                  fluxoId: 'flow_tamanhos_cores'
                },
                {
                  numero: 3,
                  texto: 'Escolher 3 unidades (R$ 197,90)',
                  acao: 'executar_fluxo',
                  fluxoId: 'flow_tamanhos_cores'
                },
                {
                  numero: 4,
                  texto: 'Escolher 6 unidades (R$ 297,90)',
                  acao: 'executar_fluxo',
                  fluxoId: 'flow_tamanhos_cores'
                },
                {
                  numero: 5,
                  texto: 'Voltar ao menu',
                  acao: 'voltar_menu',
                  fluxoId: 'flow_boas_vindas'
                }
              ]
            }
          ]
        },
        {
          id: 'flow_tamanhos_cores',
          nome: 'Tamanhos e Cores',
          descricao: 'Orientações de tamanhos M, G, GG e cores bege e preto',
          status: 'Publicado',
          isWelcomeFlow: false,
          updatedAt: new Date().toISOString(),
          blocos: [
            {
              id: 'b_tc_1',
              tipo: 'texto',
              conteudo:
                '📐 *Tamanhos e Cores Disponíveis:*\n\n' +
                'Tamanhos: *M*, *G* e *GG* (nossa modelagem anatômica se adapta perfeitamente ao seu corpo).\n' +
                'Cores: *Bege* (discreta) e *Preto* (elegante).\n\nComo você prefere continuar?',
              libraryItemId: 'lib_tabela_medidas',
              delay: 1.0
            },
            {
              id: 'b_tc_2',
              tipo: 'menu',
              conteudo: 'Opções de navegação',
              opcoes: [
                {
                  numero: 1,
                  texto: 'Ver preços e kits',
                  acao: 'executar_fluxo',
                  fluxoId: 'flow_precos_kits'
                },
                {
                  numero: 2,
                  texto: 'Finalizar compra',
                  acao: 'executar_fluxo',
                  fluxoId: 'flow_finalizar_compra'
                },
                {
                  numero: 3,
                  texto: 'Voltar ao menu',
                  acao: 'voltar_menu',
                  fluxoId: 'flow_boas_vindas'
                }
              ]
            }
          ]
        },
        {
          id: 'flow_pagamento_entrega',
          nome: 'Pagamento e Entrega',
          descricao: 'Formas de pagamento PIX/Cartão e prazos de entrega',
          status: 'Publicado',
          isWelcomeFlow: false,
          updatedAt: new Date().toISOString(),
          blocos: [
            {
              id: 'b_pe_1',
              tipo: 'texto',
              conteudo:
                '💳 *Pagamento & Entrega:*\n\n' +
                '✅ Aceitamos PIX (aprovação na hora) e Cartão de Crédito em até 12x.\n' +
                '🚚 Frete Rápido com código de rastreamento no WhatsApp.\n' +
                '🔒 Compra 100% segura com garantia incondicional de 7 dias.',
              delay: 1.0
            },
            {
              id: 'b_pe_2',
              tipo: 'menu',
              conteudo: 'Opções de pagamento',
              opcoes: [
                {
                  numero: 1,
                  texto: 'Ver preços e kits',
                  acao: 'executar_fluxo',
                  fluxoId: 'flow_precos_kits'
                },
                {
                  numero: 2,
                  texto: 'Finalizar compra',
                  acao: 'executar_fluxo',
                  fluxoId: 'flow_finalizar_compra'
                },
                {
                  numero: 3,
                  texto: 'Voltar ao menu',
                  acao: 'voltar_menu',
                  fluxoId: 'flow_boas_vindas'
                }
              ]
            }
          ]
        },
        {
          id: 'flow_finalizar_compra',
          nome: 'Finalizar Compra',
          descricao: 'Link seguro de checkout com orientações de pagamento',
          status: 'Publicado',
          isWelcomeFlow: false,
          updatedAt: new Date().toISOString(),
          blocos: [
            {
              id: 'b_fc_1',
              tipo: 'texto',
              conteudo:
                '🎉 Excelente escolha! Para concluir seu pedido com segurança total:\n\n' +
                'Acesse nosso checkout seguro:\n{{linkCheckout}}\n\n' +
                'Assim que o pagamento for aprovado, nossa equipe já separa seu pacote com todo carinho! 💕',
              delay: 1.0
            },
            {
              id: 'b_fc_2',
              tipo: 'menu',
              conteudo: 'Opções finais',
              opcoes: [
                {
                  numero: 1,
                  texto: 'Voltar ao menu',
                  acao: 'voltar_menu',
                  fluxoId: 'flow_boas_vindas'
                },
                {
                  numero: 2,
                  texto: 'Falar com atendente',
                  acao: 'transferir_humano'
                }
              ]
            }
          ]
        }
      ];
      if (!fs.existsSync(this.flowsFile)) {
        this.saveFlows(defaultFlows);
        console.log('[AutomationEngine] 🔄 Fluxos oficiais iniciais criados com sucesso.');
      }
    }

    if (!fs.existsSync(this.rulesFile)) {
      const defaultRules = [
        {
          id: 'rule_precos_kits',
          nome: 'Preços e Kits',
          name: 'Preços e Kits',
          prioridade: 'Crítica',
          priority: 'P1',
          categoria: 'Comercial',
          estadoConversa: 'active',
          palavras: ['preco', 'preço', 'valor', 'valores', 'quanto custa', 'tabela', 'kits', 'kit'],
          todasPalavras: ['preco', 'preço', 'valor', 'valores', 'quanto custa', 'tabela', 'kits', 'kit'],
          tipoAcao: 'executar_fluxo',
          fluxoId: 'flow_precos_kits',
          fluxoNome: 'Preços e Kits',
          acoes: [
            {
              id: 'act_pk',
              tipo: 'executar_fluxo',
              fluxoId: 'flow_precos_kits',
              fluxoNome: 'Preços e Kits'
            }
          ]
        },
        {
          id: 'rule_tamanhos_cores',
          nome: 'Tamanhos e Cores',
          name: 'Tamanhos e Cores',
          prioridade: 'Alta',
          priority: 'P2',
          categoria: 'Produto',
          estadoConversa: 'active',
          palavras: ['tamanho', 'tamanhos', 'cor', 'cores', 'medida', 'medidas', 'bege', 'preto', 'tabela de medidas'],
          todasPalavras: ['tamanho', 'tamanhos', 'cor', 'cores', 'medida', 'medidas', 'bege', 'preto', 'tabela de medidas'],
          tipoAcao: 'executar_fluxo',
          fluxoId: 'flow_tamanhos_cores',
          fluxoNome: 'Tamanhos e Cores',
          acoes: [
            {
              id: 'act_tc',
              tipo: 'executar_fluxo',
              fluxoId: 'flow_tamanhos_cores',
              fluxoNome: 'Tamanhos e Cores'
            }
          ]
        },
        {
          id: 'rule_pagamento_entrega',
          nome: 'Pagamento e Entrega',
          name: 'Pagamento e Entrega',
          prioridade: 'Alta',
          priority: 'P2',
          categoria: 'Comercial',
          estadoConversa: 'active',
          palavras: ['frete', 'entrega', 'pagamento', 'pix', 'cartao', 'cartão', 'parcela', 'prazo', 'envio'],
          todasPalavras: ['frete', 'entrega', 'pagamento', 'pix', 'cartao', 'cartão', 'parcela', 'prazo', 'envio'],
          tipoAcao: 'executar_fluxo',
          fluxoId: 'flow_pagamento_entrega',
          fluxoNome: 'Pagamento e Entrega',
          acoes: [
            {
              id: 'act_pe',
              tipo: 'executar_fluxo',
              fluxoId: 'flow_pagamento_entrega',
              fluxoNome: 'Pagamento e Entrega'
            }
          ]
        },
        {
          id: 'rule_finalizar_compra',
          nome: 'Finalizar Compra',
          name: 'Finalizar Compra',
          prioridade: 'Crítica',
          priority: 'P1',
          categoria: 'Pedido',
          estadoConversa: 'active',
          palavras: ['comprar', 'quero comprar', 'link', 'checkout', 'fechar pedido', 'finalizar', 'pagar'],
          todasPalavras: ['comprar', 'quero comprar', 'link', 'checkout', 'fechar pedido', 'finalizar', 'pagar'],
          tipoAcao: 'executar_fluxo',
          fluxoId: 'flow_finalizar_compra',
          fluxoNome: 'Finalizar Compra',
          acoes: [
            {
              id: 'act_fc',
              tipo: 'executar_fluxo',
              fluxoId: 'flow_finalizar_compra',
              fluxoNome: 'Finalizar Compra'
            }
          ]
        },
        {
          id: 'rule_menu_inicio',
          nome: 'Menu Principal',
          name: 'Menu Principal',
          prioridade: 'Média',
          priority: 'P3',
          categoria: 'Atendimento',
          estadoConversa: 'active',
          palavras: ['menu', 'inicio', 'início', 'opcoes', 'opções', 'comeco', 'começo', 'voltar'],
          todasPalavras: ['menu', 'inicio', 'início', 'opcoes', 'opções', 'comeco', 'começo', 'voltar'],
          tipoAcao: 'executar_fluxo',
          fluxoId: 'flow_boas_vindas',
          fluxoNome: 'Boas-vindas Principal',
          acoes: [
            {
              id: 'act_bv',
              tipo: 'executar_fluxo',
              fluxoId: 'flow_boas_vindas',
              fluxoNome: 'Boas-vindas Principal'
            }
          ]
        }
      ];
      this.saveRules(defaultRules);
      console.log('[AutomationEngine] ⚡ 5 Regras Brizex integradas aos fluxos cadastradas.');
    }
  }

  // ----------------------------------------------------
  // HELPER: TEXT NORMALIZATION & VARIABLE REPLACEMENT
  // ----------------------------------------------------

  public normalizeText(text: string): string {
    return (text || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\w\s]/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  public detectInfluencerCode(text: string): string | null {
    return null;
  }

  public interpolateText(
    text: string,
    conv: ConversationInfo,
    contactName: string,
    extraVars?: Record<string, string>
  ): string {
    let result = text || '';
    const name = contactName || conv.contactName || 'Cliente';
    const kit = conv.selectedKit || '2 unidades (Mais vendida)';
    const size = conv.selectedSize || 'G';
    const color = conv.selectedColor || 'Bege';
    const price =
      kit.includes('1') ? '97,90' : kit.includes('3') ? '197,90' : kit.includes('6') ? '297,90' : '167,90';

    const checkoutUrl = 'https://checkout.brizex.com.br/calcinha-cinta-brizex';

    result = result
      .replace(/\{\{nome\}\}/gi, name)
      .replace(/\{nome\}/gi, name)
      .replace(/\{\{cliente\}\}/gi, name)
      .replace(/\{cliente\}/gi, name)
      .replace(/\{\{influencerCode\}\}/gi, '')
      .replace(/\{influencerCode\}/gi, '')
      .replace(/\{\{kit\}\}/gi, kit)
      .replace(/\{kit\}/gi, kit)
      .replace(/\{\{tamanho\}\}/gi, size)
      .replace(/\{tamanho\}/gi, size)
      .replace(/\{\{cor\}\}/gi, color)
      .replace(/\{cor\}/gi, color)
      .replace(/\{\{preco\}\}/gi, price)
      .replace(/\{preco\}/gi, price)
      .replace(/\{\{linkCheckout\}\}/gi, checkoutUrl)
      .replace(/\{linkCheckout\}/gi, checkoutUrl);

    if (extraVars) {
      for (const [key, val] of Object.entries(extraVars)) {
        if (val !== undefined && val !== null) {
          const rx1 = new RegExp(`\\{\\{${key}\\}\\}`, 'gi');
          const rx2 = new RegExp(`\\{${key}\\}`, 'gi');
          result = result.replace(rx1, String(val)).replace(rx2, String(val));
        }
      }
    }

    return result;
  }

  public formatMenuAsText(menu: ActiveMenuState): string {
    let text = '';
    if (menu.titulo) text += `*${menu.titulo}*\n\n`;
    if (menu.textoPrincipal) text += `${menu.textoPrincipal}\n\n`;

    menu.opcoes.forEach((op) => {
      text += `*${op.numero}* - ${op.texto}${op.descricao ? ` _(${op.descricao})_` : ''}\n`;
    });

    if (menu.rodape) {
      text += `\n_${menu.rodape}_`;
    } else {
      text += `\n_Digite o número da opção desejada._`;
    }
    return text;
  }

  // ----------------------------------------------------
  // FLOW EXECUTION PIPELINE
  // ----------------------------------------------------

  public executeFlow(
    flowId: string,
    conv: ConversationInfo,
    contactName: string,
    depth: number = 0,
    incomingText?: string,
    extraVars?: Record<string, string>,
    executionId?: string
  ): {
    responseTexts: string[];
    mediaAttachments: any[];
    delays: number[];
    activeMenu: ActiveMenuState | null;
    flowId: string;
    flowName: string;
    transferredToHuman?: boolean;
    closed?: boolean;
    stepsLog: FlowExecutionStepLog[];
  } {
    if (depth > 5) {
      console.warn(`[AutomationEngine] ⚠️ Limite de profundidade de encadeamento de fluxos atingido (max 5) para ${flowId}.`);
      return {
        responseTexts: [],
        mediaAttachments: [],
        delays: [],
        activeMenu: null,
        flowId,
        flowName: flowId,
        stepsLog: []
      };
    }

    const flow = this.getFlowById(flowId);
    if (!flow || flow.status === 'Inativo' || flow.ativo === false) {
      console.warn(`[AutomationEngine] ⚠️ Fluxo não encontrado ou inativo: ${flowId}`);
      return {
        responseTexts: [],
        mediaAttachments: [],
        delays: [],
        activeMenu: null,
        flowId,
        flowName: flow?.nome || flowId,
        stepsLog: []
      };
    }

    conversationsService.setConversationFlow(conv.phone, flow.id, flow.nome, 0);

    const responseTexts: string[] = [];
    const mediaAttachments: any[] = [];
    const delays: number[] = [];
    const stepsLog: FlowExecutionStepLog[] = [];
    let activeMenu: ActiveMenuState | null = null;
    let transferredToHuman = false;
    let closed = false;

    const blocks = Array.isArray(flow.blocos) ? flow.blocos : [];

    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i];
      const nowIso = new Date().toISOString();

      // Bloco do tipo 'regra' (Gatilho inicial ou reutilização de regras cadastradas)
      if (block.tipo === 'regra' && block.regraId) {
        const rule = this.getRuleById(block.regraId);
        if (rule) {
          if (block.condicao && block.condicao !== 'sempre') {
            const shouldRun = this.evaluateBlockCondition(block.condicao, incomingText || '', conv);
            if (!shouldRun) {
              stepsLog.push({
                blocoId: block.id,
                tipoBloco: 'regra',
                titulo: rule.nome || rule.name,
                executadoEm: nowIso,
                status: 'ignorado',
                detalhes: `Condição "${block.condicao}" não satisfeita.`
              });
              continue;
            }
          }

          let textContent = rule.response || rule.resposta || block.conteudo || block.texto || '';
          const libId = rule.libraryItemId || block.libraryItemId;
          if (libId) {
            const libItem = this.getLibraryItem(libId);
            if (libItem && libItem.content) textContent = libItem.content;
          }
          const resolvedText = this.interpolateText(textContent, conv, contactName, extraVars);
          if (resolvedText) {
            responseTexts.push(resolvedText);
            const rDelay = typeof rule.delaySeconds === 'number' ? rule.delaySeconds : (typeof block.delay === 'number' ? block.delay : 1.5);
            delays.push(rDelay);
          }

          let mediaFile = rule.mediaUrl || rule.arquivo || block.arquivo || '';
          let mediaCaption = rule.mediaCaption || block.conteudo || undefined;
          if (libId) {
            const libItem = this.getLibraryItem(libId);
            if (libItem && libItem.type !== 'texto') {
              mediaFile = libItem.fileName || libItem.name;
              if (libItem.content && !mediaCaption) mediaCaption = libItem.content;
            }
          }
          if (mediaFile) {
            mediaAttachments.push({
              type: mediaFile.endsWith('.mp4') ? 'video' : mediaFile.endsWith('.mp3') ? 'audio' : mediaFile.endsWith('.pdf') ? 'pdf' : 'image',
              fileName: mediaFile,
              caption: mediaCaption ? this.interpolateText(mediaCaption, conv, contactName, extraVars) : undefined
            });
          }

          stepsLog.push({
            blocoId: block.id,
            tipoBloco: 'regra',
            titulo: rule.nome || rule.name,
            executadoEm: nowIso,
            status: 'sucesso',
            detalhes: `Regra acionada: ${rule.nome || rule.name}`
          });

          if (rule.actionType === 'transferir_humano' || rule.tipoAcao === 'transferir_humano') {
            transferredToHuman = true;
            conversationsService.setConversationAttendanceMode(conv.phone, 'manual', 'regra_transferencia');
            conversationsService.clearActiveMenu(conv.phone);
            break;
          }
          if (rule.actionType === 'encerrar' || rule.tipoAcao === 'encerrar') {
            closed = true;
            conversationsService.closeConversation(conv.phone, 'regra_encerramento', contactName);
            conversationsService.clearActiveMenu(conv.phone);
            break;
          }
          if ((rule.actionType === 'executar_fluxo' || rule.tipoAcao === 'executar_fluxo') && (rule.targetFlowId || rule.fluxoId)) {
            const subId = rule.targetFlowId || rule.fluxoId;
            if (subId && subId !== flowId) {
              const subResult = this.executeFlow(subId, conv, contactName, depth + 1, incomingText, extraVars, executionId);
              responseTexts.push(...subResult.responseTexts);
              mediaAttachments.push(...subResult.mediaAttachments);
              delays.push(...subResult.delays);
              stepsLog.push(...subResult.stepsLog);
              if (subResult.activeMenu) activeMenu = subResult.activeMenu;
              if (subResult.transferredToHuman) transferredToHuman = true;
              if (subResult.closed) closed = true;
              break;
            }
          }
        }
      } else if (block.tipo === 'aguardar_resposta' || block.tipo === 'pergunta') {
        const questionText = block.conteudo || block.texto || '';
        if (questionText) {
          const resolved = this.interpolateText(questionText, conv, contactName, extraVars);
          responseTexts.push(resolved);
          delays.push(typeof block.delay === 'number' && block.delay >= 0 ? block.delay : 1.0);
        }
        stepsLog.push({
          blocoId: block.id,
          tipoBloco: block.tipo,
          titulo: 'Aguardar Resposta do Cliente',
          executadoEm: nowIso,
          status: 'sucesso',
          detalhes: 'Fluxo pausado aguardando interação do cliente.'
        });
        break;
      } else if (block.tipo === 'texto' || block.tipo === 'mensagem') {
        let textContent = block.conteudo || block.texto || '';
        if (block.libraryItemId) {
          const libItem = this.getLibraryItem(block.libraryItemId);
          if (libItem && libItem.content) textContent = libItem.content;
        }
        const resolvedText = this.interpolateText(textContent, conv, contactName, extraVars);
        if (resolvedText) {
          responseTexts.push(resolvedText);
          const blockDelay = typeof block.delay === 'number' && block.delay >= 0
            ? (block.delayUnidade === 'minutos' ? block.delay * 60 : block.delay)
            : 1.5;
          delays.push(blockDelay);
        }
        stepsLog.push({
          blocoId: block.id,
          tipoBloco: 'texto',
          titulo: 'Mensagem de Texto',
          executadoEm: nowIso,
          status: 'sucesso',
          detalhes: resolvedText ? (resolvedText.length > 50 ? `${resolvedText.substring(0, 50)}...` : resolvedText) : 'Mensagem vazia'
        });
      } else if (
        block.tipo === 'midia' ||
        block.tipo === 'imagem' ||
        block.tipo === 'video' ||
        block.tipo === 'audio' ||
        block.tipo === 'documento'
      ) {
        let mediaFile = block.arquivo || '';
        let mediaCaption = block.conteudo || block.texto || undefined;
        if (block.libraryItemId) {
          const libItem = this.getLibraryItem(block.libraryItemId);
          if (libItem) {
            mediaFile = libItem.fileName || libItem.name;
            if (libItem.content && !mediaCaption) mediaCaption = libItem.content;
          }
        }
        if (mediaFile) {
          const inferredType: 'image' | 'video' | 'audio' | 'pdf' =
            block.tipo === 'video' || mediaFile.endsWith('.mp4')
              ? 'video'
              : block.tipo === 'audio' || mediaFile.endsWith('.mp3') || mediaFile.endsWith('.ogg')
              ? 'audio'
              : block.tipo === 'documento' || mediaFile.endsWith('.pdf')
              ? 'pdf'
              : 'image';

          mediaAttachments.push({
            type: inferredType,
            fileName: mediaFile,
            caption: mediaCaption ? this.interpolateText(mediaCaption, conv, contactName, extraVars) : undefined
          });
        }
        stepsLog.push({
          blocoId: block.id,
          tipoBloco: block.tipo,
          titulo: `Mídia (${block.tipo})`,
          executadoEm: nowIso,
          status: 'sucesso',
          detalhes: mediaFile || 'Sem anexo'
        });
      } else if (block.tipo === 'delay') {
        const rawDelay = typeof block.delay === 'number' && block.delay > 0 ? block.delay : 1.0;
        const finalDelay = block.delayUnidade === 'minutos' ? rawDelay * 60 : rawDelay;
        delays.push(finalDelay);
        stepsLog.push({
          blocoId: block.id,
          tipoBloco: 'delay',
          titulo: `Espera (${finalDelay}s)`,
          executadoEm: nowIso,
          status: 'sucesso',
          detalhes: `Pausa calculada de ${finalDelay} segundos.`
        });
      } else if (block.tipo === 'condicao') {
        const condType = String(block.condicao || 'sempre');
        const pass = this.evaluateBlockCondition(condType, incomingText || '', conv);
        stepsLog.push({
          blocoId: block.id,
          tipoBloco: 'condicao',
          titulo: `Condição (${condType})`,
          executadoEm: nowIso,
          status: pass ? 'sucesso' : 'ignorado',
          detalhes: `Resultado: ${pass ? 'Verdadeiro' : 'Falso'}`
        });
        if (!pass) {
          break;
        }
      } else if (block.tipo === 'tag') {
        const tagName = block.tag || block.conteudo || '';
        if (tagName) {
          conversationsService.updateConversation(conv.phone, {
            lastRuleApplied: `Tag: ${tagName}`
          });
        }
        stepsLog.push({
          blocoId: block.id,
          tipoBloco: 'tag',
          titulo: `Etiqueta CRM: ${tagName}`,
          executadoEm: nowIso,
          status: 'sucesso',
          detalhes: `Tag "${tagName}" atribuída ao contato.`
        });
      } else if (block.tipo === 'menu') {
        const rawOptions: FlowMenuOption[] = Array.isArray(block.opcoes) ? block.opcoes : [];
        const menuOptions: ActiveMenuOption[] = rawOptions.map((op, idx) => {
          if (typeof op === 'string') {
            return {
              numero: idx + 1,
              texto: op,
              acao: 'executar_fluxo'
            };
          }
          const optId = op.id || `opt_${op.numero || idx + 1}`;
          return {
            id: optId,
            numero: op.numero || idx + 1,
            texto: op.texto,
            descricao: op.descricao,
            acao: op.acao || 'executar_fluxo',
            fluxoId: op.fluxoId,
            regraId: op.regraId,
            libraryItemId: op.libraryItemId,
            resposta: op.resposta
          };
        });

        activeMenu = {
          titulo: block.tituloMenu || flow.nome,
          textoPrincipal: block.conteudo || 'Por favor, selecione uma das opções:',
          rodape: block.rodapeMenu,
          formato: 'numerado', // EXCLUSIVAMENTE MENUS NUMERADOS TEXTO
          botaoTextoLista: block.botaoTextoLista,
          opcoes: menuOptions,
          createdAt: new Date().toISOString(),
          aguardandoResposta: true
        };

        const menuText = this.formatMenuAsText(activeMenu);
        responseTexts.push(menuText);
        delays.push(typeof block.delay === 'number' ? block.delay : 1.5);
        conversationsService.setActiveMenu(conv.phone, activeMenu);

        stepsLog.push({
          blocoId: block.id,
          tipoBloco: 'menu',
          titulo: 'Menu Numerado',
          executadoEm: nowIso,
          status: 'sucesso',
          detalhes: `${menuOptions.length} opções estruturadas.`
        });
        break;
      } else if (block.tipo === 'executar_fluxo' && block.targetFlowId) {
        console.log(`[AutomationEngine] 🔀 Encadeando execução de fluxo: ${flow.id} ➔ ${block.targetFlowId}`);
        const subResult = this.executeFlow(block.targetFlowId, conv, contactName, depth + 1, incomingText, extraVars, executionId);
        responseTexts.push(...subResult.responseTexts);
        mediaAttachments.push(...subResult.mediaAttachments);
        delays.push(...subResult.delays);
        stepsLog.push(...subResult.stepsLog);
        if (subResult.activeMenu) activeMenu = subResult.activeMenu;
        if (subResult.transferredToHuman) transferredToHuman = true;
        if (subResult.closed) closed = true;

        stepsLog.push({
          blocoId: block.id,
          tipoBloco: 'executar_fluxo',
          titulo: `Transição ➔ ${block.targetFlowName || block.targetFlowId}`,
          executadoEm: nowIso,
          status: 'sucesso'
        });
        break;
      } else if (block.tipo === 'transferir_humano') {
        transferredToHuman = true;
        conversationsService.setConversationAttendanceMode(conv.phone, 'manual', 'fluxo_transferencia');
        conversationsService.clearActiveMenu(conv.phone);
        const transMsg = block.conteudo || 'Estou transferindo seu atendimento para nossa equipe humana. Um atendente responderá em instantes!';
        responseTexts.push(this.interpolateText(transMsg, conv, contactName, extraVars));
        delays.push(typeof block.delay === 'number' && block.delay >= 0 ? block.delay : 1.0);

        stepsLog.push({
          blocoId: block.id,
          tipoBloco: 'transferir_humano',
          titulo: 'Transferir para Atendente Humano',
          executadoEm: nowIso,
          status: 'sucesso',
          detalhes: 'Modo de atendimento alterado para manual.'
        });
        break;
      } else if (block.tipo === 'encerrar') {
        closed = true;
        conversationsService.closeConversation(conv.phone, 'fluxo_encerramento', contactName);
        conversationsService.clearActiveMenu(conv.phone);
        const closeMsg = block.conteudo || 'Atendimento encerrado com sucesso. Sempre que precisar, é só nos chamar!';
        responseTexts.push(this.interpolateText(closeMsg, conv, contactName, extraVars));
        delays.push(typeof block.delay === 'number' && block.delay >= 0 ? block.delay : 1.0);

        stepsLog.push({
          blocoId: block.id,
          tipoBloco: 'encerrar',
          titulo: 'Encerrar Fluxo',
          executadoEm: nowIso,
          status: 'sucesso',
          detalhes: 'Atendimento finalizado.'
        });
        break;
      }
    }

    return {
      responseTexts,
      mediaAttachments,
      delays,
      activeMenu,
      flowId: flow.id,
      flowName: flow.nome,
      transferredToHuman,
      closed,
      stepsLog
    };
  }

  // ----------------------------------------------------
  // DISPARO AUTOMÁTICO DE REGRAS E FLUXOS POR EVENTOS DE PEDIDO
  // ----------------------------------------------------

  public async triggerOrderEventRules(
    order: UpZapOrder,
    eventType: string,
    options: { origin?: 'brizex' | 'whatsapp' | 'simulador' | 'manual' } = {}
  ): Promise<FlowExecution[]> {
    const rawName = order.cliente?.nome || (order as any).clienteNome || 'Cliente';
    const firstName = rawName.trim().split(' ')[0] || 'Cliente';
    const phone = (
      order.cliente?.telefone ||
      (order as any).clienteTelefone ||
      (order as any).telefone ||
      ''
    ).replace(/\D/g, '');
    const logzzOrderId = order.logzzOrderId || (order as any).id || (order as any).numero || 'BZ-001';

    if (!phone) {
      console.warn(`[AutomationEngine] Telefone do cliente não informado no pedido ${logzzOrderId}.`);
      return [];
    }

    // Deduplicação estrita por Pedido + Status
    const dedupKey = `${logzzOrderId}_${order.status}`;
    if (this.dispatchedOrderEvents.has(dedupKey)) {
      console.log(`[AutomationEngine] ℹ️ Evento ${dedupKey} já foi processado anteriormente. Ignorando.`);
      return [];
    }
    this.dispatchedOrderEvents.add(dedupKey);

    const valorNum =
      typeof order.valorTotal === 'number'
        ? order.valorTotal
        : typeof (order as any).valor === 'number'
        ? (order as any).valor
        : 0;
    const orderTotalFormatted = `R$ ${valorNum.toFixed(2).replace('.', ',')}`;
    const itemsList = Array.isArray(order.itens)
      ? order.itens
      : Array.isArray((order as any).produtos)
      ? (order as any).produtos
      : [];
    const itemsSummary = itemsList.map((i: any) => `${i.quantidade || 1}x ${i.nome || i.titulo || 'Produto'}`).join(', ');

    const extraVars: Record<string, string> = {
      nome: firstName,
      cliente: rawName,
      nome_completo: rawName,
      pedido: logzzOrderId,
      id_pedido: logzzOrderId,
      status: order.status,
      status_pedido: order.status,
      valor: orderTotalFormatted,
      total: orderTotalFormatted,
      itens: itemsSummary,
      rastreio: logzzOrderId,
      codigo_rastreio: logzzOrderId
    };

    // Atualiza conversa no CRM
    let conv = conversationsService.getConversation(phone);
    if (!conv) {
      conversationsService.registerOrUpdateIncomingMessage(phone, `[Pedido ${order.status}: ${logzzOrderId}]`, rawName);
      conv = conversationsService.getConversation(phone);
    } else {
      conversationsService.updateConversation(phone, {
        contactName: rawName,
        currentFlow: `Pedido ${order.status}`
      });
    }

    const rules = this.getRules();
    const eventMappings = this.getEventMappings();
    const flows = this.getFlows();

    const normEventType = (eventType || '').toLowerCase().trim();
    const normStatus = (order.status || '').toLowerCase().trim();

    // 1. Localiza regras ativas correspondentes
    const matchedRules = rules.filter((r) => {
      if (r.ativo === false || r.active === false) return false;
      const g = (r.tipoGatilho || '').toLowerCase();
      if (g === normEventType) return true;
      if (g === `pedido_${normStatus.replace(/\s+/g, '_')}`) return true;
      if (g === 'evento_pedido' && r.statusPedido && r.statusPedido.toLowerCase() === normStatus) return true;
      if (r.statusPedido && r.statusPedido.toLowerCase() === normStatus) return true;
      return false;
    });

    // 2. Localiza mapeamentos de eventos configuráveis ativos
    const matchedMappings = eventMappings.filter((m) => {
      if (!m.ativo) return false;
      const mStatus = (m.statusLogzzCorrespondente || '').toLowerCase();
      const mEvento = (m.evento || '').toLowerCase();
      return mStatus === normStatus || mEvento === normEventType;
    });

    // 3. Reúne IDs dos fluxos a executar
    const targetFlowIds = new Set<string>();
    const flowToRuleMap = new Map<string, { id: string; nome: string }>();

    for (const r of matchedRules) {
      const fId = r.fluxoId || r.targetFlowId;
      if (fId) {
        targetFlowIds.add(fId);
        flowToRuleMap.set(fId, { id: r.id, nome: r.nome || r.name });
      }
      if (Array.isArray(r.fluxosVinculados)) {
        r.fluxosVinculados.forEach((f: string) => {
          if (f) {
            targetFlowIds.add(f);
            flowToRuleMap.set(f, { id: r.id, nome: r.nome || r.name });
          }
        });
      }
    }

    for (const m of matchedMappings) {
      if (m.fluxoId) {
        targetFlowIds.add(m.fluxoId);
        if (m.regraId) {
          flowToRuleMap.set(m.fluxoId, { id: m.regraId, nome: m.regraNome || m.nomeEvento });
        }
      }
    }

    // Também verifica fluxos cujo bloco inicial 'regra' aponte para regra correspondente
    for (const flow of flows) {
      if (flow.ativo === false) continue;
      const firstBlock = flow.blocos && flow.blocos[0];
      if (firstBlock && firstBlock.tipo === 'regra' && firstBlock.regraId) {
        const foundRule = matchedRules.find((r) => r.id === firstBlock.regraId);
        if (foundRule) {
          targetFlowIds.add(flow.id);
          flowToRuleMap.set(flow.id, { id: foundRule.id, nome: foundRule.nome || foundRule.name });
        }
      }
      if (flow.regraGatilhoId) {
        const foundRule = matchedRules.find((r) => r.id === flow.regraGatilhoId);
        if (foundRule) {
          targetFlowIds.add(flow.id);
          flowToRuleMap.set(flow.id, { id: foundRule.id, nome: foundRule.nome || foundRule.name });
        }
      }
    }

    if (targetFlowIds.size === 0) {
      console.log(`[AutomationEngine] Nenhuma regra/fluxo ativa encontrada para o evento do pedido ${order.logzzOrderId} (status: ${order.status}).`);
      return [];
    }

    const executions: FlowExecution[] = [];

    for (const fId of targetFlowIds) {
      const flow = this.getFlowById(fId);
      if (!flow || flow.ativo === false) continue;

      const ruleInfo = flowToRuleMap.get(fId);
      const executionId = `exec_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const execution: FlowExecution = {
        id: executionId,
        flowId: flow.id,
        flowName: flow.nome,
        ruleId: ruleInfo?.id,
        ruleName: ruleInfo?.nome,
        clienteNome: rawName,
        clienteTelefone: phone,
        orderId: logzzOrderId,
        logzzOrderId: logzzOrderId,
        origem: options.origin || 'brizex',
        status: 'Em execução',
        etapaAtual: 'Iniciando',
        etapaIndex: 0,
        totalEtapas: flow.blocos.length,
        startedAt: new Date().toISOString(),
        stepsLog: []
      };

      try {
        const safeConv: ConversationInfo = conv || {
          id: phone,
          jid: `${phone}@s.whatsapp.net`,
          phone,
          senderNumber: phone,
          contactName: rawName,
          senderName: rawName,
          state: 'active',
          firstMessageAt: new Date().toISOString(),
          startedAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          lastMessageAt: new Date().toISOString(),
          lastUserMessage: '',
          messageCount: 0,
          currentFlow: flow.id,
          updatedAt: new Date().toISOString(),
          attendanceMode: 'auto'
        };

        const flowResult = this.executeFlow(
          flow.id,
          safeConv,
          firstName,
          0,
          `[Pedido ${order.status}]`,
          extraVars,
          executionId
        );

        execution.status = 'Concluído';
        execution.completedAt = new Date().toISOString();
        execution.etapaAtual = 'Concluído';
        execution.etapaIndex = flow.blocos.length;
        if (flowResult.stepsLog) {
          execution.stepsLog = flowResult.stepsLog;
        }

        const currentConv = conversationsService.getConversation(phone);
        const isAuto = !currentConv || currentConv.attendanceMode === 'auto';
        if (isAuto && whatsAppDirectService.isSocketConnected()) {
          for (let i = 0; i < flowResult.responseTexts.length; i++) {
            const txt = flowResult.responseTexts[i];
            const delaySec = flowResult.delays[i] || 1;
            if (delaySec > 0 && i > 0) {
              await new Promise((r) => setTimeout(r, Math.min(delaySec * 1000, 3000)));
            }
            await whatsAppDirectService.sendTextMessage(phone, txt);
          }
          for (const media of flowResult.mediaAttachments) {
            if (media.filePath) {
              await whatsAppDirectService.sendMediaMessage(phone, {
                type: media.type || 'image',
                filePath: media.filePath,
                caption: media.caption
              });
            }
          }
        }

        this.recordExecution(execution);
        executions.push(execution);

        auditEventsService.addEvent({
          type: 'flow_execution',
          level: 'info',
          title: `Fluxo Executado: ${flow.nome}`,
          description: `Disparado por evento do pedido ${logzzOrderId} (${order.status}) para ${rawName} (${phone}).`,
          details: { flowId: flow.id, orderId: logzzOrderId, status: order.status }
        });
      } catch (err: any) {
        console.error(`[AutomationEngine] Erro ao executar fluxo ${flow.id}:`, err);
        execution.status = 'Falhou';
        execution.erro = err.message || String(err);
        execution.completedAt = new Date().toISOString();
        this.recordExecution(execution);
        executions.push(execution);
      }
    }

    return executions;
  }

  // ----------------------------------------------------
  // MAIN ENGINE ENTRYPOINT: PROCESS INCOMING MESSAGE
  // ----------------------------------------------------

  public async processIncomingMessage(
    phoneOrParams:
      | string
      | {
          phone: string;
          text: string;
          contactName?: string;
          senderJid?: string;
          isSimulator?: boolean;
        },
    optionalText?: string,
    optionalContactName?: string
  ): Promise<ProcessedEngineResult> {
    const params =
      typeof phoneOrParams === 'object' && phoneOrParams !== null
        ? phoneOrParams
        : {
            phone: String(phoneOrParams || ''),
            text: optionalText || '',
            contactName: optionalContactName || 'Cliente'
          };
    const rawText = (params.text || '').trim();
    const contactName = params.contactName || 'Cliente';
    const normText = this.normalizeText(rawText);

    // 0. Registra mensagem no ciclo do Atendimento (preservando e persistindo estado)
    const cycle = conversationsService.registerOrUpdateIncomingMessage(
      params.phone,
      rawText,
      contactName,
      params.senderJid
    );
    let conv = cycle.conversation;

    // 0. VERIFICAÇÃO ESTRITA DE AUTOMAÇÕES E FLUXOS
    // A UpZap só poderá executar uma automação quando existir uma regra ativa vinculada a um fluxo válido e ativo.
    // Se não houver fluxos ou regras cadastradas/ativas, NENHUMA automação deverá ser executada.
    const allRules = this.getRules();
    const activeRules = allRules.filter((r) => r.ativo !== false && r.active !== false);
    const allFlows = this.getFlows();
    const activeFlows = allFlows.filter((f) => f.ativo !== false && f.status !== 'Inativo');

    if (activeRules.length === 0 || activeFlows.length === 0) {
      console.log(`[AutomationEngine] ℹ️ Sem fluxos ou regras ativas cadastradas. Nenhuma automação será executada para: "${rawText}"`);
      return {
        matchedType: 'unmatched',
        matchedName: 'Nenhuma automação cadastrada',
        responseTexts: [],
        mediaAttachments: [],
        delays: [],
        activeMenu: null,
        influencerCode: conv.influencerCode,
        status: 'no_automation'
      };
    }

    // 1.5. Solicitação Determinística de Atendente Humano (Item 7 & 11)
    // Se o texto for puramente uma seleção numérica ("1", "2", "opcao 1", etc.), NUNCA deve ser interpretado como solicitação de humano
    const trimmedRawInput = rawText.trim();
    const isPurelyNumericChoice = Boolean(
      trimmedRawInput.match(/^(?:opt_)?#?([1-9]|10)[\s.\-–:]*$/i) ||
      trimmedRawInput.match(/^(?:opcao|opção)\s*#?([1-9]|10)\b/i) ||
      trimmedRawInput.match(/^[1-9]️⃣?$/)
    );

    const wordTokens = normText.split(' ').filter(Boolean);
    const humanTriggers = [
      'falar com atendente',
      'falar com humano',
      'falar com operador',
      'suporte humano',
      'atendimento humano',
      'quero atendente',
      'quero falar com atendente',
      'atendente humano',
      'atendente',
      'humano',
      'operador'
    ];

    // Verifica de forma estrita (frase exata ou palavra isolada nos tokens) para não capturar termos acidentais
    // NUNCA aciona se for uma escolha numérica de menu
    const isHumanIntent = !isPurelyNumericChoice && humanTriggers.some((kw) => {
      if (kw.includes(' ')) {
        return normText === kw || normText.includes(kw);
      }
      return wordTokens.includes(kw);
    });

    if (isHumanIntent) {
      console.log(`[AutomationEngine] 👤 Solicitação de Atendente Humano detectada com prioridade para ${conv.phone}`);
      conversationsService.clearActiveMenu(conv.phone);
      conv = conversationsService.setConversationAttendanceMode(conv.phone, 'manual', 'cliente_solicitou_humano');
      const humanReply = `Transferindo você para nossa equipe de atendimento humano da Brizex, ${contactName}! 💕 Um momento, por favor. Nosso atendente já vai te responder por aqui.`;
      conversationsService.recordBotReply(conv.phone, humanReply, 'Transferência para Atendente Humano', 'sys_human');
      return {
        matchedType: 'human_transfer',
        matchedName: 'Transferência para Atendente Humano',
        matchedId: 'sys_human',
        responseTexts: [humanReply],
        mediaAttachments: [],
        delays: [1.0],
        activeMenu: null,
        influencerCode: conv.influencerCode,
        status: 'paused'
      };
    }

    // 2. Verificação de Palavras Especiais (Item 5 e Bloco 1)
    const specialWordResult = conversationsService.evaluateSpecialWords(rawText, contactName);
    if (specialWordResult.matched && specialWordResult.specialWord) {
      const sw = specialWordResult.specialWord;
      console.log(`[AutomationEngine] ⚡ Palavra Especial detectada: "${specialWordResult.matchedKeyword}" (${sw.acao})`);

      conversationsService.clearActiveMenu(conv.phone);

      if (sw.acao === 'transferir_humano') {
        conversationsService.setConversationAttendanceMode(conv.phone, 'manual', 'palavra_especial');
        const reply = specialWordResult.response || 'Transferindo para nossa equipe humana. Aguarde um instante!';
        conversationsService.recordBotReply(conv.phone, reply, `⚡ ${sw.nome}`, sw.id);
        return {
          matchedType: 'special_word',
          matchedName: `Palavra Especial: ${sw.nome}`,
          matchedId: sw.id,
          responseTexts: [reply],
          mediaAttachments: [],
          delays: [1.0],
          activeMenu: null,
          influencerCode: conv.influencerCode,
          status: 'paused'
        };
      } else if (sw.acao === 'encerrar') {
        conversationsService.closeConversation(conv.phone, 'palavra_especial_encerrar', contactName);
        const reply = specialWordResult.response || 'Atendimento cancelado e encerrado. Obrigado!';
        conversationsService.recordBotReply(conv.phone, reply, `⚡ ${sw.nome}`, sw.id);
        return {
          matchedType: 'special_word',
          matchedName: `Palavra Especial: ${sw.nome}`,
          matchedId: sw.id,
          responseTexts: [reply],
          mediaAttachments: [],
          delays: [1.0],
          activeMenu: null,
          influencerCode: conv.influencerCode,
          status: 'closed'
        };
      } else if (sw.acao === 'resposta_fixa') {
        const reply = specialWordResult.response || '';
        conversationsService.recordBotReply(conv.phone, reply, `⚡ ${sw.nome}`, sw.id);
        return {
          matchedType: 'special_word',
          matchedName: `Palavra Especial: ${sw.nome}`,
          matchedId: sw.id,
          responseTexts: [reply],
          mediaAttachments: [],
          delays: [1.0],
          activeMenu: null,
          influencerCode: conv.influencerCode,
          status: 'success'
        };
      } else if (sw.acao === 'ignorar') {
        return {
          matchedType: 'muted',
          matchedName: 'Silenciado por palavra especial',
          responseTexts: [],
          mediaAttachments: [],
          delays: [],
          activeMenu: null,
          influencerCode: conv.influencerCode,
          status: 'success'
        };
      }
    }

    // 3. Verificação de Atendimento Manual ou Pausado (sincronizando estado fresco do disco)
    const freshConv = conversationsService.getConversation(conv.phone) || conv;
    conv = freshConv;
    const isGlobalPaused = conversationsService.isGlobalAutomationPaused();
    let attendanceMode = freshConv.attendanceMode || (freshConv.automationPaused ? 'paused' : 'auto');

    // Se o cliente estava em modo 'paused' (ex: por loop guard anterior), nova mensagem legítima retoma automaticamente
    if (attendanceMode === 'paused' && !isGlobalPaused) {
      console.log(`[AutomationEngine] 🔄 Retomando atendimento automaticamente para ${conv.phone} por nova mensagem recebida.`);
      conversationsService.setConversationAttendanceMode(conv.phone, 'auto', 'cliente_nova_interacao');
      conv.attendanceMode = 'auto';
      conv.automationPaused = false;
      attendanceMode = 'auto';
    }

    // Se o cliente enviar comandos de retorno/menu ("menu", "inicio", "voltar", "oi", "ola", "bot", "ajuda"), retoma para auto
    const resumeKeywords = ['menu', 'inicio', 'início', 'voltar', 'oi', 'ola', 'olá', 'comecar', 'começar', 'ajuda', 'retomar', 'robo', 'robô', 'reiniciar', 'reset'];
    if (attendanceMode === 'manual' && !isGlobalPaused && resumeKeywords.some((cmd) => normText === cmd || wordTokens.includes(cmd))) {
      console.log(`[AutomationEngine] 🔄 Retomando modo automático via comando do cliente: "${rawText}"`);
      conversationsService.setConversationAttendanceMode(conv.phone, 'auto', 'cliente_comando_retomada');
      conv.attendanceMode = 'auto';
      conv.automationPaused = false;
      attendanceMode = 'auto';
    }

    if (isGlobalPaused || attendanceMode === 'manual') {
      console.log(`[AutomationEngine] ⏸️ Atendimento em modo ${attendanceMode} ou global pausado para ${conv.phone}.`);
      return {
        matchedType: 'muted',
        matchedName: `Automação ${attendanceMode === 'manual' ? 'Manual' : 'Pausada'}`,
        responseTexts: [],
        mediaAttachments: [],
        delays: [],
        activeMenu: null,
        influencerCode: conv.influencerCode,
        status: 'paused'
      };
    }

    // 4. Se a conversa estava encerrada, reabre imediatamente para garantir processamento contínuo
    if (conv.state === 'closed') {
      conversationsService.reopenConversation(conv.phone);
      conv.state = 'active';
    }

    // 5. RESOLUÇÃO DE MENU ATIVO VS REGRAS CADASTRADAS (Itens 1, 2 e 4)
    // Se o cliente está em um menu ativo, verificamos primeiro se enviou um número ou se enviou uma palavra-chave
    if (conv.activeMenu && conv.activeMenu.opcoes && conv.activeMenu.opcoes.length > 0) {
      const activeMenu = conv.activeMenu;
      let matchedOption: ActiveMenuOption | null = null;
      let extractedNumber: string | null = null;

      // 5a. Match por número exato ("1", "1.", "1 - ...", "opcao 1", "opt_1", "1️⃣", etc.)
      const trimmedRaw = rawText.trim();
      const numPatterns = [
        /^(?:opt_)?#?([1-9]|10)\b/i,
        /^(?:opcao|opção)\s*#?([1-9]|10)\b/i,
        /^(?:escolh[oa]|quero|item)\s*(?:a|o)?\s*#?([1-9]|10)\b/i,
        /^([1-9]|10)[\s.\-–:]/i,
        /^([1-9]|10)$/
      ];

      for (const pat of numPatterns) {
        const m = trimmedRaw.match(pat);
        if (m) {
          extractedNumber = m[1];
          break;
        }
      }

      if (!extractedNumber) {
        const emojiMap: Record<string, string> = {
          '1️⃣': '1', '2️⃣': '2', '3️⃣': '3', '4️⃣': '4', '5️⃣': '5',
          '6️⃣': '6', '7️⃣': '7', '8️⃣': '8', '9️⃣': '9', '🔟': '10'
        };
        for (const [em, val] of Object.entries(emojiMap)) {
          if (trimmedRaw.includes(em)) {
            extractedNumber = val;
            break;
          }
        }
      }

      if (extractedNumber) {
        matchedOption =
          activeMenu.opcoes.find(
            (op, idx) => String(op.numero) === extractedNumber || String(idx + 1) === extractedNumber
          ) || null;
      }

      // 5b. Match por ID interno estável do botão ("opt_1", "opt_pk", etc.)
      if (!matchedOption && rawText) {
        matchedOption =
          activeMenu.opcoes.find((op) => {
            if (!op.id) return false;
            const opId = String(op.id).trim();
            return opId === rawText || opId.toLowerCase() === rawText.toLowerCase();
          }) || null;
      }

      // 5c. Se o usuário digitou um número fora do intervalo do menu atual (ex: 9 quando há 5 opções)
      if (extractedNumber && !matchedOption) {
        const totalOpts = activeMenu.opcoes.length;
        const invalidOptionMsg = `Você digitou *${extractedNumber}*, mas as opções do menu vão de *1 a ${totalOpts}*.\n\nPor favor, digite um número entre *1 e ${totalOpts}* (ou digite *menu* para ver as opções novamente).`;
        conversationsService.recordBotReply(conv.phone, invalidOptionMsg, 'Opção de Menu Inválida');
        return {
          matchedType: 'menu_invalid_option',
          matchedName: 'Opção de Menu Inválida',
          responseTexts: [invalidOptionMsg],
          mediaAttachments: [],
          delays: [1.0],
          activeMenu: activeMenu, // Preserva menu ativo!
          influencerCode: conv.influencerCode,
          status: 'success'
        };
      }

      // 5d. Se NÃO for uma escolha numérica direta:
      // O CLIENTE PODE TER DIGITADO UMA PALAVRA-CHAVE DE QUALQUER OUTRA REGRA CADASTRADA!
      // As regras têm prioridade sobre o fallback do menu.
      if (!matchedOption) {
        const potentialRule = this.evaluateRulesWithPriority(rawText, normText, allRules);
        if (potentialRule) {
          // Limpa menu ativo anterior pois o cliente mudou o assunto para uma regra cadastrada
          console.log(`[AutomationEngine] 🔀 Cliente em menu digitou palavra-chave de regra: "${potentialRule.nome || potentialRule.name}". Executando regra com prioridade.`);
          conversationsService.clearActiveMenu(conv.phone);
          conv.activeMenu = null;
          // Deixa prosseguir para a etapa 7 de avaliação de regras!
        } else {
          // Não é regra, tenta match pelo texto do botão/opção
          matchedOption =
            activeMenu.opcoes.find((op) => {
              const normOpText = this.normalizeText(op.texto);
              return normText === normOpText || (normOpText.length > 3 && normText.includes(normOpText));
            }) || null;
        }
      }

      if (matchedOption) {
        console.log(`[AutomationEngine] 🎯 Opção do menu ativo selecionada: [${matchedOption.numero}] ${matchedOption.texto}`);

        // Extrai preferências comerciais (Kit, Cor, Tamanho)
        const optText = matchedOption.texto;
        const lowerOpt = optText.toLowerCase();

        let detectedKit: string | undefined = undefined;
        const isNotJustMenu = !lowerOpt.includes('preço') && !lowerOpt.includes('preco') && !lowerOpt.includes('menu');
        if (lowerOpt.includes('unidade') || (lowerOpt.includes('kit') && isNotJustMenu)) {
          detectedKit = optText;
        }

        let detectedColor: string | undefined = undefined;
        if (lowerOpt.includes('bege')) detectedColor = 'Bege';
        else if (lowerOpt.includes('preto') || lowerOpt.includes('preta')) detectedColor = 'Preto';
        else if (lowerOpt.includes('chocolate')) detectedColor = 'Chocolate';

        let detectedSize: string | undefined = undefined;
        const szMatch = optText.match(/\b(P|M|G|GG|XG|XGG)\b/i);
        if (szMatch) detectedSize = szMatch[1].toUpperCase();

        conversationsService.setSalesPreferences(conv.phone, {
          option: matchedOption.texto,
          kit: detectedKit,
          color: detectedColor,
          size: detectedSize
        });

        // Limpa menu ativo anterior
        conversationsService.clearActiveMenu(conv.phone);

        // Executa a ação da opção selecionada
        if (matchedOption.acao === 'executar_fluxo' && matchedOption.fluxoId) {
          const flowExec = this.executeFlow(matchedOption.fluxoId, conv, contactName);
          const fullReply = flowExec.responseTexts.join('\n\n');
          conversationsService.recordBotReply(conv.phone, fullReply, `Menu ➔ ${flowExec.flowName}`);

          return {
            matchedType: 'active_menu',
            matchedName: `Menu: Opção ${matchedOption.numero} (${matchedOption.texto}) ➔ ${flowExec.flowName}`,
            matchedId: matchedOption.fluxoId,
            responseTexts: flowExec.responseTexts,
            mediaAttachments: flowExec.mediaAttachments,
            delays: flowExec.delays,
            activeMenu: flowExec.activeMenu,
            influencerCode: conv.influencerCode,
            flowId: flowExec.flowId,
            flowName: flowExec.flowName,
            status: 'success'
          };
        } else if (matchedOption.acao === 'enviar_biblioteca' && matchedOption.libraryItemId) {
          const libItems = this.getLibraryItems();
          const libItem = libItems.find((l) => l.id === matchedOption!.libraryItemId);
          const libContent = libItem ? (libItem.content || `[Conteúdo: ${libItem.name}]`) : 'Conteúdo da biblioteca não encontrado.';
          const interpolated = this.interpolateText(libContent, conv, contactName);
          conversationsService.recordBotReply(conv.phone, interpolated, `Menu ➔ Biblioteca: ${libItem?.name || matchedOption.libraryItemId}`);

          const media =
            libItem && (libItem.filePath || libItem.url)
              ? [
                  {
                    type: (libItem.type === 'foto' ? 'image' : libItem.type === 'video' ? 'video' : libItem.type === 'audio' ? 'audio' : 'pdf') as
                      | 'image'
                      | 'video'
                      | 'audio'
                      | 'pdf',
                    fileName: libItem.fileName || libItem.name,
                    filePath: libItem.filePath || libItem.url,
                    caption: libItem.name
                  }
                ]
              : [];

          return {
            matchedType: 'active_menu',
            matchedName: `Menu: Opção ${matchedOption.numero} ➔ Biblioteca: ${libItem?.name || matchedOption.libraryItemId}`,
            matchedId: matchedOption.libraryItemId,
            responseTexts: [interpolated],
            mediaAttachments: media,
            delays: [1.0],
            activeMenu: null,
            influencerCode: conv.influencerCode,
            status: 'success'
          };
        } else if (matchedOption.acao === 'voltar_menu') {
          const welcomeFlow = this.getWelcomeFlow();
          if (welcomeFlow) {
            const flowExec = this.executeFlow(welcomeFlow.id, conv, contactName);
            const fullReply = flowExec.responseTexts.join('\n\n');
            conversationsService.recordBotReply(conv.phone, fullReply, `Menu ➔ Voltar ao Início`);

            return {
              matchedType: 'active_menu',
              matchedName: `Menu: Opção ${matchedOption.numero} ➔ Voltar ao Início`,
              matchedId: welcomeFlow.id,
              responseTexts: flowExec.responseTexts,
              mediaAttachments: flowExec.mediaAttachments,
              delays: flowExec.delays,
              activeMenu: flowExec.activeMenu,
              influencerCode: conv.influencerCode,
              flowId: flowExec.flowId,
              flowName: flowExec.flowName,
              status: 'success'
            };
          }
        } else if (matchedOption.acao === 'transferir_humano') {
          conversationsService.setConversationAttendanceMode(conv.phone, 'manual', 'menu_transferencia');
          const reply = 'Transferindo para nossa equipe humana. Um atendente responderá em instantes!';
          conversationsService.recordBotReply(conv.phone, reply, `Menu ➔ Atendente Humano`);
          return {
            matchedType: 'human_transfer',
            matchedName: 'Menu: Falar com atendente',
            responseTexts: [reply],
            mediaAttachments: [],
            delays: [1.0],
            activeMenu: null,
            influencerCode: conv.influencerCode,
            status: 'paused'
          };
        } else if (matchedOption.acao === 'encerrar') {
          conversationsService.closeConversation(conv.phone, 'menu_encerramento', contactName);
          const reply = 'Atendimento encerrado com sucesso. Muito obrigado!';
          conversationsService.recordBotReply(conv.phone, reply, `Menu ➔ Encerrar`);
          return {
            matchedType: 'closed',
            matchedName: 'Menu: Encerrar',
            responseTexts: [reply],
            mediaAttachments: [],
            delays: [1.0],
            activeMenu: null,
            influencerCode: conv.influencerCode,
            status: 'closed'
          };
        }
      }
    }

    // 6. AVALIAÇÃO DE REGRAS ATIVAS POR PRIORIDADE
    // A UpZap só executa automações quando existir uma regra ativa correspondente
    const matchedRule = this.evaluateRulesWithPriority(rawText, normText, activeRules);

    if (matchedRule) {
      console.log(`[AutomationEngine] ⚡ Regra identificada: "${matchedRule.nome || matchedRule.name}" para texto: "${rawText}"`);

      // Limpa menu ativo anterior pois uma regra explícita foi disparada
      conversationsService.clearActiveMenu(conv.phone);

      // Verifica proteção de loop apenas para rajadas abusivas de bot
      const loopCheck = conversationsService.detectLoop(conv.phone, {
        type: 'rule',
        id: matchedRule.id,
        name: matchedRule.nome || matchedRule.name
      });

      if (loopCheck.isLoop) {
        console.warn(`[AutomationEngine] 🛑 Loop técnico detectado para regra "${matchedRule.nome}".`);
        const contingency = '⚠️ Identificamos uma repetição no fluxo do seu atendimento. Nossa equipe continuará manualmente.';
        conversationsService.recordBotReply(conv.phone, contingency, '⚠️ Loop Interrompido');
        return {
          matchedType: 'fallback',
          matchedName: 'Loop Guard',
          responseTexts: [contingency],
          mediaAttachments: [],
          delays: [1.0],
          activeMenu: null,
          influencerCode: conv.influencerCode,
          status: 'success'
        };
      }

      conversationsService.recordTransition(conv.phone, {
        type: 'rule',
        id: matchedRule.id,
        name: matchedRule.nome || matchedRule.name
      });

      // Ação: "Executar fluxo" (Item 2 e 5: integração com Flow Builder)
      const targetFlowId =
        matchedRule.fluxoId ||
        (matchedRule.acoes && matchedRule.acoes.find((a: any) => a.tipo === 'executar_fluxo')?.fluxoId) ||
        (matchedRule.tipoAcao === 'executar_fluxo' ? matchedRule.targetFlowId : null);

      if (targetFlowId) {
        const targetFlow = activeFlows.find((f) => f.id === targetFlowId);
        if (!targetFlow) {
          console.warn(`[AutomationEngine] ⚠️ Regra "${matchedRule.nome || matchedRule.name}" vinculada ao fluxo "${targetFlowId}", mas o fluxo não existe ou está inativo.`);
          return {
            matchedType: 'unmatched',
            matchedName: `Regra sem fluxo ativo: ${matchedRule.nome || matchedRule.name}`,
            responseTexts: [],
            mediaAttachments: [],
            delays: [],
            activeMenu: null,
            influencerCode: conv.influencerCode,
            status: 'no_automation'
          };
        }

        console.log(`[AutomationEngine] 🚀 Regra "${matchedRule.nome || matchedRule.name}" disparando fluxo "${targetFlowId}"`);
        const flowExec = this.executeFlow(targetFlowId, conv, contactName);
        if (flowExec.responseTexts.length === 0) {
          return {
            matchedType: 'unmatched',
            matchedName: `Fluxo sem respostas: ${flowExec.flowName}`,
            responseTexts: [],
            mediaAttachments: [],
            delays: [],
            activeMenu: null,
            influencerCode: conv.influencerCode,
            status: 'no_automation'
          };
        }

        const fullReply = flowExec.responseTexts.join('\n\n');
        conversationsService.recordBotReply(conv.phone, fullReply, `Regra ➔ ${flowExec.flowName}`);

        if (flowExec.activeMenu) {
          conversationsService.setActiveMenu(conv.phone, flowExec.activeMenu);
        } else {
          conversationsService.clearActiveMenu(conv.phone);
        }

        return {
          matchedType: 'rule_flow',
          matchedName: `Regra: ${matchedRule.nome || matchedRule.name} ➔ ${flowExec.flowName}`,
          matchedId: targetFlowId,
          responseTexts: flowExec.responseTexts,
          mediaAttachments: flowExec.mediaAttachments,
          delays: flowExec.delays,
          activeMenu: flowExec.activeMenu,
          influencerCode: conv.influencerCode,
          flowId: flowExec.flowId,
          flowName: flowExec.flowName,
          status: 'success'
        };
      }

      // Regra de ação comum (texto ou anexo da biblioteca - Item 2, 3 e 5)
      let replyText =
        matchedRule.resposta ||
        matchedRule.response ||
        matchedRule.textoResposta ||
        matchedRule.texto ||
        (matchedRule.action && (matchedRule.action.text || matchedRule.action.conteudo)) ||
        '';
      const responseTexts: string[] = [];
      const mediaAttachments: any[] = [];

      if (matchedRule.libraryItemId) {
        const libItem = this.getLibraryItem(matchedRule.libraryItemId);
        if (libItem && libItem.content && !replyText) {
          replyText = libItem.content;
        }
        if (libItem && libItem.type !== 'texto') {
          mediaAttachments.push({
            type: libItem.type === 'video' ? 'video' : libItem.type === 'audio' ? 'audio' : libItem.type === 'pdf' ? 'pdf' : 'image',
            fileName: libItem.fileName || libItem.name
          });
        }
      }

      replyText = this.interpolateText(replyText, conv, contactName);
      if (replyText) {
        responseTexts.push(replyText);
      }

      if (Array.isArray(matchedRule.acoes)) {
        matchedRule.acoes.forEach((act: any) => {
          if (act.tipo === 'texto' && act.conteudo) {
            responseTexts.push(this.interpolateText(act.conteudo, conv, contactName));
          } else if (act.arquivo || act.conteudo) {
            mediaAttachments.push({
              type: act.tipo === 'video' ? 'video' : act.tipo === 'audio' ? 'audio' : act.tipo === 'pdf' ? 'pdf' : 'image',
              fileName: act.arquivo || act.conteudo
            });
          }
        });
      } else if (matchedRule.mediaUrl || matchedRule.mediaName) {
        mediaAttachments.push({
          type: 'image',
          fileName: matchedRule.mediaName || 'anexo.png'
        });
      }

      const rDelay = typeof matchedRule.delaySeconds === 'number' ? matchedRule.delaySeconds : 1.5;
      const delays = responseTexts.map(() => rDelay);

      // Tratamento de ação da regra (Item 2)
      if (matchedRule.actionType === 'transferir_humano' || matchedRule.tipoAcao === 'transferir_humano') {
        conversationsService.setConversationAttendanceMode(conv.phone, 'manual', 'regra_transferencia');
        conversationsService.clearActiveMenu(conv.phone);
        conversationsService.recordBotReply(conv.phone, responseTexts.join(' | ') || 'Transferindo para atendente', matchedRule.nome || matchedRule.name);
        return {
          matchedType: 'human_transfer',
          matchedName: `Regra: ${matchedRule.nome || matchedRule.name}`,
          matchedId: matchedRule.id,
          responseTexts,
          mediaAttachments,
          delays,
          activeMenu: null,
          influencerCode: conv.influencerCode,
          status: 'paused'
        };
      }

      if (matchedRule.actionType === 'encerrar' || matchedRule.tipoAcao === 'encerrar') {
        conversationsService.closeConversation(conv.phone, 'regra_encerramento', contactName);
        conversationsService.clearActiveMenu(conv.phone);
        conversationsService.recordBotReply(conv.phone, responseTexts.join(' | ') || 'Atendimento encerrado', matchedRule.nome || matchedRule.name);
        return {
          matchedType: 'closed',
          matchedName: `Regra: ${matchedRule.nome || matchedRule.name}`,
          matchedId: matchedRule.id,
          responseTexts,
          mediaAttachments,
          delays,
          activeMenu: null,
          influencerCode: conv.influencerCode,
          status: 'closed'
        };
      }

      // Regra de resposta padrão conclui com sucesso e limpa menus anteriores
      conversationsService.clearActiveMenu(conv.phone);
      conversationsService.recordBotReply(
        conv.phone,
        responseTexts.join(' | ') || 'Regra acionada',
        matchedRule.nome || matchedRule.name
      );

      return {
        matchedType: 'rule_action',
        matchedName: `Regra: ${matchedRule.nome || matchedRule.name}`,
        matchedId: matchedRule.id,
        responseTexts,
        mediaAttachments,
        delays,
        activeMenu: null,
        influencerCode: conv.influencerCode,
        status: 'success'
      };
    }

    // 8. Se nenhuma regra cadastrada/ativa coincidiu com a mensagem: NENHUMA automação deve ser executada!
    console.log(`[AutomationEngine] ℹ️ Mensagem "${rawText}" não coincidiu com nenhuma regra cadastrada. Nenhuma automação executada.`);
    return {
      matchedType: 'unmatched',
      matchedName: 'Nenhuma automação correspondente',
      responseTexts: [],
      mediaAttachments: [],
      delays: [],
      activeMenu: conv.activeMenu,
      influencerCode: conv.influencerCode,
      status: 'no_automation'
    };
  }

  // ----------------------------------------------------
  // DETERMINISTIC RULES EVALUATOR WITH PRIORITIES & STEMMING
  // ----------------------------------------------------

  private getWordVariants(word: string): string[] {
    if (!word) return [];
    const w = word.trim().toLowerCase();
    const variants = new Set<string>([w]);

    // Trata plural/singular comum em português
    if (w.endsWith('es') && w.length > 4) {
      variants.add(w.slice(0, -2)); // cores -> cor, valores -> valor
    } else if (w.endsWith('s') && w.length > 3) {
      variants.add(w.slice(0, -1)); // precos -> preco, tamanhos -> tamanho, kits -> kit
    } else if (!w.endsWith('s')) {
      variants.add(w + 's'); // preco -> precos, kit -> kits, tamanho -> tamanhos
      variants.add(w + 'es'); // cor -> cores, valor -> valores
    }

    return Array.from(variants);
  }

  private evaluateRulesWithPriority(
    rawText: string,
    normText: string,
    rules: any[]
  ): any | null {
    if (!Array.isArray(rules) || rules.length === 0) return null;

    const matchedRules: Array<{
      rule: any;
      priorityScore: number;
      matchScore: number;
      index: number;
    }> = [];

    const wordTokens = normText.split(' ').filter(Boolean);
    const tokenVariantsSet = new Set<string>();
    wordTokens.forEach((tok) => {
      this.getWordVariants(tok).forEach((v) => tokenVariantsSet.add(v));
    });

    rules.forEach((rule, idx) => {
      if (rule.active === false || rule.ativo === false) return;
      if (rule.executionScope === 'etapa_fluxo') return;

      const rawTriggers: string[] = [];
      if (typeof rule.trigger === 'string' && rule.trigger.trim()) {
        rule.trigger.split(/[,;\n]+/).forEach((s: string) => {
          const t = s.trim();
          if (t) rawTriggers.push(t);
        });
      }
      if (Array.isArray(rule.palavras)) {
        rule.palavras.forEach((p: any) => {
          if (typeof p === 'string' && p.trim()) rawTriggers.push(p.trim());
        });
      }
      if (Array.isArray(rule.todasPalavras)) {
        rule.todasPalavras.forEach((p: any) => {
          if (typeof p === 'string' && p.trim()) rawTriggers.push(p.trim());
        });
      }
      if (Array.isArray(rule.keywords)) {
        rule.keywords.forEach((p: any) => {
          if (typeof p === 'string' && p.trim()) rawTriggers.push(p.trim());
        });
      } else if (typeof rule.keywords === 'string' && rule.keywords.trim()) {
        rule.keywords.split(/[,;\n]+/).forEach((s: string) => {
          const t = s.trim();
          if (t) rawTriggers.push(t);
        });
      }
      if (Array.isArray(rule.palavrasChave)) {
        rule.palavrasChave.forEach((p: any) => {
          if (typeof p === 'string' && p.trim()) rawTriggers.push(p.trim());
        });
      } else if (typeof rule.palavrasChave === 'string' && rule.palavrasChave.trim()) {
        rule.palavrasChave.split(/[,;\n]+/).forEach((s: string) => {
          const t = s.trim();
          if (t) rawTriggers.push(t);
        });
      }

      const keywords = Array.from(new Set(rawTriggers));
      let bestScore = 0;

      for (const kw of keywords) {
        if (!kw || typeof kw !== 'string') continue;
        const normKw = this.normalizeText(kw);
        if (!normKw) continue;

        const kwVariants = this.getWordVariants(normKw);

        if (normKw.includes(' ')) {
          // Expressão composta (ex: "quanto custa", "tabela de medidas", "quero comprar")
          if (normText === normKw) {
            bestScore = Math.max(bestScore, 100);
          } else if (normText.includes(normKw)) {
            bestScore = Math.max(bestScore, 85 + normKw.length);
          }
        } else {
          // Palavra única
          if (normText === normKw) {
            bestScore = Math.max(bestScore, 95);
          } else if (kwVariants.some((v) => normText === v)) {
            bestScore = Math.max(bestScore, 92);
          } else if (wordTokens.includes(normKw)) {
            bestScore = Math.max(bestScore, 80 + normKw.length);
          } else if (kwVariants.some((v) => tokenVariantsSet.has(v))) {
            bestScore = Math.max(bestScore, 75 + normKw.length);
          } else if (normKw.length >= 4 && normText.includes(normKw)) {
            bestScore = Math.max(bestScore, 50 + normKw.length);
          }
        }
      }

      if (bestScore > 0) {
        const priorityStr = String(rule.priority || rule.prioridade || 'P3').toUpperCase();
        let priorityScore = 4;
        if (priorityStr.includes('1') || priorityStr.includes('CRÍT')) priorityScore = 10;
        else if (priorityStr.includes('2') || priorityStr.includes('ALT')) priorityScore = 7;
        else if (priorityStr.includes('3') || priorityStr.includes('MÉD')) priorityScore = 4;
        else if (priorityStr.includes('4') || priorityStr.includes('BAI')) priorityScore = 1;

        matchedRules.push({
          rule,
          priorityScore,
          matchScore: bestScore,
          index: idx
        });
      }
    });

    if (matchedRules.length === 0) return null;

    // Ordenação determinística: maior prioridade primeiro, maior precisão de match, menor índice
    matchedRules.sort((a, b) => {
      if (b.priorityScore !== a.priorityScore) return b.priorityScore - a.priorityScore;
      if (b.matchScore !== a.matchScore) return b.matchScore - a.matchScore;
      return a.index - b.index;
    });

    return matchedRules[0].rule;
  }
}

export const automationEngineService = AutomationEngineService.getInstance();
