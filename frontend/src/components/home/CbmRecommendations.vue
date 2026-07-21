<script setup lang="ts">
import { computed, ref } from 'vue'
import type { TaskCard } from '@/types/task'
import { useI18n } from '@/composables/useI18n'
import { getDaysUntilDeadline } from '@/composables/useDeadlineAlert'

const props = withDefaults(defineProps<{
  tasks: TaskCard[]
  onAccept?: (card: TaskCard) => Promise<void> | void
  /** 正在接受中的推荐 ID 集合，用于禁用重复点击 */
  acceptingRecoIds?: Set<string>
  /** 功能未上线时置灰展示，不可点击 */
  comingSoon?: boolean
}>(), {
  comingSoon: true,
})

const { t } = useI18n()

const DEFAULT_DEPOT = 'Shanghai'
const DEFAULT_PROJECT = 'PRJ-2026-RVS-01'
const DEFAULT_TRAIN_NO = 'HXD1-1234'
type RecoPriority = 'low' | 'medium' | 'high'

const selected = ref<TaskCard | null>(null)
const modalOpen = computed(() => selected.value !== null)
const acceptState = ref<'idle' | 'loading' | 'success'>('idle')
const collapsed = ref(true)

const selectedRecoId = computed(() => String(selected.value?.id || '').trim())
const isSelectedAccepting = computed(() => {
  const id = selectedRecoId.value
  return !!id && !!props.acceptingRecoIds?.has(id)
})

const recommendationRows = computed(() =>
  props.tasks.map((card) => ({
    card,
    priority: getRecommendationPriority(card),
  })),
)

function openCard(card: TaskCard) {
  if (props.comingSoon) return
  selected.value = card
}
function closeModal() {
  selected.value = null
  acceptState.value = 'idle'
}

function maintLabel(card: TaskCard) {
  const m = String(card.maint || '').toLowerCase()
  return m === 'c1c3' ? 'C1/C3' : (m === 'c4c6' ? 'C4/C6' : m.toUpperCase())
}

function normalizePriority(value: unknown): RecoPriority | null {
  const raw = String(value || '').trim().toLowerCase()
  if (raw === 'high' || raw === '高') return 'high'
  if (raw === 'medium' || raw === 'med' || raw === 'middle' || raw === '中') return 'medium'
  if (raw === 'low' || raw === '低') return 'low'
  return null
}

function getRecommendationPriority(card: TaskCard): RecoPriority {
  const explicit = normalizePriority(card.priority)
  if (explicit) return explicit

  const days = getDaysUntilDeadline(card.deadline)
  if (days == null) return 'low'
  if (days <= 7) return 'high'
  if (days <= 30) return 'medium'
  return 'low'
}

function priorityLabel(priority: RecoPriority) {
  if (priority === 'high') return t.value.legendHigh
  if (priority === 'medium') return t.value.legendMedium
  return t.value.legendLow
}

async function acceptSelected() {
  if (!selected.value || acceptState.value !== 'idle' || isSelectedAccepting.value) return
  acceptState.value = 'loading'
  try {
    await props.onAccept?.(selected.value)
    acceptState.value = 'success'
    setTimeout(() => { closeModal() }, 650)
  } catch {
    acceptState.value = 'idle'
  }
}
</script>

