import React, { useState } from 'react';
import { ArrowRight, Lock, User, Eye, EyeOff, AlertCircle, Loader2 } from 'lucide-react';
import { setStoredAuth, AuthUser } from '../lib/api';

interface LoginViewProps {
  onLogin: (user: AuthUser) => void;
}

export const LoginView: React.FC<LoginViewProps> = ({ onLogin }) => {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier.trim() || !password) {
      setErrorMessage('Por favor, informe seu usuário/e-mail e senha.');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: identifier.trim(),
          password
        })
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setErrorMessage(data.error || 'Credenciais inválidas. Verifique os dados informados.');
        setIsLoading(false);
        return;
      }

      // Salva dados de autenticação
      setStoredAuth(data.token, data.user);
      onLogin(data.user);
    } catch (err: any) {
      console.error('[LoginView] Erro ao autenticar:', err);
      setErrorMessage('Falha ao conectar com o servidor. Tente novamente em instantes.');
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 font-sans text-foreground">
      <div className="w-full max-w-md bg-card border border-border rounded-2xl p-7 sm:p-8 shadow-xl space-y-6">
        {/* Logo Header */}
        <div className="text-center space-y-2">
          <div className="w-11 h-11 bg-primary text-primary-foreground rounded-xl flex items-center justify-center mx-auto font-black text-base shadow-xs">
            UZ
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground tracking-tight">UpZap</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Plataforma de Automação & Atendimento WhatsApp
            </p>
          </div>
        </div>

        {/* Mensagem de Erro */}
        {errorMessage && (
          <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-xl flex items-start gap-2.5 text-destructive text-xs animate-fadeIn">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="flex-1">{errorMessage}</div>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground block">
              Usuário ou E-mail
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-muted-foreground absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                required
                autoFocus
                placeholder="admin ou seu.email@exemplo.com"
                className="w-full bg-background border border-border rounded-xl pl-10 pr-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground block">
              Senha
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-muted-foreground absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="Digite sua senha de acesso"
                className="w-full bg-background border border-border rounded-xl pl-10 pr-10 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1 cursor-pointer transition-colors"
                title={showPassword ? 'Ocultar senha' : 'Exibir senha'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-xl text-sm transition-all flex items-center justify-center gap-2 cursor-pointer mt-3 shadow-xs disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Autenticando...</span>
              </>
            ) : (
              <>
                <span>Acessar Painel</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        <div className="pt-4 border-t border-border text-center space-y-1">
          <p className="text-[11px] text-muted-foreground">
            Acesso restrito &bull; Instância protegida UpZap
          </p>
          <p className="text-[10px] text-muted-foreground/70">
            Contas de equipe cadastradas pelo administrador
          </p>
        </div>
      </div>
    </div>
  );
};
