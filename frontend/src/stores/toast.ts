import { defineStore } from 'pinia'
import { ref } from 'vue'

export type ToastType = 'error' | 'warn' | 'success' | 'info'

export interface ToastItem {
  id: number
  message: string
  type: ToastType
}

let _seq = 0

export const useToastStore = defineStore('toast', () => {
  const items = ref<ToastItem[]>([])

  function show(message: string, type: ToastType = 'error', duration = 3500) {
    const id = ++_seq
    items.value.push({ id, message, type })
    setTimeout(() => dismiss(id), duration)
  }

  function dismiss(id: number) {
    const idx = items.value.findIndex((t) => t.id === id)
    if (idx >= 0) items.value.splice(idx, 1)
  }

  return { items, show, dismiss }
})
