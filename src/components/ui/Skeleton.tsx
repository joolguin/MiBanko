export function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-ink-2 rounded ${className ?? ''}`} />
}
