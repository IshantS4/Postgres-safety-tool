import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;

const adminPool = new Pool({
    user: process.env.TARGET_DB_ADMIN_USER || 'postgres', 
    password: process.env.TARGET_DB_ADMIN_PASSWORD,
    host: process.env.TARGET_DB_HOST || 'localhost',
    port: Number(process.env.TARGET_DB_PORT) || 5432,
    database: process.env.TARGET_DB_NAME, 
});

async function setupRestrictedUser() {
    const client = await adminPool.connect();
    try {
        console.log("🛠️ Setting up restricted 'ai_agent' user...");

        const agentPassword = process.env.AGENT_DB_PASSWORD;
        if (!agentPassword) throw new Error('AGENT_DB_PASSWORD is not set in .env');

        const userExists = await client.query(`SELECT 1 FROM pg_roles WHERE rolname='ai_agent'`);
        
        if (userExists.rowCount === 0) {
            await client.query(`CREATE USER ai_agent WITH PASSWORD '${agentPassword.replace(/'/g, "''")}';`);
            console.log("Created 'ai_agent' user.");
        } else {
 
            await client.query(`ALTER USER ai_agent WITH PASSWORD '${agentPassword.replace(/'/g, "''")}';`);
            console.log("User 'ai_agent' already exists. Updated password.");
        }

        await client.query(`REVOKE ALL ON SCHEMA public FROM ai_agent;`);
        await client.query(`GRANT USAGE ON SCHEMA public TO ai_agent;`);

        await client.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE users TO ai_agent;`);

        await client.query(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ai_agent;`);

        console.log("✅ Successfully applied restricted permissions to 'ai_agent'!");
    } catch (error: any) {
        console.error("❌ Error setting up user:", error);
    } finally {
        client.release();
        await adminPool.end();
    }
}

setupRestrictedUser();