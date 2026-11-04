// PROTO HOSTING BOT — pm2 process definition
// Start with:  pm2 start ecosystem.config.cjs && pm2 save
module.exports = {
  apps: [
    {
      name: "proto-hosting-bot",
      script: "src/index.js",
      cwd: __dirname,
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      max_memory_restart: "512M",
      env: {
        NODE_ENV: "production",
      },
      out_file: "./logs/pm2-out.log",
      error_file: "./logs/pm2-err.log",
      time: true,
    },
  ],
};
