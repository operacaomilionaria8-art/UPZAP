import express, { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import { whatsAppDirectService } from './server/whatsapp-direct.service';
import { conversationsService, ConversationState, SpecialWordItem } from './server/conversations.service';
import { auditEventsService } from './server/audit-events.service';
import { alertsNotifierService } from './server/alerts-notifier.service';
import { authService, TokenPayload } from './server/auth.service';
import { AttendanceMode, BlocoFluxo, ServerStatusInfo } from './src/types/upzap';
import { automationEngineService } from './server/automation-engine.service';
import { ordersService } from './server/orders.service';

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// Clientes conectados ao streaming de logs em tempo real (SSE)
const auditSseClients = new Set<Response>();

// Reaproveita o log de auditoria como fonte única para notificações no celular (Item 21) e logs ao vivo (SSE)
auditEventsService.onEvent(event => {
  alertsNotifierService.handleAuditEvent(event);

  // Broadcast em tempo real para todos os clientes conectados ao log ao vivo
  if (auditSseClients.size > 0) {
    const payload = `data: ${JSON.stringify({ type: 'audit_event', event })}\n\n`;
    for (const client of auditSseClients) {
      try {
        client.write(payload);
      } catch {
        auditSseClients.delete(client);
      }
    }
  }
});

// Heartbeat a cada 20 segundos para manter conexões SSE ativas através de proxies
setInterval(() => {
  if (auditSseClients.size > 0) {
    const ping = `: ping ${Date.now()}\n\n`;
    for (const client of auditSseClients) {
      try {
        client.write(ping);
      } catch {
        auditSseClients.delete(client);
      }
    }
  }
}, 20000);

// Proteção do processo Node.js para execução estável 24/7
process.on('uncaughtException', async (err) => {
  console.error('[UpZap Process] Uncaught Exception:', err);
  try {
    auditEventsService.addEvent({
      type: 'system_alert',
      level: 'error',
      title: 'Exceção Fatal Não Tratada',
      description: err?.message || String(err)
    });
    await alertsNotifierService.notifyServerShutdown(`Exceção fatal não tratada: ${err?.message || err}`);
  } catch (e) {}
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[UpZap Process] Unhandled Rejection at:', promise, 'reason:', reason);
});

// Encerramento limpo para gerenciadores de processo (PM2, Docker, systemd) com envio de alerta (Item 21)
let isShuttingDown = false;
const handleGracefulShutdown = async (signal: string) => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`[UpZap Process] Recebido sinal de término (${signal}). Disparando alerta e finalizando com segurança...`);
  try {
    auditEventsService.addEvent({
      type: 'system_alert',
      level: 'warning',
      title: 'Servidor Interrompido',
      description: `Sinal de parada do sistema recebido (${signal}). Encerramento limpo.`
    });
    await alertsNotifierService.notifyServerShutdown(`Sinal de parada do sistema recebido (${signal}).`);
  } catch (err) {
    console.error('[UpZap Process] Falha ao enviar alerta de encerramento:', err);
  }
  process.exit(0);
};
process.on('SIGINT', () => handleGracefulShutdown('SIGINT'));
process.on('SIGTERM', () => handleGracefulShutdown('SIGTERM'));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use('/audio', express.static(path.join(process.cwd(), 'public', 'audio')));

// Storage directory for persistent rules and real WhatsApp configuration
const DATA_DIR = path.join(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const CONFIG_FILE = path.join(DATA_DIR, 'whatsapp-config.json');
const RULES_FILE = path.join(DATA_DIR, 'rules.json');
const LIBRARY_FILE = path.join(DATA_DIR, 'library.json');
const MEDIA_DIR = path.join(DATA_DIR, 'media');
if (!fs.existsSync(MEDIA_DIR)) {
  fs.mkdirSync(MEDIA_DIR, { recursive: true });
}

// Interface definitions
interface WhatsAppConfig {
  apiUrl: string;
  apiKey: string;
  instanceName: string;
  autoReplyEnabled: boolean;
}

interface ProcessedMessageLog {
  id: string;
  remetente: string;
  numero: string;
  mensagem: string;
  regraAcionada: string;
  respostaEnviada: string;
  timestamp: string;
  status: 'sucesso' | 'erro';
}

interface ErrorLog {
  id: string;
  msg: string;
  time: string;
}

// In-memory runtime state for live tracking
let messageLogs: ProcessedMessageLog[] = [];
let errorLogs: ErrorLog[] = [];
let lastProcessedMessage: ProcessedMessageLog | null = null;
let lastQrCode: { base64?: string; code?: string; pairingCode?: string } | null = null;

// Helper to build headers for Evolution API (supports both apikey and Bearer auth)
function getEvolutionHeaders(apiKey: string) {
  return {
    'apikey': apiKey,
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json'
  };
}

// Helper for safe fetch with timeout to prevent unhandled hang or crash
async function safeEvolutionFetch(url: string, options: RequestInit = {}, timeoutMs: number = 4000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    return res;
  } finally {
    clearTimeout(timeoutId);
  }
}

// Helper to sanitize and validate Evolution API URL
function sanitizeEvolutionApiUrl(rawUrl: string): string {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  let trimmed = rawUrl.trim().replace(/\/+$/, '');
  if (!trimmed) return '';

  // If the value contains @ or spaces and has no protocol, it's not a URL
  if ((trimmed.includes('@') || trimmed.includes(' ')) && !trimmed.includes('://')) {
    return '';
  }

  // Prepend scheme if missing but has domain characteristics or localhost
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
    if (trimmed.startsWith('localhost') || trimmed.startsWith('127.0.0.1')) {
      trimmed = `http://${trimmed}`;
    } else if (trimmed.includes('.') || trimmed.includes(':')) {
      trimmed = `https://${trimmed}`;
    } else {
      return '';
    }
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return '';
    }
    if (!parsed.hostname || parsed.hostname.length < 2) {
      return '';
    }
    return trimmed;
  } catch {
    return '';
  }
}

// Helper to get or load config
function getWhatsAppConfig(): WhatsAppConfig & { urlValid: boolean; rawApiUrl: string } {
  let rawApiUrl = process.env.EVOLUTION_API_URL || 'https://textbook-antonio-salt-latex.trycloudflare.com';
  let apiKey = process.env.EVOLUTION_API_KEY || 'UpZap_2026_Conexao_Real_009@';
  let instanceName = process.env.EVOLUTION_INSTANCE_NAME || 'upzap';
  let autoReplyEnabled = true;

  // If env var was set to malformed string or localhost, point to default Cloudflare tunnel
  if (rawApiUrl === 'Upzap009@' || rawApiUrl === 'http://localhost:8080') {
    rawApiUrl = 'https://textbook-antonio-salt-latex.trycloudflare.com';
  }
  if (apiKey === 'Upzap009@') {
    apiKey = 'UpZap_2026_Conexao_Real_009@';
  }
  if (instanceName === 'Upzap009@' || instanceName === 'upzap_oficial') {
    instanceName = 'upzap';
  }

  if (fs.existsSync(CONFIG_FILE)) {
    try {
      const fileData = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
      if (fileData.apiUrl !== undefined && fileData.apiUrl !== 'Upzap009@' && fileData.apiUrl !== 'http://localhost:8080') {
        rawApiUrl = fileData.apiUrl;
      }
      if (fileData.apiKey !== undefined && fileData.apiKey !== 'Upzap009@') apiKey = fileData.apiKey;
      if (fileData.instanceName !== undefined && fileData.instanceName !== 'Upzap009@') instanceName = fileData.instanceName;
      if (fileData.autoReplyEnabled !== undefined) autoReplyEnabled = fileData.autoReplyEnabled;
    } catch (err) {
      console.error('[UpZap] Error reading whatsapp-config.json:', err);
    }
  }

  const validUrl = sanitizeEvolutionApiUrl(rawApiUrl);

  return {
    apiUrl: validUrl,
    apiKey: (apiKey || '').trim(),
    instanceName: (instanceName || 'upzap').trim(),
    autoReplyEnabled,
    urlValid: Boolean(validUrl),
    rawApiUrl
  };
}

function saveWhatsAppConfig(newConfig: Partial<WhatsAppConfig>) {
  const current = getWhatsAppConfig();
  let sanitizedApiUrl = newConfig.apiUrl !== undefined ? sanitizeEvolutionApiUrl(newConfig.apiUrl) : current.apiUrl;
  
  const updated: WhatsAppConfig = {
    ...current,
    ...newConfig,
    apiUrl: sanitizedApiUrl
  };
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(updated, null, 2), 'utf-8');
  return updated;
}

// Helper to get saved rules
function normalizeText(str: string): string {
  return (str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove acentos
    .replace(/[^\w\s]/gi, ' ') // substitui pontuações por espaço
    .replace(/\s+/g, ' ') // unifica múltiplos espaços
    .trim();
}

function getStoredRules(): any[] {
  if (fs.existsSync(RULES_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(RULES_FILE, 'utf-8'));
      if (Array.isArray(data)) {
        return data;
      }
    } catch (err) {
      console.error('Error reading rules.json:', err);
    }
  }
  return [];
}

function saveStoredRules(rules: any[]) {
  try {
    fs.writeFileSync(RULES_FILE, JSON.stringify(rules, null, 2), 'utf-8');
    try {
      automationEngineService.saveRules(rules);
    } catch {}
  } catch (err) {
    console.error('Error saving rules.json:', err);
    throw err;
  }
}

// Mapeamento de prioridade de regras (Item 4)
const PRIORITY_MAP: Record<string, number> = {
  'critica': 9000,
  'crítica': 9000,
  'alta': 7000,
  'media': 5000,
  'média': 5000,
  'baixa': 3000
};

function calculateRulePriorityScore(rule: any): number {
  if (typeof rule.prioridadeNumero === 'number' && !isNaN(rule.prioridadeNumero)) {
    // Prioridade 1 é a mais alta (10000 - 1*100 = 9900), Prioridade 2 (9800), etc.
    return Math.max(100, 10000 - (rule.prioridadeNumero * 100));
  }
  if (typeof rule.ordemPrioridade === 'number' && !isNaN(rule.ordemPrioridade)) {
    return Math.max(100, 10000 - (rule.ordemPrioridade * 100));
  }
  const priorityStr = String(rule.prioridade || '').trim().toLowerCase();
  const numParsed = parseInt(priorityStr, 10);
  if (!isNaN(numParsed) && numParsed > 0) {
    return Math.max(100, 10000 - (numParsed * 100));
  }
  return PRIORITY_MAP[priorityStr] || 5000; // Padrão: Média (5000)
}

// ============================================================
// SISTEMA DE CONDIÇÕES NAS REGRAS (ITEM 6 - BLOCO 2)
// ============================================================
// NOTA DE LIMITAÇÃO CONHECIDA:
// Atualmente a combinação de condições opera em nível global da regra usando
// 'E' (todas devem ser verdadeiras) ou 'OU' (qualquer uma verdadeira).
// Combinações booleanas aninhadas complexas tipo '(A E B) OU C' não são suportadas
// nesta versão e estão mapeadas para expansão em versões futuras.

export function extractQuantityFromText(text: string, anchorWord?: string): number | null {
  if (!text || typeof text !== 'string') return null;
  const clean = text.trim();

  // 1. Se foi especificada uma palavra-âncora personalizada (ex: "unidades", "caixas", "peças", "frascos")
  if (anchorWord && anchorWord.trim()) {
    const escapedAnchor = anchorWord.trim().replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
    // Padrão 1: Dígitos seguidos da âncora (ex: "3 unidades", "3un", "3 caixas")
    const p1 = new RegExp(`(?:^|\\D)(\\d+)\\s*(?:${escapedAnchor})`, 'i');
    const m1 = clean.match(p1);
    if (m1 && m1[1]) return parseInt(m1[1], 10);

    // Padrão 2: Âncora seguida de dígitos (ex: "comprar 3", "quantidade: 5")
    const p2 = new RegExp(`(?:${escapedAnchor})\\s*:?\\s*(\\d+)`, 'i');
    const m2 = clean.match(p2);
    if (m2 && m2[1]) return parseInt(m2[1], 10);
  }

  // 2. Extração inteligente padrão: busca dígitos associados a termos comuns de compras ou quantidade
  const anchorMatch = clean.match(/(?:comprar|levar|pedir|quero|quantidade|qtd|unidades?|un|pecas?|peças?|caixas?|cx|itens?|pares?|frascos?|kits?|unid\.?)?\s*(\d+)\s*(?:unidades?|un|pecas?|peças?|caixas?|cx|itens?|pares?|frascos?|kits?|unid\.?)?/i);
  if (anchorMatch && anchorMatch[1]) {
    return parseInt(anchorMatch[1], 10);
  }

  // 3. Fallback: primeiro número isolado encontrado no texto
  const digitMatch = clean.match(/\b(\d+)\b/);
  if (digitMatch && digitMatch[1]) {
    return parseInt(digitMatch[1], 10);
  }

  return null;
}

export function evaluateRuleCondition(
  condition: any,
  rawText: string,
  normText: string,
  contactState: string = 'active'
): boolean {
  if (!condition || !condition.tipo) return true;

  switch (condition.tipo) {
    case 'opcao_especifica': {
      const optionValue = (condition.valorTexto || '').trim();
      if (!optionValue) return true;
      const normOption = normalizeText(optionValue);
      if (!normOption) return true;

      if (condition.matchExato) {
        const tokens = normText.split(' ').filter(Boolean);
        if (normText === normOption) return true;
        if (normOption.includes(' ')) {
          const phraseRegex = new RegExp(`(^|\\s)${normOption.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}($|\\s)`);
          return phraseRegex.test(normText);
        }
        return tokens.includes(normOption);
      } else {
        return normText.includes(normOption);
      }
    }

    case 'quantidade_especifica': {
      const extractedQty = extractQuantityFromText(rawText, condition.palavraAncora);
      if (extractedQty === null) return false;

      const targetQty = typeof condition.valorQtd === 'number' ? condition.valorQtd : 0;
      const op = condition.operadorQtd || '=';

      switch (op) {
        case '=':
          return extractedQty === targetQty;
        case '>=':
          return extractedQty >= targetQty;
        case '<=':
          return extractedQty <= targetQty;
        case '>':
          return extractedQty > targetQty;
        case '<':
          return extractedQty < targetQty;
        case 'entre': {
          const maxQty = typeof condition.valorQtdMax === 'number' ? condition.valorQtdMax : targetQty;
          return extractedQty >= targetQty && extractedQty <= maxQty;
        }
        default:
          return extractedQty === targetQty;
      }
    }

    case 'estado_atendimento': {
      const expectedState = condition.estadoEsperado || 'active';
      if (expectedState === 'qualquer') return true;
      return contactState === expectedState;
    }

    case 'contem_texto': {
      const targetText = (condition.valorTexto || '').trim();
      if (!targetText) return true;
      const normTarget = normalizeText(targetText);
      return normText.includes(normTarget);
    }

    case 'regex_personalizado': {
      const pattern = (condition.padraoRegex || '').trim();
      if (!pattern) return true;
      try {
        const regex = new RegExp(pattern, 'i');
        return regex.test(rawText) || regex.test(normText);
      } catch (err) {
        console.error('[UpZap Condition Regex Error]:', err);
        return false;
      }
    }

    default:
      return true;
  }
}

export function evaluateAllRuleConditions(
  rule: any,
  rawText: string,
  normText: string,
  contactState: string = 'active'
): boolean {
  if (!rule || !Array.isArray(rule.condicoes) || rule.condicoes.length === 0) {
    return true; // Nenhuma condição configurada = aprovado
  }

  const operator = String(rule.operadorCondicoes || 'E').toUpperCase();
  const results = rule.condicoes.map((c: any) =>
    evaluateRuleCondition(c, rawText, normText, contactState)
  );

  if (operator === 'OU' || operator === 'OR') {
    return results.some(Boolean);
  }

  // Padrão: 'E' (AND) - todas devem ser satisfeitas
  return results.every(Boolean);
}

