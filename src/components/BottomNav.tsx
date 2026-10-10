// ------------------------------------------------------------------
// BottomNav
//
// Fixed bottom tab bar with 5 destinations:
//   🏠 Today    👥 People    💬 Ask    📊 Report    ⚙️ Settings
//
// Design:
//   - minimum 48px tap targets (accessibility)
//   - icons + labels (never colour alone)
//   - active tab highlighted with the primary teal
//   - "Today" is the default route so it uses `end`
// ------------------------------------------------------------------

import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Icon, { type IconName } from './Icon';

type NavItem = {
  to: string;
  icon: IconName;
  labelKey: string;
  end?: boolean;
};

const ITEMS: NavItem[] = [
  { to: '/', icon: 'home', labelKey: 'today_plan', end: true },
  { to: '/people', icon: 'users', labelKey: 'people' },
  { to: '/ask', icon: 'chat', labelKey: 'ask' },
  { to: '/report', icon: 'chart', labelKey: 'report' },
  { to: '/settings', icon: 'settings', labelKey: 'settings' },
];

export default function BottomNav() {
  const { t } = useTranslation();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-30
                 pb-[env(safe-area-inset-bottom)]"
      aria-label="Main navigation"
    >
      <ul className="max-w-[480px] mx-auto grid grid-cols-5">
        {ITEMS.map((item) => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                [
                  'flex flex-col items-center justify-center py-2 min-h-[48px]',
                  'transition-colors select-none',
                  isActive
                    ? 'text-primary font-semibold'
                    : 'text-gray-500 active:text-primary',
                ].join(' ')
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={[
                      'flex items-center justify-center h-8 w-12 rounded-full transition-all',
                      isActive ? 'bg-primary/10' : '',
                    ].join(' ')}
                    aria-hidden="true"
                  >
                    <Icon name={item.icon} size={22} strokeWidth={isActive ? 2.4 : 1.9} />
                  </span>
                  <span className="text-[11px] mt-0.5 leading-tight text-center px-1">
                    {t(item.labelKey)}
                  </span>
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}