<template>
  <section class="home-section" :class="{ 'is-coming-soon': comingSoon }" aria-label="CBM Recommendations">
    <div class="home-section__header">
      <h2 class="home-section__title">
        {{ t.homeCbmTitle }}
        <span v-if="comingSoon" class="coming-soon-badge">{{ t.homeCbmComingSoon }}</span>
      </h2>
      <button
        type="button"
        class="cbm-collapse-button"
        :aria-expanded="!collapsed"
        :aria-label="collapsed ? t.homeCbmExpand : t.homeCbmCollapse"
        @click="collapsed = !collapsed"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
    </div>

    <div v-if="!collapsed" class="ios-list-group" aria-label="CBM recommendation list" :aria-disabled="comingSoon ? 'true' : undefined">
      <div class="ios-list-scroll" :class="{ 'is-empty': !tasks.length }">
        <component
          :is="comingSoon ? 'div' : 'button'"
          v-for="row in recommendationRows"
          :key="row.card.id || `${row.card.maint}-${row.card.title}-${row.card.deadline}`"
          :type="comingSoon ? undefined : 'button'"
          class="ios-list-item"
          :class="{ 'is-disabled': comingSoon }"
          @click="openCard(row.card)"
        >
          <span class="item-icon-area" aria-hidden="true">
            <span class="status-ring"></span>
            <span
              class="maint-badge"
              :class="String(row.card.maint || '').toLowerCase() === 'c4c6' ? 'maint-badge--c4c6' : 'maint-badge--c1c3'"
            >{{ maintLabel(row.card) }}</span>
          </span>
          <span class="item-content">
            <span class="item-title">{{ t.homeRecoInspection }}</span>
            <span class="item-subtitle">{{ String(row.card.depot || '').trim() || DEFAULT_DEPOT }}</span>
          </span>
          <span class="item-right">
            <!-- 优先级展示暂未启用，先全部隐藏
            <span
              class="reco-priority"
              :class="`reco-priority--${row.priority}`"
            >
              <i class="reco-priority__dot"></i>
              <span>{{ priorityLabel(row.priority) }}</span>
            </span>
            -->
            <span class="chevron">›</span>
          </span>
        </component>
        <p v-if="!tasks.length" class="ios-list-empty">{{ t.homeNoTasksFound }}</p>
      </div>
    </div>

    <div v-if="!collapsed" class="home-cbm-meta" role="note">
      <p class="home-section__subtitle home-cbm-meta__hint">{{ comingSoon ? t.homeCbmComingSoonHint : t.homeCbmSubtitle }}</p>
      <!-- 优先级图例暂未启用，先全部隐藏
      <div class="home-legend home-cbm-meta__legend" aria-label="priority legend">
        <span class="home-legend__item"><i class="home-legend__dot bg-low"></i>{{ t.legendLow }}</span>
        <span class="home-legend__item"><i class="home-legend__dot bg-med"></i>{{ t.legendMedium }}</span>
        <span class="home-legend__item"><i class="home-legend__dot bg-high"></i>{{ t.legendHigh }}</span>
      </div>
      -->
    </div>
  </section>

  <Teleport to="body">
    <div v-if="modalOpen" class="reco-sheet-backdrop" role="presentation" @click.self="closeModal">
      <div class="reco-sheet" role="dialog" aria-modal="true" :aria-label="t.basicInfo">
        <div class="reco-sheet__handle" aria-hidden="true"></div>
        <div class="reco-sheet__inner">
          <div class="reco-sheet__head">
            <h3 class="reco-sheet__title">{{ t.basicInfo }}</h3>
            <button type="button" class="reco-sheet__close" :aria-label="t.close" @click="closeModal">✕</button>
          </div>

          <div class="reco-primary">
            <div class="reco-primary__label">{{ t.maint }}</div>
            <div class="reco-primary__value">{{ selected ? maintLabel(selected) : '-' }}</div>
          </div>

          <dl class="reco-basic" aria-label="Basic Info">
            <div class="reco-basic__row"><dt>{{ t.depot }}</dt><dd>{{ String(selected?.depot || '').trim() || DEFAULT_DEPOT }}</dd></div>
            <div class="reco-basic__row"><dt>{{ t.deadline }}</dt><dd>{{ selected?.deadline || '-' }}</dd></div>
            <div class="reco-basic__row"><dt>{{ t.train }}</dt><dd>{{ DEFAULT_TRAIN_NO }}</dd></div>
            <div class="reco-basic__row"><dt>{{ t.project }}</dt><dd>{{ DEFAULT_PROJECT }}</dd></div>
            <div class="reco-basic__row"><dt>{{ t.taskid }}</dt><dd>{{ selected?.taskId || '-' }}</dd></div>
          </dl>

          <div class="reco-sheet__actions">
            <button
              type="button"
              class="reco-accept"
              :class="{ 'is-loading': acceptState === 'loading' || isSelectedAccepting }"
              :disabled="acceptState !== 'idle' || isSelectedAccepting"
              @click="acceptSelected"
            >
              <span v-if="acceptState === 'idle' && !isSelectedAccepting" class="reco-accept__plus" aria-hidden="true">+</span>
              <span v-else-if="acceptState === 'loading' || isSelectedAccepting" class="reco-accept__spinner" aria-hidden="true"></span>
              <span v-else class="reco-accept__check" aria-hidden="true">✓</span>
              {{ acceptState === 'idle' && !isSelectedAccepting ? t.accept : (acceptState === 'success' ? 'OK' : '...') }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.home-section.is-coming-soon {
  opacity: 1;
  filter: none;
}

.home-section__header {
  align-items: center;
}

.home-section__title {
  min-width: 0;
  flex: 1 1 auto;
  width: auto;
}

.cbm-collapse-button {
  width: 2.25rem;
  height: 2.25rem;
  flex: 0 0 2.25rem;
  display: inline-grid;
  place-items: center;
  margin-left: 0.45rem;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--kb-brand);
  cursor: pointer;
}

