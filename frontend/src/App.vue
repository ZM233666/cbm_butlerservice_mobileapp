<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'
import { RouterView, useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import ScreenshotWatermark from '@/components/shared/ScreenshotWatermark.vue'
import BottomNav from '@/components/layout/BottomNav.vue'
import ToastHost from '@/components/common/ToastHost.vue'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const showBottomNav = computed(() => auth.isLoggedIn && route.meta.guest !== true)

function onSessionExpired() {
  auth.logout()
  router.replace({ path: '/login' })
}

function onTokensRefreshed() {
  auth.syncTokensFromStorage()
}

function onUnhandledRejection(event: PromiseRejectionEvent) {
  const reason = event.reason as { name?: string; message?: string; status?: number } | undefined
  const msg = String(reason?.message || '')
  if (reason?.name === 'ApiError' && (msg === 'session_expired' || reason?.status === 401)) {
    event.preventDefault()
    onSessionExpired()
  }
}

onMounted(() => {
  window.addEventListener('auth:session-expired', onSessionExpired)
  window.addEventListener('auth:tokens-refreshed', onTokensRefreshed)
  window.addEventListener('unhandledrejection', onUnhandledRejection)
})
onUnmounted(() => {
  window.removeEventListener('auth:session-expired', onSessionExpired)
  window.removeEventListener('auth:tokens-refreshed', onTokensRefreshed)
  window.removeEventListener('unhandledrejection', onUnhandledRejection)
})
</script>

<template>
  <ScreenshotWatermark />
  <ToastHost />
  <RouterView v-slot="{ Component }">
    <KeepAlive include="TaskListView">
      <component :is="Component" />
    </KeepAlive>
  </RouterView>
  <BottomNav v-if="showBottomNav" />
</template>
