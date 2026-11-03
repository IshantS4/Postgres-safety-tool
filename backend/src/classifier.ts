import { parse } from "pgsql-parser" 
export type QueryType = "SELECT" | "INSERT" | "UPDATE" | "DELETE" | "DDL" | "UNKNOWN" | "WRITE_CTE"
export async function operationType (query : string) : Promise<QueryType> {
    if(!query || typeof query !== "string"){
        return "UNKNOWN"
    }
try{
    const ast = (await parse(query)) as any
    if (!ast ||  ast.stmts.length === 0) {
        return 'UNKNOWN';
    }
    if(ast.stmts.length > 1){
        return 'UNKNOWN'
    }

    const stmt = ast.stmts[0].stmt;
    if(!stmt){
        return 'UNKNOWN'
    }
    if(stmt.SelectStmt){
        if (hasDestructiveCTE(stmt.SelectStmt.withClause)) return 'WRITE_CTE'
        const selectNode = stmt.SelectStmt
        if(selectNode.intoClause){
           return 'DDL' 
        }
        return 'SELECT'
    }
    if(stmt.InsertStmt){
    if (hasDestructiveCTE(stmt.InsertStmt.withClause)) 
    return 'WRITE_CTE'
    return 'INSERT'
    }
    if(stmt.UpdateStmt){
        if (hasDestructiveCTE(stmt.UpdateStmt.withClause))
         return 'WRITE_CTE'
    return 'UPDATE'
    }
    if(stmt.DeleteStmt){
    if (hasDestructiveCTE(stmt.DeleteStmt.withClause)) 
    return 'WRITE_CTE'
    return 'DELETE'
    }
    if(stmt.DropStmt || stmt.AlterTableStmt || stmt.CreateStmt || stmt.TruncateStmt){
        return 'DDL'
    }
    return 'UNKNOWN'
}
catch(error){
    return 'UNKNOWN'
}
}

function hasDestructiveCTE (withClause : any) : boolean {
    if(!withClause || !withClause.ctes){
        return false
    }
    for(const cte of withClause.ctes){
        const cteQuery = cte.CommonTableExpr?.ctequery
        if(cteQuery){
            if (cteQuery.InsertStmt || cteQuery.UpdateStmt || cteQuery.DeleteStmt) {
                return true
            }
        }
    }
    return false
}
