<script setup lang="ts">
import { useI18n } from '@/composables/useI18n'

const { t } = useI18n()
</script>

<template>
  <div class="page page-shell">
    <slot />
    <p class="site-copyright">© 2026 Knorr-Bremse. {{ t.copyrightTail }}</p>
  </div>
</template>

<style scoped>
.page-shell {
  padding-bottom: calc(var(--bottom-nav-h, 3.5rem) + 0.5rem + env(safe-area-inset-bottom, 0px));
}

.site-copyright {
  text-align: center;
  font-size: 0.72rem;
  color: #94a3b8;
  padding: 0.75rem 0;
  margin: 0;
}
</style>
