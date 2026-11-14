import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  BookOpen,
  ChartColumn,
  GraduationCap,
  Home,
  Bot,
  Lightbulb,
  LogOut,
  Menu,
  Moon,
  Sun,
  X,
  Route as RouteIcon,
  Settings,
  Users,
  Layers,
  FileText,
  ClipboardList,
  ClipboardCheck,
  FileCheck,
  Puzzle,
  ShieldCheck,
  Award,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import useOnline from '../hooks/useOnline.js';
import ChatWidget from './ChatWidget.jsx';
import SyncStatus, { useOutbox } from './SyncStatus.jsx';
import { applyAppearance, currentAppearance, shownMode } from '../lib/applyTheme.js';
import { saveAppearance } from '../services/profile.js';

const SIDE_LINKS = [
  ['/dashboard', 'Dashboard', Home],
  ['/catalog', 'Explore courses', BookOpen],
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

const ADMIN_LINKS = [
  ['/admin', 'Overview', Home],
  ['/admin/courses', 'Courses', BookOpen],
  ['/admin/content', 'Modules & materials', Layers],
  ['/admin/glossary', 'Glossary', Lightbulb],
  ['/admin/pretest', 'Pre-test', ClipboardCheck],
  ['/admin/students', 'Students', Users],
  ['/admin/enrollments', 'Enrollments', ClipboardList],
  ['/admin/assessments', 'Quizzes', GraduationCap],
  ['/admin/activities', 'Activities', Puzzle],
  ['/admin/assignments', 'Assignments', FileCheck],
  ['/admin/certificates', 'Certificates', Award],
  ['/admin/analytics', 'Analytics', ChartColumn],
  ['/admin/profile', 'My profile', Settings],
];

function SidebarContent({ adminMode, onLogout }) {
  const links = adminMode ? ADMIN_LINKS : SIDE_LINKS;
  return (
    <>
      <div className={`flex items-center gap-3 text-xl font-extrabold mb-9 ${adminMode ? 'text-text-inverse' : 'text-text'}`}>
        <span className={`rounded-xl p-2 ${adminMode ? 'bg-brand text-brand-contrast' : 'bg-brand-soft text-brand'}`}><GraduationCap size={27}/></span>
        <div>JDK Learn <span className={`block text-xs mt-0.5 font-medium ${adminMode ? 'text-text-inverse-muted' : 'text-text-muted'}`}>{adminMode ? 'Instructor Portal' : 'Student Portal'}</span></div>
      </div>
      <nav aria-label="Main" className="space-y-1.5">
        {links.map(([path, label, Icon]) => (
          <NavLink key={path} to={path} end={path === '/admin'} className={({ isActive }) => adminMode
            ? `flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold transition-colors ${isActive ? 'bg-brand text-brand-contrast shadow-lg shadow-overlay/30' : 'text-text-inverse-muted hover:text-text-inverse hover:bg-text-inverse/10'}`
            : `navlink ${isActive ? 'active' : ''}`}>
            <Icon size={19} aria-hidden="true" /> {label}
          </NavLink>
        ))}
      </nav>
      <div className="mt-auto pt-7">
        {adminMode && <div className="rounded-2xl bg-brand/40 p-4 mb-5 text-text-inverse"><ShieldCheck size={24} className="text-text-inverse-muted mb-2"/><p className="font-bold text-sm">Instructor workspace</p><p className="text-xs text-text-inverse-muted mt-1">Publish content, manage enrollments, and help learners grow.</p></div>}
        <button type="button" className={adminMode ? 'flex gap-3 items-center w-full p-3 text-text-inverse-muted hover:text-text-inverse hover:bg-text-inverse/10 rounded-xl' : 'navlink w-full text-left'} onClick={onLogout}><LogOut size={19} aria-hidden="true"/> Log out</button>
        {!adminMode && <p className="mt-4 text-xs text-text-muted">Lessons you open are saved on this device. Work done offline syncs when you reconnect.</p>}
      </div>
    </>
  );
}

/** One tap between light and dark. Saved on the profile when online; Profile > Appearance has every option. */
function ThemeSwitch({ userId, online }) {
  const [mode, setMode] = useState(shownMode);
  useEffect(() => {
    const sync = () => setMode(shownMode());
    window.addEventListener('jdk-appearance', sync);
    return () => window.removeEventListener('jdk-appearance', sync);
  }, []);
  const toggle = () => {
    const next = { ...currentAppearance(), theme: mode === 'dark' ? 'light' : 'dark' };
    applyAppearance(next);
    if (userId && online) saveAppearance(userId, next).catch(() => { /* kept on this device */ });
  };
  return (
    <button type="button" onClick={toggle} className="w-9 h-9 grid place-items-center rounded-full border border-border bg-surface-raised text-text"
      aria-label={mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} title={mode === 'dark' ? 'Light mode' : 'Dark mode'}>
      {mode === 'dark' ? <Sun size={17} aria-hidden="true" /> : <Moon size={17} aria-hidden="true" />}
    </button>
  );
}

function ConfirmLogout({ onCancel, onConfirm, busy, waiting }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && !busy && onCancel();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel, busy]);
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center p-4 bg-overlay/40" role="presentation" onClick={() => !busy && onCancel()}>
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="logout-title"
        aria-describedby="logout-text"
        className="w-full max-w-sm bg-surface-raised rounded-2xl shadow-2xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="logout-title" className="text-xl font-extrabold text-text">Log out?</h2>
        <p id="logout-text" className="text-text-muted mt-2">You will need to log in again to continue learning. Your progress stays saved.</p>
        {waiting > 0 && <p className="text-warning text-sm mt-2">{waiting} item{waiting === 1 ? ' is' : 's are'} still waiting to sync. {waiting === 1 ? 'It stays' : 'They stay'} on this device and {waiting === 1 ? 'is' : 'are'} sent the next time you log in here with a connection.</p>}
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
  const online = useOnline();
  const outbox = useOutbox();
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
    <div className="min-h-screen md:flex">
      <aside className={`hidden md:flex md:flex-col border-r w-64 shrink-0 p-5 sticky top-0 h-screen overflow-y-auto ${adminMode ? 'bg-surface-inverse border-surface-inverse' : 'bg-surface-raised border-border'}`}>
        <SidebarContent adminMode={adminMode} onLogout={() => setConfirmOpen(true)} />
      </aside>

      {menuOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex" role="dialog" aria-modal="true" aria-label="Menu">
          <aside className={`${adminMode ? 'bg-surface-inverse text-text-inverse' : 'bg-surface-raised'} w-72 max-w-[85vw] p-5 flex flex-col overflow-y-auto shadow-2xl pt-[calc(1.25rem+env(safe-area-inset-top))]`}>
            <button type="button" aria-label="Close menu" className="self-end p-2 -mt-2 -mr-2 mb-2 rounded-full hover:bg-brand-soft" onClick={() => setMenuOpen(false)}>
              <X size={22} />
            </button>
            <SidebarContent adminMode={adminMode} onLogout={() => setConfirmOpen(true)} />
          </aside>
          <button type="button" aria-label="Close menu" className="flex-1 bg-overlay/40" onClick={() => setMenuOpen(false)} />
        </div>
      )}

      <div className="flex-1 min-w-0">
        <header className={`${adminMode ? 'bg-surface-raised/95 border-border' : 'bg-surface/90 border-border'} backdrop-blur border-b px-4 md:px-9 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))] flex items-center justify-between gap-3 sticky top-0 z-30`}>
          <div className="md:hidden flex items-center gap-2 font-extrabold text-text">
            <button type="button" aria-label="Open menu" aria-expanded={menuOpen} className="w-10 h-10 grid place-items-center rounded-full bg-surface-raised border border-border" onClick={() => setMenuOpen(true)}>
              <Menu size={20} />
            </button>
            <span>JDK <span className="text-brand">Learning System</span></span>
          </div>
          <div className="hidden md:block font-bold text-lg">{adminMode ? 'JDK Learn / Instructor' : 'Learn at your own pace'}</div>
          <div className="flex items-center gap-3 text-sm">
            {!adminMode && <SyncStatus online={online} />}
            <span
              className={`flex items-center gap-1 rounded-full px-3 py-1 font-semibold ${online ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'}`}
              role="status"
            >
              {online ? <Wifi size={15} aria-hidden="true" /> : <WifiOff size={15} aria-hidden="true" />}
              {online ? 'Online' : 'Offline'}
            </span>
            <ThemeSwitch userId={user?.id} online={online} />
            <span className="hidden lg:inline text-text-muted truncate max-w-[14rem]">{user?.email}</span>
          </div>
        </header>

        <main className="w-full max-w-[1680px] mx-auto p-4 sm:p-6 md:p-8 xl:p-10 pb-28 md:pb-10" key={location.pathname}>
          <Outlet />
        </main>
      </div>

      {confirmOpen && <ConfirmLogout busy={loggingOut} waiting={outbox.length} onCancel={() => setConfirmOpen(false)} onConfirm={logout} />}

      {!adminMode && <ChatWidget />}

      <nav
        aria-label="Main"
        className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-surface-raised border-t border-border grid grid-cols-4 pb-[env(safe-area-inset-bottom)]"
      >
        {mobileTabs.map(([path, label, Icon]) => (
          <NavLink
            key={path}
            to={path}
            className={({ isActive }) =>
              `flex flex-col items-center gap-1 py-2.5 text-xs font-semibold ${isActive ? 'text-brand' : 'text-text-muted'}`
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
