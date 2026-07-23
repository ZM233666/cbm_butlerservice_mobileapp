<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { fetchTaskStatus } from '@/api/tasks'
import { useAuthStore } from '@/stores/auth'
import type { TaskCard, TaskStatusStore } from '@/types/task'
import { useI18n } from '@/composables/useI18n'
import { getDaysUntilDeadline, deadlineAlertLevel } from '@/composables/useDeadlineAlert'

const props = defineProps<{
  extraCards?: TaskCard[]
  /** 父组件唯一数据源：home-config 的 tasks，本组件不再重复请求 */
  tasks?: TaskCard[]
}>()

const auth = useAuthStore()
const router = useRouter()
const { t } = useI18n()

const cards = ref<TaskCard[]>([])
const statusStore = ref<TaskStatusStore>({})
const statusHydrated = ref(false)
const activeFilter = ref<'todo' | 'doing' | 'done' | 'all'>('doing')

const BOOT_MIN_INTERVAL_MS = 60_000
let lastStatusFetchAt = 0
let statusFetchVersion = 0

const allCards = computed<TaskCard[]>(() => {
  const merged = [...cards.value, ...(props.extraCards || [])]
  const seen = new Set<string>()
  const out: TaskCard[] = []
  merged.forEach((c) => {
    const k = taskKey(c)
    if (!k || seen.has(k)) return
    seen.add(k)
    out.push(c)
  })
  return out
})

function getStatusFromEntry(entry: unknown): 'todo' | 'doing' | 'done' | 'rejected' | null {
  const e = entry as { status?: unknown; rejected?: boolean } | null
  const s = e?.status
  if (s === 'rejected') return 'rejected'
  if (s === 'todo' && e?.rejected) return 'rejected'
  if (s === 'todo' || s === 'doing' || s === 'done') return s
  return null
}

function haveInlineStatuses(rows: TaskCard[]): boolean {
  return rows.length === 0 || rows.every((card) => !!getStatusFromEntry(card))
}

const statusReady = computed(() =>
  allCards.value.length === 0 || statusHydrated.value || haveInlineStatuses(allCards.value),
)

function taskKey(card: TaskCard) {
  return String(card.taskId || '').trim() || `${card.maint}-${card.title}-${card.deadline}`
}

const maintCounts = computed(() => {
  const map: Record<string, number> = {}
  allCards.value.forEach((c) => {
    const k = String(c.maint || '').toLowerCase()
    map[k] = (map[k] || 0) + 1
  })
  return map
})

function getCardRejected(card: TaskCard): boolean {
  return getCardStatusByCard(card) === 'rejected'
}

function getCardStatusByCard(card: TaskCard): 'todo' | 'doing' | 'done' | 'rejected' {
  const key = taskKey(card)
  const byKey = getStatusFromEntry(statusStore.value[key])
  if (byKey) return byKey

  // 兼容旧数据：仅当该 maint 下只有 1 条任务时，才允许回退到 maint 级别状态。
  const maint = String(card.maint || '').toLowerCase()
  if ((maintCounts.value[maint] || 0) <= 1) {
    const byMaint = getStatusFromEntry(statusStore.value[maint])
    if (byMaint) return byMaint
  }

  const byCard = getStatusFromEntry(card)
  if (byCard) return byCard

  return 'todo'
}

function getDepot(_card: TaskCard) {
  return String(_card.depot || '').trim() || '-'
}

function doneUploadText(card: TaskCard) {
  const p = card.uploadProgress
  if (!p || !p.required) return ''
  return `${p.uploaded || 0}/${p.required || 0}`
}

function isPendingTodo(card: TaskCard): boolean {
  const s = getCardStatusByCard(card)
  return s === 'todo' || s === 'rejected'
}

const filteredCards = computed(() =>
  allCards.value.filter((c) => {
    if (activeFilter.value === 'all') return true
    if (activeFilter.value === 'todo') return isPendingTodo(c)
    return getCardStatusByCard(c) === activeFilter.value
  }),
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
    const sa = getCardStatusByCard(a)
    const sb = getCardStatusByCard(b)
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
  allCards.value.forEach(c => {
    const s = getCardStatusByCard(c)
    if (s === 'doing') doing++
    else if (s === 'done') done++
    else if (s === 'todo' || s === 'rejected') todo++
  })
  return { todo, doing, done, all: allCards.value.length }
})

function deadlineText(deadline: string, status: string) {
  const days = getDaysUntilDeadline(deadline)
  if (status === 'done' && days != null && days < 0) return t.value.deadlineCompletedLate
  const level = deadlineAlertLevel(days, status)
  if (level === 'expired') return t.value.deadlineExpired
  if (level === 'urgent' && days != null) return String(t.value.deadlineDaysLeft).replace('{n}', String(days))
  return deadline
}

function deadlineLevel(deadline: string, status: string) {
  const days = getDaysUntilDeadline(deadline)
  if (status === 'done' && days != null && days < 0) return 'expired' as const
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
  router.push({
    path: '/task-list',
    query: {
      maint: card.maint,
      title: card.title,
      deadline: card.deadline,
      taskId: card.taskId || '',
      k: taskKey(card),
    },
  })
}

