import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;

const adminPool = new Pool({
    user: process.env.TARGET_DB_USER || 'postgres', 
    password: process.env.TARGET_DB_PASSWORD,
    host: process.env.TARGET_DB_HOST || 'localhost',
    port: Number(process.env.TARGET_DB_PORT) || 5432,
    database: process.env.TARGET_DB_NAME, 
});

async function setupRestrictedUser() {
    const client = await adminPool.connect();
    try {
        console.log("🛠️ Creating restricted 'ai_agent' user...");

        const agentPassword = process.env.AGENT_DB_PASSWORD;
        if (!agentPassword) throw new Error('AGENT_DB_PASSWORD is not set in .env');
        await client.query(`CREATE USER ai_agent WITH PASSWORD '${agentPassword.replace(/'/g, "''")}';`);
     
        await client.query(`REVOKE ALL ON SCHEMA public FROM ai_agent;`);
       
        await client.query(`GRANT USAGE ON SCHEMA public TO ai_agent;`);
      
        await client.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE users TO ai_agent;`);

        console.log("✅ Successfully created 'ai_agent' user with restricted permissions!");
    } catch (error: any) {
        if (error.code === '42710') {
            console.log("⚠️ User 'ai_agent' already exists. Skipping creation.");
        } else {
            console.error("❌ Error setting up user:", error);
        }
    } finally {
        client.release();
        await adminPool.end();
    }
}

setupRestrictedUser();