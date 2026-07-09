import { type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { House, CalendarBlank, ChartLine, GearSix, Plus } from '@phosphor-icons/react'

function NavItem({ icon, label, active, disabled, to }: {
  icon: ReactNode; label: string; active?: boolean; disabled?: boolean; to?: string
}) {
  const content = (
    <div className={`flex flex-col items-center gap-0.5 text-[10px] ${
      active ? 'text-accent-bright' : disabled ? 'text-zinc-700' : 'text-zinc-400'
    }`}>
      {icon}<span>{label}</span>
    </div>
  )
  if (disabled || !to) return content
  return <Link to={to}>{content}</Link>
}

export function AppShell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  return (
    <div className="min-h-[100dvh] flex flex-col font-sans">
      <div className="flex-1 pb-24">{children}</div>
      <nav className="fixed bottom-0 inset-x-0 border-t border-ink-line bg-ink-1 flex items-center justify-around px-5 pt-3 pb-6">
        <NavItem to="/" active={pathname === '/'} label="Inicio" icon={<House size={22} />} />
        <NavItem to="/ciclo" active={pathname === '/ciclo'} label="Ciclo" icon={<CalendarBlank size={22} />} />
        <Link to="/registro" aria-label="Registrar"
          className="w-14 h-14 -mt-8 rounded-full bg-accent flex items-center justify-center border-4 border-ink active:scale-[0.97] transition-transform">
          <Plus size={26} weight="bold" className="text-accent-deep" />
        </Link>
        <NavItem to="/historial" active={pathname === '/historial'} label="Historial" icon={<ChartLine size={22} />} />
        <NavItem to="/ajustes" active={pathname === '/ajustes'} label="Ajustes" icon={<GearSix size={22} />} />
      </nav>
    </div>
  )
}
