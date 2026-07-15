import { type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { House, CalendarBlank, ChartLine, GearSix, Plus } from '@phosphor-icons/react'

// El ::after es un área de tap de 44x44 (WCAG 2.5.5). Va absoluto y centrado a
// propósito: así no participa del layout y los íconos no se mueven ni un pixel.
// Los centros de los ítems están a 55px o más entre sí, así que no se solapan.
function NavItem({ icon, label, active, to }: {
  icon: ReactNode; label: string; active?: boolean; to: string
}) {
  return (
    <Link
      to={to}
      className="relative after:absolute after:left-1/2 after:top-1/2 after:-translate-x-1/2 after:-translate-y-1/2 after:h-11 after:w-11 after:content-['']"
    >
      <div className={`flex flex-col items-center gap-0.5 text-[10px] ${
        active ? 'text-accent-bright' : 'text-zinc-400'
      }`}>
        {icon}<span>{label}</span>
      </div>
    </Link>
  )
}

// chrome=false es para pantallas modales (/registro): sin nav ni FAB, y sin el
// pb-24 que les hace de colchón. Ese padding sumado al min-h-[100dvh] de la
// pantalla es lo que hacía desbordar el viewport en 96px.
export function AppShell({ children, chrome = true }: { children: ReactNode; chrome?: boolean }) {
  const { pathname } = useLocation()
  return (
    <div className="min-h-[100dvh] flex flex-col font-sans">
      <div className={chrome ? 'flex-1 pb-24' : 'flex-1'}>{children}</div>
      {chrome && (
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
      )}
    </div>
  )
}
