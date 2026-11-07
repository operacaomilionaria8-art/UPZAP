/**
 * UpZap 24/7 Ecosystem Configuration for PM2
 *
 * Utilização na VPS:
 * 1. npm run build
 * 2. pm2 start ecosystem.config.cjs
 * 3. pm2 save
 * 4. pm2 startup
 */

module.exports = {
  apps: [
    {
      name: 'upzap-24-7',
      script: 'dist/server.cjs',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      exp_backoff_restart_delay: 1000,
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      time: true,
      error_file: './logs/upzap-error.log',
      out_file: './logs/upzap-out.log',
      merge_logs: true
    }
  ]
};
