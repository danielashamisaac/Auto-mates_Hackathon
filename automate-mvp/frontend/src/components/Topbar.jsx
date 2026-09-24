import { NavLink, Link } from 'react-router-dom';
import { Cpu, Moon, SunMedium } from 'lucide-react';

export default function Topbar({ theme, onToggleTheme }) {
  return (
    <header className="topbar">
      <Link to="/" className="brand" style={{ textDecoration: 'none', color: 'inherit' }}>
        <div className="brand-mark">
          <Cpu />
        </div>
        <div>
          <div className="brand-name">AUTOMATE</div>
          <div className="tagline">Automate · Innovate · Elevate</div>
        </div>
      </Link>

      <nav>
        <NavLink to="/capture" className={({ isActive }) => (isActive ? 'active' : '')}>
          Student Capturing
        </NavLink>
        <NavLink to="/payment" className={({ isActive }) => (isActive ? 'active' : '')}>
          Payment Portal
        </NavLink>
        <NavLink to="/admin" className={({ isActive }) => (isActive ? 'active' : '')}>
          Admin Portal
        </NavLink>
      </nav>

      <button className="theme-toggle" type="button" onClick={onToggleTheme} aria-label="Toggle light and dark mode">
        {theme === 'light' ? <Moon size={16} /> : <SunMedium size={16} />}
        <span>{theme === 'light' ? 'Dark' : 'Light'}</span>
      </button>
    </header>
  );
}
