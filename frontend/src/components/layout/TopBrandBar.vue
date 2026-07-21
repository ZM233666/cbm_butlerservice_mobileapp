<script setup lang="ts">
import LangSwitch from '@/components/common/LangSwitch.vue'
import type { RouteLocationRaw } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

defineProps<{
  title?: string
  /** 若设置则左侧显示返回链接（用于任务列表等子页），否则显示 Logo */
  backTo?: RouteLocationRaw
  backLabel?: string
}>()

const auth = useAuthStore()
</script>

<template>
  <header class="top-brand-bar" :class="{ 'top-brand-bar--exclusive': auth.isManager }" aria-label="品牌栏">
    <div class="top-brand-bar__left">
      <router-link v-if="backTo" class="top-brand-bar__back" :to="backTo">{{ backLabel }}</router-link>
      <img v-else class="top-brand-bar__logo" src="/RVSChinaDT_Logo.png" width="364" height="230" alt="RVS-CHINA DIGITAL TEAM" decoding="async" />
    </div>
    <span class="top-brand-bar__title">{{ title ?? 'Digital CBM' }}</span>
    <LangSwitch class="top-brand-bar__lang" />
  </header>
</template>

<style scoped>
.top-brand-bar {
  width: 100%;
  min-height: 3.4rem;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  padding: 0.55rem 0.95rem;
  background: #ffffff;
  border-bottom: 1px solid #e0e0e0;
  position: relative;
}

.top-brand-bar--exclusive {
  border-bottom-color: rgba(212, 168, 75, 0.55);
  box-shadow: 0 1px 0 rgba(232, 197, 106, 0.35);
}

.top-brand-bar__left {
  display: inline-flex;
  align-items: center;
  gap: 0.6rem;
  min-width: 0;
}

.top-brand-bar__back {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 2.05rem;
  padding: 0.25rem 0.45rem;
  margin-left: -0.12rem;
  border-radius: 10px;
  font-size: 0.82rem;
  font-weight: 650;
  color: #00467f;
  text-decoration: none;
  white-space: nowrap;
  max-width: min(42vw, 9.5rem);
  overflow: hidden;
  text-overflow: ellipsis;
  -webkit-tap-highlight-color: transparent;
}

.top-brand-bar__back:active {
  opacity: 0.88;
}

.top-brand-bar__logo {
  display: block;
  width: min(38vw, 8.6rem);
  height: auto;
  max-height: 1.9rem;
  aspect-ratio: 364 / 230;
  object-fit: contain;
  -webkit-user-drag: none;
  -webkit-user-select: none;
  user-select: none;
}

.top-brand-bar__title {
  display: block;
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  font-size: clamp(0.88rem, 3.2vw, 1.02rem);
  font-weight: 760;
  color: #00467f;
  letter-spacing: 0.01em;
  white-space: nowrap;
  max-width: calc(100% - 2rem);
  overflow: hidden;
  text-overflow: ellipsis;
  text-align: center;
  pointer-events: none;
}

.top-brand-bar__lang {
  margin-left: auto;
}
</style>
