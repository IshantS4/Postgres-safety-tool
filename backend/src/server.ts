import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { targetPool, controlPool } from './db.js';
import { operationType } from './classifier.js';
import crypto from 'crypto';

const safetyConfig = {
    maxAutoUpdateRows: parseInt(process.env.MAX_AUTO_UPDATE_ROWS || '2', 10),
    maxAutoDeleteRows: parseInt(process.env.MAX_AUTO_DELETE_ROWS || '1', 10),
};

const agentApp = express();
agentApp.use(cors({origin : process.env.DASHBOARD_ORIGIN || 'http://localhost:5173'}))
agentApp.use(express.json());

const adminApp = express();
adminApp.use(cors({origin : process.env.DASHBOARD_ORIGIN || 'http://localhost:5173'}));
adminApp.use(express.json());

const ADMIN_SECRET = process.env.ADMIN_SECRET;

if(!ADMIN_SECRET || ADMIN_SECRET.length < 16){
    console.error("🚨 FATAL ERROR: ADMIN_SECRET is missing or shorter than 16 characters.");
    console.error("Please set a strong ADMIN_SECRET in your backend .env file.");
    process.exit(1);
}

agentApp.post('/api/query', async (req, res) => {
    try {
        const { query } = req.body;
        const type = await operationType(query);
        
        if(type === "UNKNOWN" || type === "WRITE_CTE"){
            await controlPool.query(
                `INSERT INTO audit_logs(query, query_type, status, affected_rows) VALUES ($1, $2, $3, $4)`,
        [query, 'UNKNOWN', 'REJECTED', null]
            )
            return res.status(400).json({success : false, error : "Invalid or strictly blocked query structure detected."})
        }
        if (type === "SELECT") {
            const client = await targetPool.connect();
            try{
            await client.query('BEGIN READ ONLY');
            await client.query("SET LOCAL statement_timeout = '5000'");
            const result = await client.query(query);
            await client.query('ROLLBACK');
            await controlPool.query(
            `INSERT INTO audit_logs(query, query_type, status, affected_rows) VALUES ($1, $2, $3, $4)`,
            [query, 'SELECT', 'AUTO_EXECUTED', result.rows.length]
);
            return res.json({success : true, type, rows : result.rows});
            }
            catch(dbError){
                await client.query('ROLLBACK');
                await controlPool.query(
                    `INSERT INTO audit_logs(query, query_type, status, affected_rows) VALUES ($1, $2, $3, $4)`,
            [query, 'SELECT', 'FAILED_EXECUTION', null]
                )
                console.error("SELECT execution error:", dbError);
                 return res.status(403).json({ 
                success: false, 
                error: "Blocked! Read-Only violation or query timeout." 
        });
            }
            finally{
                client.release();
            }
        }

        const client = await targetPool.connect();
        let blastRadius = 0;
        
        try {
            await client.query('BEGIN');
            const result = await client.query(query);
            blastRadius = result.rowCount !== null ? result.rowCount : null;
            if ((type === "UPDATE" && blastRadius <= safetyConfig.maxAutoUpdateRows) || (type === "DELETE" && blastRadius === safetyConfig.maxAutoDeleteRows)){
                await client.query('COMMIT');
                await controlPool.query(
                `INSERT INTO audit_logs(query, query_type, status, affected_rows) VALUES ($1, $2, $3, $4)`,
                [query, type, 'AUTO_EXECUTED', blastRadius]
            );
            return res.json({ 
                success: true, 
                message: "Auto-approved and executed by Rules Engine (Low Risk)", 
                rows: result.rows 
            });
            }
            else {
            await client.query('ROLLBACK');
            await controlPool.query(
                `INSERT INTO audit_logs(query, query_type, status, affected_rows) VALUES ($1, $2, $3, $4)`,
                [query, type, 'PENDING', blastRadius]
            );
            return res.status(403).json({ 
                success: false, 
                type, 
                error: "Blocked by Safety Guard! Destructive operations require approval." 
            });
        }
        } 
            catch (dbError) {
            await client.query('ROLLBACK');
            await controlPool.query(
                `INSERT INTO audit_logs(query, query_type, status, affected_rows) VALUES ($1, $2, $3, $4)`,
                [query, type, 'FAILED_EXECUTION', null]
            );
            throw dbError; 
        } finally {
            client.release(); 
        }
 
    } catch (error) {
        console.error("Error occurred in agent query:", error);
        res.status(500).json({ error: "Could not perform the query" });
    }
});

