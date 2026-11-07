import React, { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  MessageSquare,
  Users,
  Zap,
  Workflow,
  FolderOpen,
  SquarePlay,
  Bot,
  Smartphone,
  Activity,
  ScrollText,
  Bell,
  DatabaseBackup,
  Settings,
  LogOut,
  X,
  ChevronLeft,
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
  Package
} from 'lucide-react';
import { getStoredUser } from '../lib/api';

export type MainNavId =
  | 'dashboard'
  | 'atendimentos'
  | 'pedidos'
  | 'clientes'
  | 'regras'
  | 'fluxos'
  | 'biblioteca'
  | 'simulador'
  | 'atendente'
  | 'conexao'
  | 'whatsapp'
  | 'monitoramento'
  | 'auditoria'
  | 'alertas'
  | 'backup'
  | 'configuracoes'
  // legados para compatibilidade
  | 'operacao'
  | 'automacao'
  | 'infraestrutura'
  | 'agentes';

interface SidebarProps {
  currentNav: MainNavId;
  setCurrentNav: (nav: MainNavId) => void;
  onLogout: () => void;
  isMobileOpen?: boolean;
  setIsMobileOpen?: (open: boolean) => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

interface NavSection {
  title: string;
  items: {
    id: MainNavId;
    label: string;
    icon: React.ElementType;
    match: MainNavId[];
  }[];
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentNav,
  setCurrentNav,
  onLogout,
  isMobileOpen = false,
  setIsMobileOpen,
  isCollapsed = false,
  onToggleCollapse
}) => {
  const [waConnected, setWaConnected] = useState<boolean>(false);
  const [waPhone, setWaPhone] = useState<string>('');

  useEffect(() => {
    const checkWaStatus = async () => {
      try {
        const res = await fetch('/api/whatsapp/status');
        if (res.ok) {
          const data = await res.json();
          setWaConnected(data?.state === 'connected');
          if (data?.number) setWaPhone(data.number);
        }
      } catch {
        // Silencioso
      }
    };

    checkWaStatus();
    const interval = setInterval(checkWaStatus, 20000); // 20 segundos
    return () => clearInterval(interval);
  }, []);

  const sections: NavSection[] = [
    {
      title: 'Principal',
      items: [
        { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, match: ['dashboard'] }
      ]
    },
    {
      title: 'Operação',
      items: [
        { id: 'atendimentos', label: 'Atendimentos', icon: MessageSquare, match: ['atendimentos', 'operacao', 'clientes'] },
        { id: 'pedidos', label: 'Pedidos (CRM)', icon: Package, match: ['pedidos'] }
      ]
    },
    {
      title: 'Automação',
      items: [
        { id: 'regras', label: 'Regras', icon: Zap, match: ['regras', 'automacao'] },
        { id: 'fluxos', label: 'Fluxos', icon: Workflow, match: ['fluxos'] },
        { id: 'biblioteca', label: 'Biblioteca', icon: FolderOpen, match: ['biblioteca'] },
        { id: 'simulador', label: 'Simulador', icon: SquarePlay, match: ['simulador'] }
      ]
    },
    {
      title: 'Infraestrutura',
      items: [
        { id: 'conexao', label: 'Conexão WhatsApp', icon: Smartphone, match: ['conexao', 'whatsapp', 'infraestrutura'] },
        { id: 'monitoramento', label: 'Central de Monitoramento', icon: Activity, match: ['monitoramento', 'auditoria', 'alertas'] }
      ]
    },
    {
      title: 'Configurações',
      items: [
        { id: 'backup', label: 'Backup', icon: DatabaseBackup, match: ['backup'] },
        { id: 'configuracoes', label: 'Geral', icon: Settings, match: ['configuracoes'] }
      ]
    }
  ];

  const handleNavClick = (id: MainNavId) => {
    setCurrentNav(id);
    if (setIsMobileOpen) setIsMobileOpen(false);
  };

  const isItemActive = (matches: MainNavId[]) => {
    return matches.includes(currentNav);
  };

  const sidebarContent = (
    <div className="flex h-full flex-col justify-between overflow-y-auto overflow-x-hidden">
      <div>
        {/* Header da Sidebar */}
        <div className={`flex items-center border-b border-sidebar-border py-4 transition-all ${
          isCollapsed ? 'justify-center px-2' : 'justify-between px-5'
        }`}>
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-xs font-bold text-primary-foreground shrink-0 shadow-sm">
              UZ
            </span>
            {!isCollapsed && (
              <span className="font-semibold tracking-tight text-sidebar-foreground">UpZap</span>
            )}
          </div>

          {/* Botão de recolher/expandir (desktop) */}
          {onToggleCollapse && (
            <button
              type="button"
              onClick={onToggleCollapse}
              title={isCollapsed ? 'Expandir barra lateral' : 'Recolher barra lateral'}
              className="hidden lg:flex p-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary rounded-lg transition-colors cursor-pointer"
            >
              {isCollapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
            </button>
          )}

          {setIsMobileOpen && (
            <button
              type="button"
              onClick={() => setIsMobileOpen(false)}
              className="lg:hidden p-1 text-muted-foreground hover:text-foreground rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Links de navegação agrupados */}
        <nav className={isCollapsed ? 'px-2 py-3' : 'px-3 py-4'}>
          {sections.map((section) => (
            <div key={section.title} className={isCollapsed ? 'mb-3' : 'mb-5'}>
              {!isCollapsed && (
                <p className="px-3 pb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
                  {section.title}
                </p>
              )}
              {isCollapsed && (
                <div className="h-[1px] bg-sidebar-border/60 mx-1 mb-2" />
              )}
              <ul className="flex flex-col gap-0.5">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  const active = isItemActive(item.match);
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => handleNavClick(item.id)}
                        title={item.label}
                        className={`flex w-full items-center rounded-lg transition-colors cursor-pointer ${
                          isCollapsed
                            ? 'justify-center p-2.5'
                            : 'gap-3 px-3 py-2 text-sm'
                        } ${
                          active
                            ? 'bg-primary text-primary-foreground font-medium shadow-xs'
                            : 'text-sidebar-foreground hover:bg-secondary hover:text-foreground'
                        }`}
                      >
                        <Icon className="h-[18px] w-[18px] shrink-0" />
                        {!isCollapsed && <span>{item.label}</span>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
      </div>

      {/* Rodapé: Indicador de WhatsApp + Usuário + Logout */}
      <div className={`border-t border-sidebar-border space-y-3 ${
        isCollapsed ? 'p-2' : 'px-5 py-4'
      }`}>
        <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'justify-between'}`}>
          <div
            title={waConnected ? `WhatsApp conectado${waPhone ? ` (+${waPhone})` : ''}` : 'WhatsApp desconectado'}
            className="flex items-center gap-2 text-xs text-muted-foreground"
          >
            {waConnected ? (
              <>
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
                </span>
                {!isCollapsed && <span className="text-foreground font-medium">Conectado</span>}
              </>
            ) : (
              <>
                <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/40" />
                {!isCollapsed && <span>Desconectado</span>}
              </>
            )}
          </div>
          {!isCollapsed && waPhone && <span className="text-[10px] font-mono text-muted-foreground">+{waPhone}</span>}
        </div>

        {(() => {
          const user = getStoredUser();
          if (!user) return null;
          return isCollapsed ? (
            <div
              title={`${user.name} (@${user.username}) - ${user.role}`}
              className="flex justify-center py-1"
            >
              <div className="h-7 w-7 rounded-full bg-primary/20 text-primary flex items-center justify-center text-[11px] font-bold shrink-0">
                {user.name ? user.name.charAt(0).toUpperCase() : 'U'}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between py-1.5 px-2 bg-sidebar-accent/50 rounded-lg text-xs">
              <div className="flex items-center gap-2 truncate">
                <div className="h-6 w-6 rounded-full bg-primary/20 text-primary flex items-center justify-center text-[10px] font-bold shrink-0">
                  {user.name ? user.name.charAt(0).toUpperCase() : 'U'}
                </div>
                <div className="truncate text-left">
                  <div className="text-[11px] font-semibold text-foreground truncate">{user.name}</div>
                  <div className="text-[9px] text-muted-foreground font-mono truncate">@{user.username}</div>
                </div>
              </div>
              <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-secondary text-muted-foreground shrink-0 font-medium">
                {user.role === 'admin' ? 'Admin' : 'Operador'}
              </span>
            </div>
          );
        })()}

        <button
          type="button"
          onClick={onLogout}
          title="Sair da conta"
          className={`flex w-full items-center text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer ${
            isCollapsed ? 'justify-center py-1.5' : 'gap-2 pt-1'
          }`}
        >
          <LogOut className="h-4 w-4 shrink-0" />
          {!isCollapsed && <span>Sair da conta</span>}
        </button>
      </div>
    </div>
  );

  return (
    <>
      <aside className={`hidden lg:flex shrink-0 border-r border-sidebar-border bg-sidebar flex-col min-h-screen sticky top-0 h-screen z-30 transition-all duration-200 ${
        isCollapsed ? 'w-16' : 'w-60'
      }`}>
        {sidebarContent}
      </aside>

      {isMobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div
            className="fixed inset-0 bg-black/80 backdrop-blur-xs"
            onClick={() => setIsMobileOpen && setIsMobileOpen(false)}
          />
          <aside className="relative w-64 max-w-[80vw] bg-sidebar border-r border-sidebar-border h-full flex flex-col z-10 shadow-2xl">
            {sidebarContent}
          </aside>
        </div>
      )}
    </>
  );
};
