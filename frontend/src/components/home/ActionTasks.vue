<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { fetchHomeConfig, fetchTaskSummary, fetchTaskStatus } from '@/api/tasks'
import { useAuthStore } from '@/stores/auth'
import type { TaskCard, TaskStatusStore, TaskSummaryMaint } from '@/types/task'
import { useI18n } from '@/composables/useI18n'
import { getDaysUntilDeadline, deadlineAlertLevel } from '@/composables/useDeadlineAlert'

const auth = useAuthStore()
const router = useRouter()
const { t } = useI18n()

const cards = ref<TaskCard[]>([])
const statusStore = ref<TaskStatusStore>({})
const activeFilter = ref<'todo' | 'doing' | 'done' | 'all'>('todo')

const defaultStats: Record<string, { items: number; photos: number }> = {
  c1c3: { items: 21, photos: 19 },
  c4c6: { items: 32, photos: 45 },
}
const summaryMaint = ref<Record<string, TaskSummaryMaint>>({})

function getCardStatus(maint: string): 'todo' | 'doing' | 'done' {
  const entry = statusStore.value[maint.toLowerCase()]
  if (entry?.status === 'doing' || entry?.status === 'done' || entry?.status === 'todo') return entry.status
  return 'todo'
}

function getStats(maint: string) {
  const key = maint.toLowerCase()
  const s = summaryMaint.value[key]
  const d = defaultStats[key] || {}
  return `${t.value.statsProjectPrefix} ${s?.items ?? d.items ?? '--'} · ${t.value.statsPhotoPrefix} ${s?.photos ?? d.photos ?? '--'}`
}

const filteredCards = computed(() =>
  cards.value.filter(c => activeFilter.value === 'all' || getCardStatus(c.maint) === activeFilter.value)
)

function urgencyRank(deadline: string, status: string) {
  if (status === 'done') return 3
  const days = getDaysUntilDeadline(deadline)
  const level = deadlineAlertLevel(days, status)
  if (level === 'expired') return 0
  if (level === 'urgent') return 1
  return 2
}

function parseDeadlineValue(deadline: string) {
  const m = String(deadline || '').match(/\d{4}-\d{2}-\d{2}/)
  if (!m) return Number.POSITIVE_INFINITY
  const d = new Date(`${m[0]}T00:00:00`)
  const t = d.getTime()
  return Number.isNaN(t) ? Number.POSITIVE_INFINITY : t
}

const sortedCards = computed(() => {
  const list = filteredCards.value.slice()
  list.sort((a, b) => {
    const sa = getCardStatus(a.maint)
    const sb = getCardStatus(b.maint)
    const ra = urgencyRank(a.deadline, sa)
    const rb = urgencyRank(b.deadline, sb)
    if (ra !== rb) return ra - rb

    const da = getDaysUntilDeadline(a.deadline)
    const db = getDaysUntilDeadline(b.deadline)
    // 对可计算天数的项目：越小越靠前（含负数的已过期也会更靠前）
    if (da != null && db != null && da !== db) return da - db
    if (da == null && db != null) return 1
    if (da != null && db == null) return -1

    const ta = parseDeadlineValue(a.deadline)
    const tb = parseDeadlineValue(b.deadline)
    if (ta !== tb) return ta - tb

    return String(a.maint).localeCompare(String(b.maint))
  })
  return list
})
const counts = computed(() => {
  let todo = 0, doing = 0, done = 0
  cards.value.forEach(c => {
    const s = getCardStatus(c.maint)
    if (s === 'doing') doing++; else if (s === 'done') done++; else todo++
  })
  return { todo, doing, done, all: todo + doing + done }
})

function deadlineText(deadline: string, status: string) {
  const days = getDaysUntilDeadline(deadline)
  const level = deadlineAlertLevel(days, status)
  if (level === 'expired') return t.value.deadlineExpired
  if (level === 'urgent' && days != null) return String(t.value.deadlineDaysLeft).replace('{n}', String(days))
  return deadline
}

function deadlineLevel(deadline: string, status: string) {
  const days = getDaysUntilDeadline(deadline)
  return deadlineAlertLevel(days, status)
}

function ringClass(deadline: string, status: string) {
  const level = deadlineLevel(deadline, status)
  return {
    'is-urgent': level === 'urgent',
    'is-expired': level === 'expired',
  }
}

