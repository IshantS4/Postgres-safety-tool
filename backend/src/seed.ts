import { targetPool } from "./db.js";
export  const seedTargetDB = async() => {
try{
const result = await targetPool.query(
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
    ('Nehal', 'nehal@rem.tech', 'free')
    `
)
console.log("Seeding of DATA sucessful")
}
catch(error){
console.log("Error occured",error)
}
finally{
    await targetPool.end()
}
}
seedTargetDB()