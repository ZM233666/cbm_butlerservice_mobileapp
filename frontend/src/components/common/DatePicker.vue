<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from '@/composables/useI18n'

const props = defineProps<{
  modelValue: string
  min?: string
  placeholder?: string
  disabled?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: string): void
  (e: 'change', v: string): void
}>()

function isDateValue(v: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(v || '').trim())
}

function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function clampYear(y: number): number {
  if (!Number.isFinite(y)) return new Date().getFullYear()
  return Math.max(2000, Math.min(2100, Math.trunc(y)))
}

function parseIsoDate(v: string): { year: number; month: number; day: number } | null {
  const text = String(v || '').trim()
  if (!isDateValue(text)) return null
  const [year, month, day] = text.split('-').map((x) => Number(x))
  if (!year || !month || !day) return null
  return { year, month, day }
}

function toIsoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function compareIso(a: string, b: string): number {
  const pa = parseIsoDate(a)
  const pb = parseIsoDate(b)
  if (!pa || !pb) return 0
  if (pa.year !== pb.year) return pa.year - pb.year
  if (pa.month !== pb.month) return pa.month - pb.month
  return pa.day - pb.day
}

const open = ref(false)
const rootEl = ref<HTMLElement | null>(null)
const panelEl = ref<HTMLElement | null>(null)
const activeYear = ref(new Date().getFullYear())
const activeMonth = ref(new Date().getMonth() + 1)

const current = computed(() => (isDateValue(props.modelValue) ? props.modelValue : ''))
const minDate = computed(() => {
  const raw = String(props.min || '').trim()
  return isDateValue(raw) ? raw : todayIso()
})
const { lang, t } = useI18n()

const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const
const WEEKDAYS_ZH = ['日', '一', '二', '三', '四', '五', '六'] as const
const WEEKDAYS_EN = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const

const displayText = computed(() => {
  if (!current.value) return props.placeholder || (lang.value === 'zh' ? '请选择日期' : 'Select date')
  const parsed = parseIsoDate(current.value)
  if (!parsed) return current.value
  if (lang.value === 'zh') return `${parsed.year}年${parsed.month}月${parsed.day}日`
  return `${MONTHS_EN[parsed.month - 1]} ${parsed.day}, ${parsed.year}`
})

const headerLabel = computed(() => {
  if (lang.value === 'zh') return `${activeYear.value}年${activeMonth.value}月`
  return `${MONTHS_EN[activeMonth.value - 1]} ${activeYear.value}`
})

const weekdays = computed(() => (lang.value === 'zh' ? WEEKDAYS_ZH : WEEKDAYS_EN))

const canGoPrev = computed(() => {
  let month = activeMonth.value - 1
  let year = activeYear.value
  if (month < 1) {
    month = 12
    year -= 1
  }
  const lastDay = new Date(year, month, 0).getDate()
  return compareIso(toIsoDate(year, month, lastDay), minDate.value) >= 0
})

const dayCells = computed(() => {
  const year = activeYear.value
  const month = activeMonth.value
  const total = new Date(year, month, 0).getDate()
  const offset = new Date(year, month - 1, 1).getDay()
  const cells: Array<{ key: string; day: number; iso: string; disabled: boolean; isActive: boolean; isToday: boolean } | null> = []
  const today = todayIso()
  for (let i = 0; i < offset; i += 1) cells.push(null)
  for (let day = 1; day <= total; day += 1) {
    const iso = toIsoDate(year, month, day)
    cells.push({
      key: iso,
      day,
      iso,
      disabled: compareIso(iso, minDate.value) < 0,
      isActive: current.value === iso,
      isToday: iso === today,
    })
  }
  return cells
})

watch(
  () => props.modelValue,
  (v) => {
    const parsed = parseIsoDate(v)
    if (!parsed) return
    activeYear.value = clampYear(parsed.year)
    activeMonth.value = parsed.month
  },
  { immediate: true },
)

function close() {
  open.value = false
}

function setValue(v: string) {
  emit('update:modelValue', v)
  emit('change', v)
}

function pickDay(iso: string) {
  if (!isDateValue(iso) || compareIso(iso, minDate.value) < 0) return
  setValue(iso)
  close()
}

function prevMonth() {
  if (!canGoPrev.value) return
  let month = activeMonth.value - 1
  let year = activeYear.value
  if (month < 1) {
    month = 12
    year -= 1
  }
  activeYear.value = clampYear(year)
  activeMonth.value = month
}

function nextMonth() {
  let month = activeMonth.value + 1
  let year = activeYear.value
  if (month > 12) {
    month = 1
    year += 1
  }
  activeYear.value = clampYear(year)
  activeMonth.value = month
}

function setToday() {
  const today = todayIso()
  if (compareIso(today, minDate.value) < 0) return
  const parsed = parseIsoDate(today)
  if (parsed) {
    activeYear.value = parsed.year
    activeMonth.value = parsed.month
  }
  setValue(today)
  close()
}

