import { existsSync } from 'node:fs';
import { createApp } from './app';

if (existsSync('.env')) process.loadEnvFile('.env');

const port = Number(process.env['PORT'] ?? 3210);

createApp().listen(port, () => {
  console.info(`StockPilot is running at http://localhost:${port}`);
});
