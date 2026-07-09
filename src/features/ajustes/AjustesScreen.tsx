import { SubscriptionsSection } from './SubscriptionsSection'
import { CategoriesSection } from './CategoriesSection'
import { BiceConfigSection } from './BiceConfigSection'
import { FreshnessSection } from './FreshnessSection'

export function AjustesScreen() {
  return (
    <section className="px-6 pt-8 flex flex-col gap-8">
      <p className="text-[11px] uppercase tracking-[0.14em] text-zinc-600">ajustes</p>
      <SubscriptionsSection />
      <CategoriesSection />
      <BiceConfigSection />
      <FreshnessSection />
    </section>
  )
}
