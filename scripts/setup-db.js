import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import pg from 'pg';
import { resetCurrentDomainData } from '../server/currentDomainRepository.js';

dotenv.config();

const { Client } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

function splitStatements(sql) {
  return sql
    .split(';')
    .map((statement) => statement.trim())
    .filter(Boolean);
}

async function run() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is missing. Copy .env.example to .env and update it.');
  }

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    const schema = await readFile(path.join(rootDir, 'database', 'schema.sql'), 'utf8');
    const seed = await readFile(path.join(rootDir, 'database', 'seed.sql'), 'utf8');

    for (const statement of splitStatements(schema)) {
      await client.query(statement);
    }

    for (const statement of splitStatements(seed)) {
      await client.query(statement);
    }

    await resetCurrentDomainData(client);

    await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [path.join(rootDir, 'scripts', 'backfill-history.js')], {
        stdio: 'inherit',
        env: process.env
      });

      child.on('exit', (code) => {
        if (code === 0) {
          resolve();
          return;
        }
        reject(new Error(`History backfill failed with exit code ${code}.`));
      });

      child.on('error', reject);
    });

    console.log('Database schema and seed data loaded successfully.');
  } finally {
    await client.end();
  }
}

run().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
