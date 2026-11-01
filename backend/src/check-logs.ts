import { controlPool } from "./db.js";

const checkLogs = async () => {
  try {
    const result = await controlPool.query("SELECT * FROM audit_logs ORDER BY created_at DESC;");
    console.log("📋 Audit Logs in Control DB:", result.rows);
  } catch (error) {
    console.error("❌ Error fetching audit logs:", error);
  } finally {
    await controlPool.end();
  }
};

checkLogs();
