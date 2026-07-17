import {
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  Mic2,
  Settings2,
  X,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { Brand } from './Brand';
import { StorageBadge } from './StorageBadge';

const links = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/practice', label: 'Practice', icon: Mic2 },
  { to: '/history', label: 'History', icon: History },
  { to: '/settings', label: 'Settings', icon: Settings2 },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { user, logOut } = useApp();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  const handleLogOut = async () => {
    await logOut();
    navigate('/auth', { replace: true });
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-inner">
          <Brand compact />
          <nav className="desktop-nav" aria-label="Primary navigation">
            {links.map(({ to, label, icon: Icon }) => (
              <NavLink key={to} to={to} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
                <Icon size={16} />
                {label}
              </NavLink>
            ))}
          </nav>
          <div className="topbar-actions">
            <StorageBadge className="desktop-storage-badge" />
            <span className="user-chip" title={user?.username}>{user?.username.slice(0, 1).toUpperCase()}</span>
            <button className="icon-button desktop-logout" type="button" onClick={() => void handleLogOut()} aria-label="Sign out">
              <LogOut size={17} />
            </button>
            <button className="icon-button mobile-menu-button" type="button" onClick={() => setMenuOpen((open) => !open)} aria-label="Toggle navigation">
              {menuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>
        {menuOpen && (
          <nav className="mobile-nav" aria-label="Mobile navigation">
            <StorageBadge />
            {links.map(({ to, label, icon: Icon }) => (
              <NavLink key={to} to={to} onClick={() => setMenuOpen(false)} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
                <Icon size={17} />
                {label}
              </NavLink>
            ))}
            <button type="button" className="nav-link nav-button" onClick={() => void handleLogOut()}>
              <LogOut size={17} /> Sign out
            </button>
          </nav>
        )}
      </header>
      <main className="main-content">{children}</main>
    </div>
  );
}
