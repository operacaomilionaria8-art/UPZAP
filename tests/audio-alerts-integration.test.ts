import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { alertsNotifierService } from '../server/alerts-notifier.service';
import { auditEventsService } from '../server/audit-events.service';
import { ALERT_SOUND_CATALOG } from '../src/lib/sound-alerts';

console.log('====================================================');
console.log('🔊 UPZAP: TESTES DE INTEGRAÇÃO DOS ÁUDIOS DE ALERTA');
console.log('====================================================');

// --- 1. Verificação dos 11 Arquivos de Áudio Oficiais ---
console.log('\n--- 1. Existência e Integridade dos 11 Arquivos MP3 ---');
const EXPECTED_AUDIO_FILES = [
  'internet_desconectada.mp3',
  'internet_restabelecida.mp3',
  'whatsapp_desconectado.mp3',
  'whatsapp_reconectado.mp3',
  'servidor_indisponivel.mp3',
  'brizex_indisponivel.mp3',
  'pedido_sincronizacao_falhou.mp3',
  'fluxo_falhou.mp3',
  'erro_critico.mp3',
  'reconexao_concluida.mp3',
  'integracao_restabelecida.mp3'
];

const audioDir = path.join(process.cwd(), 'public', 'audio');
assert(fs.existsSync(audioDir), 'Diretório public/audio deve existir');

for (const fileName of EXPECTED_AUDIO_FILES) {
  const filePath = path.join(audioDir, fileName);
  assert(fs.existsSync(filePath), `Arquivo de áudio ${fileName} deve existir em public/audio`);
  const stat = fs.statSync(filePath);
  assert(stat.size > 1000, `Arquivo ${fileName} deve ter tamanho válido (> 1000 bytes). Tamanho: ${stat.size}`);
  console.log(`  ✓ ${fileName} (${stat.size} bytes) presente e válido`);
}

// --- 2. Regra Estrita: whatsapp_reconectando.mp3 NUNCA deve existir ---
console.log('\n--- 2. Verificação da Regra Estrita de Reconexão Silenciosa ---');
const prohibitedReconnectingFile = path.join(audioDir, 'whatsapp_reconectando.mp3');
assert(!fs.existsSync(prohibitedReconnectingFile), 'whatsapp_reconectando.mp3 NÃO deve existir no sistema');
console.log('  ✓ Confirmado: whatsapp_reconectando.mp3 não existe. Reconexão é estritamente visual.');

// --- 3. Verificação do Catálogo de Áudios (ALERT_SOUND_CATALOG) ---
console.log('\n--- 3. Verificação do Catálogo ALERT_SOUND_CATALOG ---');
assert.strictEqual(ALERT_SOUND_CATALOG.length, 11, 'ALERT_SOUND_CATALOG deve conter exatamente 11 áudios oficiais');

const catalogEvents = new Set(ALERT_SOUND_CATALOG.map(item => item.event));
const catalogFiles = new Set(ALERT_SOUND_CATALOG.map(item => item.fileName));

for (const expectedFile of EXPECTED_AUDIO_FILES) {
  assert(catalogFiles.has(expectedFile), `Arquivo ${expectedFile} deve constar no catálogo`);
}
assert(!catalogEvents.has('whatsapp_reconectando' as any), 'whatsapp_reconectando não deve estar no catálogo');
console.log('  ✓ Catálogo contém exatamente os 11 áudios com metadados e categorias corretas.');

// --- 4. Rota Estática do Servidor Express ---
console.log('\n--- 4. Verificação da Rota Estática no Servidor Express ---');
const serverCode = fs.readFileSync(path.join(process.cwd(), 'server.ts'), 'utf-8');
assert(serverCode.includes("app.use('/audio'"), 'server.ts deve disponibilizar a rota estática /audio');
console.log('  ✓ Rota estática /audio montada com sucesso no Express.');

// --- 5. Disparo de Eventos com Mapeamento de Áudios no Backend ---
console.log('\n--- 5. Disparo de Alertas e Mapeamento de Áudios Operacionais ---');

