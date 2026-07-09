<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useToastStore } from '@/stores/toast'

const toast = useToastStore()
const { items } = storeToRefs(toast)
</script>

<template>
  <div class="toast-host" aria-live="polite" aria-atomic="true">
    <div
      v-for="item in items"
      :key="item.id"
      class="toast-item"
      :class="`toast-item--${item.type}`"
      role="status"
    >
      {{ item.message }}
    </div>
  </div>
</template>

<style scoped>
.toast-host {
  position: fixed;
  left: 50%;
  bottom: max(5.5rem, calc(4.5rem + env(safe-area-inset-bottom, 0px)));
  transform: translateX(-50%);
  z-index: 10200;
  display: grid;
  gap: 0.45rem;
  width: min(92vw, 22rem);
  pointer-events: none;
}

.toast-item {
  padding: 0.62rem 0.95rem;
  border-radius: 999px;
  font-size: 0.8rem;
  font-weight: 650;
  text-align: center;
  color: #fff;
  background: rgba(24, 24, 27, 0.92);
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.18);
  animation: toast-in 0.22s ease;
}

.toast-item--error { background: rgba(185, 28, 28, 0.94); }
.toast-item--warn { background: rgba(180, 83, 9, 0.94); }
.toast-item--success { background: rgba(4, 120, 87, 0.94); }
.toast-item--info { background: rgba(30, 64, 175, 0.94); }

@keyframes toast-in {
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>
