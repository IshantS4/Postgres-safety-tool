import 'dotenv/config'; // Make sure env variables load first
import pg from 'pg';

// Create a standalone pool just for seeding, using ADMIN credentials
const seedPool = new pg.Pool({
    user: process.env.TARGET_DB_ADMIN_USER || 'postgres',
    password: process.env.TARGET_DB_ADMIN_PASSWORD,
    host: process.env.TARGET_DB_HOST,
    port: Number(process.env.TARGET_DB_PORT),
    database: process.env.TARGET_DB_NAME,
});

export const seedTargetDB = async () => {
    try {
        await seedPool.query(
            `DROP TABLE IF EXISTS users;
            CREATE TABLE IF NOT EXISTS users(
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            email TEXT NOT NULL,
            plan TEXT DEFAULT 'free'
            );
            INSERT INTO users(name,email,plan) VALUES
            ('Ishant', 'ishant@yc.com', 'pro'),
            ('Raju', 'raju@haveli.com', 'free'),
            ('Amit', 'amit@codechai.in', 'pro'),
            ('Priya', 'priya@jugaad.io', 'free'),
            ('Jack', 'jack@tech.com', 'free'),
            ('Nehal', 'nehal@rem.tech', 'free');`
        );
        console.log("✅ Seeding of DATA successful");
    } catch (error) {
        console.error("❌ Error occurred during seeding:", error);
    } finally {
        await seedPool.end();
    }
};

seedTargetDB();