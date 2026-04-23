import { NavLink } from 'react-router-dom';

const base = 'py-3 text-center';
const active = 'text-brand font-medium';
const idle = 'text-slate-500';

export default function BottomNav() {
  return (
    <nav
      className="fixed bottom-0 inset-x-0 border-t bg-white"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className="max-w-md mx-auto grid grid-cols-3 text-xs">
        <NavLink to="/home" className={({ isActive }) => `${base} ${isActive ? active : idle}`}>
          홈
        </NavLink>
        <NavLink to="/market" className={({ isActive }) => `${base} ${isActive ? active : idle}`}>
          마켓
        </NavLink>
        <NavLink to="/profile" className={({ isActive }) => `${base} ${isActive ? active : idle}`}>
          프로필
        </NavLink>
      </div>
    </nav>
  );
}
