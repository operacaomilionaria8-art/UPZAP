import fs from 'fs';
import path from 'path';
import {
  UpZapOrder,
  LogzzOrderStatus,
  BrizexIntegrationConfig,
  BrizexSyncLog,
  OrderInternalNote,
  OrderStatusHistoryItem,
  OrderItem,
  OrderDeliveryAddress,
  OrderCustomer
} from '../src/types/upzap';
import { conversationsService } from './conversations.service';
import { auditEventsService } from './audit-events.service';

export const OFFICIAL_LOGZZ_STATUSES: LogzzOrderStatus[] = [
  'Agendado',
  'Em Separação',
  'Separado',
  'Em Rota',
  'Cancelado',
  'A Reagendar',
  'Frustrado',
  'Completo'
];

export class OrdersService {
  private static instance: OrdersService;
  private ordersFile: string;
  private configFile: string;
  private syncLogsFile: string;

  private constructor() {
    const dataDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    this.ordersFile = path.join(dataDir, 'orders.json');
    this.configFile = path.join(dataDir, 'brizex-config.json');
    this.syncLogsFile = path.join(dataDir, 'orders_sync_logs.json');

    this.ensureDefaultData();
  }

  public static getInstance(): OrdersService {
    if (!OrdersService.instance) {
      OrdersService.instance = new OrdersService();
    }
    return OrdersService.instance;
  }

  private ensureDefaultData(): void {
    if (!fs.existsSync(this.configFile)) {
      const defaultConfig: BrizexIntegrationConfig = {
        webhookSecret: process.env.BRIZEX_INTEGRATION_TOKEN || 'brizex_live_secret_upzap2026',
        enabled: true,
        autoPauseCommercialOnScheduled: true,
        webhookUrl: '/api/integrations/brizex/orders',
        updatedAt: new Date().toISOString()
      };
      fs.writeFileSync(this.configFile, JSON.stringify(defaultConfig, null, 2), 'utf-8');
    }

    if (!fs.existsSync(this.ordersFile)) {
      fs.writeFileSync(this.ordersFile, JSON.stringify([], null, 2), 'utf-8');
    }

    if (!fs.existsSync(this.syncLogsFile)) {
      fs.writeFileSync(this.syncLogsFile, JSON.stringify([], null, 2), 'utf-8');
    }
  }

  // ----------------------------------------------------
  // CONFIGURAÇÃO DA INTEGRAÇÃO BRIZEX
  // ----------------------------------------------------

  public getConfig(): BrizexIntegrationConfig {
    try {
      if (fs.existsSync(this.configFile)) {
        const raw = fs.readFileSync(this.configFile, 'utf-8');
        return JSON.parse(raw);
      }
    } catch (err) {
      console.error('[OrdersService] Erro ao ler brizex-config.json:', err);
    }
    return {
      webhookSecret: process.env.BRIZEX_INTEGRATION_TOKEN || 'brizex_live_secret_upzap2026',
      enabled: true,
      autoPauseCommercialOnScheduled: true,
      webhookUrl: '/api/integrations/brizex/orders',
      updatedAt: new Date().toISOString()
    };
  }

  public saveConfig(newConfig: Partial<BrizexIntegrationConfig>): BrizexIntegrationConfig {
    const current = this.getConfig();
    const updated: BrizexIntegrationConfig = {
      ...current,
      ...newConfig,
      updatedAt: new Date().toISOString()
    };
    try {
      fs.writeFileSync(this.configFile, JSON.stringify(updated, null, 2), 'utf-8');
      console.log('[OrdersService] Configurações de integração Brizex atualizadas com sucesso.');
    } catch (err) {
      console.error('[OrdersService] Erro ao salvar brizex-config.json:', err);
    }
    return updated;
  }

  public validateAuthToken(token?: string): boolean {
    if (!token) return false;
    const config = this.getConfig();
    const expected = config.webhookSecret.trim();
    const cleanToken = token.replace(/^Bearer\s+/i, '').trim();
    return cleanToken === expected;
  }

  // ----------------------------------------------------
  // PERSISTÊNCIA E LEITURA DE PEDIDOS
  // ----------------------------------------------------