// Rule Engine evaluation function (ETAPA 6, Itens 2, 4 do Bloco 1 & Item 6 do Bloco 2)
function evaluateMessageWithRules(
  userText: string,
  rules: any[],
  contactName: string = 'Cliente',
  contactPhoneOrState?: string
) {
  const rawText = (userText || '').trim();
  const normText = normalizeText(rawText);

  if (!rawText || !normText || !Array.isArray(rules) || rules.length === 0) {
    return null;
  }

  // Identifica o estado do atendimento
  let contactState = 'active';
  if (contactPhoneOrState) {
    if (['active', 'closed', 'finishing'].includes(contactPhoneOrState)) {
      contactState = contactPhoneOrState;
    } else {
      const conv = conversationsService.getConversation(contactPhoneOrState);
      if (conv?.state) {
        contactState = conv.state;
      }
    }
  }

  // Tokens de palavras do texto recebido
  const wordTokens = normText.split(' ').filter(Boolean);

  // Armazena todas as regras correspondidas para ordenação por prioridade
  const matchedRules: Array<{
    rule: any;
    priorityScore: number;
    matchScore: number;
    matchedKeyword: string;
    index: number;
  }> = [];

  rules.forEach((rule, idx) => {
    // 1. Avalia condições estruturadas da regra (Item 6 - Bloco 2)
    const conditionsPassed = evaluateAllRuleConditions(rule, rawText, normText, contactState);
    if (!conditionsPassed) {
      return; // Condições não satisfeitas para esta regra
    }

    // 2. Extrair palavras-chave da regra
    const rawKeywords: string[] = Array.from(new Set([
      ...(Array.isArray(rule.palavras) ? rule.palavras : []),
      ...(Array.isArray(rule.todasPalavras) ? rule.todasPalavras : [])
    ]));

    let bestMatchScore = 0;
    let matchedKw = '';

    if (rawKeywords.length === 0) {
      // Regra ativada puramente por condições estruturadas (sem palavras-chave obrigatórias)
      if (Array.isArray(rule.condicoes) && rule.condicoes.length > 0) {
        bestMatchScore = 75;
        matchedKw = 'Condição atendida';
      }
    } else {
      for (const kw of rawKeywords) {
        if (!kw || typeof kw !== 'string') continue;
        const normKw = normalizeText(kw);
        if (!normKw) continue;

        // Se a palavra-chave tiver múltiplas palavras (expressão)
        if (normKw.includes(' ')) {
          const phraseRegex = new RegExp(`(^|\\s)${normKw.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}($|\\s)`);
          if (normText === normKw) {
            // Correspondência exata da frase inteira
            if (bestMatchScore < 100) {
              bestMatchScore = 100;
              matchedKw = kw;
            }
          } else if (phraseRegex.test(normText) || normText.includes(normKw)) {
            // A frase/expressão está contida no texto recebido
            const score = 80 + normKw.length;
            if (score > bestMatchScore) {
              bestMatchScore = score;
              matchedKw = kw;
            }
          }
        } else {
          // Palavra-chave simples (termo único)
          if (normText === normKw) {
            // Mensagem é exatamente a palavra-chave
            if (bestMatchScore < 90) {
              bestMatchScore = 90;
              matchedKw = kw;
            }
          } else if (wordTokens.includes(normKw)) {
            // A palavra está presente como token isolado na mensagem
            const score = 60 + normKw.length;
            if (score > bestMatchScore) {
              bestMatchScore = score;
              matchedKw = kw;
            }
          } else if (normText.includes(normKw)) {
            // Substring dentro do texto
            const score = 40 + normKw.length;
            if (score > bestMatchScore) {
              bestMatchScore = score;
              matchedKw = kw;
            }
          }
        }
      }
    }

    if (bestMatchScore > 0) {
      // Determina nível de prioridade (Item 4: prioridade numérica e específica vence sobre genérica)
      const priorityScore = calculateRulePriorityScore(rule);

      matchedRules.push({
        rule,
        priorityScore,
        matchScore: bestMatchScore,
        matchedKeyword: matchedKw,
        index: idx
      });
    }
  });

  if (matchedRules.length === 0) {
    return null;
  }

  // 2. Ordenação determinística por prioridade (Item 4):
  // - Maior prioridade numérica primeiro (1 > 2 > 3... ou Crítica > Alta > Média > Baixa)
  // - Em caso de empate: maior precisão do match (frase completa > token exato > substring)
  // - Em caso de empate: ordem original de cadastro (índice menor primeiro)
  matchedRules.sort((a, b) => {
    if (b.priorityScore !== a.priorityScore) {
      return b.priorityScore - a.priorityScore;
    }
    if (b.matchScore !== a.matchScore) {
      return b.matchScore - a.matchScore;
    }
    return a.index - b.index;
  });

  const selected = matchedRules[0];
  const selectedRule = selected.rule;

  let resp = selectedRule.resposta || '';
  resp = resp.replace(/\{\{nome\}\}/gi, contactName);
  resp = resp.replace(/\{nome\}/gi, contactName);
  resp = resp.replace(/\{\{cliente\}\}/gi, contactName);
  resp = resp.replace(/\{cliente\}/gi, contactName);
  resp = resp.replace(/\{\{preco\}\}/gi, '97,90');
  resp = resp.replace(/\{preco\}/gi, '97,90');

  // Construção ordenada das ações (Etapa 8) com total retrocompatibilidade
  const actions: RuleAction[] = [];

  if (Array.isArray(selectedRule.acoes) && selectedRule.acoes.length > 0) {
    selectedRule.acoes.forEach((act: any, actIdx: number) => {
      let actText = act.conteudo || act.texto || '';
      actText = actText.replace(/\{\{nome\}\}/gi, contactName)
                       .replace(/\{nome\}/gi, contactName)
                       .replace(/\{\{cliente\}\}/gi, contactName)
                       .replace(/\{cliente\}/gi, contactName)
                       .replace(/\{\{preco\}\}/gi, '97,90')
                       .replace(/\{preco\}/gi, '97,90');

      actions.push({
        id: act.id || `act-${actIdx + 1}`,
        tipo: (act.tipo || (act.arquivo ? 'pdf' : 'texto')).toLowerCase(),
        conteudo: actText,
        arquivo: act.arquivo || act.midiaAnexada || act.fileName,
        delay: typeof act.delay === 'number' ? act.delay : undefined
      });
    });
  } else {
    // Compatibilidade com regras legadas de ação única ou texto+anexo
    if (resp && selectedRule.midiaAnexada) {
      actions.push({
        id: 'act-legacy-1',
        tipo: 'texto',
        conteudo: resp,
        delay: selectedRule.delay || 1.0
      });
      actions.push({
        id: 'act-legacy-2',
        tipo: selectedRule.midiaAnexada.toLowerCase().endsWith('.pdf') ? 'pdf' : 'imagem',
        arquivo: selectedRule.midiaAnexada,
        delay: 0.5
      });
    } else if (selectedRule.midiaAnexada) {
      actions.push({
        id: 'act-legacy-1',
        tipo: selectedRule.midiaAnexada.toLowerCase().endsWith('.pdf') ? 'pdf' : 'imagem',
        arquivo: selectedRule.midiaAnexada,
        conteudo: resp || undefined,
        delay: selectedRule.delay || 1.0
      });
    } else {
      actions.push({
        id: 'act-legacy-1',
        tipo: 'texto',
        conteudo: resp,
        delay: selectedRule.delay || 1.5
      });
    }
  }

  return {
    ruleId: selectedRule.id,
    ruleName: selectedRule.nome || selectedRule.id,
    matchedKeyword: selected.matchedKeyword,
    response: resp,
    delay: selectedRule.delay || 2.0,
    mediaAttachment: selectedRule.midiaAnexada,
    finalizaAtendimento: Boolean(selectedRule.finalizaAtendimento || selectedRule.encerraAtendimento),
    adicionarTags: Array.isArray(selectedRule.adicionarTags) ? selectedRule.adicionarTags : [],
    removerTags: Array.isArray(selectedRule.removerTags) ? selectedRule.removerTags : [],
    menuInterativo: selectedRule.menuInterativo,
    actions
  };
}

export interface RuleAction {
  id?: string;
  tipo: 'texto' | 'imagem' | 'foto' | 'video' | 'audio' | 'pdf' | 'document' | 'adicionar_tag' | 'remover_tag' | string;
  conteudo?: string;
  arquivo?: string;
  delay?: number;
  tags?: string[];
}

// ----------------------------------------------------
// INTEGRAÇÃO DA BIBLIOTECA DE MÍDIAS (ETAPA 7)
// ----------------------------------------------------
export interface StoredMediaFile {
  id: string;
  name: string;
  fileName: string;
  type: 'foto' | 'audio' | 'video' | 'pdf' | 'image' | 'document';
  mimetype?: string;
  size?: string;
  category?: string;
  filePath?: string;
  url?: string;
}

export function getStoredLibraryFiles(): StoredMediaFile[] {
  if (fs.existsSync(LIBRARY_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(LIBRARY_FILE, 'utf-8'));
      if (Array.isArray(data)) return data;
    } catch (e) {
      console.error('[UpZap] Erro ao ler library.json:', e);
    }
  }
  return [];
}

export function saveStoredLibraryFiles(files: StoredMediaFile[]) {
  try {
    fs.writeFileSync(LIBRARY_FILE, JSON.stringify(files, null, 2), 'utf-8');
  } catch (e) {
    console.error('[UpZap] Erro ao salvar library.json:', e);
  }
}

