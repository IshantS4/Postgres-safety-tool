import { parse } from "pgsql-parser" 
export type QueryType = "SELECT" | "INSERT" | "UPDATE" | "DELETE" | "DDL" | "UNKNOWN"
export async function operationType (query : string) : Promise<QueryType> {
    if(!query || typeof query !== "string"){
        return "UNKNOWN"
    }
try{
    const ast = (await parse(query)) as any
    if (!ast || !ast.stmts || ast.stmts.length === 0) {
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
        if(stmt.SelectStmt.withClause){
            return 'UPDATE'
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
    if(stmt.DropStmt || stmt.AlterTableStmt){
        return 'DDL'
    }
}
catch(error){
    console.error("PARSER ERROR:", error)
    return 'UNKNOWN'
}
return 'UNKNOWN'
}
