import { authService } from '../server/auth.service';

const args = process.argv.slice(2);
const username = args[0] || process.env.ADMIN_USERNAME || 'admin';
const password = args[1] || process.env.ADMIN_PASSWORD || 'UpZap@2026!';

const existing = authService.getUserByUsernameOrEmail(username);
if (existing) {
  authService.resetAdminPassword(password);
  console.log(`\n[SUCESSO] Senha do administrador "${username}" foi atualizada com sucesso!\n`);
} else {
  const result = authService.createUser({
    name: 'Administrador UpZap',
    username,
    email: `${username}@upzap.com.br`,
    password,
    role: 'admin'
  });

  if (result.success) {
    console.log(`\n[SUCESSO] Conta de administrador "${username}" criada com sucesso!\n`);
  } else {
    console.error(`\n[ERRO] Falha ao criar administrador: ${result.error}\n`);
    process.exit(1);
  }
}
