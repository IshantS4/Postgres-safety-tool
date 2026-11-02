import { useEffect, useState } from 'react';
interface AuditLog {
  id: number;
  query: string;
  query_type: string;
  status: string;
  affected_rows: number;
  created_at: string;
}
const adminToken = import.meta.env.VITE_ADMIN_SECRET
export default function App() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  const fetchLogs = async () => {
    try {
      const res = await fetch('http://localhost:8001/api/audit-logs',{
        headers: {
          'x-admin-token': adminToken,
          'Content-Type': 'application/json'
        }
      });
      
      const data = await res.json();
      if (data.success) {
        setLogs(data.auditLogs);
      }
    } catch (err) {
      console.error("Failed to fetch logs", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const handleApprove = async (id: number) => {
    try {
      const res = await fetch(`http://localhost:8001/api/approve/${id}`, {
        method: 'POST',
        headers: {
    'x-admin-token': adminToken, 
    'Content-Type': 'application/json'
  }
      });
      const data = await res.json();
      if (data.success) {
        setMessage(`Success: ${data.message}`);
        fetchLogs(); 
      } else {
        setMessage(`Error: ${data.error}`);
      }
    } catch (err) {
      console.error("Approval failed", err);
    }
  };

  const handleReject = async(id : number) => {
    try{
      const res = await fetch(`http://localhost:8001/api/reject/${id}`,{
        method : 'POST',
        headers : {
          'x-admin-token' : adminToken,
          'Content-Type' : 'application/json'
        }
      })
      const data = await res.json();
      if (data.success) {
        setMessage(`Success: ${data.message}`);
        fetchLogs(); 
      } else {
        setMessage(`Error: ${data.error}`);
      }
    } catch (err) {
      console.error("Rejection failed", err);
    }
    }
  

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-8">
      <div className="max-w-6xl mx-auto">
        <header className="flex justify-between items-center mb-8 border-b border-gray-800 pb-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Postgres Safety Dashboard</h1>
            <p className="text-sm text-gray-400">Zero-Trust DB Proxy & Audit Log Management</p>
          </div>
          <button 
            onClick={fetchLogs} 
            className="bg-gray-800 hover:bg-gray-700 text-xs px-4 py-2 rounded-md font-medium transition"
          >
            Refresh Logs
          </button>
        </header>

        {message && (
          <div className="mb-6 p-4 bg-emerald-950/50 border border-emerald-800 text-emerald-300 rounded-lg text-sm">
            {message}
          </div>
        )}

        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden shadow-xl">
          <div className="p-4 border-b border-gray-800 font-semibold text-sm text-gray-300">
            Audit Trail & Pending Approvals
          </div>

          {loading ? (
            <div className="p-8 text-center text-gray-500 text-sm">Loading logs...</div>
          ) : logs.length === 0 ? (
            <div className="p-8 text-center text-gray-500 text-sm">No audit logs found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-gray-800 text-gray-400 bg-gray-900/50 text-xs uppercase tracking-wider">
                    <th className="p-4">ID</th>
                    <th className="p-4">Type</th>
                    <th className="p-4">Query</th>
                    <th className="p-4">Blast Radius</th>
                    <th className="p-4">Status</th>
                    <th className="p-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {logs.map((log) => (
                    <tr key={log.id} className="hover:bg-gray-850/50 transition">
                      <td className="p-4 font-mono text-xs text-gray-400">#{log.id}</td>
                      <td className="p-4 font-semibold text-xs">
                        <span className={`px-2 py-1 rounded text-[10px] ${
                          log.query_type === 'DELETE' ? 'bg-rose-950 text-rose-400 border border-rose-800' :
                          log.query_type === 'UPDATE' ? 'bg-amber-950 text-amber-400 border border-amber-800' :
                          'bg-sky-950 text-sky-400 border border-sky-800'
                        }`}>
                          {log.query_type}
                        </span>
                      </td>
                      <td className="p-4 font-mono text-xs text-gray-300 max-w-md whitespace-pre-wrap break-all">{log.query}</td>
                      <td className="p-4 font-mono text-xs text-gray-300">{log.affected_rows} rows</td>
                      <td className="p-4 text-xs">
                        <span className={`px-2 py-1 rounded-full font-medium text-[10px] ${
                          log.status === 'PENDING' ? 'bg-yellow-950 text-yellow-400 border border-yellow-800' :
                          log.status === 'AUTO_EXECUTED' ? 'bg-blue-950 text-blue-400 border border-blue-800' :
                          'bg-emerald-950 text-emerald-400 border border-emerald-800'
                        }`}>
                          {log.status}
                        </span>
                      </td>
                      <td className="p-4 text-right">
                     {log.status === 'PENDING' ? (
                     <div className="flex justify-end gap-2"> {/* Added flex and gap for spacing */}
                     <button
                     onClick={() => handleApprove(log.id)}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded text-xs font-medium transition shadow-sm"
                   >
                  Approve
                   </button>
                   <button
                   onClick={() => handleReject(log.id)}
                    className="bg-rose-600 hover:bg-rose-500 text-white px-3 py-1.5 rounded text-xs font-medium transition shadow-sm"
                  >
                  Reject
                  </button>
                  </div>
               ) : (
             <span className="text-gray-600 text-xs font-medium">N/A</span>
            )}
                </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}