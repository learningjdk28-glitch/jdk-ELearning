import { useEffect,useState } from 'react';
import {Link} from 'react-router-dom';
import {listModules,listCourses} from '../services/lms.js';
import {getMaterials,openMaterial} from '../services/materials.js';
import {FileText,ExternalLink,BookOpen} from 'lucide-react';
import {Notice,panel} from '../components/AdminUI.jsx';
export default function StudentMaterials(){
 const [modules,setModules]=useState([]),[courses,setCourses]=useState([]),[files,setFiles]=useState({}),[error,setError]=useState('');
 useEffect(()=>{Promise.all([listModules(),listCourses()]).then(([m,c])=>{setModules(m);setCourses(c);}).catch(e=>setError(e.message));},[]);
 return <main className="max-w-6xl mx-auto space-y-5"><h1 className="text-3xl font-black">Learning resources</h1><p className="text-slate-500">Materials from courses you are currently enrolled in. Private downloads require an internet connection.</p><Notice error={error}/>{modules.length===0&&<div className={`${panel} p-8 text-center`}><BookOpen size={36} className="mx-auto text-indigo-600 mb-3"/><p>No resources available yet.</p><Link to="/catalog" className="primary mt-4">Explore courses</Link></div>}<div className="grid md:grid-cols-2 gap-4">{modules.map(m=><section className={`${panel} p-5`} key={m.id}><p className="text-xs text-indigo-700 uppercase font-bold">{courses.find(c=>c.id===m.course_id)?.title||m.course_id}</p><h2 className="text-xl font-black mt-2">{m.title}</h2><p className="text-slate-500 text-sm mt-2">{m.description}</p><button className="secondary my-3" onClick={()=>getMaterials(m.id).then(data=>setFiles(v=>({...v,[m.id]:data}))).catch(e=>setError(e.message))}>Show materials</button>{files[m.id]?.length===0&&<p className="text-xs text-slate-500">No materials published yet.</p>}{files[m.id]?.map(f=><button key={f.id} className="flex items-center gap-2 text-indigo-700 hover:underline my-3 break-all text-sm" onClick={()=>openMaterial(f).catch(e=>setError(e.message))}><FileText size={16}/>{f.title}<ExternalLink size={15}/></button>)}</section>)}</div></main>;
}
