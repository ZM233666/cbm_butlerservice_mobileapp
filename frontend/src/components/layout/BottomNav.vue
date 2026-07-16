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
    { to: '/assignments', label: t.value.navAssignments, icon: 'assignments' },
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
      <!-- Home -->
      <svg v-if="item.icon === 'home'" class="bottom-nav__icon" viewBox="0 0 24 24" aria-hidden="true">
        <path
          class="bottom-nav__glyph--outline"
          fill="none"
          stroke="currentColor"
          stroke-width="1.75"
          stroke-linecap="round"
          stroke-linejoin="round"
          d="M4.5 10.8 12 4.5l7.5 6.3V19a1.5 1.5 0 0 1-1.5 1.5h-3.6v-5.2h-4.8V20.5H6A1.5 1.5 0 0 1 4.5 19V10.8Z"
        />
        <path
          class="bottom-nav__glyph--fill"
          fill="currentColor"
          d="M12 3.6 3.7 10.6a.9.9 0 0 0-.3.65V19a2.2 2.2 0 0 0 2.2 2.2h4.1v-5.6h4.6v5.6h4.1A2.2 2.2 0 0 0 20.6 19v-7.75a.9.9 0 0 0-.3-.65L12 3.6Z"
        />
      </svg>

      <!-- Assignments -->
      <svg v-else-if="item.icon === 'assignments'" class="bottom-nav__icon" viewBox="0 0 24 24" aria-hidden="true">
        <path
          class="bottom-nav__glyph--outline"
          fill="none"
          stroke="currentColor"
          stroke-width="1.75"
          stroke-linecap="round"
          stroke-linejoin="round"
          d="M8.2 4.5h7.6A2.2 2.2 0 0 1 18 6.7v12.6A2.2 2.2 0 0 1 15.8 21.5H8.2A2.2 2.2 0 0 1 6 19.3V6.7A2.2 2.2 0 0 1 8.2 4.5Z"
        />
        <path class="bottom-nav__glyph--outline" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" d="M9.2 9.4h5.6M9.2 13h5.6M9.2 16.6h3.4" />
        <path class="bottom-nav__glyph--outline" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" d="M9.4 3.4h5.2" />
        <path
          class="bottom-nav__glyph--fill"
          fill="currentColor"
          d="M8.2 3.7h7.6A3 3 0 0 1 18.8 6.7v12.6a3 3 0 0 1-3 3H8.2a3 3 0 0 1-3-3V6.7a3 3 0 0 1 3-3Zm1.4 5.2a.85.85 0 0 0 0 1.7h5.2a.85.85 0 0 0 0-1.7H9.6Zm0 3.6a.85.85 0 0 0 0 1.7h5.2a.85.85 0 0 0 0-1.7H9.6Zm0 3.6a.85.85 0 0 0 0 1.7H13a.85.85 0 0 0 0-1.7H9.6Z"
        />
      </svg>

      <!-- Tasks / Task Centre — clipboard checklist -->
      <svg v-else-if="item.icon === 'task-center'" class="bottom-nav__icon" viewBox="0 0 24 24" aria-hidden="true">
        <path
          class="bottom-nav__glyph--outline"
          fill="none"
          stroke="currentColor"
          stroke-width="1.75"
          stroke-linecap="round"
          stroke-linejoin="round"
          d="M9 4.4h6a1.1 1.1 0 0 1 1.1 1.1V6.2h1.4A2.1 2.1 0 0 1 19.6 8.3v10.5a2.1 2.1 0 0 1-2.1 2.1H6.5a2.1 2.1 0 0 1-2.1-2.1V8.3A2.1 2.1 0 0 1 6.5 6.2h1.4V5.5A1.1 1.1 0 0 1 9 4.4Z"
        />
        <path class="bottom-nav__glyph--outline" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" d="m8.6 12.2 1.7 1.7 3.6-3.8M8.6 17.1h6.8" />
        <path
          class="bottom-nav__glyph--fill"
          fill="currentColor"
          d="M9 3.55h6a2 2 0 0 1 2 2v.35h1.15A3 3 0 0 1 21.15 8.9v10a3 3 0 0 1-3 3H5.85a3 3 0 0 1-3-3v-10a3 3 0 0 1 3-3H7V5.55a2 2 0 0 1 2-2Zm-.3 9.35a.85.85 0 0 0 0 1.2l1.9 1.9a.85.85 0 0 0 1.2 0l3.85-4.05a.85.85 0 1 0-1.23-1.17l-3.25 3.42-1.27-1.27a.85.85 0 0 0-1.2 0ZM8.6 16.35a.85.85 0 0 0 0 1.7h6.8a.85.85 0 0 0 0-1.7H8.6Z"
        />
      </svg>

      <!-- Records — document + bars -->
      <svg v-else-if="item.icon === 'records'" class="bottom-nav__icon" viewBox="0 0 24 24" aria-hidden="true">
        <path
          class="bottom-nav__glyph--outline"
          fill="none"
          stroke="currentColor"
          stroke-width="1.75"
          stroke-linecap="round"
          stroke-linejoin="round"
          d="M7.2 3.8h7.1L18.8 8.4v11a1.8 1.8 0 0 1-1.8 1.8H7.2A1.8 1.8 0 0 1 5.4 19.4V5.6A1.8 1.8 0 0 1 7.2 3.8Z"
        />
        <path class="bottom-nav__glyph--outline" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" d="M14 3.9v3.8h3.9M9 13.2v4.2M12 11.4v6M15 14.5v3.9" />
        <path
          class="bottom-nav__glyph--fill"
          fill="currentColor"
          d="M7.2 2.95h7.35L19.55 8.1v11.3A2.65 2.65 0 0 1 16.9 22H7.2A2.65 2.65 0 0 1 4.55 19.4V5.6A2.65 2.65 0 0 1 7.2 2.95ZM14.1 4.3v3.35h3.35L14.1 4.3ZM9 12.35a.85.85 0 0 0-.85.85v4.2a.85.85 0 0 0 1.7 0v-4.2A.85.85 0 0 0 9 12.35Zm3-1.8a.85.85 0 0 0-.85.85v6a.85.85 0 0 0 1.7 0v-6a.85.85 0 0 0-.85-.85Zm3 3.1a.85.85 0 0 0-.85.85v2.9a.85.85 0 0 0 1.7 0v-2.9a.85.85 0 0 0-.85-.85Z"
        />
      </svg>

      <!-- Profile -->
      <svg v-else class="bottom-nav__icon" viewBox="0 0 24 24" aria-hidden="true">
        <path
          class="bottom-nav__glyph--outline"
          fill="none"
          stroke="currentColor"
          stroke-width="1.75"
          stroke-linecap="round"
          d="M12 12.4a3.6 3.6 0 1 0 0-7.2 3.6 3.6 0 0 0 0 7.2ZM5.2 20.2a6.8 6.8 0 0 1 13.6 0"
        />
        <path
          class="bottom-nav__glyph--fill"
          fill="currentColor"
          d="M12 4.1a4.45 4.45 0 1 1 0 8.9 4.45 4.45 0 0 1 0-8.9Zm0 10.2c4.35 0 7.85 2.95 8.55 6.85a1 1 0 0 1-.98 1.2H4.43a1 1 0 0 1-.98-1.2C4.15 17.25 7.65 14.3 12 14.3Z"
        />
      </svg>

      <span>{{ item.label }}</span>
    </router-link>
  </nav>
