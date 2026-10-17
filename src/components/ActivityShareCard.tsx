import { brandEntryTheme } from '@/lib/brandEntryTheme'

export default function ActivityShareCard({ name, color, locale, logo }: { name: string; color?: string | null; locale: 'zh' | 'en'; logo: string }) {
  const theme = color ? brandEntryTheme(color) : { ink: '#244c40', border: '#d9dec4', background: '#f8f2d8' }
  return <div style={{ width: '100%', height: '100%', display: 'flex', position: 'relative', background: theme.background, color: '#172f29', padding: 48, fontFamily: 'Activity Sans' }}>
    <div style={{ display: 'flex', position: 'absolute', width: 520, height: 520, borderRadius: 260, background: '#fff0b4', left: -210, top: -180 }}/>
    <div style={{ display: 'flex', position: 'absolute', width: 500, height: 500, borderRadius: 250, background: '#e4eee4', right: -190, bottom: -180 }}/>
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', borderRadius: 48, background: '#ffffff', border: `2px solid ${theme.border}`, padding: '44px 36px', textAlign: 'center' }}>
      <div style={{ display: 'flex', color: theme.ink, fontSize: 24, letterSpacing: 3, marginBottom: 28 }}>{locale === 'zh' ? '这一面，让我们更近一点' : 'A LITTLE HELLO. A LOVELY CONNECTION.'}</div>
      <div style={{ display: 'flex', width: 60, height: 7, borderRadius: 4, background: color || '#d8b852', marginBottom: 34 }}/>
      <div style={{ display: 'flex', justifyContent: 'center', fontSize: name.length > 20 ? 46 : 64, fontWeight: 600, lineHeight: 1.25, color: theme.ink, maxWidth: 610, marginBottom: 30 }}>{name.length > 32 ? name.slice(0, 31) + '…' : name}</div>
      <div style={{ display: 'flex', fontSize: 40, marginBottom: 16 }}>{locale === 'zh' ? '很高兴遇见你！' : 'Lovely to see you!'}</div>
      <div style={{ display: 'flex', fontSize: 27, color: '#697770', lineHeight: 1.6, maxWidth: 540 }}>{locale === 'zh' ? '来看看我们的新鲜事，也期待下一次见面。' : 'Good things to discover. A reason to stay in touch.'}</div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 54, gap: 9, fontSize: 18, color: '#7c8882' }}>
        <span>Powered by</span>{/* eslint-disable-next-line @next/next/no-img-element -- Satori requires a native image with embedded artwork. */}
        <img src={logo} width={25} height={25} alt=""/><span>AMC - AI Marketing Crew</span>
      </div>
    </div>
  </div>
}