async function loadStatuses(force = false) {
  const employeeId = String(auth.user?.employeeId || '').trim()
  if (!employeeId) {
    statusStore.value = {}
    statusHydrated.value = true
    return
  }

  const now = Date.now()
  if (!force && now - lastStatusFetchAt < BOOT_MIN_INTERVAL_MS) return
  lastStatusFetchAt = now

  const version = ++statusFetchVersion
  try {
    const data = await fetchTaskStatus(employeeId)
    if (version !== statusFetchVersion) return
    if (String(auth.user?.employeeId || '').trim() !== employeeId) return
    if (data.statuses) statusStore.value = data.statuses
    statusHydrated.value = true
  } catch {
    statusHydrated.value = haveInlineStatuses(allCards.value)
  }
}

function onFocus() {
  void loadStatuses()
}

function onVisibilityChange() {
  if (!document.hidden) void loadStatuses()
}

onMounted(() => {
  window.addEventListener('focus', onFocus)
  document.addEventListener('visibilitychange', onVisibilityChange)
})
onUnmounted(() => {
  window.removeEventListener('focus', onFocus)
  document.removeEventListener('visibilitychange', onVisibilityChange)
})

// 任务列表完全由父组件驱动，避免与 HomeView 重复请求 home-config
watch(
  () => props.tasks,
  (rows) => {
    cards.value = Array.isArray(rows) ? rows.slice() : []
    statusHydrated.value = haveInlineStatuses(cards.value)
    if (!statusHydrated.value) void loadStatuses(true)
  },
  { immediate: true },
)

watch(
  () => auth.user?.employeeId || '',
  (id) => {
    statusFetchVersion += 1
    statusStore.value = {}
    statusHydrated.value = false
    lastStatusFetchAt = 0
    if (id) void loadStatuses(true)
  },
)
</script>

<template>
  <section class="home-section" aria-label="Action Jobs">
    <div class="home-section__header">
      <h2 class="home-section__title">{{ t.homeActionTasksTitle }}</h2>
    </div>

    <div class="ios-list-group">
      <p v-if="!statusReady" class="ios-list-empty" role="status" aria-live="polite">{{ t.homeLoading }}</p>

      <div v-else class="in-card-tabs" role="tablist" aria-label="任务筛选">
        <div class="ios-segmented-control">
          <button
            v-for="f in (['todo','doing','done','all'] as const)"
            :key="f"
            type="button"
            class="segment-btn"
            :class="[
              `segment-btn--${f}`,
              { 'is-active': activeFilter === f, 'has-doing-bar': f === 'doing' && counts.doing > 0 },
            ]"
            role="tab"
            :aria-selected="activeFilter === f"
            @click="activeFilter = f"
          >
            <span class="segment-btn__icon" aria-hidden="true">
              <svg v-if="f === 'todo'" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8">
                <path d="M8 4h7l4 4v11a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" stroke-linejoin="round" />
                <path d="M14 4v4h4M9 12h6M9 15.5h4" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
              <svg v-else-if="f === 'doing'" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8">
                <circle cx="12" cy="12" r="7.2" />
                <circle cx="12" cy="12" r="3.6" />
                <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
              </svg>
              <svg v-else-if="f === 'done'" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8">
                <circle cx="12" cy="12" r="7.5" />
                <path d="m8.5 12.2 2.4 2.4 4.6-4.8" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
              <svg v-else viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8">
                <path d="M7 7h10M7 12h10M7 17h7" stroke-linecap="round" />
              </svg>
            </span>
            <span class="segment-btn__label">{{ { todo: t.filterTodo, doing: t.filterDoing, done: t.filterDone, all: t.filterAll }[f] }}</span>
            <span class="segment-btn__count">{{ counts[f] }}</span>
          </button>
        </div>
      </div>

      <div v-if="statusReady" class="ios-list-scroll" :class="{ 'is-empty': !sortedCards.length }">
        <button
          v-for="card in sortedCards"
          :key="`${card.maint}-${card.title}-${card.deadline}`"
          type="button"
          class="ios-list-item"
          @click="goTask(card)"
        >
          <span class="item-icon-area" aria-hidden="true">
            <span class="status-ring" :class="ringClass(card.deadline, getCardStatusByCard(card))"></span>
          </span>
          <span class="item-content">
            <span class="item-title">{{ card.meta }}</span>
            <span class="item-subtitle">
              {{ card.title }} · {{ getDepot(card) }}
              <template v-if="getCardRejected(card)"> · {{ (t as any).rejectedBtn || '已拒绝' }}</template>
              <template v-if="getCardStatusByCard(card) === 'done' && doneUploadText(card)">
                · {{ doneUploadText(card) }}
              </template>
            </span>
          </span>
          <span class="item-right" aria-hidden="true">
            <span class="item-date" :class="dateClass(card.deadline, getCardStatusByCard(card))">
              {{ deadlineText(card.deadline, getCardStatusByCard(card)) }}
            </span>
            <span class="chevron">›</span>
          </span>
        </button>
        <p v-if="!sortedCards.length" class="ios-list-empty">{{ t.homeNoTasksFound }}</p>
      </div>
    </div>
  </section>
</template>