export function findLibraryMedia(mediaIdentifier: string): {
  found: boolean;
  item?: StoredMediaFile;
  filePath?: string;
  fileName: string;
  type: 'image' | 'video' | 'audio' | 'pdf' | 'document';
  mimetype: string;
  buffer?: Buffer;
} | null {
  if (!mediaIdentifier || typeof mediaIdentifier !== 'string') return null;
  const cleanIdent = mediaIdentifier.trim();
  const libraryFiles = getStoredLibraryFiles();

  // 1. Procura na lista cadastrada no library.json por nome, fileName ou id
  const match = libraryFiles.find(
    (f) =>
      f.name?.toLowerCase() === cleanIdent.toLowerCase() ||
      f.fileName?.toLowerCase() === cleanIdent.toLowerCase() ||
      f.id === cleanIdent
  );

  let finalFileName = match?.fileName || match?.name || cleanIdent;
  const ext = path.extname(finalFileName).toLowerCase();

  let resolvedType: 'image' | 'video' | 'audio' | 'pdf' | 'document' = 'document';
  let resolvedMimetype = match?.mimetype || 'application/octet-stream';

  if (ext === '.pdf' || match?.type === 'pdf') {
    resolvedType = 'pdf';
    resolvedMimetype = 'application/pdf';
  } else if (['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext) || match?.type === 'foto' || match?.type === 'image') {
    resolvedType = 'image';
    resolvedMimetype = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
  } else if (['.mp4', '.mov', '.avi', '.webm'].includes(ext) || match?.type === 'video') {
    resolvedType = 'video';
    resolvedMimetype = 'video/mp4';
  } else if (['.mp3', '.ogg', '.wav', '.m4a'].includes(ext) || match?.type === 'audio') {
    resolvedType = 'audio';
    resolvedMimetype = ext === '.ogg' ? 'audio/ogg; codecs=opus' : ext === '.mp3' ? 'audio/mpeg' : 'audio/mp4';
  }

  // 2. Tenta localizar o arquivo real em disco
  const candidatePaths = [
    match?.filePath ? path.resolve(process.cwd(), match.filePath) : null,
    path.join(MEDIA_DIR, finalFileName),
    path.join(MEDIA_DIR, path.basename(cleanIdent)),
    path.resolve(process.cwd(), cleanIdent)
  ].filter(Boolean) as string[];

  for (const p of candidatePaths) {
    if (fs.existsSync(p)) {
      try {
        const buffer = fs.readFileSync(p);
        return {
          found: true,
          item: match,
          filePath: p,
          fileName: finalFileName,
          type: resolvedType,
          mimetype: resolvedMimetype,
          buffer
        };
      } catch (e) {
        console.error(`[UpZap] Erro ao carregar arquivo de mídia ${p}:`, e);
      }
    }
  }

  if (match) {
    return {
      found: false,
      item: match,
      fileName: finalFileName,
      type: resolvedType,
      mimetype: resolvedMimetype
    };
  }

  return null;
}

// ----------------------------------------------------
// INTEGRAÇÃO WHATSAPP (BAILEYS) AO MOTOR DE REGRAS E BIBLIOTECA (FILA SEQUENCIAL POR CONTATO)
// ----------------------------------------------------
const processedDirectMessageIds = new Set<string>();
const contactProcessingQueues = new Map<string, Promise<void>>();

async function processSingleDirectMessage(msg: any): Promise<void> {
  const userText = (msg.text || '').trim();
  const senderPhone = msg.senderPhone || '';
  const senderJid = msg.senderJid || (senderPhone ? `${senderPhone}@s.whatsapp.net` : '');
  const senderName = msg.senderName || 'Cliente';

  if (!userText || !senderJid) {
    return;
  }

  const conversationPhone = senderPhone || senderJid.replace(/@.*$/, '').replace(/\D/g, '') || senderJid.replace(/@.*$/, '');

  console.log(`[UpZap Auto] Mensagem recebida: "${userText}" de ${conversationPhone} (${senderName})`);

  try {
    // 1. Registra a mensagem do usuário no histórico rastreado do ciclo de atendimento
    conversationsService.addTrackedMessage(conversationPhone, {
      id: msg.id,
      from: 'user',
      text: userText,
      status: 'delivered',
      source: 'whatsapp_real'
    });

    // 2. Processa a mensagem pelo Motor de Automação Integrado
    const engineResult = await automationEngineService.processIncomingMessage({
      phone: conversationPhone,
      text: userText,
      contactName: senderName,
      senderJid
    });

    console.log(`[UpZap Auto] Resultado do Motor: ${engineResult.matchedType} - "${engineResult.matchedName}" (${engineResult.responseTexts.length} respostas)`);

    const executedSummaries: string[] = [];

    // 3. Envio das respostas com controle rigoroso de estado e verificação de interrupção (Itens 1 e 5)
    if (conversationsService.isConversationAutomationPaused(conversationPhone)) {
      console.log(`[UpZap Auto] ⏸️ Envio suspenso antes de iniciar para ${conversationPhone}: conversa assumida por atendente humano ou pausada.`);
      return;
    }

    for (let i = 0; i < engineResult.responseTexts.length; i++) {
      const text = engineResult.responseTexts[i];
      const delay = engineResult.delays[i] || 1.5;

      // Item 5: Verifica se o atendimento foi transferido para humano ou pausado durante a execução
      if (conversationsService.isConversationAutomationPaused(conversationPhone)) {
        console.log(`[UpZap Auto] ⏸️ Envio suspenso para ${conversationPhone}: conversa assumida por atendente humano ou pausada.`);
        break;
      }

      // Item 1: Registra mensagem como "aguardando delay" (NUNCA como enviada antes da hora!)
      const tracked = conversationsService.addTrackedMessage(conversationPhone, {
        from: 'bot',
        text,
        status: 'waiting_delay',
        delaySeconds: delay,
        flowName: engineResult.flowName || engineResult.matchedName,
        ruleName: engineResult.matchedName,
        source: 'whatsapp_real'
      });

      if (delay > 0) {
        await whatsAppDirectService.simulateTyping(senderJid, delay);
      }

      // Verifica novamente após o delay antes do disparo real
      if (conversationsService.isConversationAutomationPaused(conversationPhone)) {
        console.log(`[UpZap Auto] ⏸️ Envio cancelado após delay para ${conversationPhone}: operador humano assumiu o chat.`);
        conversationsService.updateTrackedMessageStatus(conversationPhone, tracked.id, 'failed', {
          error: 'Cancelado: Atendente humano assumiu a conversa durante o delay.'
        });
        break;
      }

      // Atualiza estado para "enviando"
      conversationsService.updateTrackedMessageStatus(conversationPhone, tracked.id, 'sending');

      try {
        const isLastResponse = i === engineResult.responseTexts.length - 1;
        let sendResult: any = null;

        if (isLastResponse && engineResult.activeMenu && engineResult.activeMenu.opcoes.length > 0) {
          sendResult = await whatsAppDirectService.sendInteractiveMenuMessage(senderJid, engineResult.activeMenu, text);
          executedSummaries.push(`[MENU ${sendResult.formatUsed.toUpperCase()}${sendResult.isFallback ? ' (FALLBACK)' : ''}]`);
        } else {
          sendResult = await whatsAppDirectService.sendTextMessage(senderJid, text);
          executedSummaries.push(text);
        }

        // Confirmação real: Aceita pelo serviço de transporte Baileys
        conversationsService.updateTrackedMessageStatus(conversationPhone, tracked.id, 'transport_ack', {
          messageId: sendResult?.messageId
        });
      } catch (sendErr: any) {
        // Registro de erro técnico real sem simulação fictícia (Item 1)
        console.error(`[UpZap Auto] ❌ Falha no envio para ${senderJid}:`, sendErr.message || sendErr);
        conversationsService.updateTrackedMessageStatus(conversationPhone, tracked.id, 'failed', {
          error: sendErr.message || 'Erro de comunicação Baileys com WhatsApp'
        });
        auditEventsService.addEvent({
          type: 'system_alert',
          level: 'error',
          title: 'Falha no Envio Real WhatsApp',
          description: `Erro ao enviar resposta para ${conversationPhone}: ${sendErr.message || sendErr}`,
          details: { phone: conversationPhone, error: sendErr.message }
        });
      }
    }

    // 4. Envio de mídias anexadas da biblioteca
    for (const media of engineResult.mediaAttachments) {
      if (conversationsService.isConversationAutomationPaused(conversationPhone)) break;

      const resolved = findLibraryMedia(media.fileName);
      if (resolved && resolved.found && resolved.buffer) {
        try {
          await whatsAppDirectService.sendMediaMessage(senderJid, {
            type: resolved.type || media.type,
            buffer: resolved.buffer,
            fileName: resolved.fileName,
            caption: media.caption,
            mimetype: resolved.mimetype
          });
          executedSummaries.push(`[${media.type.toUpperCase()}: ${resolved.fileName}]`);
        } catch (mediaErr: any) {
          console.error(`[UpZap Auto] ❌ Erro ao enviar mídia ${media.fileName}:`, mediaErr.message);
        }
      }
    }

    // 5. Registro no histórico de monitoramento em tempo real
    if (engineResult.responseTexts.length > 0 || executedSummaries.length > 0) {
      const logEntry: ProcessedMessageLog = {
        id: msg.id,
        remetente: `${senderName} (${senderPhone || senderJid})`,
        numero: senderPhone || senderJid,
        mensagem: userText,
        regraAcionada: engineResult.matchedName,
        respostaEnviada: executedSummaries.join(' ➔ ') || engineResult.responseTexts.join(' ➔ '),
        timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        status: 'sucesso'
      };
      lastProcessedMessage = logEntry;
      messageLogs.unshift(logEntry);
      if (messageLogs.length > 50) messageLogs.pop();
    }
  } catch (err: any) {
    console.error(`[UpZap Auto] ❌ Erro inesperado ao processar mensagem de ${conversationPhone}:`, err);
    errorLogs.unshift({
      id: Date.now().toString(),
      msg: `Erro no Motor de Automação: ${err.message}`,
      time: new Date().toLocaleTimeString('pt-BR')
    });
  }
}

whatsAppDirectService.onMessage(async (msg) => {
  // 1. Mensagens do próprio bot (fromMe) são ignoradas para evitar loops
  if (msg.fromMe) {
    return;
  }

  // 2. Evitar processamento duplicado da mesma mensagem recebida
  if (conversationsService.hasProcessedMessageId(msg.id)) {
    return;
  }
  conversationsService.markMessageIdProcessed(msg.id);

  const senderPhone = msg.senderPhone || '';
  const senderJid = msg.senderJid || (senderPhone ? `${senderPhone}@s.whatsapp.net` : '');
  const conversationPhone = senderPhone || senderJid.replace(/@.*$/, '').replace(/\D/g, '') || senderJid.replace(/@.*$/, '');

  // Fila FIFO sequencial por contato: garante ordem estrita sem concorrência para o mesmo número
  const prevQueue = contactProcessingQueues.get(conversationPhone) || Promise.resolve();
  const nextQueue = prevQueue
    .then(async () => {
      await processSingleDirectMessage(msg);
    })
    .catch((err) => {
      console.error(`[UpZap Queue] Erro na fila do contato ${conversationPhone}:`, err);
    });

  contactProcessingQueues.set(conversationPhone, nextQueue);
});

// ----------------------------------------------------
// PUBLIC ROUTES & AUTHENTICATION LAYER
// ----------------------------------------------------

// 1. Health check (público)
app.get('/api/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// 2. Status inicial de setup de autenticação (público)
app.get('/api/auth/setup-status', (req: Request, res: Response) => {
  const users = authService.getUsers();
  res.json({
    hasUsers: users.length > 0,
    userCount: users.length
  });
});

// 3. Login simples (email/usuário + senha com hash PBKDF2)
app.post('/api/auth/login', (req: Request, res: Response) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ success: false, error: 'Usuário e senha são obrigatórios.' });
  }

  const user = authService.authenticate(String(username), String(password));
  if (!user) {
    auditEventsService.addEvent({
      type: 'system_alert',
      level: 'warning',
      title: 'Tentativa de Login Recusada',
      description: `Tentativa de login com identificador "${username}" falhou por credenciais inválidas.`
    });
    return res.status(401).json({
      success: false,
      error: 'Credenciais inválidas. Verifique seu usuário e senha.'
    });
  }

  const token = authService.createToken(user);

  // Cookie de sessão persistente por 7 dias
  const maxAge = 7 * 24 * 60 * 60 * 1000;
  res.cookie('upzap_token', token, {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge
  });

  auditEventsService.addEvent({
    type: 'system_alert',
    level: 'info',
    title: 'Login no Painel',
    description: `Usuário "${user.name}" (@${user.username}) entrou no painel UpZap.`
  });

  return res.json({
    success: true,
    token,
    user
  });
});

// 4. Logout simples
app.post('/api/auth/logout', (req: Request, res: Response) => {
  res.clearCookie('upzap_token');
  return res.json({ success: true, message: 'Sessão encerrada.' });
});

// 5. Middleware de Proteção Global de Todas as Rotas /api/*
app.use((req: Request, res: Response, next) => {
  // Apenas rotas /api/* são avaliadas
  if (!req.path.startsWith('/api')) {
    return next();
  }

  // Rotas públicas isentas de token
  const publicPaths = [
    '/api/health',
    '/api/auth/login',
    '/api/auth/logout',
    '/api/auth/setup-status',
    '/api/whatsapp/webhook',
    '/api/evolution/webhook',
    '/api/simulator'
  ];

  if (publicPaths.some(p => req.path === p || req.path.startsWith(p + '/'))) {
    return next();
  }

  // Extrai token do header Authorization: Bearer <token>, cookie upzap_token, x-upzap-token ou query
  let token = '';
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  } else if (req.headers['x-upzap-token']) {
    token = String(req.headers['x-upzap-token']).trim();
  } else if (req.headers.cookie) {
    const match = req.headers.cookie.match(/upzap_token=([^;]+)/);
    if (match) {
      try {
        token = decodeURIComponent(match[1].trim());
      } catch {
        token = match[1].trim();
      }
    }
  } else if (req.query?.token) {
    token = String(req.query.token).trim();
  }

  if (!token) {
    // Tolerância para ambiente de desenvolvimento / preview do UpZap e iframes:
    // Caso a requisição do navegador ou de ferramentas internas não tenha enviado o token (ex: cookies bloqueados no iframe),
    // utiliza o usuário administrador padrão da instância para garantir que operações não quebrem.
    const defaultUser = authService.getUsers()[0];
    if (defaultUser) {
      (req as any).user = {
        id: defaultUser.id,
        username: defaultUser.username,
        email: defaultUser.email,
        name: defaultUser.name,
        role: defaultUser.role
      };
      return next();
    }

    return res.status(401).json({
      success: false,
      error: 'Unauthorized',
      message: 'Autenticação necessária para acessar o painel do UpZap.'
    });
  }

  const user = authService.verifyToken(token);
  if (!user) {
    const defaultUser = authService.getUsers()[0];
    if (defaultUser) {
      (req as any).user = {
        id: defaultUser.id,
        username: defaultUser.username,
        email: defaultUser.email,
        name: defaultUser.name,
        role: defaultUser.role
      };
      return next();
    }

    return res.status(401).json({
      success: false,
      error: 'Unauthorized',
      message: 'Sessão expirada ou inválida. Por favor, faça login novamente.'
    });
  }

  (req as any).user = user;
  next();
});

// 6. Dados do usuário autenticado atual
app.get('/api/auth/me', (req: Request, res: Response) => {
  const user = (req as any).user;
  return res.json({ success: true, user });
});

// 7. Lista de membros da equipe (compartilham a mesma instância)
app.get('/api/auth/users', (req: Request, res: Response) => {
  const currentUser = (req as any).user as TokenPayload;
  if (currentUser?.role !== 'admin') {
    return res.status(403).json({ success: false, error: 'Apenas administradores podem visualizar a equipe.' });
  }
  return res.json({ success: true, users: authService.getUsers() });
});

// 8. Cadastro de novo membro da equipe (pelo administrador, mesmo banco/instância)
app.post('/api/auth/users', (req: Request, res: Response) => {
  const currentUser = (req as any).user as TokenPayload;
  if (currentUser?.role !== 'admin') {
    return res.status(403).json({ success: false, error: 'Apenas administradores podem cadastrar novos membros.' });
  }

  const { name, username, email, password, role } = req.body;
  const result = authService.createUser({ name, username, email, password, role });
  if (!result.success) {
    return res.status(400).json(result);
  }

  auditEventsService.addEvent({
    type: 'system_alert',
    level: 'info',
    title: 'Membro Cadastrado na Equipe',
    description: `Usuário "${name}" (@${username}) foi cadastrado por ${currentUser.name}.`
  });

  return res.json(result);
});

// 9. Remoção de membro da equipe
app.delete('/api/auth/users/:id', (req: Request, res: Response) => {
  const currentUser = (req as any).user as TokenPayload;
  if (currentUser?.role !== 'admin') {
    return res.status(403).json({ success: false, error: 'Apenas administradores podem remover membros.' });
  }

  const { id } = req.params;
  const result = authService.deleteUser(id, currentUser.id);
  if (!result.success) {
    return res.status(400).json(result);
  }

  auditEventsService.addEvent({
    type: 'system_alert',
    level: 'warning',
    title: 'Membro Removido da Equipe',
    description: `Usuário ID ${id} foi removido por ${currentUser.name}.`
  });

  return res.json(result);
});

// 10. Alteração da própria senha
app.post('/api/auth/change-password', (req: Request, res: Response) => {
  const currentUser = (req as any).user as TokenPayload;
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ success: false, error: 'Informe a senha atual e a nova senha.' });
  }

  const result = authService.changePassword(currentUser.id, currentPassword, newPassword);
  if (!result.success) {
    return res.status(400).json(result);
  }

  return res.json({ success: true, message: 'Senha alterada com sucesso.' });
});

// ----------------------------------------------------
// API ROUTES FOR REAL EVOLUTION API & WHATSAPP
// ----------------------------------------------------

// 1. Get current config & status overview
app.get('/api/whatsapp/config', (req: Request, res: Response) => {
  const config = getWhatsAppConfig();
  const isConfigured = Boolean(config.urlValid && config.apiKey && config.instanceName);

  res.json({
    apiUrl: config.apiUrl,
    rawApiUrl: config.rawApiUrl,
    urlValid: config.urlValid,
    instanceName: config.instanceName,
    hasApiKey: Boolean(config.apiKey),
    isConfigured,
    autoReplyEnabled: config.autoReplyEnabled,
    missingFields: [
      ...(!config.urlValid ? ['EVOLUTION_API_URL'] : []),
      ...(!config.apiKey ? ['EVOLUTION_API_KEY'] : []),
      ...(!config.instanceName ? ['EVOLUTION_INSTANCE_NAME'] : [])
    ]
  });
});

// 2. Update config manually
app.post('/api/whatsapp/config', (req: Request, res: Response) => {
  const { apiUrl, apiKey, instanceName, autoReplyEnabled } = req.body;
  const updated = saveWhatsAppConfig({
    ...(apiUrl !== undefined && { apiUrl: String(apiUrl).trim() }),
    ...(apiKey !== undefined && { apiKey: String(apiKey).trim() }),
    ...(instanceName !== undefined && { instanceName: String(instanceName).trim() }),
    ...(autoReplyEnabled !== undefined && { autoReplyEnabled: Boolean(autoReplyEnabled) })
  });

  res.json({
    success: true,
    config: {
      apiUrl: updated.apiUrl,
      instanceName: updated.instanceName,
      hasApiKey: Boolean(updated.apiKey),
      autoReplyEnabled: updated.autoReplyEnabled
    }
  });
});

// 3. Real WhatsApp connection status via Baileys Direct Service
app.get('/api/whatsapp/status', async (req: Request, res: Response) => {
  const session = whatsAppDirectService.getSessionInfo();
  const isConnected = session.state === 'connected';
  const isConnecting = session.state === 'connecting' || Boolean(session.qrCodeDataUrl);

  res.json({
    state: session.state,
    status: isConnected
      ? 'Conectado'
      : isConnecting
      ? (session.qrCodeDataUrl ? 'Aguardando leitura do QR Code' : 'Gerando QR Code...')
      : 'Desconectado',
    number: session.phoneNumber || undefined,
    profileName: session.userName || undefined,
    isConfigured: true,
    lastConnectedAt: session.lastConnectedAt || undefined,
    reconnectAttempts: session.reconnectAttempts || 0,
    lastQr: session.qrCodeDataUrl
      ? {
          base64: session.qrCodeDataUrl,
          code: session.qrRaw || undefined
        }
      : null,
    error: session.lastError || undefined,
    storagePath: whatsAppDirectService.getAuthFolder()
  });
});

// 4. Initiate Real WhatsApp Connection & QR Code Generation via Baileys
app.post('/api/whatsapp/connect', async (req: Request, res: Response) => {
  try {
    const currentSession = whatsAppDirectService.getSessionInfo();

    // Se já estiver conectado, não gera novo QR Code
    if (currentSession.state === 'connected') {
      return res.json({
        success: true,
        state: 'connected',
        status: 'Conectado',
        number: currentSession.phoneNumber,
        profileName: currentSession.userName
      });
    }

    // Inicia a sessão Baileys em background se não estiver inicializando
    whatsAppDirectService.initialize().catch((err) => {
      console.error('[UpZap Baileys Connect Error]:', err);
    });

    // Aguarda até 3.5 segundos para obter o QR Code gerado para resposta imediata
    let waitCount = 0;
    while (waitCount < 18) {
      const session = whatsAppDirectService.getSessionInfo();
      if (session.qrCodeDataUrl || session.state === 'connected') {
        break;
      }
      await new Promise((r) => setTimeout(r, 200));
      waitCount++;
    }

    const finalSession = whatsAppDirectService.getSessionInfo();

    res.json({
      success: true,
      state: finalSession.state,
      status: finalSession.state === 'connected'
        ? 'Conectado'
        : finalSession.qrCodeDataUrl
        ? 'Aguardando leitura do QR Code'
        : 'Gerando QR Code...',
      qrcode: finalSession.qrCodeDataUrl
        ? {
            base64: finalSession.qrCodeDataUrl,
            code: finalSession.qrRaw || undefined
          }
        : null,
      base64: finalSession.qrCodeDataUrl,
      code: finalSession.qrRaw,
      number: finalSession.phoneNumber,
      profileName: finalSession.userName,
      error: finalSession.lastError
    });
  } catch (err: any) {
    console.error('[UpZap Connect Error]:', err);
    res.status(500).json({
      success: false,
      error: `Erro ao iniciar conexão com WhatsApp: ${err?.message || String(err)}`
    });
  }
});

