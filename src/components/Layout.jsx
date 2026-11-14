import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  BookOpen,
  ChartColumn,
  Cloud,
  CloudOff,
  GraduationCap,
  Home,
  Bot,
  Lightbulb,
  LogOut,
  Menu,
  X,
  Route as RouteIcon,
  Settings,
  Users,
  Layers,
  FileText,
  ClipboardList,
  ShieldCheck,
  Award,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useLearner } from '../context/LearnerContext.jsx';
import { FullScreenMessage } from './ui.jsx';
import ChatWidget from './ChatWidget.jsx';

const SIDE_LINKS = [
  ['/dashboard', 'Dashboard', Home],
  ['/catalog', 'Explore courses', BookOpen],
  ['/courses', 'Offline lessons', GraduationCap],
  ['/materials', 'Learning materials', FileText],
  ['/certificates', 'Certificates', Award],
  ['/pretest', 'Pre-Test', GraduationCap],
  ['/path', 'My Path', RouteIcon],
  ['/progress', 'Progress', ChartColumn],
  ['/glossary', 'Glossary', Lightbulb],
  ['/profile', 'Profile', Settings],
];

const TABS = [
  ['/dashboard', 'Home', Home],
  ['/catalog', 'Courses', BookOpen],
  ['/progress', 'Progress', ChartColumn],
  ['/glossary', 'Glossary', Lightbulb],
];

function SyncBadge() {
  const { sync, online } = useLearner();
  const pending = sync.pending;
  if (!online) {
    return (
      <span className="hidden sm:inline-flex items-center gap-1 text-xs text-amber-800">
        <CloudOff size={14} /> {pending > 0 ? `${pending} change${pending === 1 ? '' : 's'} waiting` : 'Saved on device'}
      </span>
    );
  }
  if (sync.state === 'syncing') return <span className="hidden sm:inline text-xs text-slate-600">Syncing...</span>;
  if (sync.state === 'error') {
    return <span className="hidden sm:inline text-xs text-red-700" title={sync.message}>Sync problem</span>;
  }
  return (
    <span className="hidden sm:inline-flex items-center gap-1 text-xs text-green-800">
      <Cloud size={14} /> {pending > 0 ? `${pending} pending` : 'Synced'}
    </span>
  );
}

const ADMIN_LINKS = [
  ['/admin', 'Overview', Home],
  ['/admin/courses', 'Courses', BookOpen],
  ['/admin/content', 'Modules & materials', Layers],
  ['/admin/students', 'Students', Users],
  ['/admin/enrollments', 'Enrollments', ClipboardList],
  ['/admin/assessments', 'Assessments', GraduationCap],
  ['/admin/certificates', 'Certificates', Award],
  ['/admin/analytics', 'Analytics', ChartColumn],
  ['/profile', 'My profile', Settings],
];

function SidebarContent({ adminMode, onLogout }) {
  const links = adminMode ? ADMIN_LINKS : SIDE_LINKS;
  return (
    <>
      <div className={`flex items-center gap-3 text-xl font-extrabold mb-9 ${adminMode ? 'text-white' : 'text-navy'}`}>
        <span className={`rounded-xl p-2 ${adminMode ? 'bg-indigo-600' : 'bg-indigo-100 text-indigo-700'}`}><GraduationCap size={27}/></span>
        <div>JDK Learn <span className={`block text-xs mt-0.5 font-medium ${adminMode ? 'text-slate-300' : 'text-slate-500'}`}>{adminMode ? 'Admin Portal' : 'Student Portal'}</span></div>
      </div>
      <nav aria-label="Main" className="space-y-1.5">
        {links.map(([path, label, Icon]) => (
          <NavLink key={path} to={path} end={path === '/admin'} className={({ isActive }) => adminMode
            ? `flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold transition-colors ${isActive ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-950/30' : 'text-slate-300 hover:text-white hover:bg-white/10'}`
            : `navlink ${isActive ? 'active' : ''}`}>
            <Icon size={19} aria-hidden="true" /> {label}
          </NavLink>
        ))}
      </nav>
      <div className="mt-auto pt-7">
        {adminMode && <div className="rounded-2xl bg-indigo-700/60 p-4 mb-5 text-white"><ShieldCheck size={24} className="text-indigo-200 mb-2"/><p className="font-bold text-sm">Administrator workspace</p><p className="text-xs text-indigo-200 mt-1">Publish content, manage enrollments, and help learners grow.</p></div>}
        <button type="button" className={adminMode ? 'flex gap-3 items-center w-full p-3 text-slate-300 hover:text-white hover:bg-white/10 rounded-xl' : 'navlink w-full text-left'} onClick={onLogout}><LogOut size={19} aria-hidden="true"/> Log out</button>
        {!adminMode && <p className="mt-4 text-xs text-slate-600">Your offline learning progress syncs when connected.</p>}
      </div>
    </>
  );
}

