export const AMC_QR_LOGO = '/logos/amc-sunflower.svg'
export const AMC_QR_BACKGROUND = {
  backgroundColor: '#f7f3dc',
  backgroundImage: 'radial-gradient(ellipse at 0% 0%, #fff1af 0%, transparent 55%), radial-gradient(ellipse at 100% 40%, #e5eee5 0%, transparent 65%), linear-gradient(#13252308 1px, transparent 1px), linear-gradient(90deg, #13252308 1px, transparent 1px)',
  backgroundSize: 'auto, auto, 48px 48px, 48px 48px',
}

export function drawAmcQrBackground(ctx: CanvasRenderingContext2D, width: number, height: number) {
  ctx.fillStyle = AMC_QR_BACKGROUND.backgroundColor
  ctx.fillRect(0, 0, width, height)
  const gold = ctx.createRadialGradient(0, 0, 0, 0, 0, width * 1.1)
  gold.addColorStop(0, '#fff1af')
  gold.addColorStop(1, '#fff1af00')
  ctx.fillStyle = gold
  ctx.fillRect(0, 0, width, height)
  const mint = ctx.createRadialGradient(width, height * .4, 0, width, height * .4, width)
  mint.addColorStop(0, '#e5eee5')
  mint.addColorStop(1, '#e5eee500')
  ctx.fillStyle = mint
  ctx.fillRect(0, 0, width, height)
  ctx.strokeStyle = '#1325230a'
  ctx.lineWidth = width / 1200
  const step = width * 48 / 320
  ctx.beginPath()
  for (let x = 0; x <= width; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, height) }
  for (let y = 0; y <= height; y += step) { ctx.moveTo(0, y); ctx.lineTo(width, y) }
  ctx.stroke()
}
