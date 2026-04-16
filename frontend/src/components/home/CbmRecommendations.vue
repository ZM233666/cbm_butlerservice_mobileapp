<script setup lang="ts">
import { computed, ref } from 'vue'
import type { TaskCard } from '@/types/task'
import { useI18n } from '@/composables/useI18n'
import { useAuthStore } from '@/stores/auth'

const props = defineProps<{
  tasks: TaskCard[]
  onAccept?: (card: TaskCard) => Promise<void> | void
}>()

const { t } = useI18n()
const auth = useAuthStore()

const DEFAULT_DEPOT = 'Shanghai'
const DEFAULT_PROJECT = 'PRJ-2026-RVS-01'
const DEFAULT_TRAIN_NO = 'HXD1-1234'

const selected = ref<TaskCard | null>(null)
const modalOpen = computed(() => selected.value !== null)
const acceptState = ref<'idle' | 'loading' | 'success'>('idle')

function openCard(card: TaskCard) { selected.value = card }
function closeModal() {
  selected.value = null
  acceptState.value = 'idle'
}

function maintLabel(card: TaskCard) {
  const m = String(card.maint || '').toLowerCase()
  return m === 'c1c3' ? 'C1–C3' : (m === 'c4c6' ? 'C4–C6' : m.toUpperCase())
}

async function acceptSelected() {
  if (!selected.value || acceptState.value !== 'idle') return
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
  <section class="home-section" aria-label="CBM Recommendations">
    <div class="home-section__header">
      <h2 class="home-section__title">
        <span class="home-section__icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8">
            <path d="M12 3.8V20.2M3.8 12H20.2" stroke-linecap="round" />
            <path d="M6.2 6.2 17.8 17.8M17.8 6.2 6.2 17.8" stroke-linecap="round" />
            <circle cx="12" cy="12" r="8.2" />
          </svg>
        </span>
        {{ t.homeCbmTitle }}
      </h2>
    </div>

    <div class="ios-list-group" aria-label="CBM recommendation list">
      <div class="ios-list-scroll" :class="{ 'is-empty': !tasks.length }">
        <button v-for="card in tasks" :key="`${card.maint}-${card.title}-${card.deadline}`" type="button" class="ios-list-item" @click="openCard(card)">
          <span class="item-icon-area" aria-hidden="true">
            <span class="ai-icon">✦</span>
          </span>
          <span class="item-content">
            <span class="item-title">{{ card.title }} {{ t.homeRecoSuffix }}</span>
            <span class="item-subtitle">{{ (card.meta || 'CCBII · Maintenance') }} · {{ String((card as any).depot || '').trim() || DEFAULT_DEPOT }}</span>
          </span>
          <span class="item-right" aria-hidden="true">
            <span class="priority-indicator" :class="card.maint.toLowerCase() === 'c4c6' ? 'bg-high' : 'bg-med'"></span>
            <span class="chevron">›</span>
          </span>
        </button>
        <p v-if="!tasks.length" class="ios-list-empty">{{ t.homeNoTasksFound }}</p>
      </div>
    </div>

    <div class="home-cbm-meta" role="note">
      <p class="home-section__subtitle home-cbm-meta__hint">{{ t.homeCbmSubtitle }}</p>
      <div class="home-legend home-cbm-meta__legend" aria-label="priority legend">
        <span class="home-legend__item"><i class="home-legend__dot bg-low"></i>{{ t.legendLow }}</span>
        <span class="home-legend__item"><i class="home-legend__dot bg-med"></i>{{ t.legendMedium }}</span>
        <span class="home-legend__item"><i class="home-legend__dot bg-high"></i>{{ t.legendHigh }}</span>
      </div>
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
            <div class="reco-basic__row"><dt>{{ t.depot }}</dt><dd>{{ String((selected as any)?.depot || '').trim() || DEFAULT_DEPOT }}</dd></div>
            <div class="reco-basic__row"><dt>{{ t.deadline }}</dt><dd>{{ selected?.deadline || '-' }}</dd></div>
            <div class="reco-basic__row"><dt>{{ t.train }}</dt><dd>{{ DEFAULT_TRAIN_NO }}</dd></div>
            <div class="reco-basic__row"><dt>{{ t.project }}</dt><dd>{{ DEFAULT_PROJECT }}</dd></div>
            <div class="reco-basic__row"><dt>{{ t.taskid }}</dt><dd>{{ String((selected as any)?.taskId || '-') }}</dd></div>
          </dl>

          <div class="reco-sheet__actions">
            <button type="button" class="reco-accept" :class="{ 'is-loading': acceptState === 'loading' }" :disabled="acceptState !== 'idle'" @click="acceptSelected">
              <span v-if="acceptState === 'idle'" class="reco-accept__plus" aria-hidden="true">+</span>
              <span v-else-if="acceptState === 'loading'" class="reco-accept__spinner" aria-hidden="true"></span>
              <span v-else class="reco-accept__check" aria-hidden="true">✓</span>
              {{ acceptState === 'idle' ? ((t as any).accept || 'Accept') : (acceptState === 'loading' ? '...' : 'OK') }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
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
