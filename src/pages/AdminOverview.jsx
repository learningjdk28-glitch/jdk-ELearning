import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, Layers, Users, FileText, ArrowUpRight, UserRoundPlus, ClipboardList, LibraryBig, GraduationCap } from 'lucide-react';
import { adminSummary, listCourses } from '../services/lms.js';
import { AdminHeading, Metric, Notice, Status, panel } from '../components/AdminUI.jsx';
const actions = [
  { to:'/admin/courses', title:'Create a course', subtitle:'Build a new learning path', icon:BookOpen },
  { to:'/admin/content', title:'Add modules & materials', subtitle:'Publish lessons, PDF and DOCX files', icon:LibraryBig },
  { to:'/admin/students', title:'Manage students', subtitle:'View accounts and course access', icon:UserRoundPlus },
  { to:'/admin/enrollments', title:'Manage enrollments', subtitle:'Assign or revoke student access', icon:ClipboardList },
  { to:'/admin/assessments', title:'Create quizzes', subtitle:'Add questions and securely grade students', icon:GraduationCap },
  { to:'/admin/certificates', title:'Certificates', subtitle:'Review issued course credentials', icon:GraduationCap },
];
export default function AdminOverview(){
 const [stats,setStats]=useState(null), [courses,setCourses]=useState([]), [error,setError]=useState('');
 useEffect(()=>{let active=true;Promise.all([adminSummary(),listCourses()]).then(([s,c])=>{if(active){setStats(s);setCourses(c.slice(0,5));}}).catch(e=>active&&setError(e.message));return ()=>{active=false;};},[]);
 return <div className="space-y-7 pb-10">
 <AdminHeading title="Overview" description="Create meaningful learning experiences and keep your students on track." action={<Link className="primary" to="/admin/courses">+ Create course</Link>}/>
 <Notice error={error}/>
 <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4"><Metric icon={Users} label="Students" value={stats?.students}/><Metric icon={BookOpen} label="Courses" value={stats?.courses} hint={`${stats?.published_courses??0} published`}/><Metric icon={Layers} label="Learning modules" value={stats?.modules}/><Metric icon={GraduationCap} label="Active enrollments" value={stats?.enrollments}/></div>
 <div className="grid xl:grid-cols-[1.5fr_1fr] gap-5"><section className={`${panel} p-6`}><div className="flex justify-between items-center mb-5"><h2 className="text-xl font-black">Recent courses</h2><Link to="/admin/courses" className="text-indigo-700 text-sm font-bold">View all <ArrowUpRight size={15} className="inline"/></Link></div><div className="space-y-3">{courses.length?courses.map(c=><div key={c.id} className="border-b last:border-0 border-slate-100 pb-3 flex items-center justify-between gap-3"><div className="flex gap-3 items-center min-w-0"><span className="p-3 rounded-xl bg-indigo-50 text-indigo-700"><BookOpen size={20}/></span><div className="min-w-0"><p className="font-bold truncate">{c.title}</p><p className="text-xs text-slate-500">{c.category} · {c.level}</p></div></div><Status value={c.published}/></div>):<p className="text-slate-500">No courses found. Create one to start publishing lessons.</p>}</div></section><section className={`${panel} p-6`}><h2 className="text-xl font-black mb-5">Quick actions</h2><div className="space-y-2">{actions.map(({to,title,subtitle,icon:Icon})=><Link key={to} to={to} className="flex gap-3 p-3 rounded-xl border border-slate-100 hover:bg-indigo-50 hover:border-indigo-200 transition"><span className="p-2.5 bg-indigo-50 text-indigo-700 rounded-xl"><Icon size={21}/></span><div><p className="font-bold text-sm text-slate-900">{title}</p><p className="text-slate-500 text-xs mt-1">{subtitle}</p></div><ArrowUpRight size={15} className="ml-auto text-slate-400 shrink-0"/></Link>)}</div></section></div>
 <div className="grid sm:grid-cols-2 gap-4"><div className={`${panel} p-5 flex gap-4 items-center`}><FileText size={27} className="text-indigo-600"/><div><p className="text-xl font-black">{stats?.materials??'—'}</p><p className="text-sm text-slate-500">Uploaded materials</p></div></div><div className={`${panel} p-5 flex gap-4 items-center`}><GraduationCap size={27} className="text-indigo-600"/><div><p className="text-xl font-black">{stats?.completed_lessons??'—'}</p><p className="text-sm text-slate-500">Completed course lessons</p></div></div></div>
 </div>;
}
