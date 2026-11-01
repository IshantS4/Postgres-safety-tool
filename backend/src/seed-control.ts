 import { controlPool } from "./db.js";
 export const seedControlDB = async() => {
    try{
        await controlPool.query(
            `DROP TABLE IF EXISTS audit_logs;
            CREATE TABLE IF NOT EXISTS audit_logs(
            Id SERIAL PRIMARY KEY,
            query TEXT NOT NULL,
            query_type TEXT NOT NULL,
            status TEXT DEFAULT 'PENDING',
            affected_rows INT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
            `
        )
        console.log("✅ Control DB Audit Table Seeded Successfully!")
    }
    catch(error){
        console.error("❌ Error seeding Control DB:", error)
    }
    finally{
        await controlPool.end()
    }
 }
 seedControlDB()