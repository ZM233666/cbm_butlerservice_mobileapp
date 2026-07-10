<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { fetchHomeConfig, fetchTaskStatus } from '@/api/tasks'
import { useAuthStore } from '@/stores/auth'
import type { TaskCard, TaskStatusStore } from '@/types/task'
import { useI18n } from '@/composables/useI18n'
import { getDaysUntilDeadline, deadlineAlertLevel } from '@/composables/useDeadlineAlert'

const props = defineProps<{
  refreshSignal?: number
  extraCards?: TaskCard[]
  initialTasks?: TaskCard[]
}>()

const auth = useAuthStore()
const router = useRouter()
const { t } = useI18n()

const cards = ref<TaskCard[]>([])
const statusStore = ref<TaskStatusStore>({})
const activeFilter = ref<'todo' | 'doing' | 'done' | 'all'>('todo')

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

function taskKey(card: TaskCard) {
  // 任务状态 key：优先使用每条任务独立的 Main Task ID
  return String((card as any).taskId || '').trim() || `${card.maint}-${card.title}-${card.deadline}`
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

  return 'todo'
}

function getDepot(_card: TaskCard) {
  return String((_card as any).depot || '').trim() || '-'
}

function doneUploadText(card: TaskCard) {
  const p = (card as any).uploadProgress as { uploaded?: number; required?: number } | undefined
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
      // 关键：确保 TaskList 侧可以在缺 k 时复原 key（以及便于调试/排查）
      title: card.title,
      deadline: card.deadline,
      taskId: (card as any).taskId || '',
      // k 用于 taskKey 存储/读取：这里直接使用 Main Task ID
      k: taskKey(card),
    },
  })
}

async function loadStatuses() {
  if (!auth.user) return
  try {
    const data = await fetchTaskStatus(auth.user.employeeId)
    if (data.statuses) statusStore.value = data.statuses
  } catch { /* keep local */ }
}

async function boot(force = false) {
  const employeeId = String(auth.user?.employeeId || '').trim()
  if (!employeeId) return
  const now = Date.now()
  if (!force && now - lastBootAt < BOOT_MIN_INTERVAL_MS) return
  lastBootAt = now
  try {
    if (props.initialTasks?.length && !force) {
      cards.value = props.initialTasks
    } else {
      const cfg = await fetchHomeConfig(employeeId)
      if (cfg.tasks) cards.value = cfg.tasks
    }
    await loadStatuses()
  } catch {
    /* 会话过期或上游失败 */
  }
}

const BOOT_MIN_INTERVAL_MS = 60_000
let lastBootAt = 0

function onFocus() { boot() }

onMounted(() => {
  boot()
  window.addEventListener('focus', onFocus)
  document.addEventListener('visibilitychange', () => { if (!document.hidden) boot() })
})
onUnmounted(() => { window.removeEventListener('focus', onFocus) })

// 有些情况下首页先渲染、auth 后到位，导致未拉到状态；监听 employeeId，确保随时刷新。
watch(
  () => auth.user?.employeeId || '',
  (id) => {
    if (id) void loadStatuses()
  },
  { immediate: true },
)

watch(
  () => props.initialTasks,
  (rows) => {
    if (rows?.length) cards.value = rows
  },
)

watch(
  () => props.refreshSignal || 0,
  () => {
    boot(true)
  },
)
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
          <button
            v-for="f in (['todo','doing','done','all'] as const)"
            :key="f"
            type="button"
            class="segment-btn"
            :class="{ 'is-active': activeFilter === f, 'has-doing-bar': f === 'doing' && counts.doing > 0 }"
            role="tab"
            :aria-selected="activeFilter === f"
            @click="activeFilter = f"
          >
            <span class="segment-btn__label">{{ { todo: t.filterTodo, doing: t.filterDoing, done: t.filterDone, all: t.filterAll }[f] }}</span>
            <span class="segment-btn__count">{{ counts[f] }}</span>
          </button>
        </div>
      </div>

      <div class="ios-list-scroll" :class="{ 'is-empty': !sortedCards.length }">
        <div v-if="sortedCards.length">
          <button v-for="card in sortedCards" :key="`${card.maint}-${card.title}-${card.deadline}`" type="button" class="ios-list-item" @click="goTask(card)">
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
        </div>
        <p v-else class="ios-list-empty">{{ t.homeNoTasksFound }}</p>
      </div>
    </div>
  </section>
</template>