.cbm-collapse-button svg {
  width: 1.25rem;
  height: 1.25rem;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
  transition: transform 0.18s ease;
}

.cbm-collapse-button[aria-expanded='false'] svg {
  transform: rotate(180deg);
}

.cbm-collapse-button:focus-visible {
  outline: 2px solid var(--kb-brand);
  outline-offset: 1px;
}

@media (prefers-reduced-motion: reduce) {
  .cbm-collapse-button svg { transition: none; }
}

.home-section.is-coming-soon .home-section__icon {
  opacity: 0.75;
}

.coming-soon-badge {
  margin-left: auto;
  padding: 0.12rem 0.5rem;
  border-radius: 999px;
  font-size: 0.58rem;
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #64748b;
  background: var(--surface-muted, #f5f7fa);
  border: 1px solid rgba(196, 204, 215, 0.9);
  vertical-align: middle;
}

.ios-list-item.is-disabled {
  cursor: not-allowed;
  pointer-events: none;
  user-select: none;
}

.ios-list-item.is-disabled .item-title,
.ios-list-item.is-disabled .item-subtitle,
.ios-list-item.is-disabled .maint-badge {
  color: #94a3b8;
}

.ios-list-item.is-disabled .status-ring {
  opacity: 0.45;
}

.ios-list-item.is-disabled .chevron {
  opacity: 0.35;
}

.home-section.is-coming-soon .home-cbm-meta__hint {
  color: #94a3b8;
}

.home-section.is-coming-soon .home-legend__item {
  opacity: 0.86;
}

.reco-priority {
  display: inline-flex;
  align-items: center;
  gap: 0.28rem;
  min-width: 2.65rem;
  justify-content: flex-start;
  padding: 0.2rem 0.38rem;
  border-radius: 999px;
  font-size: 0.72rem;
  font-weight: 800;
  line-height: 1;
  white-space: nowrap;
  background: #f8fafc;
  border: 1px solid rgba(226, 232, 240, 0.92);
}

.reco-priority__dot {
  width: 0.55rem;
  height: 0.55rem;
  border-radius: 999px;
  flex: 0 0 auto;
}

.reco-priority--low {
  color: #15803d;
}

.reco-priority--low .reco-priority__dot {
  background: #22c55e;
}

.reco-priority--medium {
  color: #b45309;
}

.reco-priority--medium .reco-priority__dot {
  background: #f59e0b;
}

.reco-priority--high {
  color: #b91c1c;
}

.reco-priority--high .reco-priority__dot {
  background: #e11d48;
}

.ios-list-item.is-disabled .reco-priority {
  color: inherit;
  opacity: 1;
}

.ios-list-item.is-disabled .reco-priority--low {
  color: #15803d;
}

.ios-list-item.is-disabled .reco-priority--medium {
  color: #b45309;
}

.ios-list-item.is-disabled .reco-priority--high {
  color: #b91c1c;
}

.reco-sheet-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.42);
  z-index: 10150;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  /* 避开底部导航栏（BottomNav） */
  padding: 0.85rem 0.85rem calc(var(--bottom-nav-h, 3.5rem) + 0.85rem + env(safe-area-inset-bottom, 0px));
}