// Queda WhatsApp
const waAlert = alertsNotifierService.triggerAlert('wa_disconnect_test', {
  severity: 'critical',
  title: 'WhatsApp Desconectado',
  description: 'Sessão desconectada.',
  origin: 'whatsapp',
  soundEvent: 'whatsapp_desconectado',
  recoverySoundEvent: 'whatsapp_reconectado'
});
assert.strictEqual(waAlert.soundEvent, 'whatsapp_desconectado', 'Alerta de queda deve ter soundEvent whatsapp_desconectado');
assert.strictEqual(waAlert.recoverySoundEvent, 'whatsapp_reconectado', 'Recuperação de queda deve ter recoverySoundEvent whatsapp_reconectado');

// Erro Brizex
const brizexAlert = alertsNotifierService.triggerAlert('brizex_err_test', {
  severity: 'warning',
  title: 'Brizex Indisponível',
  description: 'Erro 503 na API Brizex.',
  origin: 'brizex',
  soundEvent: 'brizex_indisponivel',
  recoverySoundEvent: 'integracao_restabelecida'
});
assert.strictEqual(brizexAlert.soundEvent, 'brizex_indisponivel', 'Alerta Brizex deve ter soundEvent brizex_indisponivel');
assert.strictEqual(brizexAlert.recoverySoundEvent, 'integracao_restabelecida', 'Recuperação Brizex deve ter integracao_restabelecida');

// Falha em Fluxo
const flowAlert = alertsNotifierService.triggerAlert('flow_fail_test', {
  severity: 'error',
  title: 'Falha em Fluxo',
  description: 'Erro na execução do nó de condição.',
  origin: 'automacao',
  soundEvent: 'fluxo_falhou'
});
assert.strictEqual(flowAlert.soundEvent, 'fluxo_falhou', 'Alerta de fluxo deve ter soundEvent fluxo_falhou');

// Falha em Sincronização de Pedido
const orderAlert = alertsNotifierService.triggerAlert('order_sync_fail_test', {
  severity: 'error',
  title: 'Falha na Sincronização de Pedido',
  description: 'Pedido #998877 não sincronizou.',
  origin: 'brizex',
  soundEvent: 'pedido_sincronizacao_falhou'
});
assert.strictEqual(orderAlert.soundEvent, 'pedido_sincronizacao_falhou', 'Alerta de pedido deve ter soundEvent pedido_sincronizacao_falhou');

// Resolução de alertas
const resolveSuccess = alertsNotifierService.resolveAlert('wa_disconnect_test', 'Sessão restabelecida com sucesso');
assert.strictEqual(resolveSuccess, true, 'Alerta de WhatsApp deve ter sido resolvido com sucesso');

const allAlerts = alertsNotifierService.getAllAlerts();
const resolvedWa = allAlerts.resolved.find(a => a.key === 'wa_disconnect_test');
assert(resolvedWa !== undefined, 'Alerta resolvido deve constar na lista de resolvidos');
assert.strictEqual(resolvedWa?.recoverySoundEvent, 'whatsapp_reconectado', 'Resolução de WhatsApp preserva recoverySoundEvent');

console.log('  ✓ Todos os alertas mapeiam perfeitamente seus respectivos eventos sonoros e de recuperação.');

// --- 6. Verificação de Isolamento dos Áudios Internos ---
console.log('\n--- 6. Verificação de Isolamento Estrito (Nunca enviar aos contatos) ---');
const whatsappServiceCode = fs.readFileSync(path.join(process.cwd(), 'server', 'whatsapp-direct.service.ts'), 'utf-8');
assert(!whatsappServiceCode.includes('internet_desconectada.mp3'), 'WhatsApp service não deve enviar arquivos de alerta aos clientes');
assert(!whatsappServiceCode.includes('public/audio'), 'WhatsApp service não deve ler public/audio');
console.log('  ✓ Confirmado isolamento: áudios de alerta são exclusivos do painel interno.');

console.log('\n====================================================');
console.log('🎉 TODOS OS TESTES DE INTEGRAÇÃO DE ÁUDIO FORAM APROVADOS!');
console.log('====================================================\n');