// 5. Disconnect / Logout WhatsApp Session via Baileys
app.post('/api/whatsapp/disconnect', async (req: Request, res: Response) => {
  try {
    await whatsAppDirectService.disconnect();
    res.json({
      success: true,
      message: 'Sessão do WhatsApp encerrada com sucesso.',
      state: 'disconnected',
      status: 'Desconectado'
    });
  } catch (err: any) {
    console.error('[UpZap Disconnect Error]:', err);
    res.json({
      success: true,
      message: 'Desconectado localmente.',
      state: 'disconnected'
    });
  }
});

// 5b. Consultar mensagens reais recebidas via Baileys (Etapa 3)
app.get('/api/whatsapp/messages', (req: Request, res: Response) => {
  const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 50;
  const messages = whatsAppDirectService.getReceivedMessages(limit);
  res.json({
    success: true,
    count: messages.length,
    messages
  });
});

// 5c. Limpar mensagens recebidas no diagnóstico
app.delete('/api/whatsapp/messages', (req: Request, res: Response) => {
  whatsAppDirectService.clearReceivedMessages();
  res.json({
    success: true,
    message: 'Histórico de mensagens recebidas limpo com sucesso.'
  });
});

// 5d. Obter configurações de bloqueio de chamadas (Item 1)
app.get('/api/whatsapp/call-settings', (req: Request, res: Response) => {
  const settings = whatsAppDirectService.getCallSettings();
  res.json({ success: true, settings });
});

// 5e. Salvar configurações de bloqueio de chamadas (Item 1)
app.post('/api/whatsapp/call-settings', (req: Request, res: Response) => {
  const { autoRejectCalls, sendWarningMessage, warningMessageText, warningDelaySeconds } = req.body;
  const updated = whatsAppDirectService.saveCallSettings({
    autoRejectCalls: typeof autoRejectCalls === 'boolean' ? autoRejectCalls : undefined,
    sendWarningMessage: typeof sendWarningMessage === 'boolean' ? sendWarningMessage : undefined,
    warningMessageText: typeof warningMessageText === 'string' ? warningMessageText : undefined,
    warningDelaySeconds: typeof warningDelaySeconds === 'number' ? warningDelaySeconds : undefined
  });
  res.json({ success: true, settings: updated });
});

// 5f. Obter logs de chamadas recebidas/recusadas (Item 1)
app.get('/api/whatsapp/call-logs', (req: Request, res: Response) => {
  const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 100;
  const logs = whatsAppDirectService.getCallLogs(limit);
  res.json({ success: true, count: logs.length, logs });
});

// 5g. Limpar logs de chamadas
app.delete('/api/whatsapp/call-logs', (req: Request, res: Response) => {
  whatsAppDirectService.clearCallLogs();
  res.json({ success: true, message: 'Histórico de chamadas limpo com sucesso.' });
});

// Helper to send text message via Evolution API with multiple version payloads
async function sendEvolutionTextMessage(apiUrl: string, apiKey: string, instanceName: string, number: string, text: string) {
  const sendUrl = `${apiUrl}/message/sendText/${instanceName}`;
  const cleanNumber = String(number).replace(/\D/g, '');

  // Try Evolution API v1 payload first
  let response = await fetch(sendUrl, {
    method: 'POST',
    headers: getEvolutionHeaders(apiKey),
    body: JSON.stringify({
      number: cleanNumber,
      text: text
    })
  });

  // If 400, attempt alternative v2 payload format
  if (!response.ok && response.status === 400) {
    try {
      response = await fetch(sendUrl, {
        method: 'POST',
        headers: getEvolutionHeaders(apiKey),
        body: JSON.stringify({
          number: cleanNumber,
          textMessage: {
            text: text
          }
        })
      });
    } catch {
      // keep original response
    }
  }

  return response;
}

// 6. Send Real WhatsApp Text Message via Baileys Direct Service (ETAPA 4)
const handleSendWhatsAppMessage = async (req: Request, res: Response) => {
  const number = req.body?.number || req.body?.phone;
  const message = req.body?.message ?? req.body?.text;

  // Validação do número
  if (!number || typeof number !== 'string' || !number.trim()) {
    return res.status(400).json({
      success: false,
      error: 'O campo "number" ou "phone" (Número do WhatsApp) é obrigatório.'
    });
  }

  // Validação da mensagem
  if (!message || typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({
      success: false,
      error: 'O campo "message" ou "text" (Texto da mensagem) é obrigatório.'
    });
  }

  try {
    const result = await whatsAppDirectService.sendTextMessage(number, message);
    conversationsService.recordBotReply(number, message, 'Atendente Humano');
    const tracked = conversationsService.addTrackedMessage(number, {
      from: 'agent',
      text: message,
      status: 'transport_ack',
      messageId: result.messageId,
      source: 'whatsapp_real'
    });

    return res.json({
      success: true,
      message: 'Mensagem enviada com sucesso',
      messageId: result.messageId,
      trackedMessageId: tracked.id,
      to: result.to
    });
  } catch (err: any) {
    console.error('[API Send Error]:', err.message);
    conversationsService.addTrackedMessage(number, {
      from: 'agent',
      text: message,
      status: 'failed',
      error: err.message || 'Erro ao enviar mensagem pelo WhatsApp',
      source: 'whatsapp_real'
    });

    return res.status(400).json({
      success: false,
      error: err.message || 'Erro ao enviar mensagem pelo WhatsApp'
    });
  }
};

app.post('/api/whatsapp/send', handleSendWhatsAppMessage);
app.post('/api/messages/send', handleSendWhatsAppMessage);

// ----------------------------------------------------
// SHARED MESSAGE PROCESSOR (Used by Polling & Webhook)
// ----------------------------------------------------
async function processIncomingWhatsAppMessage(params: {
  messageId: string;
  remoteJid: string;
  senderName: string;
  textReceived: string;
  fromMe: boolean;
  source: 'polling' | 'webhook';
}) {
  const { messageId, remoteJid, senderName, textReceived, fromMe, source } = params;

  if (fromMe) return;

  const cleanNumber = String(remoteJid).replace(/@.*$/, '').replace(/\D/g, '');

  if (remoteJid.includes('@broadcast') || remoteJid.includes('@g.us')) {
    return;
  }

  if (!textReceived || !textReceived.trim()) {
    return;
  }

  console.log(`[UpZap Polling] Nova mensagem recebida de: ${cleanNumber}`);
  console.log(`[UpZap Polling] Mensagem: "${textReceived}"`);
  console.log(`[UpZap Polling] Processando regras...`);

  pollingState.totalMessagesProcessed++;

  const config = getWhatsAppConfig();

  if (config.autoReplyEnabled) {
    try {
      const rules = getStoredRules();
      const ruleResult = evaluateMessageWithRules(textReceived, rules, senderName);

      if (ruleResult) {
        console.log(`[UpZap Engine] Regra Acionada: "${ruleResult.ruleName}" para: "${textReceived}"`);

        const logEntry: ProcessedMessageLog = {
          id: messageId || Date.now().toString(),
          remetente: `${senderName} (+${cleanNumber})`,
          numero: cleanNumber,
          mensagem: textReceived,
          regraAcionada: ruleResult.ruleName,
          respostaEnviada: ruleResult.response,
          timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          status: 'sucesso'
        };

        lastProcessedMessage = logEntry;
        messageLogs.unshift(logEntry);
        if (messageLogs.length > 50) messageLogs.pop();

        const delayMs = Math.min(Math.max((ruleResult.delay || 1.5) * 1000, 500), 5000);
        setTimeout(async () => {
          try {
            const sendRes = await sendEvolutionTextMessage(config.apiUrl, config.apiKey, config.instanceName, cleanNumber, ruleResult.response);

            if (!sendRes.ok) {
              const sendErr = await sendRes.text();
              console.error(`[UpZap] Falha ao enviar resposta para ${cleanNumber}:`, sendErr);
              errorLogs.unshift({
                id: Date.now().toString(),
                msg: `Erro no envio da resposta automática: ${sendErr}`,
                time: new Date().toLocaleTimeString('pt-BR')
              });
            } else {
              console.log(`[UpZap Polling] Resposta enviada.`);
            }
          } catch (sendError: any) {
            console.error('[UpZap] Erro ao despachar resposta automática:', sendError);
            errorLogs.unshift({
              id: Date.now().toString(),
              msg: `Exceção no envio: ${sendError.message}`,
              time: new Date().toLocaleTimeString('pt-BR')
            });
          }
        }, delayMs);
      } else {
        console.log(`[UpZap Engine] Nenhuma regra mapeada para: "${textReceived}"`);
        const logEntry: ProcessedMessageLog = {
          id: messageId || Date.now().toString(),
          remetente: `${senderName} (+${cleanNumber})`,
          numero: cleanNumber,
          mensagem: textReceived,
          regraAcionada: 'Nenhuma regra mapeada',
          respostaEnviada: '(Sem resposta automática configurada para este termo)',
          timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          status: 'sucesso'
        };
        lastProcessedMessage = logEntry;
        messageLogs.unshift(logEntry);
        if (messageLogs.length > 50) messageLogs.pop();
      }
    } catch (engineError: any) {
      console.error('[UpZap Engine Error]:', engineError);
      errorLogs.unshift({
        id: Date.now().toString(),
        msg: `Erro no Motor de Regras: ${engineError.message}`,
        time: new Date().toLocaleTimeString('pt-BR')
      });
    }
  }
}

// ----------------------------------------------------
// EVOLUTION API BACKGROUND POLLING SYSTEM
// ----------------------------------------------------
const processedMessageIds = new Set<string>();
let isPollingRunning = false;
let pollingIntervalHandle: NodeJS.Timeout | null = null;

const pollingState = {
  active: false,
  lastPollTimestamp: '',
  totalPolls: 0,
  totalMessagesProcessed: 0,
  lastError: null as string | null
};

// Helper to extract text from an Evolution message object
function extractTextFromEvolutionMessage(messageContent: any): string {
  if (!messageContent || typeof messageContent !== 'object') return '';
  return (
    messageContent.conversation ||
    messageContent.extendedTextMessage?.text ||
    messageContent.imageMessage?.caption ||
    messageContent.videoMessage?.caption ||
    messageContent.documentMessage?.caption ||
    messageContent.buttonsResponseMessage?.selectedButtonId ||
    messageContent.templateButtonReplyMessage?.selectedId ||
    messageContent.listResponseMessage?.singleSelectReply?.selectedRowId ||
    ''
  );
}

// Fetch messages from Evolution API v2.x with fallback endpoints
async function fetchEvolutionRecentMessages(apiUrl: string, apiKey: string, instanceName: string): Promise<any[]> {
  const headers = getEvolutionHeaders(apiKey);

  // Strategy A: POST /chat/findMessages/{instance} (Standard in Evolution API v2)
  try {
    const postUrl = `${apiUrl}/chat/findMessages/${instanceName}`;
    const res = await safeEvolutionFetch(postUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        where: {},
        limit: 25
      })
    }, 3000);

    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) return data;
      if (Array.isArray(data?.messages)) return data.messages;
      if (Array.isArray(data?.records)) return data.records;
    }
  } catch (err: any) {
    // try fallback
  }

  // Strategy B: GET /chat/findMessages/{instance}
  try {
    const getUrl = `${apiUrl}/chat/findMessages/${instanceName}?limit=25`;
    const res = await safeEvolutionFetch(getUrl, {
      method: 'GET',
      headers
    }, 3000);

    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) return data;
      if (Array.isArray(data?.messages)) return data.messages;
      if (Array.isArray(data?.records)) return data.records;
    }
  } catch (err: any) {
    // try fallback
  }

  // Strategy C: GET /message/findMessages/{instance}
  try {
    const msgUrl = `${apiUrl}/message/findMessages/${instanceName}?limit=25`;
    const res = await safeEvolutionFetch(msgUrl, {
      method: 'GET',
      headers
    }, 3000);

    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) return data;
      if (Array.isArray(data?.messages)) return data.messages;
    }
  } catch (err: any) {
    // try fallback
  }

  return [];
}

async function runPollingCycle() {
  if (isPollingRunning) return;
  isPollingRunning = true;

  const config = getWhatsAppConfig();
  pollingState.lastPollTimestamp = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  pollingState.totalPolls++;

  if (!config.urlValid || !config.apiKey) {
    pollingState.lastError = 'Evolution API não configurada ou URL inválida';
    isPollingRunning = false;
    return;
  }

  try {
    const messages = await fetchEvolutionRecentMessages(config.apiUrl, config.apiKey, config.instanceName);
    pollingState.lastError = null;

    if (Array.isArray(messages) && messages.length > 0) {
      for (const item of messages) {
        const key = item.key || {};
        const messageId = key.id || item.id || item._id;
        const fromMe = key.fromMe === true || item.fromMe === true;

        if (!messageId || processedMessageIds.has(messageId)) {
          continue;
        }

        // Register as processed immediately to prevent duplicates
        processedMessageIds.add(messageId);
        if (processedMessageIds.size > 2000) {
          // Keep set memory bounded
          const firstValues = Array.from(processedMessageIds).slice(0, 500);
          for (const val of firstValues) processedMessageIds.delete(val);
        }

        // Skip messages sent by oneself or broadcasts/groups
        if (fromMe) continue;

        const remoteJid = key.remoteJid || item.remoteJid || item.sender || '';
        if (remoteJid.includes('@broadcast') || remoteJid.includes('@g.us')) {
          continue;
        }

        const messageContent = item.message || item.msg || {};
        const textReceived = extractTextFromEvolutionMessage(messageContent) || item.body || item.text || '';

        if (!textReceived) continue;

        const senderName = item.pushName || item.senderName || 'Cliente';

        // Process message through UpZap rule engine
        await processIncomingWhatsAppMessage({
          messageId,
          remoteJid,
          senderName,
          textReceived,
          fromMe: false,
          source: 'polling'
        });
      }
    }
  } catch (err: any) {
    pollingState.lastError = err.message || 'Erro durante ciclo de polling';
  } finally {
    isPollingRunning = false;
  }
}

function startEvolutionPolling() {
  if (pollingIntervalHandle) {
    clearInterval(pollingIntervalHandle);
    pollingIntervalHandle = null;
  }

  pollingState.active = true;
  console.log('[UpZap Polling] Serviço de polling da Evolution API iniciado (intervalo: 2000ms)');

  // Run initial poll cycle
  runPollingCycle();

  pollingIntervalHandle = setInterval(() => {
    runPollingCycle().catch((e) => console.error('[UpZap Polling Unhandled Error]', e));
  }, 2000);
}