.reco-sheet {
  width: min(28rem, 100%);
  background: #fff;
  border-radius: 1.25rem;
  border: 1px solid rgba(226, 232, 240, 0.9);
  box-shadow: 0 18px 50px rgba(15, 23, 42, 0.22);
  animation: reco-sheet-in 0.22s ease both;
}

.reco-sheet__handle {
  width: 2.6rem;
  height: 0.28rem;
  border-radius: 999px;
  background: rgba(148, 163, 184, 0.55);
  margin: 0.55rem auto 0;
}

.reco-sheet__inner { padding: 0.75rem 0.9rem 0.9rem; }
.reco-sheet__head { display: flex; align-items: center; justify-content: space-between; gap: 0.6rem; margin: 0.2rem 0 0.6rem; }
.reco-sheet__title { margin: 0; font-size: 1rem; font-weight: 800; color: var(--kb-navy); }
.reco-sheet__close {
  border: 1px solid rgba(148, 163, 184, 0.35);
  background: rgba(248, 250, 252, 0.92);
  color: rgba(15, 23, 42, 0.82);
  font: inherit;
  font-weight: 900;
  cursor: pointer;
  width: 2.35rem;
  height: 2.35rem;
  border-radius: 999px;
  display: inline-grid;
  place-items: center;
  line-height: 1;
  user-select: none;
}
.reco-sheet__close:active { filter: brightness(0.97); transform: translateY(1px); }

.reco-primary { padding: 0.6rem 0.7rem; border-radius: 0.9rem; background: rgba(239, 246, 255, 0.72); border: 1px solid rgba(191, 219, 254, 0.75); margin: 0.2rem 0 0.75rem; }
.reco-primary__label { font-size: 0.72rem; font-weight: 700; letter-spacing: 0.01em; color: rgba(71, 85, 105, 0.92); }
.reco-primary__value { margin-top: 0.16rem; font-size: 1.02rem; font-weight: 760; color: #0b4a82; letter-spacing: -0.01em; }

.reco-basic { margin: 0; padding: 0 0.7rem; display: grid; gap: 0.55rem; }
.reco-basic__row { display: grid; grid-template-columns: 7.4rem minmax(0, 1fr); gap: 0.7rem; align-items: center; }
.reco-basic__row dt { font-size: 0.78rem; font-weight: 750; color: rgba(71, 85, 105, 0.9); }
.reco-basic__row dd { margin: 0; font-size: 0.88rem; font-weight: 700; color: #0f172a; word-break: break-word; overflow-wrap: anywhere; }

.reco-sheet__actions { margin-top: 0.85rem; }
.reco-accept { width: 100%; min-height: 2.55rem; border-radius: 999px; border: 1px solid transparent; background: linear-gradient(180deg, #0066b3 0%, #00467f 100%); color: #fff; font: inherit; font-weight: 800; letter-spacing: 0.02em; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 0.5rem; }
.reco-accept:active { filter: brightness(0.96); }
.reco-accept__plus { width: 1.2rem; height: 1.2rem; border-radius: 999px; background: rgba(255,255,255,0.2); display: inline-flex; align-items: center; justify-content: center; font-size: 1.05rem; line-height: 1; }
.reco-accept:disabled { opacity: 0.7; cursor: not-allowed; }
.reco-accept__spinner {
  width: 1.05rem;
  height: 1.05rem;
  border-radius: 999px;
  border: 2px solid rgba(255,255,255,0.55);
  border-top-color: rgba(255,255,255,1);
  animation: reco-spin 0.9s linear infinite;
}
.reco-accept__check {
  width: 1.2rem;
  height: 1.2rem;
  border-radius: 999px;
  background: rgba(255,255,255,0.2);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 1.05rem;
  line-height: 1;
  animation: reco-check 0.32s ease both;
}

@keyframes reco-sheet-in {
  from { transform: translateY(18px); opacity: 0.01; }
  to { transform: translateY(0); opacity: 1; }
}
@keyframes reco-spin { to { transform: rotate(360deg); } }
@keyframes reco-check {
  from { transform: scale(0.65); opacity: 0.2; }
  to { transform: scale(1); opacity: 1; }
}

@media (max-width: 380px) { .reco-basic__row { grid-template-columns: 6.6rem minmax(0, 1fr); } }
</style>