function ConfirmLogout({ onCancel, onConfirm, busy }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && !busy && onCancel();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel, busy]);
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center p-4 bg-black/40" role="presentation" onClick={() => !busy && onCancel()}>
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="logout-title"
        aria-describedby="logout-text"
        className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="logout-title" className="text-xl font-extrabold text-navy">Log out?</h2>
        <p id="logout-text" className="text-slate-700 mt-2">You will need to log in again to continue learning. Your progress stays saved.</p>
        <div className="mt-5 flex justify-end gap-3">
          <button type="button" className="secondary min-h-[44px]" autoFocus onClick={onCancel} disabled={busy}>Cancel</button>
          <button type="button" className="primary min-h-[44px]" onClick={onConfirm} disabled={busy}>{busy ? 'Logging out...' : 'OK'}</button>
        </div>
      </div>
    </div>
  );
}

export default function Layout() {
  const { user, isAdmin, signOut } = useAuth();
  const { ready, online } = useLearner();
  const location = useLocation();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const adminMode = isAdmin && location.pathname.startsWith('/admin');
  const mobileTabs = adminMode ? [['/admin', 'Overview', Home], ['/admin/courses', 'Courses', BookOpen], ['/admin/content', 'Modules', Layers], ['/admin/students', 'Students', Users]] : TABS;

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  async function logout() {
    setLoggingOut(true);
    try {
      await signOut();
      navigate('/', { replace: true });
    } finally {
      setLoggingOut(false);
      setConfirmOpen(false);
    }
  }

  return (
    <div className={`min-h-screen md:flex ${adminMode ? 'bg-[#f4f7ff]' : ''}`}>
      <aside className={`hidden md:flex md:flex-col border-r w-64 shrink-0 p-5 sticky top-0 h-screen overflow-y-auto ${adminMode ? 'bg-[#101b37] border-slate-800' : 'bg-white border-indigo-100'}`}>
        <SidebarContent adminMode={adminMode} onLogout={() => setConfirmOpen(true)} />
      </aside>

      {menuOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex" role="dialog" aria-modal="true" aria-label="Menu">
          <aside className={`${adminMode ? 'bg-[#101b37] text-white' : 'bg-white'} w-72 max-w-[85vw] p-5 flex flex-col overflow-y-auto shadow-2xl pt-[calc(1.25rem+env(safe-area-inset-top))]`}>
            <button type="button" aria-label="Close menu" className="self-end p-2 -mt-2 -mr-2 mb-2 rounded-full hover:bg-brand-soft" onClick={() => setMenuOpen(false)}>
              <X size={22} />
            </button>
            <SidebarContent adminMode={adminMode} onLogout={() => setConfirmOpen(true)} />
          </aside>
          <button type="button" aria-label="Close menu" className="flex-1 bg-black/40" onClick={() => setMenuOpen(false)} />
        </div>
      )}

      <div className="flex-1 min-w-0">
        <header className={`${adminMode ? 'bg-white/95 border-slate-200' : 'bg-surface/90 border-indigo-100'} backdrop-blur border-b px-4 md:px-9 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))] flex items-center justify-between gap-3 sticky top-0 z-30`}>
          <div className="md:hidden flex items-center gap-2 font-extrabold text-navy">
            <button type="button" aria-label="Open menu" aria-expanded={menuOpen} className="w-10 h-10 grid place-items-center rounded-full bg-white border border-indigo-100" onClick={() => setMenuOpen(true)}>
              <Menu size={20} />
            </button>
            <span>JDK <span className="text-brand">Learning System</span></span>
          </div>
          <div className="hidden md:block font-bold text-lg">{adminMode ? 'JDK Learn / Administration' : 'Learn at your own pace'}</div>
          <div className="flex items-center gap-3 text-sm">
            {!adminMode && <SyncBadge />}
            <span
              className={`flex items-center gap-1 rounded-full px-3 py-1 font-semibold ${online ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-900'}`}
              role="status"
            >
              {online ? <Wifi size={15} aria-hidden="true" /> : <WifiOff size={15} aria-hidden="true" />}
              {online ? 'Online' : 'Offline'}
            </span>
            <span className="hidden lg:inline text-slate-600 truncate max-w-[14rem]">{user?.email}</span>
          </div>
        </header>

        <main className="w-full max-w-[1680px] mx-auto p-4 sm:p-6 md:p-8 xl:p-10 pb-28 md:pb-10" key={location.pathname}>
          {ready ? <Outlet /> : <FullScreenMessage>Loading your learning data...</FullScreenMessage>}
        </main>
      </div>

      {confirmOpen && <ConfirmLogout busy={loggingOut} onCancel={() => setConfirmOpen(false)} onConfirm={logout} />}

      {!adminMode && <ChatWidget />}

      <nav
        aria-label="Main"
        className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-indigo-100 grid grid-cols-4 pb-[env(safe-area-inset-bottom)]"
      >
        {mobileTabs.map(([path, label, Icon]) => (
          <NavLink
            key={path}
            to={path}
            className={({ isActive }) =>
              `flex flex-col items-center gap-1 py-2.5 text-xs font-semibold ${isActive ? 'text-brand' : 'text-slate-600'}`
            }
          >
            <Icon size={24} aria-hidden="true" />
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