function openPanel() {
  if (props.disabled) return
  const seed = parseIsoDate(current.value) || parseIsoDate(minDate.value) || parseIsoDate(todayIso())
  if (seed) {
    activeYear.value = clampYear(seed.year)
    activeMonth.value = seed.month
  }
  open.value = true
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
    nextTick(() => panelEl.value?.querySelector<HTMLElement>('[data-day-btn="1"]')?.focus())
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
  <div ref="rootEl" class="dp" :class="{ 'is-open': open, 'is-disabled': disabled }">
    <button
      type="button"
      class="dp__control"
      :disabled="disabled"
      :aria-expanded="open ? 'true' : 'false'"
      @click="openPanel"
    >
      <span class="dp__value" :class="{ 'is-placeholder': !current }">{{ displayText }}</span>
      <span class="dp__chev" aria-hidden="true">▾</span>
    </button>

    <div v-if="open" ref="panelEl" class="dp__panel" role="dialog" :aria-label="t.dpPickDate">
      <div class="dp__nav">
        <button type="button" class="dp__nav-btn" :disabled="!canGoPrev" @click="prevMonth">‹</button>
        <p class="dp__nav-label">{{ headerLabel }}</p>
        <button type="button" class="dp__nav-btn" @click="nextMonth">›</button>
      </div>

      <div class="dp__weekdays" aria-hidden="true">
        <span v-for="(label, index) in weekdays" :key="`${label}-${index}`" class="dp__weekday">{{ label }}</span>
      </div>

      <div class="dp__days" role="grid" :aria-label="t.dpDays">
        <template v-for="(cell, index) in dayCells" :key="cell?.key || `blank-${index}`">
          <span v-if="!cell" class="dp__day dp__day--blank"></span>
          <button
            v-else
            type="button"
            class="dp__day"
            :class="{ 'is-active': cell.isActive, 'is-today': cell.isToday && !cell.isActive }"
            :disabled="cell.disabled"
            role="gridcell"
            data-day-btn="1"
            @click="pickDay(cell.iso)"
          >
            {{ cell.day }}
          </button>
        </template>
      </div>

      <div class="dp__footer">
        <button type="button" class="dp__today" @click="setToday">{{ t.dpToday }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dp { position: relative; }
.dp__control {
  min-height: 2.45rem;
  width: 100%;
  border-radius: 10px;
  border: 1px solid #cbd5e1;
  padding: 0.35rem 0.65rem;
  font: inherit;
  background: #fff;
  color: #0f172a;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  cursor: pointer;
}
.dp.is-disabled .dp__control { opacity: 0.6; cursor: not-allowed; }
.dp__value.is-placeholder { color: #64748b; }
.dp__chev { color: #475569; font-size: 0.9rem; }

.dp__panel {
  position: absolute;
  left: 0;
  right: 0;
  top: calc(100% + 0.35rem);
  border-radius: 12px;
  border: 1px solid #e2e8f0;
  background: #fff;
  box-shadow: 0 10px 28px rgba(15, 23, 42, 0.14);
  z-index: 10100;
  overflow: hidden;
  padding: 0.5rem 0.55rem 0.45rem;
}

.dp__nav {
  display: grid;
  grid-template-columns: 2rem 1fr 2rem;
  align-items: center;
  gap: 0.25rem;
  margin-bottom: 0.45rem;
}
.dp__nav-btn {
  width: 2rem;
  height: 2rem;
  border: 0;
  border-radius: 8px;
  background: #f1f5f9;
  color: #0f172a;
  font: inherit;
  font-size: 1.1rem;
  font-weight: 700;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.dp__nav-btn:disabled { opacity: 0.35; cursor: not-allowed; }
.dp__nav-label {
  margin: 0;
  text-align: center;
  font-size: 0.92rem;
  font-weight: 800;
  color: #0b4a82;
  letter-spacing: -0.01em;
}

.dp__weekdays {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 0.15rem;
  margin-bottom: 0.2rem;
}
.dp__weekday {
  text-align: center;
  font-size: 0.68rem;
  font-weight: 700;
  color: #94a3b8;
  line-height: 1.2;
}

.dp__days {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 0.15rem;
}
.dp__day {
  min-height: 1.95rem;
  border: 0;
  border-radius: 8px;
  background: transparent;
  cursor: pointer;
  font: inherit;
  font-size: 0.82rem;
  font-weight: 700;
  color: #0f172a;
}
.dp__day--blank { visibility: hidden; }
.dp__day:hover:not(:disabled) { background: #f1f5f9; }
.dp__day.is-today { color: #2563eb; }
.dp__day.is-active {
  background: #2563eb;
  color: #fff;
}
.dp__day:disabled {
  color: #cbd5e1;
  cursor: not-allowed;
}

.dp__footer {
  display: flex;
  justify-content: flex-end;
  margin-top: 0.45rem;
  padding-top: 0.4rem;
  border-top: 1px solid #eef2f7;
}
.dp__today {
  border: 0;
  background: transparent;
  color: #2563eb;
  font: inherit;
  font-size: 0.78rem;
  font-weight: 800;
  cursor: pointer;
  padding: 0.2rem 0.15rem;
}
</style>
