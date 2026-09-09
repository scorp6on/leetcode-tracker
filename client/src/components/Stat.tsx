/** A labelled headline number, used on the queue and dashboard screens. */
export function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-sm text-muted">{label}</div>
      <div className="mt-1 font-display text-2xl font-semibold">{value}</div>
    </div>
  )
}
