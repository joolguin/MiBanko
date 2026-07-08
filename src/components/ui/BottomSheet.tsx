import type { ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

interface Props { open: boolean; title: string; children: ReactNode; onClose: () => void }

export function BottomSheet({ open, title, children, onClose }: Props) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div className="fixed inset-0 z-50 bg-black/50" onClick={onClose}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
          <motion.div className="fixed inset-x-0 bottom-0 z-50 bg-ink-1 border-t border-ink-line rounded-t-2xl p-5 pb-8"
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}>
            <p className="text-sm text-zinc-400 mb-3">{title}</p>
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
