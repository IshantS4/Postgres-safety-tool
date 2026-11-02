import 'dotenv/config';
import pg from 'pg';

export const targetPool = new pg.Pool({
  user: process.env.TARGET_DB_USER,
  password: process.env.TARGET_DB_PASSWORD,
  host: process.env.TARGET_DB_HOST,
  port: Number(process.env.TARGET_DB_PORT),
  database: process.env.TARGET_DB_NAME,
});

export const controlPool = new pg.Pool({
  user: process.env.CONTROL_DB_USER,
  password: process.env.CONTROL_DB_PASSWORD,
  host: process.env.CONTROL_DB_HOST,
  port: Number(process.env.CONTROL_DB_PORT),
  database: process.env.CONTROL_DB_NAME,
});

targetPool.query('SELECT NOW()').then(() => console.log("✅ Target DB Connected!"));
controlPool.query('SELECT NOW()').then(() => console.log("✅ Control DB Connected!"));