require('dotenv').config({ path: require('path').join(__dirname, '.env') });

module.exports = {
  apps: [{
    name: 'tanker-tracker',
    script: 'server.js',
    instances: 1,             // keep at 1 — SQLite does not support concurrent writers
    autorestart: true,
    watch: false,
    max_memory_restart: '256M',
    env_production: {
      NODE_ENV:      'production',
      PORT:          process.env.PORT          || 3000,
      ADMIN_PIN:     process.env.ADMIN_PIN,
      SOCIETY_NAME:  process.env.SOCIETY_NAME  || 'My Society'
    }
  }]
};
