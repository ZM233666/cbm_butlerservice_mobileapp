<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from '@/composables/useI18n'

type MonthStatus = 'none' | 'ok' | 'warn'

const props = defineProps<{
  modelValue: string
  statusByMonth?: Record<string, MonthStatus>
  placeholder?: string
  disabled?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: string): void
  (e: 'change', v: string): void
}>()

function isMonthValue(v: string): boolean {
  return /^\d{4}-\d{2}$/.test(String(v || '').trim())
}

function nowMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function clampYear(y: number): number {
  if (!Number.isFinite(y)) return new Date().getFullYear()
  return Math.max(2000, Math.min(2100, Math.trunc(y)))
}

const open = ref(false)
const rootEl = ref<HTMLElement | null>(null)
const panelEl = ref<HTMLElement | null>(null)

const current = computed(() => (isMonthValue(props.modelValue) ? props.modelValue : ''))
const { lang, t } = useI18n()
const thisMonthKey = computed(() => nowMonth())
const displayText = computed(() => {
  if (!current.value) return props.placeholder || 'YYYY-MM'
  if (lang.value !== 'zh') return current.value
  const [y, m] = current.value.split('-')
  if (!y || !m) return current.value
  return `${y}年${m}月`
})

const activeYear = ref<number>(new Date().getFullYear())

watch(
  () => props.modelValue,
  (v) => {
    if (!isMonthValue(v)) return
    const y = Number(v.slice(0, 4))
    if (Number.isFinite(y)) activeYear.value = clampYear(y)
  },
  { immediate: true }
)

const MONTHS_EN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'] as const

const months = computed(() => {
  return Array.from({ length: 12 }).map((_, i) => {
    const mm = String(i + 1).padStart(2, '0')
    const key = `${activeYear.value}-${mm}`
    const status = props.statusByMonth?.[key] ?? 'none'
    const label = lang.value === 'zh' ? `${i + 1}月` : MONTHS_EN[i]
    return { key, label, status, isThisMonth: key === thisMonthKey.value }
  })
})

function close() {
  open.value = false
}

function setValue(v: string) {
  emit('update:modelValue', v)
  emit('change', v)
}

function pickMonth(key: string) {
  setValue(key)
  close()
}

function clearValue() {
  setValue('')
  close()
}

function setThisMonth() {
  setValue(nowMonth())
  close()
}

function onDocPointerDown(e: PointerEvent) {
  if (!open.value) return
  const root = rootEl.value
  if (!root) return
  if (root.contains(e.target as Node)) return
  close()
}

function onDocKeydown(e: KeyboardEvent) {
  if (!open.value) return
  if (e.key === 'Escape') close()
}

watch(open, (v) => {
  if (v) {
    document.addEventListener('pointerdown', onDocPointerDown, true)
    document.addEventListener('keydown', onDocKeydown, true)
    nextTick(() => panelEl.value?.querySelector<HTMLElement>('[data-month-btn="1"]')?.focus())
  } else {
    document.removeEventListener('pointerdown', onDocPointerDown, true)
    document.removeEventListener('keydown', onDocKeydown, true)
  }
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocPointerDown, true)
  document.removeEventListener('keydown', onDocKeydown, true)
})
</script>

