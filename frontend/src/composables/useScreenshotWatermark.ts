import { watch, onMounted, onUnmounted } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { ROLE_EXTERNAL_CONTRACTOR } from '@/types/user'

const WATERMARK_ID = 'third-party-screenshot-watermark'
let timer: ReturnType<typeof setInterval> | null = null

function buildSvgDataUrl(line1: string, line2: string): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='360' height='240' viewBox='0 0 360 240'>
    <g transform='rotate(-24 180 120)' fill='rgba(100,116,139,0.09)'>
      <text x='18' y='96' font-size='18' font-family='Arial, PingFang SC, sans-serif' font-weight='700'>${esc(line1)}</text>
      <text x='18' y='132' font-size='14' font-family='Arial, PingFang SC, sans-serif' font-weight='600'>${esc(line2)}</text>
    </g>
  </svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

function render(username: string, employeeId: string) {
  let el = document.getElementById(WATERMARK_ID)
  if (!el) {
    el = document.createElement('div')
    el.id = WATERMARK_ID
    el.setAttribute('aria-hidden', 'true')
    document.body.appendChild(el)
  }
  Object.assign(el.style, {
    position: 'fixed', inset: '0', zIndex: '9999',
    pointerEvents: 'none', userSelect: 'none',
    backgroundRepeat: 'repeat', backgroundSize: '320px 220px',
  } as CSSStyleDeclaration)
  const now = new Date()
  const ts = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  el.style.backgroundImage = `url("${buildSvgDataUrl('第三方账号页面 · 截图追溯水印', `${username || '-'} / ${employeeId || '-'} / ${ts}`)}")`
}

function remove() {
  document.getElementById(WATERMARK_ID)?.remove()
  if (timer) { clearInterval(timer); timer = null }
}

export function useScreenshotWatermark() {
  const auth = useAuthStore()

  function sync() {
    if (!auth.user || auth.user.role !== ROLE_EXTERNAL_CONTRACTOR) { remove(); return }
    render(auth.user.username, auth.user.employeeId)
    if (!timer) {
      timer = setInterval(() => {
        if (auth.user?.role === ROLE_EXTERNAL_CONTRACTOR) render(auth.user.username, auth.user.employeeId)
        else remove()
      }, 60_000)
    }
  }

  onMounted(sync)
  watch(() => auth.user, sync)
  onUnmounted(remove)
}
