<script setup lang="ts">
import { computed } from 'vue'
import { useI18nStore } from '@/stores/i18n'
import { storeToRefs } from 'pinia'

defineProps<{
  title?: string
  /** 若设置则左侧显示返回链接（用于任务列表等子页），否则显示 Logo */
  backTo?: string
  backLabel?: string
}>()

const i18n = useI18nStore()
const { lang } = storeToRefs(i18n)
const toggleLabel = computed(() => (lang.value === 'zh' ? 'CN/EN' : 'EN/CN'))
</script>

<template>
  <header class="top-brand-bar" aria-label="品牌栏">
    <div class="top-brand-bar__left">
      <router-link v-if="backTo" class="top-brand-bar__back" :to="backTo">{{ backLabel }}</router-link>
      <img v-else class="top-brand-bar__logo" src="/RVSChinaDT_Logo.png" width="180" height="40" alt="RVS-CHINA DIGITAL TEAM" decoding="async" />
    </div>
    <span class="top-brand-bar__title">{{ title ?? 'Digital CBM' }}</span>
    <button type="button" class="top-brand-bar__lang" :aria-label="toggleLabel" @click="i18n.toggleLang">
      {{ toggleLabel }}
    </button>
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
  object-fit: contain;
  -webkit-user-drag: none;
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
  flex-shrink: 0;
  min-height: 2.05rem;
  padding: 0.25rem 0.6rem;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.55);
  background: linear-gradient(180deg, #fff 0%, #f8fafc 100%);
  color: #0f172a;
  font: inherit;
  font-size: 0.72rem;
  font-weight: 760;
  letter-spacing: 0.02em;
  cursor: pointer;
}

.top-brand-bar__lang:active {
  transform: translateY(1px);
  filter: brightness(0.98);
}
</style>
