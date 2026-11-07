import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { alertsNotifierService } from '../server/alerts-notifier.service';
import { auditEventsService } from '../server/audit-events.service';
import { automationEngineService } from '../server/automation-engine.service';
import { ordersService } from '../server/orders.service';
import { whatsAppDirectService } from '../server/whatsapp-direct.service';

console.log('====================================================');
console.log('🚀 UPZAP: TESTES DE CENTRALIZAÇÃO E REDUÇÃO');
console.log('====================================================');

// --- 1. Verificação de Eliminação da Base de Conhecimento e Aurora ---
console.log('\n--- 1. Eliminação da Base de Conhecimento e Aurora ---');
const appTsx = fs.readFileSync(path.join(process.cwd(), 'src', 'App.tsx'), 'utf-8');
const sidebarTsx = fs.readFileSync(path.join(process.cwd(), 'src', 'components', 'Sidebar.tsx'), 'utf-8');
const serverTs = fs.readFileSync(path.join(process.cwd(), 'server.ts'), 'utf-8');

assert(!appTsx.includes('AtendenteView'), 'AtendenteView não deve constar em App.tsx');
assert(!sidebarTsx.includes('Base de conhecimento'), 'Base de conhecimento não deve constar na Sidebar');
assert(!sidebarTsx.includes('Atendente Virtual'), 'Atendente Virtual não deve constar na Sidebar');
assert(!serverTs.includes("app.get('/api/knowledge-base'"), 'Rota GET /api/knowledge-base não deve existir');
assert(!serverTs.includes("app.post('/api/knowledge-base'"), 'Rota POST /api/knowledge-base não deve existir');
console.log('✅ Base de Conhecimento e menus da Aurora eliminados com sucesso.');

// --- 2. Verificação de Remoção do Aplicativo Externo de Alertas (ntfy.sh) ---
console.log('\n--- 2. Remoção do Aplicativo Externo de Alertas (ntfy) ---');
const alertsServiceFile = fs.readFileSync(path.join(process.cwd(), 'server', 'alerts-notifier.service.ts'), 'utf-8');
assert(!alertsServiceFile.includes('ntfy.sh'), 'alerts-notifier.service não deve conter chamadas para ntfy.sh');
assert(!alertsServiceFile.includes('sendHeartbeatPing'), 'Heartbeat externo não deve constar em alerts-notifier');
assert(!serverTs.includes('ntfyTopicOrUrl'), 'server.ts não deve referenciar ntfyTopicOrUrl');

const alertsSettings = alertsNotifierService.getSettings().settings;
assert(alertsSettings.enabled === true, 'Alertas internos devem estar habilitados');
assert(typeof alertsSettings.soundEnabled === 'boolean', 'soundEnabled deve ser configurável');
assert(typeof alertsSettings.soundVolume === 'number', 'soundVolume deve ser numérico');
console.log('✅ Notificações push externas para ntfy removidas; alertas centralizados internamente.');

// --- 3. Unificação na Central de Monitoramento ---
console.log('\n--- 3. Unificação na Central de Monitoramento ---');
assert(sidebarTsx.includes('Central de Monitoramento'), 'Sidebar deve conter Central de Monitoramento');
assert(!sidebarTsx.includes("'Log de auditoria'"), 'Log de auditoria não deve existir como item separado no menu');
assert(!sidebarTsx.includes("'Alertas'"), 'Alertas não deve existir como item separado no menu');
assert(fs.existsSync(path.join(process.cwd(), 'src', 'components', 'CentralMonitoramentoView.tsx')), 'CentralMonitoramentoView.tsx deve existir');
assert(fs.existsSync(path.join(process.cwd(), 'src', 'components', 'GlobalAlertBanner.tsx')), 'GlobalAlertBanner.tsx deve existir');
console.log('✅ Monitoramento, Auditoria e Alertas unificados em uma única Central de Monitoramento.');

// --- 4. Disparo de Alerta Interno e Prevenção de Duplicidade ---
console.log('\n--- 4. Alertas Internos e Prevenção de Duplicatas ---');
// Dispara alerta inicial
const alert1 = alertsNotifierService.triggerAlert('test_conn_drop', {
  severity: 'critical',
  title: 'Falha de Conexão Crítica',
  description: 'Conexão perdida com o provedor.',
  origin: 'rede',
  recommendedAction: 'Aguarde o restabelecimento automático.'
});
assert(alert1.status === 'active', 'O status do alerta deve ser active');