</template>

<style scoped>
.bottom-nav {
  position: fixed;
  z-index: 10050;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  justify-content: space-around;
  align-items: stretch;
  gap: 0.15rem;
  max-width: var(--column-max, 28rem);
  margin: 0 auto;
  height: calc(var(--bottom-nav-h, 3.5rem) + env(safe-area-inset-bottom, 0px));
  padding: 0.15rem 0.25rem 0.3rem;
  padding-bottom: calc(0.3rem + env(safe-area-inset-bottom, 0px));
  box-sizing: border-box;
  border-radius: 0;
  border-top: 1px solid rgba(196, 204, 215, 0.65);
  background: rgba(255, 255, 255, 0.96);
  backdrop-filter: saturate(160%) blur(14px);
  -webkit-backdrop-filter: saturate(160%) blur(14px);
  box-shadow: 0 -4px 16px rgba(0, 69, 126, 0.06);
}

.bottom-nav__item {
  position: relative;
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.18rem;
  min-width: 0;
  min-height: 2.8rem;
  padding: 0.35rem 0.25rem 0.2rem;
  border-radius: 0;
  color: var(--bottom-nav-muted, #8a94a6);
  text-decoration: none;
  font-size: 0.66rem;
  font-weight: 650;
  letter-spacing: 0.01em;
  line-height: 1.15;
  text-align: center;
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
  transition: color 0.15s ease;
}

.bottom-nav__item::before {
  content: "";
  position: absolute;
  top: 0;
  left: 22%;
  right: 22%;
  height: 3px;
  border-radius: 999px;
  background: transparent;
  transition: background 0.15s ease;
}

.bottom-nav__item:active {
  background: transparent;
  opacity: 0.88;
}

.bottom-nav__item.is-active {
  color: var(--kb-brand, #00467f);
  background: transparent;
  border: 0;
  box-shadow: none;
  font-weight: 760;
}

.bottom-nav__item.is-active::before {
  background: var(--kb-brand, #00467f);
}

.bottom-nav__icon {
  display: block;
  width: 24px;
  height: 24px;
  flex-shrink: 0;
  color: currentColor;
}

.bottom-nav__glyph--fill {
  display: none;
}

.bottom-nav__item.is-active .bottom-nav__glyph--outline {
  display: none;
}

.bottom-nav__item.is-active .bottom-nav__glyph--fill {
  display: block;
}

.bottom-nav__item span {
  display: block;
  max-width: 5.5rem;
  line-height: 1.25;
}
</style>
