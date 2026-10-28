import mongoose from 'mongoose';
import { config } from './config.js';
import { createApp } from './app.js';

async function main() {
  await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 8000 });
  console.log(`[db] connected ${config.mongoUri}`);
  const app = createApp();
  app.listen(config.port, '0.0.0.0', () => {
    console.log(`[api] listening on http://0.0.0.0:${config.port} (mode: ${config.aiProvider === 'none' || !config.aiApiKey ? 'rules-only' : 'ai-assisted'})`);
  });
}

main().catch((e) => { console.error('[fatal]', e.message); process.exit(1); });
