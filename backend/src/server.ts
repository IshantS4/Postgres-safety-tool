import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { targetPool, controlPool } from './db.js';
import { operationType } from './classifier.js';

const agentApp = express();
agentApp.use(express.json());

const adminApp = express();
adminApp.use(cors());
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
        
        if(type === "UNKNOWN"){
            return res.status(400).json({message : "Invalid or strictly blocked query structure detected."})
        }
        if (type === "SELECT") {
            const client = await targetPool.connect();
            try{
            await client.query('BEGIN READ ONLY');
            await client.query("SET LOCAL statement_timeout = '5000'");
            const result = await client.query(query);
            await client.query('ROLLBACK');
            return res.json({success : true, type, rows : result.rows});
            }
            catch(dbError){
                await client.query('ROLLBACK');
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
            blastRadius = result.rowCount || 0;
            if ((type === "UPDATE" && blastRadius <= 2) || (type === "DELETE" && blastRadius === 1)){
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
        } catch (dbError) {
            await client.query('ROLLBACK');
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
   
    if (token !== ADMIN_SECRET) {
        return res.status(401).json({ success: false, error: "Unauthorized. Admin access only." });
    }
    next();
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
            
            if (executeQuery.rowCount !== originalBlastRadius) {
                await client.query('ROLLBACK');
                await controlPool.query(
                    `UPDATE audit_logs SET status = 'REJECTED_STATE_CHANGE' WHERE id = $1`, [id]
                );
                return res.status(409).json({ success: false, message: 'Blast radius mismatch! Database state changed.' });
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
        res.status(500).json({ success: false, message: "Could not execute the Approved Query" });
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

const AGENT_PORT = process.env.PORT || 8000;
const ADMIN_PORT = process.env.ADMIN_PORT || 8001;

agentApp.listen(AGENT_PORT, () => {
    console.log(`🤖 Agent Plane running on port ${AGENT_PORT}`);
});

adminApp.listen(ADMIN_PORT, () => {
    console.log(`🛡️  Admin Control Plane running on port ${ADMIN_PORT}`);
});