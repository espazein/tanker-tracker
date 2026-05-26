module.exports = {
  apps: [{
    name: 'tanker-tracker',
    script: 'server.js',
    instances: 1,          // keep at 1 — SQLite does not support concurrent writers
    autorestart: true,
    watch: false,
    max_memory_restart: '256M',
    env_production: {
      NODE_ENV: 'production',
      PORT: 3000
    }
  }]
};
