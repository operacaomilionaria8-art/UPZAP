import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export interface User {
  id: string;
  name: string;
  username: string;
  email: string;
  role: 'admin' | 'operator';
  passwordHash: string;
  salt: string;
  createdAt: string;
  lastLoginAt?: string;
}

export interface SafeUser {
  id: string;
  name: string;
  username: string;
  email: string;
  role: 'admin' | 'operator';
  createdAt: string;
  lastLoginAt?: string;
}

export interface TokenPayload {
  id: string;
  username: string;
  email: string;
  name: string;
  role: 'admin' | 'operator';
  exp?: number;
  iat?: number;
}

class AuthService {
  private usersFile: string;
  private users: User[] = [];
  private jwtSecret: string;

  constructor() {
    const dataDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    this.usersFile = path.join(dataDir, 'users.json');
    this.jwtSecret = process.env.JWT_SECRET || 'upzap_super_secret_jwt_key_2026_production_guard';
    this.loadUsers();
    this.ensureAdminUser();
  }

  private loadUsers(): void {
    try {
      if (fs.existsSync(this.usersFile)) {
        const raw = fs.readFileSync(this.usersFile, 'utf-8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          this.users = parsed;
          return;
        }
      }
    } catch (err) {
      console.error('[AuthService] Erro ao carregar users.json:', err);
    }
    this.users = [];
  }

  private saveUsers(): void {
    try {
      fs.writeFileSync(this.usersFile, JSON.stringify(this.users, null, 2), 'utf-8');
    } catch (err) {
      console.error('[AuthService] Erro ao salvar users.json:', err);
    }
  }

  public hashPassword(password: string, salt?: string): { hash: string; salt: string } {
    const generatedSalt = salt || crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(password, generatedSalt, 100000, 64, 'sha512').toString('hex');
    return { hash, salt: generatedSalt };
  }

  public verifyPassword(password: string, hash: string, salt: string): boolean {
    try {
      const calculatedHash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
      return crypto.timingSafeEqual(Buffer.from(calculatedHash, 'hex'), Buffer.from(hash, 'hex'));
    } catch {
      return false;
    }
  }

  public createToken(user: SafeUser, expiresInSeconds = 7 * 24 * 3600): string {
    const header = { alg: 'HS256', typ: 'JWT' };
    const now = Math.floor(Date.now() / 1000);
    const exp = now + expiresInSeconds;
    const payload: TokenPayload = {
      id: user.id,
      username: user.username,
      email: user.email,
      name: user.name,
      role: user.role,
      iat: now,
      exp
    };

    const b64Header = Buffer.from(JSON.stringify(header)).toString('base64url');
    const b64Payload = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = crypto.createHmac('sha256', this.jwtSecret)
      .update(`${b64Header}.${b64Payload}`)
      .digest('base64url');

    return `${b64Header}.${b64Payload}.${signature}`;
  }

  public verifyToken(token: string): TokenPayload | null {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return null;
      const [b64Header, b64Payload, signature] = parts;
      const expected = crypto.createHmac('sha256', this.jwtSecret)
        .update(`${b64Header}.${b64Payload}`)
        .digest('base64url');

      if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
        return null;
      }

