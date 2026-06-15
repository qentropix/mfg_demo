import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config();

const { Pool } = pg;

export const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL
    })
  : null;

export async function query(text, params = []) {
  if (!pool) {
    throw new Error('DATABASE_URL is not configured');
  }

  return pool.query(text, params);
}
