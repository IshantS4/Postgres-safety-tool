import 'dotenv/config';
import pg from 'pg';

// 1. Target DB Connection (Jahan AI kaam karega)
export const targetPool = new pg.Pool({
  user: process.env.TARGET_DB_USER,
  password: process.env.TARGET_DB_PASSWORD,
  host: process.env.TARGET_DB_HOST,
  port: Number(process.env.TARGET_DB_PORT),
  database: process.env.TARGET_DB_NAME,
});

// 2. Control DB Connection (Tera secure vault)
export const controlPool = new pg.Pool({
  user: process.env.CONTROL_DB_USER,
  password: process.env.CONTROL_DB_PASSWORD,
  host: process.env.CONTROL_DB_HOST,
  port: Number(process.env.CONTROL_DB_PORT),
  database: process.env.CONTROL_DB_NAME,
});

// Connection Test
targetPool.query('SELECT NOW()').then(() => console.log("✅ Target DB Connected!"));
controlPool.query('SELECT NOW()').then(() => console.log("✅ Control DB Connected!"));