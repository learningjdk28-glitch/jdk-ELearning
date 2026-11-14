import { useEffect,useState } from 'react';
import { Award,Trash2 } from 'lucide-react';
import { listCertificates,deleteCertificate } from '../services/lms.js';
import { AdminHeading,Notice,Metric,panel } from '../components/AdminUI.jsx';
export default function AdminCertificates(){
 const [rows,setRows]=useState([]),[error,setError]=useState(''),[info,setInfo]=useState(''),[busy,setBusy]=useState(false);
 async function load(){setRows(await listCertificates());}
 useEffect(()=>{load().catch(e=>setError(e.message));},[]);
 async function revoke(id){if(!window.confirm('Revoke this certificate? The student will need to claim it again after meeting course requirements.'))return;setBusy(true);setError('');setInfo('');try{await deleteCertificate(id);await load();setInfo('Certificate revoked.');}catch(e){setError(e.message);}finally{setBusy(false);}}
 return <div className="space-y-6"><AdminHeading title="Certificates" description="Review securely issued credentials and revoke incorrect certificates when necessary."/><Notice error={error} info={info}/><div className="max-w-xs"><Metric icon={Award} label="Recently issued certificates" value={rows.length} hint="Latest 200 records"/></div><section className={`${panel} overflow-hidden`}><div className="overflow-x-auto"><table className="w-full text-sm text-left"><thead className="bg-slate-50 text-slate-500"><tr><th className="p-4">Student</th><th className="p-4">Course</th><th className="p-4">Issued</th><th className="p-4">Certificate ID</th><th className="p-4">Action</th></tr></thead><tbody>{rows.map(r=><tr key={r.id} className="border-t border-slate-100"><td className="p-4 font-bold">{r.student_name}</td><td className="p-4">{r.course_title}</td><td className="p-4">{new Date(r.issued_at).toLocaleDateString()}</td><td className="p-4 text-slate-500 font-mono text-xs">{r.id.slice(0,14)}…</td><td className="p-4"><button className="secondary !text-rose-700 text-xs" disabled={busy} onClick={()=>revoke(r.id)}><Trash2 size={15}/> Revoke</button></td></tr>)}</tbody></table>{rows.length===0&&<p className="p-6 text-slate-500">No certificates issued yet.</p>}</div></section></div>;
}
