<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useI18n } from '@/composables/useI18n'

const route = useRoute()
const auth = useAuthStore()
const { t } = useI18n()

interface NavItem { to: string; label: string; icon: string }

const items = computed<NavItem[]>(() => {
  return [
    { to: '/', label: t.value.navHome, icon: 'home' },
    { to: '/task-center', label: t.value.navTaskCenter, icon: 'task-center' },
    { to: '/records', label: t.value.navRecords, icon: 'records' },
    { to: '/my', label: t.value.navMy, icon: 'my' },
  ]
})

const visibleItems = computed(() => items.value.filter(i => auth.canAccess(i.to)))
</script>

<template>
  <nav class="bottom-nav" aria-label="主导航">
    <router-link
      v-for="item in visibleItems"
      :key="item.to"
      :to="item.to"
      class="bottom-nav__item"
      :class="{ 'is-active': route.path === item.to }"
      :aria-current="route.path === item.to ? 'page' : undefined"
    >
      <svg v-if="item.icon === 'home'" class="bottom-nav__icon" viewBox="0 0 24 24" aria-hidden="true">
        <path fill="currentColor" stroke="none" d="M12 4L4 10.5h16L12 4z" />
        <path fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" d="M5 10.5V20h4v-6h6v6h4V10.5" />
      </svg>
      <svg v-else-if="item.icon === 'records'" class="bottom-nav__icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" d="M3 10.5V19a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-9" />
        <path stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" d="M3 10.5V8a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v.5" />
        <ellipse cx="6.25" cy="18.6" rx="2" ry="1.15" stroke="currentColor" stroke-width="1.65" fill="none" />
        <path stroke="currentColor" stroke-width="1.65" stroke-linecap="round" d="M4.25 18.6v-2.5M8.25 18.6v-2.5" />
      </svg>
      <svg v-else-if="item.icon === 'task-center'" class="bottom-nav__icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="3.5" y="5.5" width="17" height="15" rx="2.2" stroke="currentColor" stroke-width="1.65" />
        <path d="M8.5 5.2a2 2 0 0 1 2-1.7h3a2 2 0 0 1 2 1.7" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" />
        <path d="M8 11h8M8 15h5" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" />
      </svg>
      <svg v-else class="bottom-nav__icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="9" r="3.25" stroke="currentColor" stroke-width="1.65" />
        <path stroke="currentColor" stroke-width="1.65" stroke-linecap="round" d="M5 20.25a7.2 7.2 0 0 1 14 0" />
      </svg>
      <span>{{ item.label }}</span>
    </router-link>
  </nav>
</template>

<style scoped>
.bottom-nav {
  position: fixed;
  /* 高于第三方截图水印层（home.css 中 .screenshot-watermark 为 9999） */
  z-index: 10050;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  justify-content: space-around;
  align-items: stretch;
  gap: 0.25rem;
  max-width: var(--column-max, 28rem);
  margin: 0 auto;
  height: calc(var(--bottom-nav-h, 3.5rem) + env(safe-area-inset-bottom, 0px));
  padding: 0.2rem 0.35rem;
  padding-bottom: calc(0.4rem + env(safe-area-inset-bottom, 0px));
  box-sizing: border-box;
  border-radius: 18px 18px 0 0;
  border-top: 1px solid rgba(148, 163, 184, 0.25);
  background: rgba(255, 255, 255, 0.78);
  backdrop-filter: saturate(160%) blur(18px);
  -webkit-backdrop-filter: saturate(160%) blur(18px);
  box-shadow:
    0 -8px 24px rgba(15, 23, 42, 0.08),
    0 1px 0 rgba(255, 255, 255, 0.85) inset;
}

.bottom-nav__item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.2rem;
  min-width: 0;
  min-height: 2.8rem;
  padding: 0.2rem 0.35rem;
  border-radius: 12px;
  color: var(--bottom-nav-muted, #71717a);
  text-decoration: none;
  font-size: 0.68rem;
  font-weight: 600;
  letter-spacing: 0.01em;
  line-height: 1.15;
  text-align: center;
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
  transition: color 0.15s ease, background 0.15s ease;
}

.bottom-nav__item:active {
  background: rgba(0, 70, 127, 0.06);
}

.bottom-nav__item.is-active {
  /* 更高对比度：户外强光下更易辨识 */
  color: #00345e;
  background: rgba(0, 70, 127, 0.16);
  border: 1px solid rgba(0, 70, 127, 0.22);
  box-shadow:
    0 6px 14px rgba(0, 70, 127, 0.12),
    0 1px 0 rgba(255, 255, 255, 0.65) inset;
  font-weight: 750;
}

.bottom-nav__icon {
  display: block;
  width: 26px;
  height: 26px;
  flex-shrink: 0;
  /* 默认图标跟随文字颜色，选中态对比度更统一 */
  color: currentColor;
}

.bottom-nav__item.is-active .bottom-nav__icon {
  color: #00345e;
}

.bottom-nav__item span {
  display: block;
  max-width: 5.5rem;
  line-height: 1.25;
}
</style>
