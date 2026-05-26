const fs   = require('fs');
const path = require('path');

// Parse .env manually — avoids depending on dotenv being in PM2's module scope
function loadEnv(envPath) {
  try {
    return Object.fromEntries(
      fs.readFileSync(envPath, 'utf8')
        .split('\n')
        .filter(l => l.trim() && !l.startsWith('#') && l.includes('='))
        .map(l => {
          const idx = l.indexOf('=');
          return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()];
        })
    );
  } catch { return {}; }
}

const env = loadEnv(path.join(__dirname, '.env'));

module.exports = {
  apps: [{
    name: 'tanker-tracker',
    script: 'server.js',
    instances: 1,             // keep at 1 — SQLite does not support concurrent writers
    autorestart: true,
    watch: false,
    max_memory_restart: '256M',
    env_production: {
      NODE_ENV:     'production',
      PORT:         env.PORT         || 3000,
      ADMIN_PIN:    env.ADMIN_PIN,
      SOCIETY_NAME: env.SOCIETY_NAME || 'My Society'
    }
  }]
};
