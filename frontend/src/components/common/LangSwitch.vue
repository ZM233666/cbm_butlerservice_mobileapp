<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useI18nStore } from '@/stores/i18n'

const i18n = useI18nStore()
const { lang } = storeToRefs(i18n)
const toggleLabel = computed(() => (lang.value === 'zh' ? 'Switch to English' : '切换到中文'))
</script>

<template>
  <button
    type="button"
    class="lang-switch"
    :aria-label="toggleLabel"
    @click="i18n.toggleLang"
  >
    <span class="lang-switch__opt" :class="{ 'is-active': lang === 'en' }">EN</span>
    <span class="lang-switch__opt" :class="{ 'is-active': lang === 'zh' }">CN</span>
  </button>
</template>

<style scoped>
.lang-switch {
  display: inline-grid;
  grid-template-columns: 1fr 1fr;
  align-items: center;
  flex-shrink: 0;
  min-width: 4.6rem;
  min-height: 1.85rem;
  padding: 0.15rem;
  border-radius: 999px;
  border: 1px solid var(--aux-line, #c4ccd7);
  background: var(--surface-muted, #f5f7fa);
  cursor: pointer;
  font: inherit;
}

.lang-switch__opt {
  display: grid;
  place-items: center;
  min-height: 1.5rem;
  padding: 0 0.35rem;
  border-radius: 999px;
  font-size: 0.68rem;
  font-weight: 760;
  letter-spacing: 0.04em;
  color: var(--text-muted, #8a94a6);
  transition: background 0.15s ease, color 0.15s ease, box-shadow 0.15s ease;
}

.lang-switch__opt.is-active {
  background: #fff;
  color: var(--kb-brand, #00467f);
  box-shadow: 0 2px 6px rgba(0, 69, 126, 0.12);
}
</style>
