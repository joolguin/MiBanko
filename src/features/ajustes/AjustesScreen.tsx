import { Link } from 'react-router-dom'
import { SubscriptionsSection } from './SubscriptionsSection'
import { CategoriesSection } from './CategoriesSection'
import { BiceConfigSection } from './BiceConfigSection'
import { FreshnessSection } from './FreshnessSection'

export function AjustesScreen() {
  return (
    <section className="px-6 pt-8 flex flex-col gap-8">
      <p className="text-[11px] uppercase tracking-[0.14em] text-faint">ajustes</p>
      <Link to="/importar"
        className="bg-ink-2 border border-ink-line rounded-xl px-4 py-3 flex items-center justify-between active:scale-[0.99]">
        <span className="text-sm text-zinc-200">Importar movimientos (BICE Visa o Santander)</span>
        <span className="text-accent-bright text-sm">Importar</span>
      </Link>
      <SubscriptionsSection />
      <CategoriesSection />
      <BiceConfigSection />
      <FreshnessSection />
    </section>
  )
}
