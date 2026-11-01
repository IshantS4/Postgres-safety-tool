import 'dotenv/config'; // .env file ko read karne ke liye[cite: 18]
import express from 'express';
import cors from 'cors';
import { targetPool, controlPool } from './db.js'; // TS + Node (ESM) mein .js lagana padta hai imports mein
import { operationType } from './classifier.js';
import { error } from 'node:console';
import { get } from 'node:http';
import { queryObjects } from 'node:v8';
import { Query } from 'pg';

const app = express();

// SECURITY MIDDLEWARES
app.use(cors()); // Frontend ko allow karne ke liye[cite: 18]
app.use(express.json()); // JSON chunks parse karne ke liye[cite: 14, 18]

// HEALTH CHECK ROUTE
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: "AI Postgres Safety Tool API is running!" });
});

// ENGINE START
const PORT = process.env.PORT || 8000;

app.listen(PORT, () => {
  console.log(`🚀 Secure Express Engine running on port ${PORT}`);
});

app.post('/api/query', async(req,res) => {
    try{
        const {query} = req.body
    const type = operationType(query)
    if(type === "SELECT"){
        const result = await targetPool.query(query)
        return res.json({ success: true, type, rows: result.rows })
    }

    //IF THE QUERY IS HAZARDOUS LIKE UPDATE,DELETE

    const client = await targetPool.connect()
    await client.query('BEGIN')
    const result = await client.query(query)
    const blastRadius = result.rowCount
    await client.query('ROLLBACK')
    client.release()

    if(type === "UPDATE" && blastRadius <= 2 || type === "DELETE" && blastRadius === 1){
       const autoExec =  await targetPool.query(query)
      await controlPool.query(
        `INSERT INTO audit_logs(query,query_type,status,affected_rows) VALUES ($1,$2,$3,$4)`,[query,type,'AUTO_EXECUTED',blastRadius]
    )
    return res.json({ 
            success: true, 
            message: "Auto-approved and executed by Rules Engine (Low Risk)", 
            rows: autoExec.rows 
        })
    }
    else{
        await controlPool.query(
        `INSERT INTO audit_logs(query,query_type,status,affected_rows) VALUES ($1,$2,$3,$4)`,[query,type,'PENDING',blastRadius]
    )

    return res.status(403).json({ success: false, type, error: "Blocked by Safety Guard! Destructive operations require approval." })
    }
   
    }
    catch(error){
        console.error("Error Occured !",error)
        res.status(500).json({error : "Could not perform the query"})
    }
})

//SELECTING A QUERY FROM CONTROLPOOL THEN EXECUTING IT TO TARGETPOOL THEN UPDATING CONTROLPOOL STATUS TO "EXECUTED"
app.post('/api/approve/:id', async(req,res) => {
    try{
        const {id} = req.params
     const logResults = await controlPool.query(
            `SELECT * FROM audit_logs WHERE id = $1 AND status = 'PENDING'`,[id]
        )
        if(logResults.rows.length === 0){
          return res.status(404).json({success: false, error: "Pending audit log not found or already processed."})
        }
        const targetQuery = logResults.rows[0].query
        const executeQuery = await targetPool.query(targetQuery)
        await controlPool.query(
            `UPDATE audit_logs SET status = 'EXECUTED' WHERE id = $1`,[id]
        )
        return res.json({success : true,
                        message : "Query approved and executed successfully on Target DB!",
                        ApprovedQuery : targetQuery,
                        result: executeQuery.rows || "Query executed (No rows returned)"
    })
    }
    catch(error){
        console.error("Error during query approval/execution",error)
        res.status(500).json({success : false,
                            message : "Could not execute the Approved Query"
        })
    }
})

//READING THE TABLE DATA

app.get('/api/audit-logs', async(req,res) => {
   try{
     const getPendingData = await controlPool.query(
        `SELECT * FROM audit_logs ORDER BY created_at DESC`
    )
    if(getPendingData.rows.length === 0){
        return res.status(404).json({success: false, error: "Audit log not found."})
    }
    return res.json({success : true,
                    message : "THE QUERIES CURRENTLY BLOCKED BY THE PROTECTOR.",
                    auditLogs : getPendingData.rows
    })
   }
   catch(error){
    console.error("Error during accessing the blocked queries data from audit_logs")
    res.status(500).json({success : false, message : "Could not show the blocked data"})
   }
})
