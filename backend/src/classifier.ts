export type QueryType = "SELECT" | "INSERT" | "UPDATE" | "DELETE" | "DDL" | "UNKNOWN"
export function operationType (query : string) : QueryType {
    if(!query || typeof query !== "string"){
        return "UNKNOWN"
    }
const formatQuery = query.trim().toUpperCase().split(/\s+/)[0] || ""
if(formatQuery === "SELECT"){
    return 'SELECT'
}
if(formatQuery === "INSERT"){
    return 'INSERT'
}
if(formatQuery === "UPDATE"){
    return 'UPDATE'
}
if(formatQuery === "DELETE"){
    return 'DELETE'
}
const DDLQueries = ["CREATE", "ALTER", "DROP", "TRUNCATE"]
if(DDLQueries.includes(formatQuery)){
    return "DDL"
}
return "UNKNOWN"
}