  public getAllOrders(): UpZapOrder[] {
    try {
      if (fs.existsSync(this.ordersFile)) {
        const raw = fs.readFileSync(this.ordersFile, 'utf-8');
        const list = JSON.parse(raw);
        if (Array.isArray(list)) {
          return list.map((ord) => this.computeDelayAlert(ord));
        }
      }
    } catch (err) {
      console.error('[OrdersService] Erro ao ler orders.json:', err);
    }
    return [];
  }

  private saveAllOrders(orders: UpZapOrder[]): void {
    try {
      fs.writeFileSync(this.ordersFile, JSON.stringify(orders, null, 2), 'utf-8');
    } catch (err) {
      console.error('[OrdersService] Erro ao salvar orders.json:', err);
    }
  }

  // ----------------------------------------------------
  // LOGS DE SINCRONIZAÇÃO
  // ----------------------------------------------------

  public getSyncLogs(limit: number = 100): BrizexSyncLog[] {
    try {
      if (fs.existsSync(this.syncLogsFile)) {
        const raw = fs.readFileSync(this.syncLogsFile, 'utf-8');
        const list = JSON.parse(raw);
        if (Array.isArray(list)) {
          return list.slice(0, limit);
        }
      }
    } catch (err) {
      console.error('[OrdersService] Erro ao ler orders_sync_logs.json:', err);
    }
    return [];
  }

