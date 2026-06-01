// pm2 config for the rnp backend on odin.
// cwd is the repo/deploy root (~/rnp) so dotenv (loaded in src/config/env.js)
// reads ~/rnp/.env. Node resolves modules from the script's own backend/node_modules.
module.exports = {
  apps: [{
    name: 'rnp-backend',
    cwd: '/home/admin/rnp',
    script: 'backend/src/server.js',
    instances: 1,
    autorestart: true,
    max_memory_restart: '300M',
    env: { NODE_ENV: 'production' },
  }],
};
