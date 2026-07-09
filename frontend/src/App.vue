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

onMounted(() => window.addEventListener('auth:session-expired', onSessionExpired))
onUnmounted(() => window.removeEventListener('auth:session-expired', onSessionExpired))
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