adminApp.use((req, res, next) => {
    const token = req.headers['x-admin-token'];
    const secret = process.env.ADMIN_SECRET;

    if (!token || typeof token !== 'string' || !secret) {
        return res.status(401).json({ success: false, error: "Unauthorized access" });
    }

    try {
        const tokenHash = crypto.createHash('sha256').update(token).digest();
        const secretHash = crypto.createHash('sha256').update(secret).digest();

        if (!crypto.timingSafeEqual(tokenHash, secretHash)) {
            return res.status(401).json({ success: false, error: "Unauthorized access" });
        }
        next();
    } catch (error) {
        return res.status(500).json({ success: false, error: "Authentication processing error" });
    }
});

adminApp.get('/api/audit-logs', async (req, res) => {
    try {
        const getPendingData = await controlPool.query(`SELECT * FROM audit_logs ORDER BY created_at DESC`);
       
        return res.json({ 
            success: true, 
            auditLogs: getPendingData.rows 
        });
    } catch (error) {
        console.error("Error accessing audit_logs:", error);
        res.status(500).json({ success: false, message: "Could not fetch audit logs" });
    }
});

adminApp.post('/api/approve/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const logResults = await controlPool.query(
            `UPDATE audit_logs SET status = 'EXECUTING' WHERE id = $1 AND status = 'PENDING' RETURNING *`,[id]
        );
        
        if (logResults.rows.length === 0) {
            return res.status(404).json({ success: false, error: "Pending audit log not found or already processed." });
        }
        
        const originalBlastRadius = logResults.rows[0].affected_rows;
        const targetQuery = logResults.rows[0].query;
        
        const client = await targetPool.connect();
        
        try {
            await client.query('BEGIN');
            const executeQuery = await client.query(targetQuery);
            
            if (originalBlastRadius !== null && executeQuery.rowCount !== originalBlastRadius) {
                await client.query('ROLLBACK');
                await controlPool.query(
                    `UPDATE audit_logs SET status = 'REJECTED_STATE_CHANGE' WHERE id = $1`, [id]
                );
                return res.status(409).json({ success: false, error: 'Blast radius mismatch! Database state changed.' });
            } else {
                await client.query('COMMIT'); 
                
                await controlPool.query(
                    `UPDATE audit_logs SET status = 'EXECUTED' WHERE id = $1`, [id]
                );
                return res.json({ 
                    success: true,
                    message: "Query approved and executed successfully on Target DB!",
                    ApprovedQuery: targetQuery,
                    result: executeQuery.rows || "Query executed (No rows returned)"
                });
            }
        } catch (dbError) {
            await client.query('ROLLBACK');
            await controlPool.query(
        `UPDATE audit_logs SET status = 'FAILED_EXECUTION' WHERE id = $1`, [id]
         );
            throw dbError; 
        } finally {
            client.release();
        }

    } catch (error) {

        console.error("Error during execution:", error);
        res.status(500).json({ success: false, error: "Could not execute the Approved Query" });
    }
});

adminApp.post('/api/reject/:id',async(req,res) => {
const {id} = req.params
try{
    const result = await controlPool.query(
        `UPDATE audit_logs SET status = 'REJECTED' WHERE id = $1 AND status = 'PENDING' RETURNING *`,[id]
    )
    if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: "Audit log not found." });
        }
        res.json({success : true, message : "Query rejected successfully.", rejectedQuery : result.rows[0].query})
}
catch (error) {
        res.status(500).json({ success: false, error: "Could not reject the query"});
    }
})

const cleanupStaleQueries = async () => {
    try {
        const result = await controlPool.query(
            `UPDATE audit_logs SET status = 'FAILED_EXECUTION' WHERE status = 'EXECUTING'`
        );
        if (result.rowCount && result.rowCount > 0) {
            console.log(`🧹 Cleaned up ${result.rowCount} stuck queries from previous crash.`);
        }
    } catch (error) {
        console.error('Failed to run startup cleanup routine:', error);
    }
};

cleanupStaleQueries().then(() => {
    agentApp.listen(Number(process.env.PORT || 8000), () => {
        console.log(`🤖 Agent Plane running on port ${process.env.PORT || 8000}`);
    });

    adminApp.listen(Number(process.env.ADMIN_PORT || 8001), '127.0.0.1', () => {
        console.log(`🛡️ Admin Control Plane running on http://127.0.0.1:${process.env.ADMIN_PORT || 8001}`);
    });
});
