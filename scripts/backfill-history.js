import dotenv from 'dotenv';
import pg from 'pg';
import { generateHistoryRange } from '../server/historyGenerator.js';
import { insertOperationalEvents, upsertDailyMetrics, upsertIngestionCheckpoint } from '../server/historyRepository.js';

dotenv.config();

const { Client } = pg;

async function run() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is missing. Copy .env.example to .env and update it.');
  }

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    const days = Number.parseInt(process.env.HISTORY_DAYS || '210', 10);
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - days * 86400000);
    const history = generateHistoryRange({ startDate, endDate });

    await client.query('begin');
    await client.query('delete from operational_events');
    await client.query('delete from shift_daily_metrics');
    await client.query('delete from ingestion_checkpoints');

    for (const daily of history.dailyMetrics) {
      await upsertDailyMetrics(client, daily);
    }

    await insertOperationalEvents(client, history.operationalEvents);
    await upsertIngestionCheckpoint(client, 'historical-backfill', new Date().toISOString(), history.operationalEvents.length);
    await client.query('commit');

    console.log(`Backfilled ${history.dailyMetrics.length} daily metric rows and ${history.operationalEvents.length} operational events.`);
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    await client.end();
  }
}

run().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
