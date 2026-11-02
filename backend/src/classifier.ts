import { parse } from "pgsql-parser" 
export type QueryType = "SELECT" | "INSERT" | "UPDATE" | "DELETE" | "DDL" | "UNKNOWN" | "WRITE_CTE"
export async function operationType (query : string) : Promise<QueryType> {
    if(!query || typeof query !== "string"){
        return "UNKNOWN"
    }
try{
    const ast = (await parse(query)) as any
    if (!ast ||  ast.length === 0) {
        return 'UNKNOWN';
    }
    if(ast.length > 1){
        return 'UNKNOWN'
    }

    const stmt = ast.stmts[0].stmt;
    if(!stmt){
        return 'UNKNOWN'
    }
    if(stmt.SelectStmt){
        const selectNode = stmt.SelectStmt
        if(selectNode.intoClause){
           return 'DDL' 
        }
        if(selectNode.withClause?.ctes){
            for(const cte of selectNode.withClause.ctes){
            const cteQuery = cte.CommonTableExpr?.ctequery;
            if(cteQuery){
                if(cteQuery.InsertStmt || cteQuery.UpdateStmt || cteQuery.DeleteStmt){
                    return 'WRITE_CTE'
                }
            }
            }
        }
        return 'SELECT'
    }
    if(stmt.InsertStmt){
        return 'INSERT'
    }
    if(stmt.UpdateStmt){
        return 'UPDATE'
    }
    if(stmt.DeleteStmt){
        return 'DELETE'
    }
    if(stmt.DropStmt || stmt.AlterTableStmt || stmt.CreateStmt || stmt.TruncateStmt){
        return 'DDL'
    }
    return 'UNKNOWN'
}
catch(error){
    console.error("PARSER ERROR:", error)
    return 'UNKNOWN'
}
}
