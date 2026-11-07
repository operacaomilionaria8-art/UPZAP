import React, { useState, useEffect } from 'react';
import { Sidebar, MainNavId } from './components/Sidebar';
import { RealHeader } from './components/RealHeader';
import { LoginView } from './components/LoginView';
import { DashboardView } from './components/DashboardView';
import { ConversationsManagerView } from './components/ConversationsManagerView';
import { PedidosView } from './components/PedidosView';
import { RegrasView } from './components/RegrasView';
import { FlowBuilderView } from './components/FlowBuilderView';
import { BibliotecaView } from './components/BibliotecaView';
import { SimuladorView } from './components/SimuladorView';
import { WhatsappView } from './components/WhatsappView';
import { CentralMonitoramentoView } from './components/CentralMonitoramentoView';
import { GlobalAlertBanner } from './components/GlobalAlertBanner';
import { BackupView } from './components/BackupView';
import { ConfiguracoesView } from './components/ConfiguracoesView';
import { SystemAlertsProvider } from './context/SystemAlertsContext';

import { defaultBaseUpZap } from './data/defaultBase';
import { BaseOficialUpZap } from './types/upzap';
import { getStoredToken, getStoredUser, clearStoredAuth, AuthUser, authFetch } from './lib/api';

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => Boolean(getStoredToken()));
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(() => getStoredUser());

  useEffect(() => {
    const token = getStoredToken();
    if (!token) {
      setIsAuthenticated(false);
      return;
    }

    // Valida token com o backend
    authFetch('/api/auth/me')
      .then((r) => {
        if (!r.ok) throw new Error('Não autorizado');
        return r.json();
      })
      .then((data) => {
        if (data.success && data.user) {
          setCurrentUser(data.user);
          setIsAuthenticated(true);
        } else {
          clearStoredAuth();
          setIsAuthenticated(false);
        }
      })
      .catch(() => {
        clearStoredAuth();
        setIsAuthenticated(false);
      });

    const handleUnauthorized = () => {
      clearStoredAuth();
      setCurrentUser(null);
      setIsAuthenticated(false);
    };

    window.addEventListener('upzap_unauthorized', handleUnauthorized);
    return () => window.removeEventListener('upzap_unauthorized', handleUnauthorized);
  }, []);

  const handleLogout = async () => {
    try {
      await authFetch('/api/auth/logout', { method: 'POST' });
    } catch {}
    clearStoredAuth();
    setCurrentUser(null);
    setIsAuthenticated(false);
  };

  const [base, setBase] = useState<BaseOficialUpZap>(() => {
    const saved = localStorage.getItem('upzap_base_oficial');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error('Error loading saved base:', e);
      }
    }
    return defaultBaseUpZap;
  });

  // Estado principal de navegação com todas as páginas do v0
  const [currentNav, setCurrentNav] = useState<MainNavId>(() => {
    const saved = localStorage.getItem('upzap_main_nav');
    if (saved) {
      return saved as MainNavId;
    }
    return 'dashboard';
  });

  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);

  useEffect(() => {
    localStorage.setItem('upzap_base_oficial', JSON.stringify(base));
  }, [base]);

  useEffect(() => {
    localStorage.setItem('upzap_main_nav', currentNav);
    // Recolhe automaticamente a barra lateral ao entrar no Flow Builder para máxima área de trabalho
    if (currentNav === 'fluxos') {
      setIsSidebarCollapsed(true);
    }
  }, [currentNav]);

  const handleReset = () => {
    setBase(defaultBaseUpZap);
    localStorage.removeItem('upzap_base_oficial');
    localStorage.removeItem('upzap_rules_list');
    localStorage.removeItem('upzap_agents_list');
    localStorage.removeItem('upzap_library_files');
    localStorage.removeItem('upzap_flow_nodes');

    fetch('/api/automation/reset', { method: 'POST' })
      .then(() => {
        window.dispatchEvent(new CustomEvent('upzap_library_updated'));
      })
      .catch((err) => console.error('Erro ao resetar backend:', err));
  };

  const handleNavigate = (target: MainNavId) => {
    setCurrentNav(target);
  };

  if (!isAuthenticated) {
    return (
      <LoginView
        onLogin={(user) => {
          setCurrentUser(user);
          setIsAuthenticated(true);
        }}
      />
    );
  }

  // Título canônico do Header para cada view
  const getHeaderTitle = () => {
    switch (currentNav) {
      case 'dashboard':
        return 'Visão geral';
      case 'atendimentos':
      case 'operacao':
        return 'Atendimentos';
      case 'pedidos':
        return 'Pedidos (CRM)';
      case 'clientes':
        return 'Clientes';
      case 'regras':
      case 'automacao':
        return 'Regras';
      case 'fluxos':
        return 'Flow Builder';
      case 'biblioteca':
        return 'Biblioteca';
      case 'simulador':
        return 'Simulador';
      case 'conexao':
      case 'whatsapp':
      case 'infraestrutura':
        return 'Conexão WhatsApp';
      case 'monitoramento':
      case 'auditoria':
      case 'alertas':
        return 'Central de Monitoramento';
      case 'backup':
        return 'Backup';
      case 'configuracoes':
        return 'Geral';
      default:
        return 'UpZap';
    }
  };

  const isFlowsView = currentNav === 'fluxos';

  return (
    <SystemAlertsProvider>
      <div className="flex min-h-screen bg-background text-foreground antialiased selection:bg-primary/20 selection:text-primary">
        {/* Menu Lateral Fixo com suporte a recolhimento */}
        <Sidebar
          currentNav={currentNav}
          setCurrentNav={handleNavigate}
          onLogout={handleLogout}
          isMobileOpen={isMobileOpen}
          setIsMobileOpen={setIsMobileOpen}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={() => setIsSidebarCollapsed((prev) => !prev)}
        />

        {/* Área Principal de Conteúdo */}
        <div className={`flex flex-1 flex-col min-w-0 ${isFlowsView ? 'h-screen overflow-hidden' : 'min-h-screen'}`}>
          {/* Alerta Global Superior para Falhas Críticas e Desconexões */}
          <GlobalAlertBanner onNavigateToMonitoring={() => handleNavigate('monitoramento')} />

          {/* Header Padronizado v0 (oculto na aba de Fluxo para maximizar 100% da tela) */}
          {!isFlowsView && (
            <RealHeader
              title={getHeaderTitle()}
              onOpenMobileMenu={() => setIsMobileOpen(true)}
            />
          )}

          {/* Views Reais Renderizadas */}
          <main className={isFlowsView ? 'flex-1 p-0 overflow-hidden relative flex flex-col h-screen' : 'flex-1 px-4 py-6 md:px-8 md:py-8 overflow-y-auto'}>
            {currentNav === 'dashboard' && (
              <DashboardView base={base} onNavigate={handleNavigate} />
            )}

            {(currentNav === 'atendimentos' || currentNav === 'operacao' || currentNav === 'clientes') && (
              <ConversationsManagerView />
            )}

            {currentNav === 'pedidos' && (
              <PedidosView onNavigateToTab={handleNavigate} />
            )}

            {(currentNav === 'regras' || currentNav === 'automacao') && (
              <RegrasView base={base} onNavigateToFlows={() => handleNavigate('fluxos')} />
            )}

            {currentNav === 'fluxos' && (
              <FlowBuilderView
                onNavigateToRules={() => handleNavigate('regras')}
                onNavigateToLibrary={() => handleNavigate('biblioteca')}
                isSidebarCollapsed={isSidebarCollapsed}
                onToggleSidebar={() => setIsSidebarCollapsed((prev) => !prev)}
              />
            )}

            {currentNav === 'biblioteca' && (
              <BibliotecaView base={base} onNavigateToFlows={() => handleNavigate('fluxos')} />
            )}

            {currentNav === 'simulador' && (
              <SimuladorView base={base} />
            )}

            {(currentNav === 'conexao' || currentNav === 'whatsapp' || currentNav === 'infraestrutura') && (
              <WhatsappView base={base} />
            )}

            {(currentNav === 'monitoramento' || currentNav === 'auditoria' || currentNav === 'alertas') && (
              <CentralMonitoramentoView onNavigateToTab={handleNavigate} />
            )}

            {currentNav === 'backup' && (
              <BackupView />
            )}

            {currentNav === 'configuracoes' && (
              <ConfiguracoesView
                base={base}
                currentUser={currentUser}
                onReset={handleReset}
                onNavigateToTab={handleNavigate}
              />
            )}
          </main>
        </div>
      </div>
    </SystemAlertsProvider>
  );
}
