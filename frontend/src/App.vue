<script setup lang="ts">
import { computed } from 'vue'
import { RouterView, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import ScreenshotWatermark from '@/components/shared/ScreenshotWatermark.vue'
import BottomNav from '@/components/layout/BottomNav.vue'

const route = useRoute()
const auth = useAuthStore()
const showBottomNav = computed(() => auth.isLoggedIn && route.meta.guest !== true)
</script>

<template>
  <ScreenshotWatermark />
  <RouterView />
  <BottomNav v-if="showBottomNav" />
</template>
