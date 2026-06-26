import dotenv from 'dotenv';
import { analyzeAiFailures } from '../server/aiFailureAnalyzer.js';

dotenv.config();

async function run() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is missing. Copy .env.example to .env and update it.');
  }

  const days = Math.max(1, Math.min(365, Number.parseInt(process.env.AI_GAP_LOOKBACK_DAYS ?? '30', 10) || 30));
  const minCount = Math.max(1, Number.parseInt(process.env.AI_GAP_MIN_COUNT ?? '2', 10) || 2);
  const gaps = await analyzeAiFailures({ days, minCount });

  console.log(`Analyzed AI failures for the last ${days} day(s).`);
  console.log(`Generated ${gaps.length} retrieval gap proposal(s).`);
  for (const gap of gaps) {
    console.log(`- ${gap.gap_key}: ${gap.failure_count} failure(s) across ${gap.example_queries.length} example query(ies).`);
  }
}

run().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