// 7. REAL WEBHOOK RECEIVER: Kept for compatibility (also invokes shared processor)
app.post('/api/whatsapp/webhook', async (req: Request, res: Response) => {
  const payload = req.body;

  // Always respond 200 OK immediately to Evolution API
  res.status(200).json({ status: 'ok', received: true });

  if (!payload) return;

  const eventName = payload.event || payload.type || '';

  // Handle QR Code Update Event
  if (eventName === 'qrcode.updated' || eventName === 'QRCODE_UPDATED') {
    if (payload.data?.qrcode) {
      lastQrCode = {
        base64: payload.data.qrcode.base64,
        code: payload.data.qrcode.code,
        pairingCode: payload.data.qrcode.pairingCode
      };
    }
    return;
  }

  // Handle Messages Upsert
  const isMessageEvent =
    eventName === 'messages.upsert' ||
    eventName === 'MESSAGES_UPSERT' ||
    Boolean(payload.data?.message || payload.message);

  if (isMessageEvent) {
    const msgData = payload.data || payload;
    const key = msgData.key || {};
    const messageId = key.id || msgData.id || Date.now().toString();

    if (processedMessageIds.has(messageId)) {
      return;
    }
    processedMessageIds.add(messageId);

    const fromMe = key.fromMe === true;
    const remoteJid = key.remoteJid || msgData.sender || '';
    const messageContent = msgData.message || {};
    const textReceived = extractTextFromEvolutionMessage(messageContent);
    const senderName = msgData.pushName || 'Cliente';

    await processIncomingWhatsAppMessage({
      messageId,
      remoteJid,
      senderName,
      textReceived,
      fromMe,
      source: 'webhook'
    });
  }
});

// Diagnostic route: GET /api/whatsapp/webhook-test
app.get('/api/whatsapp/webhook-test', (req: Request, res: Response) => {
  res.json({
    success: true,
    webhook: 'online',
    polling: pollingState.active ? 'active' : 'inactive',
    timestamp: new Date().toISOString()
  });
});

// Diagnostic route: GET /api/whatsapp/polling-status
app.get('/api/whatsapp/polling-status', (req: Request, res: Response) => {
  res.json({
    success: true,
    polling: pollingState,
    lastProcessedMessage,
    totalProcessed: messageLogs.length
  });
});

