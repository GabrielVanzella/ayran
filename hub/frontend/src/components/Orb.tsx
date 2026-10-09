export default function Orb({ size = 40, thinking = false }: { size?: number; thinking?: boolean }) {
  return <div className={`orb shrink-0 rounded-full ${thinking ? 'thinking' : ''}`} style={{ width: size, height: size }} />
}
