/**
 * Compute per-index staggered entrance style for a list.
 * Returns a style object with `animationDelay` so children animate in sequence.
 *
 * Usage:
 *   const getStaggerStyle = useStaggerStyle()
 *   {items.map((it, i) => <div style={getStaggerStyle(i)}>...</div>)}
 */
export function useStaggerStyle(max = 8) {
  return (index: number): React.CSSProperties => ({
    animationDelay: `${Math.min(index, max) * 35}ms`
  })
}