  public addSyncLog(log: Omit<BrizexSyncLog, 'id' | 'timestamp'>): BrizexSyncLog {
    const logs = this.getSyncLogs(500);
    const newEntry: BrizexSyncLog = {
      id: `synclog_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      timestamp: new Date().toISOString(),
      ...log
    };
    logs.unshift(newEntry);
    if (logs.length > 500) logs.pop();

    try {
      fs.writeFileSync(this.syncLogsFile, JSON.stringify(logs, null, 2), 'utf-8');
    } catch (err) {
      console.error('[OrdersService] Erro ao salvar orders_sync_logs.json:', err);
    }
    return newEntry;
  }

  public clearSyncLogs(): void {
    try {
      fs.writeFileSync(this.syncLogsFile, JSON.stringify([], null, 2), 'utf-8');
    } catch {}
  }

  // ----------------------------------------------------
  // REGRAS DE NEGÓCIO E NORMALIZAÇÃO DE STATUS
  // ----------------------------------------------------

  /**
   * Mapeia variações textuais da Brizex/Logzz para exatamente um dos 8 status oficiais.
   * Se o valor for desconhecido ou não documentado, retorna null de forma explícita e segura,
   * permitindo que pedidos existentes mantenham seu status intacto.
   */
  public normalizeStatus(rawStatus?: string): LogzzOrderStatus | null {
    if (!rawStatus || typeof rawStatus !== 'string') return null;
    const s = rawStatus.trim();
    if (!s) return null;

    // 1. Verificação direta exata (case-insensitive)
    const direct = OFFICIAL_LOGZZ_STATUSES.find(
      (opt) => opt.toLowerCase() === s.toLowerCase()
    );
    if (direct) return direct;

    // 2. Normalização semântica determinística estrita
    const lower = s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    // Divergência "A Reagendar" vs "O Reagenda" e derivados de reagendamento
    if (lower.includes('reagend') || lower.includes('remarc')) {
      return 'A Reagendar';
    }

    // Em Separação (separação operacional de estoque e empacotamento)
    if (
      lower.includes('separacao') ||
      lower.includes('separando') ||
      lower.includes('preparacao') ||
      lower.includes('preparand') ||
      lower.includes('coleta') ||
      lower.includes('empacot')
    ) {
      return 'Em Separação';
    }

    // Separado (pacote pronto, aguardando coleta de rota)
    if (lower.includes('separad') && !lower.includes('em separacao')) {
      return 'Separado';
    }

    // Em Rota (em trânsito ou saiu para entrega)
    if (
      lower.includes('rota') ||
      lower.includes('saiu') ||
      lower.includes('transito') ||
      (lower.includes('entrega') && !lower.includes('entregue') && !lower.includes('nao entregue'))
    ) {
      if (
        lower.includes('frustrad') ||
        lower.includes('nao entregue') ||
        lower.includes('ausente') ||
        lower.includes('recusad') ||
        lower.includes('tentativa')
      ) {
        return 'Frustrado';
      }
      return 'Em Rota';
    }

    // Frustrado (insucesso de entrega comprovado, ausência ou recusa)
    if (
      lower.includes('frustrad') ||
      lower.includes('falha') ||
      lower.includes('insucesso') ||
      lower.includes('devolv') ||
      lower.includes('ausente') ||
      lower.includes('recusad') ||
      lower.includes('nao entregue')
    ) {
      return 'Frustrado';
    }

    // Cancelado
    if (lower.includes('cancel')) {
      return 'Cancelado';
    }

    // Completo (apenas entrega finalizada comprovada; 'pago' NÃO é sinônimo automático)
    if (
      lower.includes('complet') ||
      lower.includes('entregue') ||
      lower.includes('concluid') ||
      lower.includes('finalizad')
    ) {
      return 'Completo';
    }

    // Agendado (apenas se contiver agendad)
    if (lower.includes('agendad')) {
      return 'Agendado';
    }

    // Valor desconhecido ou não documentado: retorna null para não alterar status silenciosamente
    return null;
  }

  /**
   * Se um pedido permanecer por mais de 24 horas em 'Em Separação' ou 'Separado',
   * sinaliza para análise humana sem alterar seu status automaticamente (Item 5).
   */
  public computeDelayAlert(order: UpZapOrder): UpZapOrder {
    const isSeparation = order.status === 'Em Separação' || order.status === 'Separado';
    let alertaAtraso = false;

    if (isSeparation) {
      // Localiza o momento em que o pedido entrou no status atual de separação
      let statusSince = new Date(order.ultimaAtualizacao).getTime();
      if (Array.isArray(order.statusHistory)) {
        const lastSeparationEntry = [...order.statusHistory]
          .reverse()
          .find((h) => h.status === order.status);
        if (lastSeparationEntry && lastSeparationEntry.data) {
          statusSince = new Date(lastSeparationEntry.data).getTime();
        }
      }

      const diffHours = (Date.now() - statusSince) / (1000 * 60 * 60);
      if (diffHours >= 24) {
        alertaAtraso = true;
      }
    }

    const precisaAcompanhamentoHumano =
      alertaAtraso ||
      order.status === 'Frustrado' ||
      order.status === 'A Reagendar' ||
      order.status === 'Cancelado';

    return {
      ...order,
      alertaAtraso,
      precisaAcompanhamentoHumano
    };
  }

  private normalizePhone(phone: string): string {
    return (phone || '').replace(/\D/g, '');
  }

  // ----------------------------------------------------
  // RECEBIMENTO E PROCESSAMENTO DE PEDIDOS DA BRIZEX
  // ----------------------------------------------------

  /**
   * Processa com validação rigorosa, deduplicação por ID Logzz e persistência determinística.
   */
  public processBrizexOrderPayload(
    payload: any,
    options: { ip?: string; origin?: 'brizex' | 'manual' | 'logzz' } = {}
  ): {
    success: boolean;
    order?: UpZapOrder;
    action: 'created' | 'updated' | 'unchanged';
    message: string;
    errors?: string[];
  } {
    const errors: string[] = [];

    if (!payload || typeof payload !== 'object') {
      const msg = 'Payload de pedido inválido: esperado um objeto JSON.';
      this.addSyncLog({
        tipoOperacao: 'erro_validacao',
        sucesso: false,
        mensagem: msg,
        detalhes: { payload },
        ipOrigem: options.ip
      });
      return { success: false, action: 'unchanged', message: msg, errors: [msg] };
    }

    // 1. Extração do Identificador da Logzz (Chave Primária Obrigatória de Deduplicação)
    const logzzId = String(
      payload.logzzOrderId ||
      payload.idLogzz ||
      payload.id_logzz ||
      payload.order_id ||
      payload.id_pedido ||
      payload.numero_pedido ||
      payload.id ||
      ''
    ).trim();

    if (!logzzId) {
      const msg = 'Campo obrigatório ausente: identificador do pedido na Logzz (logzzOrderId / id_logzz).';
      this.addSyncLog({
        tipoOperacao: 'erro_validacao',
        sucesso: false,
        mensagem: msg,
        detalhes: { payload },
        ipOrigem: options.ip
      });
      return { success: false, action: 'unchanged', message: msg, errors: [msg] };
    }

    const brizexOrderId = payload.brizexOrderId || payload.idBrizex || payload.id_brizex || undefined;

    // Busca preliminar de pedido existente para deduplicação (Logzz ID ou Brizex ID)
    const allOrders = this.getAllOrders();
    const existingIndex = allOrders.findIndex(
      (o) => o.logzzOrderId === logzzId || (brizexOrderId && o.brizexOrderId === brizexOrderId)
    );
    const existing = existingIndex >= 0 ? allOrders[existingIndex] : null;

    // 2. Extração dos Dados do Cliente
    const rawCliente = payload.cliente || payload.customer || {};
    const rawPhone = String(
      rawCliente.telefone ||
      rawCliente.phone ||
      rawCliente.celular ||
      payload.telefone ||
      payload.phone ||
      payload.celular ||
      payload.whatsapp ||
      ''
    ).trim();

    const cleanPhone = this.normalizePhone(rawPhone) || (existing ? existing.cliente.telefone : '');

    if (!cleanPhone || cleanPhone.length < 8) {
      const msg = 'Campo obrigatório ausente ou inválido: telefone do cliente com DDD (cliente.telefone).';
      this.addSyncLog({
        logzzOrderId: logzzId,
        tipoOperacao: 'erro_validacao',
        sucesso: false,
        mensagem: msg,
        detalhes: { payload, rawPhone },
        ipOrigem: options.ip
      });
      return { success: false, action: 'unchanged', message: msg, errors: [msg] };
    }

    const clienteNome = String(
      rawCliente.nome ||
      rawCliente.name ||
      payload.nome_cliente ||
      payload.nome ||
      (existing ? existing.cliente.nome : '') ||
      'Cliente'
    ).trim();

    const cliente: OrderCustomer = {
      nome: clienteNome,
      telefone: cleanPhone,
      cpf: rawCliente.cpf || payload.cpf || undefined,
      email: rawCliente.email || payload.email || undefined
    };

    // 3. Extração do Endereço de Entrega
    const rawEnd = payload.endereco || payload.address || {};
    const endereco: OrderDeliveryAddress = {
      logradouro: rawEnd.logradouro || rawEnd.rua || payload.rua || payload.logradouro || undefined,
      numero: rawEnd.numero || payload.numero || undefined,
      complemento: rawEnd.complemento || payload.complemento || undefined,
      bairro: rawEnd.bairro || payload.bairro || undefined,
      cidade: rawEnd.cidade || payload.cidade || undefined,
      uf: (rawEnd.uf || rawEnd.estado || payload.uf || payload.estado || '').toUpperCase() || undefined,
      cep: rawEnd.cep || payload.cep || undefined,
      referencia: rawEnd.referencia || payload.referencia || undefined
    };

    // 4. Extração dos Itens / Produtos
    const rawItens = Array.isArray(payload.itens)
      ? payload.itens
      : Array.isArray(payload.items)
      ? payload.items
      : Array.isArray(payload.produtos)
      ? payload.produtos
      : [];

    const itens: OrderItem[] = rawItens.map((it: any) => ({
      nome: String(it.nome || it.name || it.produto || it.title || 'Produto Brizex').trim(),
      quantidade: typeof it.quantidade === 'number' ? it.quantidade : parseInt(it.quantidade || it.qty || '1', 10) || 1,
      valorUnitario: typeof it.valorUnitario === 'number' ? it.valorUnitario : parseFloat(it.valorUnitario || it.preco || it.price || '0') || 0,
      valorTotal: typeof it.valorTotal === 'number' ? it.valorTotal : parseFloat(it.valorTotal || '0') || 0,
      sku: it.sku || undefined,
      kit: it.kit || undefined,
      tamanho: it.tamanho || it.size || undefined,
      cor: it.cor || it.color || undefined
    }));

    // Se nenhum item foi passado em array mas temos campos no nível raiz
    if (itens.length === 0) {
      itens.push({
        nome: payload.produto_nome || payload.produto || 'Calcinha Cinta Modeladora Brizex',
        quantidade: typeof payload.quantidade === 'number' ? payload.quantidade : 1,
        valorUnitario: typeof payload.valorTotal === 'number' ? payload.valorTotal : parseFloat(payload.valorTotal || payload.valor || '0') || 0,
        kit: payload.kit || undefined,
        tamanho: payload.tamanho || undefined,
        cor: payload.cor || undefined
      });
    }

    // 5. Valores e Pagamento
    const valorTotal = typeof payload.valorTotal === 'number'
      ? payload.valorTotal
      : parseFloat(payload.valorTotal || payload.total || payload.valor || '0') || 0;

    const valorFrete = typeof payload.valorFrete === 'number'
      ? payload.valorFrete
      : parseFloat(payload.valorFrete || payload.frete || '0') || 0;

    const metodoPagamento = payload.metodoPagamento || payload.formaPagamento || payload.pagamento || 'Logzz Entrega';

    // 6. Datas e Status
    const nowIso = new Date().toISOString();
    const dataCriacao = payload.dataCriacao || payload.created_at || payload.createdAt || nowIso;
    const dataAgendamento = payload.dataAgendamento || payload.scheduled_at || payload.previsao_entrega || undefined;

    const rawStatus = (payload.status || payload.statusLogistico || payload.logisticStatus || payload.status_logistico || '').toString().trim();
    const normalized = this.normalizeStatus(rawStatus);

    let targetStatus: LogzzOrderStatus;
    let statusWarning: string | null = null;

    let finalOrder: UpZapOrder;
    let actionResult: 'created' | 'updated' | 'unchanged' = 'created';

    if (existingIndex >= 0) {
      // ATUALIZAÇÃO SEGURA DO MESMO PEDIDO SEM DUPLICAÇÃO (Itens 4 e 5)
      const existing = allOrders[existingIndex];

      if (normalized) {
        targetStatus = normalized;
      } else {
        // PRESERVAÇÃO SEGURA DO STATUS EXISTENTE: não altera silenciosamente para status desconhecido
        targetStatus = existing.status;
        if (rawStatus) {
          statusWarning = `Status recebido não documentado: '${rawStatus}'. Status atual [${existing.status}] mantido com segurança.`;
          console.warn(`[OrdersService] ⚠️ ${statusWarning} (Pedido: ${logzzId})`);
        }
      }

      const hasStatusChanged = existing.status !== targetStatus;

      const updatedHistory = Array.isArray(existing.statusHistory) ? [...existing.statusHistory] : [];
      if (hasStatusChanged) {
        updatedHistory.push({
          status: targetStatus,
          data: nowIso,
          origem: options.origin || 'brizex',
          observacao: payload.observacao || payload.motivo || `Transição de ${existing.status} para ${targetStatus} via Brizex`
        });
      } else if (statusWarning) {
        updatedHistory.push({
          status: existing.status,
          data: nowIso,
          origem: options.origin || 'brizex',
          observacao: statusWarning
        });
      }

      const existingNotes = Array.isArray(existing.observacoesInternas) ? [...existing.observacoesInternas] : [];
      if (statusWarning) {
        existingNotes.unshift({
          id: `note_warn_${Date.now()}`,
          autor: 'Auditoria Brizex',
          texto: statusWarning,
          data: nowIso
        });
      }

      finalOrder = {
        ...existing,
        brizexOrderId: brizexOrderId || existing.brizexOrderId,
        cliente: {
          ...existing.cliente,
          ...cliente
        },
        endereco: {
          ...existing.endereco,
          ...endereco
        },
        itens: itens.length > 0 ? itens : existing.itens,
        valorTotal: valorTotal > 0 ? valorTotal : existing.valorTotal,
        valorFrete: valorFrete > 0 ? valorFrete : existing.valorFrete,
        metodoPagamento: metodoPagamento || existing.metodoPagamento,
        dataAgendamento: dataAgendamento || existing.dataAgendamento,
        status: targetStatus,
        statusHistory: updatedHistory,
        observacoesInternas: existingNotes,
        ultimaAtualizacao: nowIso,
        motivoCancelamento: targetStatus === 'Cancelado' ? (payload.motivoCancelamento || payload.motivo || existing.motivoCancelamento) : existing.motivoCancelamento,
        motivoFalha: targetStatus === 'Frustrado' ? (payload.motivoFalha || payload.motivo || existing.motivoFalha) : existing.motivoFalha,
        motivoReagendamento: targetStatus === 'A Reagendar' ? (payload.motivoReagendamento || payload.motivo || existing.motivoReagendamento) : existing.motivoReagendamento,
        rawPayload: payload
      };

      allOrders[existingIndex] = this.computeDelayAlert(finalOrder);
      actionResult = hasStatusChanged ? 'updated' : 'unchanged';
    } else {
      // NOVO PEDIDO CADASTRADO NO CRM
      if (normalized) {
        targetStatus = normalized;
      } else {
        targetStatus = 'Agendado';
        if (rawStatus) {
          statusWarning = `Status inicial não documentado: '${rawStatus}'. Pedido iniciado como [Agendado].`;
        }
      }

      const newId = `upz_ord_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const initialHistory: OrderStatusHistoryItem[] = [
        {
          status: targetStatus,
          data: nowIso,
          origem: options.origin || 'brizex',
          observacao: statusWarning || payload.observacao || 'Pedido recebido via integração Brizex'
        }
      ];

      const initialNotes: OrderInternalNote[] = [];
      if (statusWarning) {
        initialNotes.push({
          id: `note_warn_${Date.now()}`,
          autor: 'Auditoria Brizex',
          texto: statusWarning,
          data: nowIso
        });
      }

      finalOrder = {
        id: newId,
        logzzOrderId: logzzId,
        brizexOrderId,
        cliente,
        endereco,
        itens,
        valorTotal,
        valorFrete,
        metodoPagamento,
        dataCriacao,
        dataAgendamento,
        status: targetStatus,
        statusHistory: initialHistory,
        ultimaAtualizacao: nowIso,
        observacoesInternas: initialNotes,
        responsavel: payload.responsavel || undefined,
        motivoCancelamento: targetStatus === 'Cancelado' ? (payload.motivoCancelamento || payload.motivo) : undefined,
        motivoFalha: targetStatus === 'Frustrado' ? (payload.motivoFalha || payload.motivo) : undefined,
        motivoReagendamento: targetStatus === 'A Reagendar' ? (payload.motivoReagendamento || payload.motivo) : undefined,
        origem: options.origin || 'brizex',
        rawPayload: payload
      };

      allOrders.unshift(this.computeDelayAlert(finalOrder));
      actionResult = 'created';
    }

    this.saveAllOrders(allOrders);

    // 8. SEPARAÇÃO DA AUTOMAÇÃO COMERCIAL DO CRM (Item 6)
    // Quando o pedido entrar em "Agendado", o fluxo comercial automatizado do UpZap
    // DEVE PARAR para aquele cliente, sem apagar o pedido nem interromper o acompanhamento no CRM.
    const config = this.getConfig();
    if (targetStatus === 'Agendado' && config.autoPauseCommercialOnScheduled) {
      try {
        console.log(`[OrdersService] 🛑 Pedido ${logzzId} entrou em Agendado. Pausando automação comercial para o cliente ${cleanPhone}...`);
        
        // Coloca o atendimento do cliente em modo manual (atendimento humano)
        conversationsService.setConversationAttendanceMode(cleanPhone, 'manual', 'pedido_agendado_logzz');
        conversationsService.updateConversation(cleanPhone, {
          currentFlow: 'Pedido Agendado (Logzz)',
          contactName: clienteNome
        });

        auditEventsService.addEvent({
          type: 'system_alert',
          level: 'info',
          title: 'Automação Comercial Interrompida (Pedido Agendado)',
          description: `Pedido ${logzzId} foi Agendado na Logzz. O fluxo de vendas foi encerrado para ${cleanPhone} e transferido para acompanhamento humano no CRM.`,
          details: { logzzOrderId: logzzId, phone: cleanPhone, status: targetStatus }
        });
      } catch (err: any) {
        console.warn(`[OrdersService] Alerta ao pausar automação comercial para ${cleanPhone}:`, err.message);
      }
    }

    // 9. Registro de Log de Sincronização e Auditoria
    this.addSyncLog({
      logzzOrderId: logzzId,
      brizexOrderId,
      clienteNome,
      clienteTelefone: cleanPhone,
      statusLogistico: targetStatus,
      tipoOperacao: statusWarning ? 'aviso_status' : (actionResult === 'created' ? 'criacao' : 'atualizacao'),
      sucesso: true,
      mensagem: statusWarning
        ? `${actionResult === 'created' ? 'Novo pedido' : 'Pedido mantido'}: ${statusWarning}`
        : (actionResult === 'created'
            ? `Novo pedido ${logzzId} registrado com sucesso no status [${targetStatus}].`
            : `Pedido ${logzzId} atualizado com sucesso para o status [${targetStatus}].`),
      detalhes: {
        upzapId: finalOrder.id,
        valorTotal,
        itensCount: itens.length,
        rawStatusReceived: rawStatus || undefined,
        statusWarning: statusWarning || undefined
      },
      ipOrigem: options.ip
    });

    return {
      success: true,
      order: finalOrder,
      action: actionResult,
      message: `Pedido ${logzzId} processado com sucesso [${actionResult}]. Status: ${targetStatus}.`
    };
  }

