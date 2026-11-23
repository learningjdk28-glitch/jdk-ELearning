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
  Award,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import useOnline from '../hooks/useOnline.js';
import ChatWidget from './ChatWidget.jsx';
import Logo from './Logo.jsx';
import SyncStatus, { useOutbox } from './SyncStatus.jsx';
import { applyAppearance, currentAppearance, shownMode } from '../lib/applyTheme.js';
import { saveAppearance } from '../services/profile.js';
import useCourseBrand from '../hooks/useCourseBrand.js';

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

// Both portals: the sidebar is the brand colour (each person's, or the course's). brand-contrast text on brand
// is always at least 4.5:1 (src/lib/theme.js), and the active item swaps the two colours.
const SIDE_ITEM = 'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-contrast';
const sideItem = (active) => `${SIDE_ITEM} ${active ? 'bg-brand-contrast text-brand shadow-sm' : 'text-brand-contrast hover:bg-brand-contrast/15'}`;

function SidebarContent({ adminMode, onLogout }) {
  const links = adminMode ? ADMIN_LINKS : SIDE_LINKS;
  return (
    <div className="flex flex-col h-full min-h-0 text-brand-contrast">
      <div className="flex items-center gap-3 px-1 mb-6 shrink-0">
        <Logo size={44} decorative className="ring-2 ring-brand-contrast" />
        <div className="min-w-0">
          <p className="text-lg font-extrabold leading-tight">JDK Learn</p>
          <p className="text-xs font-medium">{adminMode ? 'Instructor Portal' : 'Student Portal'}</p>
        </div>
      </div>
      <nav aria-label="Main" className="flex-1 min-h-0 overflow-y-auto space-y-1 -mx-1 px-1 py-1 sidebar-scroll">
        {links.map(([path, label, Icon]) => (
          <NavLink key={path} to={path} end={path === '/admin'} className={({ isActive }) => sideItem(isActive)}>
            <Icon size={19} className="shrink-0" aria-hidden="true" /> <span className="truncate">{label}</span>
          </NavLink>
        ))}
      </nav>
      <div className="shrink-0 pt-4 mt-4 border-t border-brand-contrast/25">
        <button type="button" className={`${sideItem(false)} w-full`} onClick={onLogout}><LogOut size={19} className="shrink-0" aria-hidden="true" /> Log out</button>
        {!adminMode && <p className="mt-3 px-1 text-xs leading-snug">Lessons you open are saved on this device. Work done offline syncs when you reconnect.</p>}
      </div>
    </div>
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
  useCourseBrand(location.pathname);
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
      <aside className="hidden md:flex md:flex-col w-64 shrink-0 p-4 sticky top-0 h-screen bg-brand">
        <SidebarContent adminMode={adminMode} onLogout={() => setConfirmOpen(true)} />
      </aside>

      {menuOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex" role="dialog" aria-modal="true" aria-label="Menu">
          <aside className="bg-brand w-72 max-w-[85vw] h-full p-4 flex flex-col shadow-2xl pt-[calc(1rem+env(safe-area-inset-top))] pb-[calc(1rem+env(safe-area-inset-bottom))]">
            <button type="button" aria-label="Close menu" className="self-end p-2 -mt-1 -mr-1 mb-1 rounded-full text-brand-contrast hover:bg-brand-contrast/15 shrink-0" onClick={() => setMenuOpen(false)}>
              <X size={22} aria-hidden="true" />
            </button>
            <SidebarContent adminMode={adminMode} onLogout={() => setConfirmOpen(true)} />
          </aside>
          <button type="button" aria-label="Close menu" className="flex-1 bg-overlay/40" onClick={() => setMenuOpen(false)} />
        </div>
      )}

      <div className="flex-1 min-w-0">
        <header className="bg-surface/90 border-border backdrop-blur border-b px-4 md:px-8 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))] flex items-center justify-between gap-2 sm:gap-3 sticky top-0 z-30 min-h-16">
          <div className="md:hidden flex items-center gap-2 min-w-0 font-extrabold text-text">
            <button type="button" aria-label="Open menu" aria-expanded={menuOpen} className="w-10 h-10 shrink-0 grid place-items-center rounded-full bg-surface-raised border border-border" onClick={() => setMenuOpen(true)}>
              <Menu size={20} aria-hidden="true" />
            </button>
            <Logo size={30} decorative />
            <span className="truncate">JDK <span className="text-brand">Learn</span></span>
          </div>
          <div className="hidden md:block min-w-0 truncate font-bold text-lg text-text">{adminMode ? 'Instructor workspace' : 'Learn at your own pace'}</div>
          <div className="flex items-center gap-2 sm:gap-3 text-sm shrink-0">
            {!adminMode && <SyncStatus online={online} />}
            <span
              className={`flex items-center gap-1 rounded-full px-2 sm:px-3 py-1 font-semibold ${online ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'}`}
              role="status" title={online ? 'Online' : 'Offline'}
            >
              {online ? <Wifi size={15} aria-hidden="true" /> : <WifiOff size={15} aria-hidden="true" />}
              <span className="sr-only sm:not-sr-only">{online ? 'Online' : 'Offline'}</span>
            </span>
            <ThemeSwitch userId={user?.id} online={online} />
            <span className="hidden xl:inline text-text-muted truncate max-w-[14rem]">{user?.email}</span>
          </div>
        </header>

        <main className="w-full max-w-[1400px] mx-auto px-4 sm:px-6 md:px-8 pt-5 sm:pt-6 md:pt-8 pb-[calc(6rem+env(safe-area-inset-bottom))] md:pb-10" key={location.pathname}>
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
