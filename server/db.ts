import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from '../shared/schema.js';

const { Pool } = pg;

// Create a PostgreSQL connection pool using the DATABASE_URL
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Initialize Drizzle with our schema
export const db = drizzle(pool, { schema });