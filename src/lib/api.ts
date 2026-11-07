// Gerenciamento seguro de autenticação e sessão do UpZap

export interface AuthUser {
  id: string;
  name: string;
  username: string;
  email: string;
  role: 'admin' | 'operator';
}

const TOKEN_KEY = 'upzap_token';
const USER_KEY = 'upzap_user';

export function getStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function getStoredUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setStoredAuth(token: string, user: AuthUser): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  } catch (e) {
    console.warn('[Auth] Erro ao gravar localStorage:', e);
  }

  try {
    if (typeof document !== 'undefined') {
      document.cookie = `upzap_token=${encodeURIComponent(token)}; path=/; max-age=${7 * 24 * 3600}; SameSite=Lax`;
    }
  } catch (e) {
    console.warn('[Auth] Erro ao gravar cookie:', e);
  }
}

export function clearStoredAuth(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  } catch (e) {
    console.warn('[Auth] Erro ao limpar localStorage:', e);
  }

  try {
    if (typeof document !== 'undefined') {
      document.cookie = 'upzap_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax';
    }
  } catch (e) {
    console.warn('[Auth] Erro ao limpar cookie:', e);
  }
}

/**
 * Utilitário para chamadas de API autenticadas com injeção automática de Bearer Token
 * e tratamento seguro de expiração de sessão.
 */
export async function authFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const token = getStoredToken();
  const modifiedInit: RequestInit = init ? { ...init } : {};

  if (token) {
    const headers = new Headers(modifiedInit.headers || (typeof input === 'object' && 'headers' in input ? (input as any).headers : undefined) || {});
    if (!headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    modifiedInit.headers = headers;
  }

  const response = await fetch(input, modifiedInit);

  if (response.status === 401) {
    const url = typeof input === 'string' ? input : (input instanceof URL ? input.href : (input as any).url || '');
    if (!url.includes('/api/auth/login')) {
      clearStoredAuth();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('upzap_unauthorized'));
      }
    }
  }

  return response;
}
