// PM2 process definition for the PartPilot API (which also serves the built SPA).
// Start from the repo root:  pm2 start ecosystem.config.cjs
module.exports = {
  apps: [
    {
      name: "partpilot",
      cwd: "./server",           // so dotenv loads server/.env and paths resolve
      script: "src/index.js",
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      env: { NODE_ENV: "production" },
    },
  ],
};