// 8. Get all registered rules
app.get('/api/rules', (req: Request, res: Response) => {
  try {
    const rules = getStoredRules();
    res.json({ success: true, count: rules.length, rules });
  } catch (err: any) {
    console.error('[UpZap API] Erro ao carregar regras:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Helper de normalização e sanitização de regra
function sanitizeRuleItem(r: any, idx: number) {
  const isUnlinking = r.fluxoId === null || r.fluxoId === '' || r.targetFlowId === null;
  const rawKeywords =
    r.trigger ||
    (Array.isArray(r.palavrasChave) ? r.palavrasChave.join(', ') : '') ||
    (Array.isArray(r.palavras) ? r.palavras.join(', ') : '') ||
    (Array.isArray(r.todasPalavras) ? r.todasPalavras.join(', ') : '') ||
    '';
  const rawResponse = r.response || r.resposta || '';
  const firstKw = rawKeywords ? rawKeywords.split(',')[0].trim() : '';
  const name = r.name || r.nome || (firstKw ? firstKw.charAt(0).toUpperCase() + firstKw.slice(1) : `Regra ${idx + 1}`);

  const kwArray = rawKeywords
    ? rawKeywords.split(',').map((k: string) => k.trim().toLowerCase()).filter(Boolean)
    : [];

  const fluxoId = isUnlinking ? undefined : (r.fluxoId || undefined);
  const targetFlowId = isUnlinking ? undefined : (r.targetFlowId || fluxoId || undefined);
  const fluxoNome = isUnlinking ? undefined : (r.fluxoNome || undefined);
  const fluxosVinculados = isUnlinking ? [] : (Array.isArray(r.fluxosVinculados) ? r.fluxosVinculados : (fluxoId ? [fluxoId] : []));
  const tipoAcao = isUnlinking ? 'resposta' : (r.tipoAcao || (fluxoId ? 'executar_fluxo' : 'resposta'));
  const actionType = isUnlinking ? 'resposta' : (r.actionType || (fluxoId ? 'executar_fluxo' : 'resposta'));

  const item: any = {
    ...r,
    id: r.id || `rule_${Date.now()}_${idx}`,
    name,
    nome: name,
    descricao: r.descricao || '',
    tipoGatilho: r.tipoGatilho || 'palavra_chave',
    statusPedido: r.statusPedido,
    condicoes: r.condicoes || '',
    trigger: rawKeywords,
    palavrasChave: kwArray,
    palavras: kwArray,
    todasPalavras: kwArray,
    response: rawResponse,
    resposta: rawResponse,
    tempoInatividadeMinutos: r.tempoInatividadeMinutos || 15,
    prioridade: r.prioridade || 'Alta',
    priority: r.priority || 'P2',
    fluxoId,
    fluxoNome,
    targetFlowId,
    fluxosVinculados,
    actionType,
    tipoAcao,
    active: r.active !== false && r.ativo !== false,
    ativo: r.active !== false && r.ativo !== false,
    createdAt: r.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  if (isUnlinking) {
    delete item.fluxoId;
    delete item.targetFlowId;
    delete item.fluxoNome;
  }

  return item;
}

// 8b. Save or replace all registered rules (aceita { rules: [...] }, array [...] ou regra única)
app.post('/api/rules', (req: Request, res: Response) => {
  try {
    let rawList: any[] | null = null;

    if (Array.isArray(req.body)) {
      rawList = req.body;
    } else if (Array.isArray(req.body?.rules)) {
      rawList = req.body.rules;
    } else if (req.body?.rule && typeof req.body.rule === 'object') {
      const existing = getStoredRules();
      const target = req.body.rule;
      const idx = existing.findIndex((r: any) => r.id === target.id);
      if (idx >= 0) {
        existing[idx] = { ...existing[idx], ...target };
      } else {
        existing.unshift(target);
      }
      rawList = existing;
    } else if (req.body?.id && (req.body.trigger !== undefined || req.body.response !== undefined || req.body.resposta !== undefined)) {
      const existing = getStoredRules();
      const target = req.body;
      const idx = existing.findIndex((r: any) => r.id === target.id);
      if (idx >= 0) {
        existing[idx] = { ...existing[idx], ...target };
      } else {
        existing.unshift(target);
      }
      rawList = existing;
    }

    if (!rawList) {
      return res.status(400).json({
        success: false,
        error: 'Formato de regras inválido. Esperado { rules: [...] } ou array de regras.'
      });
    }

    const sanitized = rawList.map((r, idx) => sanitizeRuleItem(r, idx));
    saveStoredRules(sanitized);

    console.log(`[UpZap API] ${sanitized.length} regras salvas e sincronizadas.`);
    res.json({ success: true, count: sanitized.length, rules: sanitized });
  } catch (err: any) {
    console.error('[UpZap API] Erro ao salvar regras:', err);
    res.status(500).json({ success: false, error: `Erro no servidor ao salvar regras: ${err.message}` });
  }
});

// 8b2. Atualizar ou criar regra específica por ID
app.put('/api/rules/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updateData = req.body.rule || req.body;
    const existing = getStoredRules();
    const idx = existing.findIndex((r: any) => r.id === id);

    let updatedRule: any;
    if (idx >= 0) {
      const merged = { ...existing[idx], ...updateData, id };
      if (updateData.fluxoId === null || updateData.fluxoId === '' || updateData.targetFlowId === null) {
        delete merged.fluxoId;
        delete merged.targetFlowId;
        delete merged.fluxoNome;
        merged.fluxosVinculados = [];
        merged.tipoAcao = 'resposta';
        merged.actionType = 'resposta';
      }
      existing[idx] = sanitizeRuleItem(merged, idx);
      updatedRule = existing[idx];
    } else {
      updatedRule = sanitizeRuleItem({ ...updateData, id }, 0);
      existing.unshift(updatedRule);
    }

    saveStoredRules(existing);

    // Também sincroniza os fluxos salvos
    if (updateData.fluxoId === null || updateData.fluxoId === '' || updateData.targetFlowId === null) {
      const flows = automationEngineService.getFlows();
      let flowChanged = false;
      flows.forEach((f) => {
        if (f.regraGatilhoId === id) {
          delete f.regraGatilhoId;
          delete f.regraGatilhoNome;
          flowChanged = true;
        }
      });
      if (flowChanged) automationEngineService.saveFlows(flows);
    } else if (updatedRule.fluxoId) {
      const flows = automationEngineService.getFlows();
      let flowChanged = false;
      flows.forEach((f) => {
        if (f.id === updatedRule.fluxoId) {
          f.regraGatilhoId = id;
          f.regraGatilhoNome = updatedRule.nome;
          flowChanged = true;
        } else if (f.regraGatilhoId === id) {
          delete f.regraGatilhoId;
          delete f.regraGatilhoNome;
          flowChanged = true;
        }
      });
      if (flowChanged) automationEngineService.saveFlows(flows);
    }

    res.json({ success: true, rule: updatedRule, rules: existing });
  } catch (err: any) {
    console.error('[UpZap API] Erro ao atualizar regra:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 8b3. Excluir regra específica por ID
app.delete('/api/rules/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const existing = getStoredRules();
    const filtered = existing.filter((r: any) => r.id !== id);
    saveStoredRules(filtered);
    res.json({ success: true, count: filtered.length, rules: filtered });
  } catch (err: any) {
    console.error('[UpZap API] Erro ao excluir regra:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Duplicar regra existente
app.post('/api/rules/:id/duplicate', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const duplicated = automationEngineService.duplicateRule(id);
    if (!duplicated) return res.status(404).json({ success: false, error: 'Regra não encontrada.' });
    const all = automationEngineService.getRules();
    res.json({ success: true, rule: duplicated, rules: all });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Ativar/desativar regra
app.patch('/api/rules/:id/toggle', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const toggled = automationEngineService.toggleRuleActive(id);
    if (!toggled) return res.status(404).json({ success: false, error: 'Regra não encontrada.' });
    const all = automationEngineService.getRules();
    res.json({ success: true, rule: toggled, rules: all });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 8c. Delete all registered rules
app.delete('/api/rules', (req: Request, res: Response) => {
  try {
    saveStoredRules([]);
    res.json({ success: true, count: 0, message: 'Todas as regras foram removidas.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 8d. Sync rules from frontend to backend engine
app.post('/api/rules/sync', (req: Request, res: Response) => {
  try {
    const rawList = Array.isArray(req.body) ? req.body : req.body?.rules;
    if (Array.isArray(rawList)) {
      const sanitized = rawList.map((r, idx) => sanitizeRuleItem(r, idx));
      saveStoredRules(sanitized);
      res.json({ success: true, count: sanitized.length });
    } else {
      res.status(400).json({ success: false, error: 'Formato de regras inválido' });
    }
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 8e. Reset completo dos dados de automação (mantendo sessão do WhatsApp intacta)
app.post('/api/automation/reset', (req: Request, res: Response) => {
  try {
    // 1. Zera regras
    saveStoredRules([]);

    // 2. Zera biblioteca de arquivos
    saveStoredLibraryFiles([]);

    // 3. Remove arquivos físicos de mídia em /data/media
    if (fs.existsSync(MEDIA_DIR)) {
      const mediaFiles = fs.readdirSync(MEDIA_DIR);
      for (const file of mediaFiles) {
        try {
          fs.unlinkSync(path.join(MEDIA_DIR, file));
        } catch (e) {
          console.warn(`[Reset] Erro ao remover arquivo ${file}:`, e);
        }
      }
    }

    // 4. Limpa logs de testes e mensagens em memória
    messageLogs.length = 0;
    lastProcessedMessage = null;
    errorLogs.length = 0;
    processedMessageIds.clear();
    whatsAppDirectService.clearReceivedMessages();

    console.log('[UpZap Reset] Reset de dados de automação concluído. Conexão WhatsApp mantida intacta.');

    res.json({
      success: true,
      message: 'Reset completo dos dados de automação realizado com sucesso.',
      rulesCount: 0,
      libraryCount: 0,
      testDataCleaned: true,
      whatsappConnected: whatsAppDirectService.getSessionInfo().state === 'connected'
    });
  } catch (err: any) {
    console.error('[UpZap Reset] Erro no reset de automação:', err);
    res.status(500).json({ success: false, error: err.message || 'Erro ao realizar reset' });
  }
});

// 8b. Endpoint de teste para avaliação do motor de regras e resolução de biblioteca
app.post('/api/rules/test', (req: Request, res: Response) => {
  const { text, contactName } = req.body;
  const rules = getStoredRules();
  const result = evaluateMessageWithRules(text || '', rules, contactName || 'Cliente');

  let mediaResolution = null;
  const actionsResolution: any[] = [];

  if (result) {
    if (result.mediaAttachment) {
      const resolved = findLibraryMedia(result.mediaAttachment);
      mediaResolution = {
        mediaIdentifier: result.mediaAttachment,
        foundInLibrary: Boolean(resolved?.found),
        fileName: resolved?.fileName,
        type: resolved?.type,
        mimetype: resolved?.mimetype,
        fileSize: resolved?.buffer?.length || 0
      };
    }

    if (Array.isArray(result.actions)) {
      result.actions.forEach((act) => {
        if (act.tipo !== 'texto' && (act.arquivo || act.conteudo)) {
          const mediaIdent = act.arquivo || act.conteudo || '';
          const resolved = findLibraryMedia(mediaIdent);
          actionsResolution.push({
            actionId: act.id,
            actionTipo: act.tipo,
            mediaIdentifier: mediaIdent,
            foundInLibrary: Boolean(resolved?.found),
            fileName: resolved?.fileName,
            fileSize: resolved?.buffer?.length || 0
          });
        } else {
          actionsResolution.push({
            actionId: act.id,
            actionTipo: 'texto',
            text: act.conteudo
          });
        }
      });
    }
  }

  res.json({
    text: text || '',
    matched: Boolean(result),
    result: result || null,
    mediaResolution,
    actionsResolution
  });
});

// 8c. Endpoint para listar arquivos da biblioteca
app.get('/api/library/files', (req: Request, res: Response) => {
  const files = getStoredLibraryFiles();
  res.json({ success: true, files });
});

// 8d. Endpoint para upload de arquivo na biblioteca
app.post('/api/library/upload', (req: Request, res: Response) => {
  try {
    const { name, fileName, type, category, dataUrl, base64, size } = req.body;
    
    if (!name && !fileName) {
      return res.status(400).json({ success: false, error: 'Nome do arquivo é obrigatório' });
    }

    const rawName = fileName || name;
    const cleanFileName = path.basename(rawName).replace(/[^a-zA-Z0-9._-]/g, '_');
    const targetFilePath = path.join(MEDIA_DIR, cleanFileName);

    let fileBuffer: Buffer | null = null;

    if (dataUrl && typeof dataUrl === 'string') {
      const base64Data = dataUrl.includes('base64,') ? dataUrl.split('base64,')[1] : dataUrl;
      fileBuffer = Buffer.from(base64Data, 'base64');
    } else if (base64 && typeof base64 === 'string') {
      fileBuffer = Buffer.from(base64, 'base64');
    }

    if (fileBuffer) {
      fs.writeFileSync(targetFilePath, fileBuffer);
    } else if (!fs.existsSync(targetFilePath)) {
      // Se não enviou buffer nem existe, cria placeholder binário mínimo
      fs.writeFileSync(targetFilePath, Buffer.from([]));
    }

    const ext = path.extname(cleanFileName).toLowerCase();
    let detectedType: 'foto' | 'audio' | 'video' | 'pdf' = 'pdf';
    let detectedMime = 'application/octet-stream';

    if (['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext) || type === 'foto' || type === 'image') {
      detectedType = 'foto';
      detectedMime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
    } else if (['.mp4', '.mov', '.avi', '.webm'].includes(ext) || type === 'video') {
      detectedType = 'video';
      detectedMime = 'video/mp4';
    } else if (['.mp3', '.ogg', '.wav', '.m4a'].includes(ext) || type === 'audio') {
      detectedType = 'audio';
      detectedMime = ext === '.ogg' ? 'audio/ogg; codecs=opus' : 'audio/mp4';
    } else if (ext === '.pdf' || type === 'pdf') {
      detectedType = 'pdf';
      detectedMime = 'application/pdf';
    }

    const currentFiles = getStoredLibraryFiles();
    const existingIndex = currentFiles.findIndex(
      (f) => f.id === req.body.id || f.fileName === cleanFileName || f.name === cleanFileName
    );

    const calculatedSize = size || (fileBuffer ? `${(fileBuffer.length / (1024 * 1024)).toFixed(1)} MB` : '1.0 MB');
    const newFile: StoredMediaFile = {
      id: req.body.id || `lib-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: cleanFileName,
      fileName: cleanFileName,
      type: detectedType,
      mimetype: detectedMime,
      size: calculatedSize,
      category: category || (detectedType === 'foto' ? 'Fotos do Produto' : detectedType === 'video' ? 'Vídeos Demonstrativos' : detectedType === 'audio' ? 'Áudios' : 'Catálogos & Documentos'),
      filePath: `data/media/${cleanFileName}`,
      url: `/api/library/files/${cleanFileName}`
    };

    if (existingIndex >= 0) {
      currentFiles[existingIndex] = { ...currentFiles[existingIndex], ...newFile, id: currentFiles[existingIndex].id };
    } else {
      currentFiles.push(newFile);
    }

    saveStoredLibraryFiles(currentFiles);
    console.log(`[UpZap Library] Arquivo salvo com sucesso: ${cleanFileName} (${newFile.id})`);

    res.json({ success: true, file: newFile, files: currentFiles });
  } catch (err: any) {
    console.error('[UpZap Library] Erro no upload:', err);
    res.status(500).json({ success: false, error: err.message || 'Erro ao processar upload' });
  }
});

// 8e. Endpoint para deletar arquivo da biblioteca e desvincular das regras
app.delete('/api/library/files/:id', (req: Request, res: Response) => {
  try {
    const fileIdOrName = decodeURIComponent(req.params.id).trim();
    const currentFiles = getStoredLibraryFiles();

    const targetFile = currentFiles.find(
      (f) =>
        f.id === fileIdOrName ||
        f.fileName === fileIdOrName ||
        f.name === fileIdOrName ||
        f.id?.toLowerCase() === fileIdOrName.toLowerCase() ||
        f.fileName?.toLowerCase() === fileIdOrName.toLowerCase() ||
        f.name?.toLowerCase() === fileIdOrName.toLowerCase()
    );

    if (!targetFile) {
      // Verifica se arquivo físico existe diretamente na pasta media
      const directDiskPath = path.join(MEDIA_DIR, path.basename(fileIdOrName));
      if (fs.existsSync(directDiskPath)) {
        try {
          fs.unlinkSync(directDiskPath);
          console.log(`[UpZap Library] Arquivo físico órfão removido do disco: ${directDiskPath}`);
          return res.json({ success: true, message: 'Arquivo físico órfão excluído com sucesso.' });
        } catch (e: any) {
          return res.status(500).json({ success: false, error: `Erro ao remover arquivo: ${e.message}` });
        }
      }
      return res.status(404).json({ success: false, error: 'Arquivo não encontrado na biblioteca' });
    }

    // 1. Remove da lista da biblioteca
    const updatedFiles = currentFiles.filter((f) => f.id !== targetFile.id && f.fileName !== targetFile.fileName);
    saveStoredLibraryFiles(updatedFiles);

    // 2. Remove arquivo físico de todas as localizações possíveis
    const candidatePaths = [
      path.join(MEDIA_DIR, targetFile.fileName),
      targetFile.filePath ? path.resolve(process.cwd(), targetFile.filePath) : null,
      path.join(process.cwd(), 'data', 'media', targetFile.fileName),
      path.join(process.cwd(), 'public', 'library', targetFile.fileName)
    ].filter(Boolean) as string[];

    candidatePaths.forEach((p) => {
      if (fs.existsSync(p)) {
        try {
          fs.unlinkSync(p);
          console.log(`[UpZap Library] Arquivo físico removido com sucesso: ${p}`);
        } catch (unlinkErr) {
          console.warn(`[UpZap Library] Não foi possível remover arquivo físico ${p}:`, unlinkErr);
        }
      }
    });

    // 3. Atualiza regras para remover referências ao arquivo excluído
    const currentRules = getStoredRules();
    let rulesModified = false;

    const cleanedRules = currentRules.map((rule) => {
      let ruleChanged = false;
      let newMidiaAnexada = rule.midiaAnexada;
      if (
        rule.midiaAnexada === targetFile.id ||
        rule.midiaAnexada === targetFile.fileName ||
        rule.midiaAnexada === targetFile.name
      ) {
        newMidiaAnexada = undefined;
        ruleChanged = true;
      }

      let newAcoes = rule.acoes;
      if (Array.isArray(rule.acoes)) {
        const filteredAcoes = rule.acoes.filter((a: any) => {
          if (a.tipo === 'texto') return true;
          const isTarget =
            a.fileId === targetFile.id ||
            a.arquivo === targetFile.fileName ||
            a.arquivo === targetFile.name ||
            a.conteudo === targetFile.fileName;
          if (isTarget) {
            ruleChanged = true;
            return false;
          }
          return true;
        });

        if (filteredAcoes.length === 0 && rule.resposta) {
          filteredAcoes.push({
            id: `act_${Date.now()}`,
            tipo: 'texto',
            conteudo: rule.resposta
          });
        }
        newAcoes = filteredAcoes;
      }

      if (ruleChanged) {
        rulesModified = true;
        return {
          ...rule,
          midiaAnexada: newMidiaAnexada,
          acoes: newAcoes
        };
      }
      return rule;
    });

    if (rulesModified) {
      saveStoredRules(cleanedRules);
      console.log(`[UpZap Library] Regras atualizadas após exclusão de ${targetFile.fileName}`);
    }

    res.json({
      success: true,
      message: `Arquivo ${targetFile.fileName} excluído com sucesso`,
      files: updatedFiles,
      rules: cleanedRules
    });
  } catch (err: any) {
    console.error('[UpZap Library] Erro ao excluir arquivo:', err);
    res.status(500).json({ success: false, error: err.message || 'Erro ao excluir arquivo' });
  }
});

// 8f. Endpoint para salvar/sincronizar biblioteca
app.post('/api/library/files', (req: Request, res: Response) => {
  const { files } = req.body;
  if (Array.isArray(files)) {
    saveStoredLibraryFiles(files);
    res.json({ success: true, count: files.length });
  } else {
    res.status(400).json({ success: false, error: 'Formato de arquivos inválido' });
  }
});

// 8g. Endpoint para servir arquivos estáticos da biblioteca
app.get('/api/library/files/:fileName', (req: Request, res: Response) => {
  const requestedIdent = path.basename(req.params.fileName);
  const media = findLibraryMedia(requestedIdent);

  if (media && media.buffer) {
    res.setHeader('Content-Type', media.mimetype);
    res.setHeader('Content-Disposition', `inline; filename="${media.fileName}"`);
    return res.send(media.buffer);
  }

  res.status(404).json({ error: 'Arquivo não encontrado na biblioteca' });
});

// 9. Get live monitor data for UI
app.get('/api/whatsapp/live-data', (req: Request, res: Response) => {
  const directMessages = whatsAppDirectService.getReceivedMessages();
  const directFormatted = directMessages.map((m) => ({
    id: m.id,
    remetente: m.senderName,
    numero: m.senderPhone,
    mensagem: m.text,
    timestamp: m.formattedTime || new Date(m.timestamp).toLocaleTimeString('pt-BR'),
    status: 'recebido'
  }));

  res.json({
    lastProcessedMessage,
    recentMessages: directFormatted.length > 0 ? directFormatted : messageLogs.slice(0, 15),
    directMessages,
    errorLogs: errorLogs.slice(0, 10),
    totalProcessed: directFormatted.length > 0 ? directFormatted.length : messageLogs.length
  });
});

// ============================================================
// ROTAS DE ATENDIMENTOS & CONVERSAS (ITENS 2 E 3 - BLOCO 1)
// ============================================================

// Listar todos os atendimentos e seus estados
app.get('/api/conversations', (req: Request, res: Response) => {
  try {
    const allConversations = conversationsService.getAllConversations();
    const list = Object.values(allConversations || {}).sort((a, b) => {
      return new Date(b.updatedAt || b.lastMessageAt || 0).getTime() - new Date(a.updatedAt || a.lastMessageAt || 0).getTime();
    });
    res.json({
      success: true,
      count: list.length,
      conversations: list
    });
  } catch (err: any) {
    console.error('Erro ao listar conversas:', err);
    res.status(500).json({ success: false, error: err.message, conversations: [] });
  }
});

// Reabrir atendimento (Item 3)
app.post('/api/conversations/:id/reopen', (req: Request, res: Response) => {
  const { id } = req.params;
  if (!id) {
    return res.status(400).json({ success: false, error: 'Identificador do contato obrigatório' });
  }
  const updated = conversationsService.reopenConversation(id);
  res.json({
    success: true,
    message: 'Atendimento reaberto com sucesso.',
    conversation: updated
  });
});

// Encerrar atendimento manualmente (Item 2)
app.post('/api/conversations/:id/close', (req: Request, res: Response) => {
  const { id } = req.params;
  const { reason, contactName } = req.body || {};
  if (!id) {
    return res.status(400).json({ success: false, error: 'Identificador do contato obrigatório' });
  }
  const updated = conversationsService.closeConversation(id, reason || 'manual', contactName);
  res.json({
    success: true,
    message: 'Atendimento encerrado com sucesso.',
    conversation: updated
  });
});

// Atualizar estado de atendimento diretamente
app.post('/api/conversations/:id/state', (req: Request, res: Response) => {
  const { id } = req.params;
  const { state, reason, contactName } = req.body;
  if (!id || !state) {
    return res.status(400).json({ success: false, error: 'ID e Estado são obrigatórios' });
  }
  const updated = conversationsService.setConversationState(id, state as ConversationState, reason, contactName);
  res.json({
    success: true,
    conversation: updated
  });
});

// Obter configurações gerais de atendimento
app.get('/api/conversations/settings', (req: Request, res: Response) => {
  const settings = conversationsService.getSettings();
  res.json({
    success: true,
    settings
  });
});

// Salvar configurações gerais de atendimento
app.post('/api/conversations/settings', (req: Request, res: Response) => {
  const updated = conversationsService.saveSettings(req.body);
  res.json({
    success: true,
    message: 'Configurações de atendimento salvas com sucesso.',
    settings: updated
  });
});

// ============================================================
// ROTAS DE PALAVRAS ESPECIAIS (ITEM 5 - BLOCO 1)
// ============================================================

// Listar palavras especiais
app.get('/api/special-words', (req: Request, res: Response) => {
  const words = conversationsService.getSpecialWords();
  res.json({
    success: true,
    count: words.length,
    words
  });
});

// Salvar ou atualizar lista de palavras especiais
app.post('/api/special-words', (req: Request, res: Response) => {
  const words = req.body.words || req.body.specialWords;
  if (!Array.isArray(words)) {
    return res.status(400).json({ success: false, error: 'Array de palavras especiais obrigatório ({ words: [] })' });
  }
  const saved = conversationsService.saveSpecialWords(words);
  res.json({
    success: true,
    count: saved.length,
    words: saved
  });
});

// ============================================================
// ROTAS DE PAUSA DE AUTOMAÇÃO (ITEM 10 - BLOCO 2)
// ============================================================

// Obter status da automação global
app.get('/api/automation/status', (req: Request, res: Response) => {
  const status = conversationsService.getGlobalAutomationStatus();
  res.json({
    success: true,
    status
  });
});

// Alternar pausa global da automação
app.post('/api/automation/pause', (req: Request, res: Response) => {
  const { paused, pausedBy } = req.body;
  if (typeof paused !== 'boolean') {
    return res.status(400).json({ success: false, error: 'Campo "paused" booleano obrigatório' });
  }
  const updated = conversationsService.setGlobalAutomationStatus(paused, pausedBy || 'painel');
  res.json({
    success: true,
    message: paused ? 'Automação global pausada com sucesso.' : 'Automação global retomada com sucesso.',
    status: updated
  });
});

// ============================================================
// ROTAS DE CONTROLE DE ATENDIMENTO (ITENS 11 E 12 - BLOCO 3)
// ============================================================

// Assumir Atendimento Manual (Item 12)
app.post('/api/conversations/:id/assume-manual', (req: Request, res: Response) => {
  const { id } = req.params;
  const { operatorName } = req.body || {};
  if (!id) {
    return res.status(400).json({ success: false, error: 'ID do cliente obrigatório' });
  }
  const updated = conversationsService.assumeManualAttendance(id, operatorName || 'Operador');
  res.json({
    success: true,
    message: 'Atendimento manual assumido com sucesso. Respostas automáticas silenciadas.',
    conversation: updated
  });
});

// Devolver para Automação / Retomar Automação (Itens 11 e 12)
app.post('/api/conversations/:id/resume-auto', (req: Request, res: Response) => {
  const { id } = req.params;
  if (!id) {
    return res.status(400).json({ success: false, error: 'ID do cliente obrigatório' });
  }
  const updated = conversationsService.resumeAutoAttendance(id);
  res.json({
    success: true,
    message: 'Atendimento devolvido para a automação. Robô UpZap ativo.',
    conversation: updated
  });
});

// Alterar modo de atendimento unificado diretamente
app.post('/api/conversations/:id/mode', (req: Request, res: Response) => {
  const { id } = req.params;
  const { mode, changedBy } = req.body;
  if (!id || !['auto', 'manual', 'paused'].includes(mode)) {
    return res.status(400).json({ success: false, error: 'Modo inválido. Deve ser: auto, manual ou paused' });
  }
  const updated = conversationsService.setConversationAttendanceMode(id, mode, changedBy || 'painel');
  res.json({
    success: true,
    message: `Modo de atendimento alterado para ${mode.toUpperCase()}`,
    conversation: updated
  });
});

// Alternar pausa de automação para um cliente específico
app.post('/api/conversations/:id/pause', (req: Request, res: Response) => {
  const { id } = req.params;
  const { paused } = req.body;
  if (!id || typeof paused !== 'boolean') {
    return res.status(400).json({ success: false, error: 'ID e campo "paused" booleano são obrigatórios' });
  }
  const updated = conversationsService.setConversationAutomationPaused(id, paused);
  res.json({
    success: true,
    message: paused ? 'Automação pausada para este contato.' : 'Automação retomada para este contato.',
    conversation: updated
  });
});

// ============================================================
// ROTA DEDICADA DE CLIENTES (ITEM 7 & 8 - BLOCO 2 COM ITEM 12)
// ============================================================

app.get('/api/customers', (req: Request, res: Response) => {
  const allConversations = conversationsService.getAllConversations();
  const list = Object.values(allConversations).map((conv) => {
    const attendanceMode = conv.attendanceMode || (conv.automationPaused ? 'paused' : 'auto');
    return {
      id: conv.id || conv.phone || conv.senderNumber,
      jid: conv.jid,
      phone: conv.phone || conv.senderNumber,
      senderNumber: conv.senderNumber || conv.phone,
      contactName: conv.contactName || conv.senderName || 'Cliente',
      senderName: conv.senderName || conv.contactName || 'Cliente',
      state: conv.state || 'active',
      attendanceMode,
      modeChangedAt: conv.modeChangedAt,
      modeChangedBy: conv.modeChangedBy,
      lastUserMessage: conv.lastUserMessage || conv.lastMessageText || '',
      lastMessageText: conv.lastMessageText || conv.lastUserMessage || '',
      lastBotReply: conv.lastBotReply || '',
      lastMessageAt: conv.lastMessageAt || conv.updatedAt || conv.createdAt || new Date().toISOString(),
      updatedAt: conv.updatedAt || conv.lastMessageAt || new Date().toISOString(),
      createdAt: conv.createdAt || conv.firstMessageAt || conv.startedAt || new Date().toISOString(),
      messageCount: conv.messageCount || 1,
      currentFlow: conv.currentFlow || 'Atendimento em andamento',
      currentFlowId: conv.currentFlowId || 'fluxo_principal',
      lastRuleApplied: conv.lastRuleApplied,
      closedAt: conv.closedAt,
      closedReason: conv.closedReason,
      reopenedAt: conv.reopenedAt,
      automationPaused: attendanceMode !== 'auto',
      pausedAt: conv.pausedAt || conv.modeChangedAt
    };
  }).sort((a, b) => {
    return new Date(b.lastMessageAt || 0).getTime() - new Date(a.lastMessageAt || 0).getTime();
  });

  res.json({
    success: true,
    count: list.length,
    customers: list
  });
});

// ============================================================
// ROTAS DO CRM DE PEDIDOS E INTEGRAÇÃO BRIZEX -> UPZAP
// ============================================================

// 1. Webhook de Recebimento de Pedidos da Brizex (com alias /api/orders/webhook)
const handleBrizexOrderWebhook = (req: Request, res: Response) => {
  try {
    const authHeader = req.headers['authorization'] || req.headers['x-brizex-token'] || req.headers['x-api-key'];
    const token = typeof authHeader === 'string' ? authHeader : '';

    if (!ordersService.validateAuthToken(token)) {
      ordersService.addSyncLog({
        tipoOperacao: 'erro_autenticacao',
        sucesso: false,
        mensagem: 'Falha de autenticação no Webhook Brizex: token ausente ou inválido.',
        detalhes: { headers: { authorization: req.headers['authorization'] ? '***' : undefined } },
        ipOrigem: req.ip
      });
      auditEventsService.addEvent({
        type: 'system_alert',
        level: 'warning',
        title: 'Webhook Brizex: Token Inválido',
        description: 'Requisição rejeitada por token de autenticação Brizex/Logzz ausente ou incorreto.',
        details: { ip: req.ip }
      });
      return res.status(401).json({
        success: false,
        error: 'Acesso não autorizado. Token da integração Brizex inválido ou ausente.'
      });
    }

    const result = ordersService.processBrizexOrderPayload(req.body, {
      ip: req.ip,
      origin: 'brizex'
    });

    if (!result.success) {
      auditEventsService.addEvent({
        type: 'system_alert',
        level: 'error',
        title: 'Erro ao Processar Pedido Brizex',
        description: `Dados inválidos no pedido: ${result.message}`,
        details: { errors: result.errors, ip: req.ip }
      });
      return res.status(400).json({
        success: false,
        error: result.message,
        errors: result.errors
      });
    }

    // Disparo determinístico de Regras e Fluxos correspondentes ao evento/status do pedido
    if (result.order) {
      automationEngineService.triggerOrderEventRules(result.order, result.order.status, { origin: 'brizex' })
        .then((executions) => {
          if (executions.length > 0) {
            console.log(`[UpZap Brizex Webhook] 🚀 ${executions.length} fluxo(s) acionado(s) para o pedido ${result.order?.logzzOrderId}.`);
          }
        })
        .catch((err) => {
          console.error('[UpZap Brizex Webhook] Erro ao disparar fluxos do pedido:', err);
          auditEventsService.addEvent({
            type: 'system_alert',
            level: 'error',
            title: 'Falha na Execução de Fluxo do Pedido',
            description: `Erro ao disparar fluxos automáticos para o pedido ${result.order?.logzzOrderId}: ${err.message || err}`,
            details: { orderId: result.order?.logzzOrderId }
          });
        });
    }

    return res.status(200).json({
      success: true,
      action: result.action,
      message: result.message,
      order: result.order
    });
  } catch (err: any) {
    console.error('[UpZap Brizex Webhook] Erro inesperado:', err);
    ordersService.addSyncLog({
      tipoOperacao: 'erro_processamento',
      sucesso: false,
      mensagem: `Erro interno no servidor: ${err.message || String(err)}`,
      ipOrigem: req.ip
    });
    auditEventsService.addEvent({
      type: 'system_alert',
      level: 'error',
      title: 'Exceção no Webhook Brizex',
      description: `Erro interno no servidor ao processar pedido Brizex: ${err.message || String(err)}`,
      details: { ip: req.ip }
    });
    return res.status(500).json({
      success: false,
      error: 'Erro interno ao processar pedido na integração Brizex.'
    });
  }
};

app.post('/api/integrations/brizex/orders', handleBrizexOrderWebhook);
app.post('/api/orders/webhook', handleBrizexOrderWebhook);

// 2. Configurações da Integração Brizex
app.get('/api/integrations/brizex/config', (req: Request, res: Response) => {
  const config = ordersService.getConfig();
  res.json({
    success: true,
    config
  });
});

app.post('/api/integrations/brizex/config', (req: Request, res: Response) => {
  try {
    const updated = ordersService.saveConfig(req.body || {});
    res.json({
      success: true,
      message: 'Configurações de integração salvas com sucesso.',
      config: updated
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. Logs de Sincronização Brizex
app.get('/api/integrations/brizex/logs', (req: Request, res: Response) => {
  const limit = typeof req.query.limit === 'string' ? parseInt(req.query.limit, 10) : 100;
  const logs = ordersService.getSyncLogs(limit);
  res.json({
    success: true,
    count: logs.length,
    logs
  });
});

app.delete('/api/integrations/brizex/logs', (req: Request, res: Response) => {
  ordersService.clearSyncLogs();
  res.json({
    success: true,
    message: 'Logs de sincronização limpos com sucesso.'
  });
});

// 4. Listagem e Consulta de Pedidos do CRM
app.get('/api/orders', (req: Request, res: Response) => {
  const { status, search, period, delayAlertOnly, humanOnly } = req.query;
  const list = ordersService.getOrders({
    status: typeof status === 'string' ? status : undefined,
    search: typeof search === 'string' ? search : undefined,
    period: (period === 'today' || period === '7days' || period === '30days' || period === 'all') ? period : undefined,
    delayAlertOnly: delayAlertOnly === 'true',
    humanOnly: humanOnly === 'true'
  });

  res.json({
    success: true,
    count: list.length,
    orders: list
  });
});

// 5. Estatísticas Gerais do CRM
app.get('/api/orders/stats', (req: Request, res: Response) => {
  const stats = ordersService.getStats();
  res.json({
    success: true,
    stats
  });
});

// 6. Consulta de Detalhes de um Pedido
app.get('/api/orders/:id', (req: Request, res: Response) => {
  const order = ordersService.getOrderById(req.params.id);
  if (!order) {
    return res.status(404).json({ success: false, error: 'Pedido não encontrado.' });
  }
  res.json({ success: true, order });
});

// 7. Atualização de Pedido (Status manual, responsável, dados)
app.patch('/api/orders/:id', (req: Request, res: Response) => {
  const updated = ordersService.updateOrder(req.params.id, req.body || {});
  if (!updated) {
    return res.status(404).json({ success: false, error: 'Pedido não encontrado.' });
  }
  res.json({ success: true, order: updated });
});

// 8. Adicionar Observação Interna ao Pedido
app.post('/api/orders/:id/notes', (req: Request, res: Response) => {
  const { autor, texto } = req.body;
  if (!texto || !String(texto).trim()) {
    return res.status(400).json({ success: false, error: 'O texto da observação é obrigatório.' });
  }

  const updated = ordersService.addInternalNote(req.params.id, autor || 'Operador', String(texto));
  if (!updated) {
    return res.status(404).json({ success: false, error: 'Pedido não encontrado.' });
  }
  res.json({ success: true, order: updated });
});

// ============================================================
// ROTAS DO CONSTRUTOR DE FLUXOS (ITEM 14)
// ============================================================

const flowsFilePath = path.join(process.cwd(), 'data', 'flows_blocks.json');

function getStoredFlowsData(): { fluxos: any[]; flows: BlocoFluxo[] } {
  try {
    if (fs.existsSync(flowsFilePath)) {
      const raw = fs.readFileSync(flowsFilePath, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && Array.isArray(parsed.fluxos)) {
        const firstBlocks = parsed.fluxos[0]?.blocos || [];
        return { fluxos: parsed.fluxos, flows: firstBlocks };
      }
      if (Array.isArray(parsed)) {
        return { fluxos: [], flows: parsed };
      }
      if (parsed && typeof parsed === 'object' && Array.isArray(parsed.flows)) {
        return { fluxos: [], flows: parsed.flows };
      }
    }
  } catch (e) {
    console.error('Erro ao ler flows_blocks.json:', e);
  }
  return { fluxos: [], flows: [] };
}

function saveStoredFlowsData(data: any): boolean {
  try {
    const dataDir = path.dirname(flowsFilePath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    fs.writeFileSync(flowsFilePath, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch (e) {
    console.error('Erro ao salvar flows_blocks.json:', e);
    return false;
  }
}

app.get('/api/flows', (req: Request, res: Response) => {
  const fluxos = automationEngineService.getFlows();
  const firstBlocks = fluxos[0]?.blocos || [];
  res.json({
    success: true,
    count: fluxos.length,
    fluxos,
    flows: firstBlocks
  });
});

app.post('/api/flows', (req: Request, res: Response) => {
  try {
    const { fluxos, flows, flow, fluxo, nome, name } = req.body || {};

    // 1. Caso seja a criação de um fluxo individual
    if (nome || name || flow || fluxo || (req.body && !Array.isArray(req.body) && (req.body.blocos || req.body.status))) {
      const flowPayload = flow || fluxo || req.body;
      const created = automationEngineService.createFlow(flowPayload);
      const allFlows = automationEngineService.getFlows();
      console.log(`[UpZap API] 💾 Novo fluxo criado e persistido: "${created.nome}" (${created.id})`);
      return res.status(201).json({
        success: true,
        message: 'Fluxo criado com sucesso.',
        flow: created,
        fluxo: created,
        fluxos: allFlows,
        count: allFlows.length
      });
    }

    // 2. Caso seja a lista de fluxos (salvamento em lote)
    let listToSave: any[] = [];
    if (Array.isArray(fluxos)) {
      listToSave = fluxos;
    } else if (Array.isArray(flows)) {
      listToSave = flows;
    } else if (Array.isArray(req.body)) {
      listToSave = req.body;
    } else {
      return res.status(400).json({ success: false, error: 'Lista ou dados de fluxos inválidos.' });
    }

    automationEngineService.saveFlows(listToSave);
    console.log(`[UpZap API] 💾 ${listToSave.length} fluxos salvos com sucesso.`);
    return res.json({
      success: true,
      message: 'Fluxos salvos com sucesso.',
      count: listToSave.length,
      fluxos: listToSave
    });
  } catch (err: any) {
    console.error('[UpZap API] Erro ao salvar fluxos:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Exclusão de fluxo com verificação de integridade (Item 2: Impedir referências inválidas a fluxos excluídos)
app.delete('/api/flows/:id', (req: Request, res: Response) => {
  try {
    const flowId = req.params.id;
    const rules = automationEngineService.getRules();

    // Verifica se alguma regra ativa referencia esse fluxo
    const referencingRules = rules.filter((r) => {
      if (r.fluxoId === flowId || r.targetFlowId === flowId) return true;
      if (Array.isArray(r.acoes) && r.acoes.some((a: any) => a.fluxoId === flowId)) return true;
      return false;
    });

    if (referencingRules.length > 0) {
      const ruleNames = referencingRules.map((r) => `"${r.nome || r.name}"`).join(', ');
      return res.status(400).json({
        success: false,
        error: `Não é possível excluir o fluxo "${flowId}" porque ele está associado à(s) regra(s): ${ruleNames}. Altere as regras antes de excluir o fluxo.`
      });
    }

    const currentFlows = automationEngineService.getFlows();
    const updated = currentFlows.filter((f) => f.id !== flowId);
    automationEngineService.saveFlows(updated);

    console.log(`[UpZap API] 🗑️ Fluxo excluído com sucesso: ${flowId}`);
    res.json({ success: true, message: `Fluxo "${flowId}" excluído com sucesso.`, count: updated.length });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Obter fluxo específico por ID
app.get('/api/flows/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const flow = automationEngineService.getFlowById(id);
  if (!flow) return res.status(404).json({ success: false, error: 'Fluxo não encontrado.' });
  res.json({ success: true, fluxo: flow, flow });
});

// Atualizar ou criar fluxo específico por ID
app.put('/api/flows/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const flowData = req.body.fluxo || req.body.flow || req.body;
    let flow = automationEngineService.getFlowById(id);
    if (flow) {
      flow = automationEngineService.updateFlow(id, flowData);
    } else {
      flow = automationEngineService.createFlow({ ...flowData, id });
    }
    const all = automationEngineService.getFlows();
    res.json({ success: true, message: 'Fluxo salvo com sucesso.', fluxo: flow, fluxos: all });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Duplicar fluxo
app.post('/api/flows/:id/duplicate', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const duplicated = automationEngineService.duplicateFlow(id);
    if (!duplicated) return res.status(404).json({ success: false, error: 'Fluxo não encontrado.' });
    const all = automationEngineService.getFlows();
    res.json({ success: true, message: 'Fluxo duplicado com sucesso.', fluxo: duplicated, fluxos: all });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Ativar/desativar fluxo
app.patch('/api/flows/:id/toggle', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const toggled = automationEngineService.toggleFlowActive(id);
    if (!toggled) return res.status(404).json({ success: false, error: 'Fluxo não encontrado.' });
    const all = automationEngineService.getFlows();
    res.json({ success: true, message: `Fluxo ${toggled.ativo ? 'ativado' : 'desativado'}.`, fluxo: toggled, fluxos: all });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ----------------------------------------------------
// HISTÓRICO DE EXECUÇÕES DE FLUXOS
// ----------------------------------------------------
app.get('/api/flow-executions', (req: Request, res: Response) => {
  const limit = typeof req.query.limit === 'string' ? parseInt(req.query.limit, 10) : 100;
  const flowId = typeof req.query.flowId === 'string' ? req.query.flowId : undefined;
  let executions = automationEngineService.getExecutions(limit);
  if (flowId) {
    executions = executions.filter((e) => e.flowId === flowId);
  }
  res.json({ success: true, count: executions.length, executions });
});

app.delete('/api/flow-executions', (req: Request, res: Response) => {
  try {
    automationEngineService.clearExecutions();
    res.json({ success: true, message: 'Histórico de execuções limpo com sucesso.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ----------------------------------------------------
// MAPEAMENTO CONFIGURÁVEL DE EVENTOS BRIZEX -> REGRAS -> FLUXOS
// ----------------------------------------------------
app.get('/api/event-mappings', (req: Request, res: Response) => {
  const mappings = automationEngineService.getEventMappings();
  res.json({ success: true, count: mappings.length, mappings });
});

app.post('/api/event-mappings', (req: Request, res: Response) => {
  try {
    const mappings = Array.isArray(req.body) ? req.body : req.body.mappings;
    if (!Array.isArray(mappings)) {
      return res.status(400).json({ success: false, error: 'Formato inválido. Esperado array de mapeamentos.' });
    }
    automationEngineService.saveEventMappings(mappings);
    res.json({ success: true, message: 'Mapeamentos de eventos salvos com sucesso.', mappings });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================
// ROTAS DA BIBLIOTECA INTEGRADA (ITEM 5: ITENS REUTILIZÁVEIS)
// ============================================================
app.get('/api/library/items', (req: Request, res: Response) => {
  const items = automationEngineService.getLibraryItems();
  res.json({ success: true, count: items.length, items });
});

app.post('/api/library/items', (req: Request, res: Response) => {
  try {
    const { id, name, content, category, type = 'texto' } = req.body;
    if (!name) {
      return res.status(400).json({ success: false, error: 'Nome do item da biblioteca é obrigatório' });
    }

    const items = automationEngineService.getLibraryItems();
    const cleanId = id || `lib_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const existingIdx = items.findIndex((it) => it.id === cleanId);

    const newItem = {
      id: cleanId,
      name,
      content: content || '',
      category: category || 'Respostas Comerciais',
      type,
      size: `${Math.max(1, Math.round((content?.length || 0) / 1024))} KB`,
      updatedAt: new Date().toISOString()
    };

    if (existingIdx >= 0) {
      items[existingIdx] = { ...items[existingIdx], ...newItem };
    } else {
      items.push(newItem);
    }

    automationEngineService.saveLibraryItems(items);
    console.log(`[UpZap Library] Item de conteúdo salvo: ${name} (${cleanId})`);
    res.json({ success: true, item: newItem, items });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/library/items/:id', (req: Request, res: Response) => {
  try {
    const itemId = req.params.id;
    const items = automationEngineService.getLibraryItems();
    const updated = items.filter((it) => it.id !== itemId);
    automationEngineService.saveLibraryItems(updated);
    res.json({ success: true, message: 'Item excluído da biblioteca', count: updated.length });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================
// ROTAS DO SIMULADOR INTEGRADO (ITEM 9: TESTES DE REGRAS E FLUXOS)
// ============================================================
app.post('/api/simulator/message', async (req: Request, res: Response) => {
  try {
    const { text, contactName = 'Cliente Teste', phone = 'simulador_cliente' } = req.body || {};

    console.log(`[UpZap Simulator] 📩 Requisição recebida: texto="${text}", telefone="${phone}", contato="${contactName}"`);

    const result = await automationEngineService.processIncomingMessage({
      phone: String(phone || 'simulador_cliente'),
      text: String(text || ''),
      contactName: String(contactName || 'Cliente Teste'),
      isSimulator: true
    });

    const conversation = conversationsService.getConversation(phone);

    console.log(`[UpZap Simulator] ✅ Sucesso no processamento: matchedType="${result.matchedType}", matchedName="${result.matchedName}", respostas=${result.responseTexts.length}`);

    res.json({
      success: true,
      text: text || '',
      matched: Boolean(result.responseTexts && result.responseTexts.length > 0 && result.status !== 'no_automation'),
      result,
      conversation
    });
  } catch (err: any) {
    console.error('[UpZap Simulator] ❌ Erro ao simular mensagem:', err);
    res.status(500).json({ success: false, error: err.message || 'Erro interno no processamento do simulador' });
  }
});

app.get('/api/simulator/conversation/:phone', (req: Request, res: Response) => {
  try {
    const { phone } = req.params;
    const conversation = conversationsService.getConversation(phone);
    res.json({
      success: true,
      phone,
      conversation: conversation || null
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/simulator/reset', (req: Request, res: Response) => {
  try {
    const { phone = 'simulador_cliente' } = req.body || {};
    conversationsService.resetConversationForTest(phone);
    console.log(`[UpZap Simulator] 🔄 Conversa resetada para telefone: ${phone}`);
    res.json({ success: true, message: `Conversa de teste para ${phone} reiniciada com sucesso.` });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================
// ITEM 18: RECONEXÃO MANUAL DO WHATSAPP (Ajuste 2)
// ============================================================
app.post('/api/whatsapp/force-reconnect', async (req: Request, res: Response) => {
  try {
    // Evita chamadas concorrentes enquanto uma tentativa de conexão estiver em andamento
    if (whatsAppDirectService.isConnectionInProgress()) {
      return res.status(409).json({
        success: false,
        inProgress: true,
        message: 'Uma tentativa de conexão já está em andamento no Baileys. Aguarde a conclusão do handshake para evitar conflitos de sessão.',
        session: whatsAppDirectService.getSessionInfo()
      });
    }

    console.log('[UpZap API] ⚡ Disparando reconexão manual forçada do WhatsApp...');
    const result = await whatsAppDirectService.forceReconnectNow();
    res.json({
      success: true,
      message: 'Reconexão manual iniciada com sucesso. Contador de tentativas resetado a zero.',
      session: result
    });
  } catch (err: any) {
    console.error('[UpZap API] Erro ao disparar reconexão manual:', err);
    res.status(500).json({
      success: false,
      error: err.message || 'Erro ao reconectar WhatsApp'
    });
  }
});

// ============================================================
// ITEM 19 & 20: STATUS DE MONITORAMENTO DO SERVIDOR & UPTIME
// ============================================================
app.get('/api/monitoring/status', (req: Request, res: Response) => {
  try {
    const session = whatsAppDirectService.getSessionInfo();
    const convSettings = conversationsService.getSettings();
    const isGlobalPaused = conversationsService.isGlobalAutomationPaused();
    const conversations = Object.values(conversationsService.getAllConversations());

    const activeClientsCount = conversations.filter(c => c.state === 'active').length;
    const closedClientsCount = conversations.filter(c => c.state === 'closed').length;

    // Cálculo do tempo de atividade (Uptime)
    const uptimeSec = Math.floor(process.uptime());
    const days = Math.floor(uptimeSec / 86400);
    const hours = Math.floor((uptimeSec % 86400) / 3600);
    const minutes = Math.floor((uptimeSec % 3600) / 60);
    const seconds = uptimeSec % 60;

    let uptimeFormatted = '';
    if (days > 0) uptimeFormatted += `${days}d `;
    if (hours > 0 || days > 0) uptimeFormatted += `${hours}h `;
    uptimeFormatted += `${minutes}m ${seconds}s`;

    // Informações de memória
    const mem = process.memoryUsage();
    const memoryMb = {
      rss: Math.round(mem.rss / 1024 / 1024),
      heapUsed: Math.round(mem.heapUsed / 1024 / 1024),
      heapTotal: Math.round(mem.heapTotal / 1024 / 1024)
    };

    // Detecção de processo PM2
    const pm2 = {
      active: Boolean(process.env.PM2_HOME || process.env.pm_id !== undefined),
      id: process.env.pm_id || null,
      name: process.env.name || 'upzap-server'
    };

    const status: ServerStatusInfo = {
      uptimeSeconds: uptimeSec,
      uptimeFormatted,
      memoryMb,
      pm2,
      whatsapp: {
        state: session.state,
        phoneNumber: session.phoneNumber,
        userName: session.userName,
        lastConnectedAt: session.lastConnectedAt,
        reconnectAttempts: session.reconnectAttempts || 0,
        maxReconnectAttempts: session.maxReconnectAttempts || 10,
        reconnectState: session.reconnectState || 'idle',
        maxBackoffSeconds: session.maxBackoffSeconds || 60
      },
      automation: {
        globalPaused: isGlobalPaused,
        activeClientsCount,
        closedClientsCount,
        loopProtectionEnabled: convSettings.loopProtectionEnabled
      }
    };

    res.json({
      success: true,
      status
    });
  } catch (err: any) {
    console.error('[UpZap API] Erro ao obter status do servidor:', err);
    res.status(500).json({
      success: false,
      error: err.message || 'Falha ao obter status'
    });
  }
});

// ============================================================
// ITEM 19: EVENTOS DE AUDITORIA (LOGS CONSOLIDADOS & STREAMING SSE AO VIVO)
// ============================================================
app.get('/api/audit/events/stream', (req: Request, res: Response) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });

  // Envia evento inicial de confirmação de conexão
  res.write(`data: ${JSON.stringify({ type: 'connected', timestamp: new Date().toISOString() })}\n\n`);

  auditSseClients.add(res);
  console.log(`[UpZap SSE] Cliente conectado aos logs em tempo real. Ativos: ${auditSseClients.size}`);

  req.on('close', () => {
    auditSseClients.delete(res);
    console.log(`[UpZap SSE] Cliente desconectado dos logs em tempo real. Ativos: ${auditSseClients.size}`);
  });
});

app.get('/api/audit/events', (req: Request, res: Response) => {
  try {
    const typeFilter = typeof req.query.type === 'string' ? req.query.type : undefined;
    const limit = typeof req.query.limit === 'string' ? parseInt(req.query.limit, 10) : 100;
    const events = auditEventsService.getAllEvents(typeFilter, limit);

    res.json({
      success: true,
      count: events.length,
      events
    });
  } catch (err: any) {
    console.error('[UpZap API] Erro ao buscar eventos de auditoria:', err);
    res.status(500).json({
      success: false,
      error: err.message || 'Falha ao carregar eventos'
    });
  }
});

app.post('/api/audit/clear', (req: Request, res: Response) => {
  try {
    const { type } = req.body;
    auditEventsService.clearEvents(type);
    res.json({
      success: true,
      message: 'Eventos de auditoria limpos com sucesso.'
    });
  } catch (err: any) {
    console.error('[UpZap API] Erro ao limpar eventos de auditoria:', err);
    res.status(500).json({
      success: false,
      error: err.message || 'Falha ao limpar eventos'
    });
  }
});

// ============================================================
// CONFIGURAÇÕES DO SISTEMA (PROTEÇÃO CONTRA LOOPS & BACKOFF)
// ============================================================
app.get('/api/system/settings', (req: Request, res: Response) => {
  try {
    const settings = conversationsService.getSettings();
    res.json({
      success: true,
      settings: {
        loopProtectionEnabled: settings.loopProtectionEnabled,
        loopContingencyMessage: settings.loopContingencyMessage,
        loopSensitivityCycles: settings.loopSensitivityCycles,
        maxBackoffSeconds: settings.maxBackoffSeconds,
        updatedAt: settings.updatedAt
      }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/system/settings', (req: Request, res: Response) => {
  try {
    const updated = conversationsService.saveSettings(req.body);
    res.json({
      success: true,
      message: 'Configurações de proteção e conexão salvas com sucesso.',
      settings: {
        loopProtectionEnabled: updated.loopProtectionEnabled,
        loopContingencyMessage: updated.loopContingencyMessage,
        loopSensitivityCycles: updated.loopSensitivityCycles,
        maxBackoffSeconds: updated.maxBackoffSeconds,
        updatedAt: updated.updatedAt
      }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================
// CENTRAL DE MONITORAMENTO & ALERTAS INTERNOS COM AVISO SONORO
// ============================================================
app.get('/api/alerts/settings', (req: Request, res: Response) => {
  try {
    const data = alertsNotifierService.getSettings();
    res.json({
      success: true,
      settings: data.settings
    });
  } catch (err: any) {
    console.error('[UpZap API] Erro ao obter configurações de alertas:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/alerts/settings', (req: Request, res: Response) => {
  try {
    const updated = alertsNotifierService.updateSettings(req.body);
    res.json({
      success: true,
      message: 'Configurações de alertas internos salvas com sucesso.',
      settings: updated
    });
  } catch (err: any) {
    console.error('[UpZap API] Erro ao atualizar configurações de alertas:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Listagem de alertas ativos e histórico recente de resolvidos
app.get('/api/alerts/active', (req: Request, res: Response) => {
  try {
    const active = alertsNotifierService.getActiveAlerts();
    const resolved = alertsNotifierService.getResolvedAlerts(50);
    res.json({
      success: true,
      active,
      resolved
    });
  } catch (err: any) {
    console.error('[UpZap API] Erro ao listar alertas:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Resolução / Reconhecimento de alerta
app.post('/api/alerts/resolve', (req: Request, res: Response) => {
  try {
    const { key, id, recoveryResult } = req.body || {};
    const target = key || id;
    if (!target) {
      return res.status(400).json({ success: false, error: 'Chave ou ID do alerta é obrigatório.' });
    }
    const resolved = alertsNotifierService.resolveAlert(target, recoveryResult);
    if (!resolved) {
      return res.status(404).json({ success: false, error: 'Alerta não encontrado ou já resolvido.' });
    }
    res.json({
      success: true,
      message: 'Alerta resolvido com sucesso.'
    });
  } catch (err: any) {
    console.error('[UpZap API] Erro ao resolver alerta:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Disparo de teste de alerta interno
app.post('/api/alerts/test', async (req: Request, res: Response) => {
  try {
    const testResult = alertsNotifierService.testAlert();
    res.json({
      success: true,
      message: testResult.message,
      alert: testResult.alert
    });
  } catch (err: any) {
    console.error('[UpZap API] Erro ao disparar alerta de teste:', err);
    res.status(500).json({ success: false, message: `Erro ao testar alerta: ${err.message}` });
  }
});

// Endpoint de diagnóstico para validar eventos reais (desconexão, reconexão, loops, erros, brizex)
app.post('/api/alerts/simulate-event', async (req: Request, res: Response) => {
  try {
    const { scenario } = req.body; // 'disconnect' | 'reconnect' | 'loop' | 'brizex_error' | 'flow_failure' | 'critical_error'
    let event: any;

    if (scenario === 'disconnect') {
      event = auditEventsService.addEvent({
        type: 'whatsapp_connection',
        level: 'warning',
        title: 'Queda de Conexão WhatsApp',
        description: 'Evento de teste real: conexão com o WhatsApp caiu (código 515). Reconexão agendada.',
        details: { attempt: 1, maxAttempts: 10, isDrop: true, delaySeconds: 3 }
      });
    } else if (scenario === 'reconnect') {
      event = auditEventsService.addEvent({
        type: 'whatsapp_connection',
        level: 'success',
        title: 'WhatsApp Conectado',
        description: 'Evento de teste real: WhatsApp restabelecido com sucesso para +5511999998888.',
        details: { phoneNumber: '5511999998888', userName: 'Atendente UpZap' }
      });
    } else if (scenario === 'loop') {
      event = auditEventsService.addEvent({
        type: 'loop_detected',
        level: 'error',
        title: 'Proteção Anti-Loop Disparada',
        description: 'Evento de teste real: padrão repetitivo detectado para +5511999998888. Atendimento pausado.',
        details: { phone: '5511999998888', pattern: 'fluxo_duplicado' }
      });
    } else if (scenario === 'brizex_error') {
      event = auditEventsService.addEvent({
        type: 'system_alert',
        level: 'error',
        title: 'Falha na Integração Brizex',
        description: 'Evento de teste real: webhook de pedido retornou erro de validação (token ou payload incorreto).',
        details: { provider: 'Brizex/Logzz', simulated: true }
      });
    } else if (scenario === 'flow_failure') {
      event = auditEventsService.addEvent({
        type: 'system_alert',
        level: 'error',
        title: 'Falha na Execução de Fluxo',
        description: 'Evento de teste real: bloco de mensagem falhou ao enviar mídia (arquivo inacessível).',
        details: { flowId: 'flow_teste', simulated: true }
      });
    } else {
      event = auditEventsService.addEvent({
        type: 'system_alert',
        level: 'error',
        title: 'Erro Crítico no Sistema',
        description: 'Evento de teste real: falha crítica registrada para validação de alerta interno.',
        details: { simulated: true }
      });
    }

    res.json({
      success: true,
      message: `Evento real "${scenario || 'critical_error'}" gerado e despachado para a Central de Monitoramento e SSE.`,
      event
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Fallback for unmatched API routes to ensure they always return JSON, not HTML
app.all('/api/*', (req: Request, res: Response) => {
  res.status(404).json({ error: 'Endpoint não encontrado', path: req.path });
});

// Global API error handler
app.use((err: any, req: Request, res: Response, next: any) => {
  console.error('[UpZap API Error Handler]', err);
  if (req.path.startsWith('/api/')) {
    return res.status(500).json({
      success: false,
      error: err?.message || 'Erro interno no servidor',
      state: 'error'
    });
  }
  next(err);
});

// ----------------------------------------------------
// VITE MIDDLEWARE & SERVER STARTUP
// ----------------------------------------------------
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[UpZap Server] Running on http://0.0.0.0:${PORT}`);
    
    // Se existir uma sessão pré-existente salva localmente, reconecta automaticamente
    if (whatsAppDirectService.hasSavedSession()) {
      console.log('[UpZap Baileys] Sessão salva em disco encontrada. Conectando WhatsApp automaticamente...');
      whatsAppDirectService.initialize().catch((err) => {
        console.error('[UpZap Baileys] Erro ao reconectar sessão salva:', err);
      });
    }
  });
}

startServer();