function dateClass(deadline: string, status: string) {
  const level = deadlineLevel(deadline, status)
  return {
    'is-urgent': level === 'urgent',
    'is-expired': level === 'expired',
  }
}

function splitMeta(meta: string): { main: string; sub: string } {
  const raw = String(meta || '').trim()
  if (!raw) return { main: '', sub: '' }
  const parts = raw.split('·').map(s => s.trim()).filter(Boolean)
  if (parts.length >= 2) return { main: parts[0], sub: parts.slice(1).join(' · ') }
  const parts2 = raw.split('-').map(s => s.trim()).filter(Boolean)
  if (parts2.length >= 2) return { main: parts2[0], sub: parts2.slice(1).join(' - ') }
  return { main: raw, sub: '' }
}

const metaCache = new Map<string, { main: string; sub: string }>()
function splitMetaCached(meta: string): { main: string; sub: string } {
  const key = String(meta || '')
  const hit = metaCache.get(key)
  if (hit) return hit
  const next = splitMeta(key)
  metaCache.set(key, next)
  return next
}

function goTask(card: TaskCard) {
  router.push(`/task-list?maint=${card.maint}`)
}

async function loadStatuses() {
  if (!auth.user) return
  try {
    const data = await fetchTaskStatus(auth.user.employeeId)
    if (data.statuses) statusStore.value = data.statuses
  } catch { /* keep local */ }
}

async function boot() {
  try {
    const cfg = await fetchHomeConfig()
    if (cfg.tasks) cards.value = cfg.tasks
  } catch { /* keep empty */ }
  await loadStatuses()
  try {
    const sum = await fetchTaskSummary()
    if (sum.maint) summaryMaint.value = sum.maint
  } catch { /* keep defaults */ }
}

function onFocus() { loadStatuses() }

onMounted(() => {
  boot()
  window.addEventListener('focus', onFocus)
  document.addEventListener('visibilitychange', () => { if (!document.hidden) loadStatuses() })
})
onUnmounted(() => { window.removeEventListener('focus', onFocus) })
</script>

<template>
  <section class="home-section" aria-label="Action Tasks">
    <div class="home-section__header">
      <h2 class="home-section__title">
        <span class="home-section__icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8">
            <path d="M7 3h8l5 5v13a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" stroke-linejoin="round" />
            <path d="M14 3v5h5" stroke-linejoin="round" />
            <path d="M8 13h8M8 17h6" stroke-linecap="round" />
          </svg>
        </span>
        {{ t.homeActionTasksTitle }}
      </h2>
    </div>

    <div class="ios-list-group">
      <div class="in-card-tabs" role="tablist" aria-label="任务筛选">
        <div class="ios-segmented-control">
          <button v-for="f in (['todo','doing','done','all'] as const)" :key="f" type="button" class="segment-btn" :class="{ 'is-active': activeFilter === f }" role="tab" :aria-selected="activeFilter === f" @click="activeFilter = f">
            <span class="segment-btn__label">{{ { todo: t.filterTodo, doing: t.filterDoing, done: t.filterDone, all: t.filterAll }[f] }}</span>
            <span class="segment-btn__count">{{ counts[f] }}</span>
          </button>
        </div>
      </div>

      <div class="ios-list-scroll" :class="{ 'is-empty': !sortedCards.length }">
        <div v-if="sortedCards.length">
          <button v-for="card in sortedCards" :key="`${card.maint}-${card.title}-${card.deadline}`" type="button" class="ios-list-item" @click="goTask(card)">
            <span class="item-icon-area" aria-hidden="true">
              <span class="status-ring" :class="ringClass(card.deadline, getCardStatus(card.maint))"></span>
            </span>
            <span class="item-content">
              <span class="item-title">{{ card.title }}</span>
              <span class="item-subtitle">{{ card.meta }} · {{ getStats(card.maint) }}</span>
            </span>
            <span class="item-right" aria-hidden="true">
              <span class="item-date" :class="dateClass(card.deadline, getCardStatus(card.maint))">
                {{ deadlineText(card.deadline, getCardStatus(card.maint)) }}
              </span>
              <span class="chevron">›</span>
            </span>
          </button>
        </div>
        <p v-else class="ios-list-empty">{{ t.homeNoTasksFound }}</p>
      </div>
    </div>
  </section>
</template>