<template>
  <div ref="rootEl" class="mp" :class="{ 'is-open': open, 'is-disabled': disabled }">
    <button
      type="button"
      class="mp__control"
      :disabled="disabled"
      :aria-expanded="open ? 'true' : 'false'"
      @click="open = !open"
    >
      <span class="mp__value" :class="{ 'is-placeholder': !current }">{{ displayText }}</span>
      <span class="mp__chev" aria-hidden="true">▾</span>
    </button>

    <div v-if="open" ref="panelEl" class="mp__panel" role="dialog" :aria-label="t.mpPickMonth">
      <div class="mp__year">
        <button type="button" class="mp__year-btn" @click="activeYear = clampYear(activeYear - 1)">‹</button>
        <input
          class="mp__year-input"
          inputmode="numeric"
          :value="activeYear"
          @change="activeYear = clampYear(Number(($event.target as HTMLInputElement).value))"
        />
        <button type="button" class="mp__year-btn" @click="activeYear = clampYear(activeYear + 1)">›</button>
      </div>

      <div class="mp__grid" role="grid" :aria-label="t.mpMonths">
        <button
          v-for="m in months"
          :key="m.key"
          type="button"
          class="mp__month"
          :class="{ 'is-active': current === m.key, 'is-this-month': m.isThisMonth }"
          role="gridcell"
          data-month-btn="1"
          @click="pickMonth(m.key)"
        >
          <span class="mp__month-text">{{ m.label }}</span>
          <span v-if="m.status !== 'none'" class="mp__bar" :class="m.status === 'warn' ? 'is-warn' : 'is-ok'"></span>
        </button>
      </div>

      <div class="mp__footer">
        <button type="button" class="mp__link" @click="clearValue">{{ t.mpClear }}</button>
        <button type="button" class="mp__link" @click="setThisMonth">{{ t.mpThisMonth }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.mp { position: relative; }
.mp__control {
  min-height: 1.9rem;
  width: 100%;
  border-radius: 10px;
  border: 1px solid #cbd5e1;
  padding: 0.2rem 0.5rem;
  font: inherit;
  background: #fff;
  color: #0f172a;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  cursor: pointer;
}
.mp.is-disabled .mp__control { opacity: 0.6; cursor: not-allowed; }
.mp__value.is-placeholder { color: #64748b; }
.mp__chev { color: #475569; font-size: 0.9rem; }

.mp__panel {
  position: absolute;
  right: 0;
  top: calc(100% + 0.4rem);
  width: min(18.5rem, 92vw);
  border-radius: 12px;
  border: 1px solid #e2e8f0;
  background: #fff;
  box-shadow: 0 14px 40px rgba(15, 23, 42, 0.18);
  z-index: 10100;
  overflow: hidden;
}

.mp__year {
  display: grid;
  grid-template-columns: 2.35rem minmax(0, 1fr) 2.35rem;
  align-items: center;
  gap: 0.35rem;
  padding: 0.6rem;
  border-bottom: 1px solid #e2e8f0;
  background: #f8fafc;
}
.mp__year-btn {
  min-width: 0;
  min-height: 2.2rem;
  border-radius: 10px;
  border: 1px solid #cbd5e1;
  background: #fff;
  cursor: pointer;
  font: inherit;
  font-weight: 800;
  font-size: 1.2rem;
  line-height: 1;
  color: #0f172a;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.mp__year-input {
  width: 100%;
  min-width: 0;
  min-height: 2.2rem;
  border-radius: 10px;
  border: 1px solid #cbd5e1;
  padding: 0 0.65rem;
  font: inherit;
  font-weight: 800;
  color: #0f172a;
  background: #fff;
  text-align: left;
}

.mp__grid {
  padding: 0.65rem 0.65rem 0.4rem;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.5rem;
}
.mp__month {
  border-radius: 10px;
  border: 1px solid transparent;
  background: #fff;
  padding: 0.8rem 0.45rem 0.42rem;
  cursor: pointer;
  position: relative;
  min-height: 2.6rem;
}
.mp__month:hover { background: #f8fafc; }
.mp__month.is-active { border-color: #2563eb; background: #eff6ff; }
.mp__month.is-this-month:not(.is-active) {
  border-color: rgba(37, 99, 235, 0.42);
  background: linear-gradient(180deg, #ffffff 0%, #f8fbff 100%);
}
.mp__month-text { font: inherit; font-weight: 760; color: #0f172a; }
.mp__bar {
  position: absolute;
  left: 18%;
  right: 18%;
  bottom: 0.38rem;
  height: 3px;
  border-radius: 999px;
}
.mp__bar.is-warn { background: #dc2626; }
.mp__bar.is-ok { background: #16a34a; }

.mp__footer {
  display: flex;
  justify-content: space-between;
  padding: 0.55rem 0.75rem 0.65rem;
  border-top: 1px solid #e2e8f0;
  background: #fff;
}
.mp__link {
  border: 0;
  background: transparent;
  color: #2563eb;
  font: inherit;
  font-weight: 800;
  cursor: pointer;
  padding: 0.35rem 0.25rem;
}
</style>