  // ----------------------------------------------------
  // GESTÃO DO CRM (CONSULTAS, FILTROS, OBSERVAÇÕES E NOTAS)
  // ----------------------------------------------------

  public getOrders(filters: {
    status?: string;
    search?: string;
    period?: 'today' | '7days' | '30days' | 'all';
    delayAlertOnly?: boolean;
    humanOnly?: boolean;
  } = {}): UpZapOrder[] {
    let orders = this.getAllOrders();

    // Filtro por busca textual (Nome, Telefone, ID Logzz, ID Brizex, ID UpZap)
    if (filters.search && filters.search.trim()) {
      const q = filters.search.toLowerCase().trim();
      const qDigits = q.replace(/\D/g, '');

      orders = orders.filter((o) => {
        const matchName = o.cliente?.nome?.toLowerCase().includes(q);
        const matchPhone = qDigits && o.cliente?.telefone?.includes(qDigits);
        const matchLogzz = o.logzzOrderId?.toLowerCase().includes(q);
        const matchBrizex = o.brizexOrderId?.toLowerCase().includes(q);
        const matchId = o.id?.toLowerCase().includes(q);
        const matchCity = o.endereco?.cidade?.toLowerCase().includes(q);
        return matchName || matchPhone || matchLogzz || matchBrizex || matchId || matchCity;
      });
    }

    // Filtro por status oficial
    if (filters.status && filters.status !== 'all' && filters.status !== 'todos') {
      orders = orders.filter((o) => o.status === filters.status);
    }

    // Filtro por período
    if (filters.period && filters.period !== 'all') {
      const now = Date.now();
      let maxAgeMs = 30 * 24 * 60 * 60 * 1000;
      if (filters.period === 'today') {
        maxAgeMs = 24 * 60 * 60 * 1000;
      } else if (filters.period === '7days') {
        maxAgeMs = 7 * 24 * 60 * 60 * 1000;
      }

      orders = orders.filter((o) => {
        const orderDate = new Date(o.dataCriacao || o.ultimaAtualizacao).getTime();
        return now - orderDate <= maxAgeMs;
      });
    }

    // Filtro: Apenas com alerta de atraso (>24h em separação)
    if (filters.delayAlertOnly) {
      orders = orders.filter((o) => o.alertaAtraso === true);
    }

    // Filtro: Acompanhamento Humano Necessário
    if (filters.humanOnly) {
      orders = orders.filter((o) => o.precisaAcompanhamentoHumano === true);
    }

    return orders.sort((a, b) => new Date(b.ultimaAtualizacao).getTime() - new Date(a.ultimaAtualizacao).getTime());
  }