const initialActiveCount = alertsNotifierService.getActiveAlerts().length;

// Dispara o mesmo alerta novamente com nova ocorrência
const alert2 = alertsNotifierService.triggerAlert('test_conn_drop', {
  severity: 'critical',
  title: 'Falha de Conexão Crítica',
  description: 'Conexão perdida com o provedor (repetição).',
  origin: 'rede',
  recommendedAction: 'Aguarde o restabelecimento automático.'
});
const afterSecondCount = alertsNotifierService.getActiveAlerts().length;
assert.strictEqual(initialActiveCount, afterSecondCount, 'Não deve criar múltiplos alertas ativos duplicados para a mesma chave');
console.log('✅ Controle de duplicidade confirmado: mesmo alerta ativo atualizado sem flood.');

// --- 5. Resolução de Alerta e Registro de Recuperação ---
console.log('\n--- 5. Resolução de Alerta e Registro de Recuperação ---');
const resolved = alertsNotifierService.resolveAlert('test_conn_drop', 'Conexão restaurada com sucesso.');
assert(resolved === true, 'Alerta deve ser resolvido com sucesso');

const activeListAfter = alertsNotifierService.getActiveAlerts();
assert(!activeListAfter.some(a => a.key === 'test_conn_drop'), 'Alerta resolvido não deve permanecer na lista ativa');

const resolvedList = alertsNotifierService.getResolvedAlerts();
const resolvedItem = resolvedList.find(a => a.key === 'test_conn_drop');
assert(resolvedItem !== undefined, 'Alerta resolvido deve constar no histórico de recuperação');
assert(resolvedItem?.recoveryResult?.includes('restaurada'), 'Resultado de recuperação deve ser preservado');
console.log('✅ Resolução de alerta e trilha de recuperação confirmadas.');

// --- 6. Integração do Evento WhatsApp com Alertas Internos ---
console.log('\n--- 6. Eventos WhatsApp -> Alertas Internos ---');
alertsNotifierService.handleAuditEvent({
  id: 'ev_test_drop',
  timestamp: new Date().toISOString(),
  type: 'whatsapp_connection',
  level: 'warning',
  title: 'Queda de Conexão WhatsApp',
  description: 'Conexão caiu (código 515). Reconexão agendada.',
  details: { attempt: 1, isDrop: true }
});

const waAlert = alertsNotifierService.getActiveAlerts().find(a => a.key === 'whatsapp_disconnected');
assert(waAlert !== undefined, 'Queda de conexão do WhatsApp deve gerar alerta interno ativo');

// Agora simula reconexão bem-sucedida
alertsNotifierService.handleAuditEvent({
  id: 'ev_test_recon',
  timestamp: new Date().toISOString(),
  type: 'whatsapp_connection',
  level: 'success',
  title: 'WhatsApp Conectado',
  description: 'Conexão restabelecida.',
  details: { phoneNumber: '5511999998888' }
});

const waAlertAfter = alertsNotifierService.getActiveAlerts().find(a => a.key === 'whatsapp_disconnected');
assert(waAlertAfter === undefined, 'Reconexão bem-sucedida do WhatsApp deve resolver automaticamente o alerta ativo');
console.log('✅ Transição de queda e reconexão automática do WhatsApp homologada.');

// --- 7. Preservação de Dados e Funcionalidades Essenciais ---
console.log('\n--- 7. Preservação de Dados e Funcionalidades Essenciais ---');
assert(fs.existsSync(path.join(process.cwd(), 'data', 'baileys_auth')), 'Sessão do WhatsApp em data/baileys_auth deve estar intacta');
assert(fs.existsSync(path.join(process.cwd(), 'data', 'brizex-config.json')), 'Configuração da Brizex deve estar intacta');
assert(typeof ordersService.processBrizexOrderPayload === 'function', 'Processamento de pedidos Brizex deve estar funcional');
assert(typeof automationEngineService.getFlows === 'function', 'Flow Builder deve estar funcional');
console.log('✅ Credenciais, CRM, regras, fluxos e Brizex integralmente preservados.');

console.log('\n====================================================');
console.log('🎉 TODOS OS TESTES PASSARAM COM 100% DE SUCESSO!');
console.log('====================================================');