      const payload: TokenPayload = JSON.parse(Buffer.from(b64Payload, 'base64url').toString('utf-8'));
      if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
        return null; // Token expirado
      }
      return payload;
    } catch {
      return null;
    }
  }

  public ensureAdminUser(): void {
    if (this.users.length > 0) {
      return;
    }

    const username = process.env.ADMIN_USERNAME || 'admin';
    const email = process.env.ADMIN_EMAIL || 'admin@upzap.com.br';
    const envPassword = process.env.ADMIN_PASSWORD;

    let initialPassword = envPassword;
    let isGenerated = false;

    if (!initialPassword) {
      // Gera senha segura e legível de 12 caracteres caso não informada em env
      const randomHex = crypto.randomBytes(4).toString('hex');
      initialPassword = `UpZap#${randomHex}9`;
      isGenerated = true;
    }

    const { hash, salt } = this.hashPassword(initialPassword);

    const adminUser: User = {
      id: `usr_${Date.now()}_admin`,
      name: 'Administrador UpZap',
      username: username.toLowerCase().trim(),
      email: email.toLowerCase().trim(),
      role: 'admin',
      passwordHash: hash,
      salt,
      createdAt: new Date().toISOString()
    };

    this.users.push(adminUser);
    this.saveUsers();

    // Salva arquivo com aviso inicial para referência caso tenha sido gerada aleatoriamente
    try {
      const credsPath = path.join(process.cwd(), 'data', 'initial_credentials.txt');
      const credsContent = [
        '=====================================================',
        'UPZAP - CREDENCIAIS DE ACESSO INICIAL (ADMINISTRADOR)',
        '=====================================================',
        `Usuário: ${adminUser.username}`,
        `E-mail: ${adminUser.email}`,
        `Senha Inicial: ${initialPassword}`,
        `Criado em: ${adminUser.createdAt}`,
        '',
        'Observação: Você pode alterar esta senha e gerenciar outros',
        'usuários diretamente no painel em Configurações > Equipe.',
        '====================================================='
      ].join('\n');
      fs.writeFileSync(credsPath, credsContent, 'utf-8');
    } catch (e) {
      console.warn('[AuthService] Erro ao escrever initial_credentials.txt:', e);
    }

    console.log('\n╔══════════════════════════════════════════════════════════════════╗');
    console.log('║               UPZAP - CONTA ADMINISTRADOR CRIADA                 ║');
    console.log('╠══════════════════════════════════════════════════════════════════╣');
    console.log(`║ Usuário:  ${adminUser.username.padEnd(52)} ║`);
    console.log(`║ E-mail:   ${adminUser.email.padEnd(52)} ║`);
    console.log(`║ Senha:    ${initialPassword.padEnd(52)} ║`);
    if (isGenerated) {
      console.log('║ (Gerada automaticamente — salva em data/initial_credentials.txt) ║');
    } else {
      console.log('║ (Definida via variável de ambiente ADMIN_PASSWORD)               ║');
    }
    console.log('╚══════════════════════════════════════════════════════════════════╝\n');
  }

  public toSafeUser(user: User): SafeUser {
    return {
      id: user.id,
      name: user.name,
      username: user.username,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt
    };
  }

  public getUsers(): SafeUser[] {
    return this.users.map((u) => this.toSafeUser(u));
  }

  public getUserById(id: string): User | undefined {
    return this.users.find((u) => u.id === id);
  }

  public getUserByUsernameOrEmail(identifier: string): User | undefined {
    const clean = identifier.toLowerCase().trim();
    return this.users.find((u) => u.username === clean || u.email === clean);
  }

  public authenticate(identifier: string, password: string): SafeUser | null {
    const user = this.getUserByUsernameOrEmail(identifier);
    if (!user) return null;

    const isValid = this.verifyPassword(password, user.passwordHash, user.salt);
    if (!isValid) return null;

    user.lastLoginAt = new Date().toISOString();
    this.saveUsers();
    return this.toSafeUser(user);
  }

  public createUser(data: {
    name: string;
    username: string;
    email: string;
    password: string;
    role?: 'admin' | 'operator';
  }): { success: boolean; user?: SafeUser; error?: string } {
    const username = data.username.toLowerCase().trim();
    const email = data.email.toLowerCase().trim();

    if (!username || !data.password || !data.name) {
      return { success: false, error: 'Nome, usuário e senha são obrigatórios.' };
    }

    if (data.password.length < 6) {
      return { success: false, error: 'A senha deve ter pelo menos 6 caracteres.' };
    }

    if (this.users.some((u) => u.username === username)) {
      return { success: false, error: 'Este nome de usuário já está em uso.' };
    }

    if (email && this.users.some((u) => u.email === email)) {
      return { success: false, error: 'Este e-mail já está cadastrado.' };
    }

    const { hash, salt } = this.hashPassword(data.password);

    const newUser: User = {
      id: `usr_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
      name: data.name.trim(),
      username,
      email: email || `${username}@upzap.local`,
      role: data.role === 'admin' ? 'admin' : 'operator',
      passwordHash: hash,
      salt,
      createdAt: new Date().toISOString()
    };

    this.users.push(newUser);
    this.saveUsers();

    return { success: true, user: this.toSafeUser(newUser) };
  }

  public deleteUser(id: string, currentUserId: string): { success: boolean; error?: string } {
    if (id === currentUserId) {
      return { success: false, error: 'Você não pode excluir sua própria conta.' };
    }

    const targetUser = this.getUserById(id);
    if (!targetUser) {
      return { success: false, error: 'Usuário não encontrado.' };
    }

    // Se for admin, certificar que existe pelo menos outro admin
    if (targetUser.role === 'admin') {
      const adminCount = this.users.filter((u) => u.role === 'admin').length;
      if (adminCount <= 1) {
        return { success: false, error: 'Não é possível remover o único administrador do sistema.' };
      }
    }

    this.users = this.users.filter((u) => u.id !== id);
    this.saveUsers();
    return { success: true };
  }

  public changePassword(
    userId: string,
    currentPass: string,
    newPass: string
  ): { success: boolean; error?: string } {
    const user = this.getUserById(userId);
    if (!user) return { success: false, error: 'Usuário não encontrado.' };

    if (!this.verifyPassword(currentPass, user.passwordHash, user.salt)) {
      return { success: false, error: 'Senha atual incorreta.' };
    }

    if (newPass.length < 6) {
      return { success: false, error: 'A nova senha deve ter no mínimo 6 caracteres.' };
    }

    const { hash, salt } = this.hashPassword(newPass);
    user.passwordHash = hash;
    user.salt = salt;
    this.saveUsers();

    return { success: true };
  }

  public resetAdminPassword(newPassword: string): boolean {
    const admin = this.users.find((u) => u.role === 'admin');
    if (!admin) return false;

    const { hash, salt } = this.hashPassword(newPassword);
    admin.passwordHash = hash;
    admin.salt = salt;
    this.saveUsers();
    return true;
  }
}

export const authService = new AuthService();