  public getOrderById(idOrLogzzId: string): UpZapOrder | null {
    const orders = this.getAllOrders();
    const found = orders.find(
      (o) => o.id === idOrLogzzId || o.logzzOrderId === idOrLogzzId || o.brizexOrderId === idOrLogzzId
    );
    return found ? this.computeDelayAlert(found) : null;
  }

  public addInternalNote(orderId: string, autor: string, texto: string): UpZapOrder | null {
    const cleanText = (texto || '').trim();
    if (!cleanText) return null;

    const orders = this.getAllOrders();
    const idx = orders.findIndex((o) => o.id === orderId || o.logzzOrderId === orderId);
    if (idx < 0) return null;

    const newNote: OrderInternalNote = {
      id: `note_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      autor: autor || 'Operador',
      texto: cleanText,
      data: new Date().toISOString()
    };

    const notes = Array.isArray(orders[idx].observacoesInternas)
      ? [...orders[idx].observacoesInternas]
      : [];
    notes.unshift(newNote);

    orders[idx].observacoesInternas = notes;
    orders[idx].ultimaAtualizacao = new Date().toISOString();

    this.saveAllOrders(orders);
    return this.computeDelayAlert(orders[idx]);
  }

  public updateOrder(orderId: string, updates: Partial<UpZapOrder>): UpZapOrder | null {
    const orders = this.getAllOrders();
    const idx = orders.findIndex((o) => o.id === orderId || o.logzzOrderId === orderId);
    if (idx < 0) return null;

    const existing = orders[idx];
    const nowIso = new Date().toISOString();

    let updatedHistory = existing.statusHistory;
    if (updates.status && updates.status !== existing.status) {
      updatedHistory = [
        ...existing.statusHistory,
        {
          status: updates.status,
          data: nowIso,
          origem: 'manual',
          observacao: updates.motivoCancelamento || updates.motivoFalha || updates.motivoReagendamento || 'Alteração manual no CRM'
        }
      ];
    }

    const updated: UpZapOrder = {
      ...existing,
      ...updates,
      statusHistory: updatedHistory,
      ultimaAtualizacao: nowIso
    };

    orders[idx] = this.computeDelayAlert(updated);
    this.saveAllOrders(orders);
    return orders[idx];
  }

  public getStats(): {
    total: number;
    agendado: number;
    emSeparacao: number;
    separado: number;
    emRota: number;
    cancelado: number;
    aReagendar: number;
    frustrado: number;
    completo: number;
    alertaAtraso: number;
    precisaAcompanhamentoHumano: number;
    valorTotalGeral: number;
  } {
    const orders = this.getAllOrders();

    const stats = {
      total: orders.length,
      agendado: 0,
      emSeparacao: 0,
      separado: 0,
      emRota: 0,
      cancelado: 0,
      aReagendar: 0,
      frustrado: 0,
      completo: 0,
      alertaAtraso: 0,
      precisaAcompanhamentoHumano: 0,
      valorTotalGeral: 0
    };

    for (const ord of orders) {
      stats.valorTotalGeral += ord.valorTotal || 0;

      switch (ord.status) {
        case 'Agendado': stats.agendado++; break;
        case 'Em Separação': stats.emSeparacao++; break;
        case 'Separado': stats.separado++; break;
        case 'Em Rota': stats.emRota++; break;
        case 'Cancelado': stats.cancelado++; break;
        case 'A Reagendar': stats.aReagendar++; break;
        case 'Frustrado': stats.frustrado++; break;
        case 'Completo': stats.completo++; break;
      }

      if (ord.alertaAtraso) stats.alertaAtraso++;
      if (ord.precisaAcompanhamentoHumano) stats.precisaAcompanhamentoHumano++;
    }

    return stats;
  }
}

export const ordersService = OrdersService.getInstance();
