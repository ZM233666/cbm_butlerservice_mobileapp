import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { isTokenRefreshFailure, parseTokenRefreshResponse } from '@/api/token-refresh'

const TOKEN_KEY = 'butler.auth.token'
const REFRESH_KEY = 'butler.auth.refresh'

// 冷启动时尝试用 refresh token 续期 access token（只跑一次）
let _bootRefreshDone = false
function accessTokenNeedsRefresh(token: string): boolean {
  try {
    const payload = token.split('.')[1]
    if (!payload) return true
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(payload.length / 4) * 4, '=')
    const exp = Number(JSON.parse(atob(base64))?.exp)
    return !Number.isFinite(exp) || exp * 1000 <= Date.now() + 60_000
  } catch {
    return true
  }
}

async function tryBootRefresh(): Promise<void> {
  if (_bootRefreshDone) return
  _bootRefreshDone = true
  const access = localStorage.getItem(TOKEN_KEY)
  const storedRefresh = localStorage.getItem(REFRESH_KEY)
  if (!access || !storedRefresh) return
  if (!accessTokenNeedsRefresh(access)) return
  try {
    const res = await fetch('/token/refresh/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh: storedRefresh }),
    })
    if (!res.ok) {
      // 远端不可用/连接池打满时：不强制登出，保留本地会话继续开发
      if (res.status >= 500) return
      localStorage.removeItem(TOKEN_KEY)
      localStorage.removeItem(REFRESH_KEY)
      localStorage.removeItem('butler.auth.user')
      window.dispatchEvent(new CustomEvent('auth:session-expired'))
      return
    }
    const data = await res.json().catch(() => null)
    if (isTokenRefreshFailure(data, true)) return
    const { access: newAccess, refresh: newRefresh } = parseTokenRefreshResponse(data)
    if (newAccess) localStorage.setItem(TOKEN_KEY, newAccess)
    if (newRefresh) localStorage.setItem(REFRESH_KEY, newRefresh)
  } catch {
    // 网络异常时静默失败，让后续 API 请求触发 401 重试流程
  }
}

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/LoginView.vue'),
      meta: { guest: true },
    },
    {
      path: '/',
      name: 'home',
      component: () => import('@/views/HomeView.vue'),
    },
    {
      path: '/assignments',
      name: 'assignments',
      component: () => import('@/views/ManagerAssignmentsView.vue'),
    },
    {
      path: '/task-list',
      name: 'task-list',
      component: () => import('@/views/TaskListView.vue'),
    },
    {
      path: '/task-center',
      name: 'task-center',
      component: () => import('@/views/TaskCenterView.vue'),
    },
    {
      path: '/records',
      name: 'records',
      component: () => import('@/views/RecordsView.vue'),
    },
    {
      path: '/my',
      name: 'my',
      component: () => import('@/views/MyView.vue'),
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: '/',
    },
  ],
})

// 会话内仅冷启动拉一次 profile，后续依赖 store TTL 去重
let _sessionProfileBootDone = false

router.beforeEach(async (to) => {
  const auth = useAuthStore()

  if (!auth.isLoggedIn) {
    _sessionProfileBootDone = false
  }

  // 冷启动时主动续期；profile 每会话只拉一次（5 分钟 TTL 兜底）
  if (auth.isLoggedIn) {
    await tryBootRefresh()
    auth.syncTokensFromStorage()
    if (!_sessionProfileBootDone) {
      _sessionProfileBootDone = true
      void auth.refreshProfile().catch(() => {})
    }
  }

  if (to.meta.guest) {
    if (auth.isLoggedIn) return { path: '/' }
    return true
  }

  if (!auth.isLoggedIn) {
    return { path: '/login', query: { next: to.fullPath } }
  }

  if (!auth.canAccess(to.path)) {
    return { path: '/' }
  }

  return true
})

router.onError((err, to) => {
  const msg = String((err as Error)?.message || err || '')
  const isChunkError =
    msg.includes('Failed to fetch dynamically imported module')
    || msg.includes('Importing a module script failed')
    || msg.includes('Loading chunk')
    || msg.includes('ChunkLoadError')
  if (!isChunkError) return
  const key = 'butler.chunk-reload'
  const last = Number(sessionStorage.getItem(key) || 0)
  if (Date.now() - last < 10_000) return
  sessionStorage.setItem(key, String(Date.now()))
  const target = to?.fullPath || window.location.pathname + window.location.search
  window.location.assign(target)
})

export default router
