<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import PageShell from '@/components/layout/PageShell.vue'
import LangSwitch from '@/components/common/LangSwitch.vue'
import ProfileCard from '@/components/home/ProfileCard.vue'
import ActionTasks from '@/components/home/ActionTasks.vue'
import CbmRecommendations from '@/components/home/CbmRecommendations.vue'
import ManagerDashboard from '@/components/home/ManagerDashboard.vue'
import { useAuthStore } from '@/stores/auth'
import { fetchHomeConfig } from '@/api/tasks'
import { acceptRecommendation } from '@/api/recommendations'
import { useI18n } from '@/composables/useI18n'
import type { TaskCard } from '@/types/task'

const HIDDEN_RECOMMENDATION_TASK_IDS = new Set([
  'MT-CCBII-88422',
  'MT-CCBII-88423',
])

const auth = useAuthStore()
const route = useRoute()
const { t } = useI18n()

const tasks = ref<TaskCard[]>([])
const recommendations = ref<TaskCard[]>([])

const loading = ref(false)
const hasLoadError = ref(false)
const hasAcceptError = ref(false)
const acceptingRecoIds = ref<Set<string>>(new Set())

let loadVersion = 0
let acceptVersion = 0

const employeeId = computed(() =>
  String(auth.user?.employeeId || '').trim(),
)

const canViewFseModules = computed(
  () => auth.isFse || auth.isThirdParty,
)

const loadError = computed(() =>
  hasLoadError.value ? t.value.homeLoadFail : '',
)

const acceptError = computed(() =>
  hasAcceptError.value ? t.value.homeAcceptFail : '',
)

const hasHomeData = computed(
  () => tasks.value.length > 0 || recommendations.value.length > 0,
)

const loadingMessage = computed(() =>
  hasHomeData.value ? t.value.homeRefreshing : t.value.homeLoading,
)

const cbmRecoTasks = computed(() =>
  recommendations.value.filter((task) => {
    const taskId = String(task.taskId || '').trim()
    return !HIDDEN_RECOMMENDATION_TASK_IDS.has(taskId)
  }),
)

/**
 * Loading / LoadError 时是否展示 FSE 业务模块：
 * - 非 FSE/第三方：不展示
 * - 加载失败：不展示
 * - 首次加载中且尚无数据：不展示
 * - 软刷新（已有数据）或加载成功：展示
 * Accept 错误不影响展示。
 */
const showFseModules = computed(() => {
  if (!employeeId.value || !canViewFseModules.value) return false
  if (hasLoadError.value) return false
  if (loading.value && !hasHomeData.value) return false
  return true
})

function resetHomeData() {
  tasks.value = []
  recommendations.value = []
}

function clearAcceptingState() {
  acceptingRecoIds.value = new Set()
  hasAcceptError.value = false
  acceptVersion += 1
}

async function loadHomeData() {
  const id = employeeId.value
  const currentVersion = ++loadVersion

  if (!id || !canViewFseModules.value) {
    resetHomeData()
    loading.value = false
    hasLoadError.value = false
    return
  }

  loading.value = true
  hasLoadError.value = false

  try {
    const cfg = await fetchHomeConfig(id)

    if (currentVersion !== loadVersion) return

    tasks.value = Array.isArray(cfg.tasks) ? cfg.tasks : []
    recommendations.value = Array.isArray(cfg.recommendations) ? cfg.recommendations : []
  } catch {
    if (currentVersion !== loadVersion) return

    resetHomeData()
    hasLoadError.value = true
  } finally {
    if (currentVersion === loadVersion) {
      loading.value = false
    }
  }
}

watch(
  [employeeId, canViewFseModules],
  () => {
    clearAcceptingState()
    resetHomeData()
    hasLoadError.value = false
    void loadHomeData()
  },
  { immediate: true },
)

watch(
  () => String(route.query.refresh || ''),
  (value, oldValue) => {
    if (value && value !== oldValue) {
      void loadHomeData()
    }
  },
)

async function acceptReco(card: TaskCard) {
  const id = employeeId.value
  const recoId = String(card.id || '').trim()
  const currentAcceptVersion = acceptVersion

  if (!id || !recoId || acceptingRecoIds.value.has(recoId)) {
    return
  }

  acceptingRecoIds.value = new Set([
    ...acceptingRecoIds.value,
    recoId,
  ])
  hasAcceptError.value = false

  try {
    await acceptRecommendation(recoId, id)

    if (currentAcceptVersion !== acceptVersion || employeeId.value !== id) return

    await loadHomeData()
  } catch {
    if (currentAcceptVersion !== acceptVersion || employeeId.value !== id) return
    hasAcceptError.value = true
  } finally {
    if (currentAcceptVersion !== acceptVersion) return
    const next = new Set(acceptingRecoIds.value)
    next.delete(recoId)
    acceptingRecoIds.value = next
  }
}
</script>

<template>
  <PageShell>
    <header class="home-top" :class="{ 'home-top--exclusive': auth.isManager }" :aria-label="t.brand">
      <svg class="home-top__tech-lines" viewBox="0 0 260 170" aria-hidden="true">
        <defs>
          <linearGradient id="home-route-a" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0" stop-color="#9fc8e5" stop-opacity="0" />
            <stop offset="0.4" stop-color="#9fc8e5" stop-opacity="0.28" />
            <stop offset="0.78" stop-color="#d8eaf6" stop-opacity="0.34" />
            <stop offset="1" stop-color="#d8eaf6" stop-opacity="0" />
          </linearGradient>
          <linearGradient id="home-route-exclusive" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0" stop-color="#b8892e" stop-opacity="0" />
            <stop offset="0.35" stop-color="#d4a84b" stop-opacity="0.42" />
            <stop offset="0.72" stop-color="#e8c56a" stop-opacity="0.55" />
            <stop offset="1" stop-color="#f5e6b8" stop-opacity="0" />
          </linearGradient>
        </defs>
        <line
          class="home-top__ray"
          :stroke="auth.isManager ? 'url(#home-route-exclusive)' : 'url(#home-route-a)'"
          x1="260" y1="10" x2="-10" y2="124"
        />
        <line
          class="home-top__ray home-top__ray--middle"
          :stroke="auth.isManager ? 'url(#home-route-exclusive)' : 'url(#home-route-a)'"
          x1="260" y1="24" x2="42" y2="170"
        />
        <line
          class="home-top__ray home-top__ray--short"
          :stroke="auth.isManager ? 'url(#home-route-exclusive)' : 'url(#home-route-a)'"
          x1="248" y1="-4" x2="112" y2="170"
        />
      </svg>
      <div class="home-top__row">
        <img
          class="home-top__logo"
          src="/RVSChinaDT_Logo_white.png"
          width="364"
          height="230"
          alt="RVS-CHINA DIGITAL TEAM"
          decoding="async"
        />
        <LangSwitch class="home-top__lang" />
      </div>
      <h1 class="home-top__title">Digital CBM</h1>
      <ProfileCard class="home-top__profile" />
    </header>

    <main class="main home-main">
      <div v-if="loading && hasHomeData && canViewFseModules" class="home-status home-status--loading" role="status" aria-live="polite">
        {{ loadingMessage }}
      </div>

      <div v-else-if="loadError" class="home-status home-status--error" role="alert">
        <p>{{ loadError }}</p>
        <button type="button" class="home-status__retry" @click="loadHomeData">{{ t.homeRetry }}</button>
      </div>

      <div v-if="acceptError" class="home-status home-status--accept-error" role="alert">
        <p>{{ acceptError }}</p>
        <button type="button" class="home-status__dismiss" @click="hasAcceptError = false">{{ t.close }}</button>
      </div>

      <ManagerDashboard v-if="auth.isManager" />

      <div
        v-if="loading && !hasHomeData && canViewFseModules"
        class="home-skeleton"
        role="status"
        aria-live="polite"
        aria-busy="true"
        :aria-label="loadingMessage"
      >
        <div class="home-skeleton__section home-skeleton__section--tasks"></div>
        <div class="home-skeleton__section home-skeleton__section--recommendations"></div>
      </div>

      <template v-else-if="showFseModules">
        <ActionTasks :tasks="tasks" />
        <CbmRecommendations
          class="home-recs-after-tasks"
          :tasks="cbmRecoTasks"
          :on-accept="acceptReco"
          :accepting-reco-ids="acceptingRecoIds"
        />
      </template>
    </main>
  </PageShell>
</template>

<style scoped>
.home-top {
  position: relative;
  isolation: isolate;
  width: 100%;
  flex-shrink: 0;
  padding:
    clamp(1rem, 3.5vw, 1.35rem)
    clamp(1rem, 4vw, 1.5rem)
    clamp(1.25rem, 4vw, 1.55rem);
  background-color: #00467f;
  overflow: hidden;
}

.home-top__tech-lines {
  position: absolute;
  top: clamp(3.4rem, 13vw, 4.4rem);
  right: -1rem;
  width: min(62vw, 18rem);
  height: clamp(9rem, 33vw, 11.5rem);
  pointer-events: none;
  z-index: 0;
}

.home-top__tech-lines line {
  fill: none;
  stroke-width: 1.45;
  stroke-linecap: round;
  stroke-linejoin: round;
  vector-effect: non-scaling-stroke;
}

.home-top__ray--middle {
  stroke-width: 1.15;
  opacity: 0.72;
}

.home-top__ray--short {
  stroke-width: 0.9;
  opacity: 0.5;
}

.home-top__row,
.home-top__title,
.home-top__profile {
  position: relative;
  z-index: 1;
}

.home-top__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.home-top__logo {
  display: block;
  width: auto;
  height: clamp(2.6rem, 9vw, 3.25rem);
  max-width: min(42vw, 9.5rem);
  object-fit: contain;
  object-position: left center;
  margin-right: auto;
  -webkit-user-select: none;
  user-select: none;
  -webkit-user-drag: none;
}

.home-top__title {
  margin: clamp(1.55rem, 5.5vw, 2.15rem) 0 clamp(1.2rem, 4vw, 1.55rem);
  padding-bottom: 1.5rem;
  font-size: clamp(1.75rem, 7.6vw, 2.35rem);
  font-weight: 880;
  letter-spacing: 0;
  line-height: 1.04;
  text-align: left;
  color: #fff;
}

.home-top__title::after {
  content: '';
  position: absolute;
  left: 0;
  bottom: 0;
  width: clamp(2.16rem, 9.6vw, 3.2rem);
  height: 0.24rem;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.92);
}

.home-top--exclusive .home-top__title::after {
  background: linear-gradient(90deg, var(--kb-exclusive-deep, #b8892e), var(--kb-exclusive-bright, #e8c56a));
  box-shadow: 0 0 10px rgba(212, 168, 75, 0.45);
}

.home-top--exclusive .home-top__tech-lines line {
  stroke-width: 1.55;
}

.home-top--exclusive :deep(.profile-card__icon),
.home-top--exclusive :deep(.profile-card__icon--at) {
  color: var(--kb-exclusive-bright, #e8c56a);
}

.home-top--exclusive :deep(.profile-card__role) {
  background: rgba(212, 168, 75, 0.28);
  color: #fff8e8;
}

.home-top__profile {
  margin: 0;
}

.home-top :deep(.lang-switch) {
  border-color: rgba(255, 255, 255, 0.32);
  background: rgba(255, 255, 255, 0.12);
}

.home-top :deep(.lang-switch__opt) {
  color: rgba(255, 255, 255, 0.72);
}

.home-top :deep(.lang-switch__opt.is-active) {
  background: rgba(255, 255, 255, 0.96);
  color: #00467f;
  box-shadow: 0 2px 8px rgba(0, 20, 40, 0.2);
}

.home-top :deep(.profile-card) {
  background: #0b568f;
  border: 0;
  border-radius: 10px;
  box-shadow: none;
}

.home-top :deep(.profile-card__icon),
.home-top :deep(.profile-card__icon--at) {
  color: rgba(255, 255, 255, 0.92);
}

.home-top :deep(.profile-card__name) {
  color: #fff;
}

.home-top :deep(.profile-card__id),
.home-top :deep(.profile-card__email) {
  color: rgba(255, 255, 255, 0.78);
}

.home-top :deep(.profile-card__role) {
  border-color: transparent;
  background: rgba(255, 255, 255, 0.18);
  color: #fff;
}

.home-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: clamp(0.75rem, 2vw, 1rem);
  padding: clamp(0.9rem, 3vw, 1.2rem) clamp(1rem, 4vw, 1.5rem) clamp(1.5rem, 5vw, 2rem);
  width: 100%;
  background: var(--page-bg, #f3f7fc);
}

.home-recs-after-tasks {
  margin-top: 0.05rem;
}

.home-skeleton {
  display: grid;
  gap: clamp(0.75rem, 2vw, 1rem);
}

.home-skeleton__section {
  border-radius: 8px;
  background: linear-gradient(100deg, #e8edf3 20%, #f6f8fb 45%, #e8edf3 70%);
  background-size: 220% 100%;
  animation: home-skeleton-shift 1.4s ease-in-out infinite;
}

.home-skeleton__section--tasks {
  min-height: 16rem;
}

.home-skeleton__section--recommendations {
  min-height: 11rem;
}

.home-status {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  min-height: 3rem;
  padding: 0.75rem 0.9rem;
  border-radius: 12px;
  border: 1px solid #e2e8f0;
  background: #fff;
  font-size: 0.88rem;
  box-shadow: 0 6px 20px rgba(15, 23, 42, 0.06);
}

.home-status--loading {
  color: var(--text-muted, #8a94a6);
}

.home-status--loading::before {
  content: '';
  width: 0.95rem;
  height: 0.95rem;
  border: 2px solid var(--kb-brand, #00467f);
  border-right-color: transparent;
  border-radius: 50%;
  animation: home-spin 0.8s linear infinite;
  flex-shrink: 0;
}

.home-status--error,
.home-status--accept-error {
  flex-direction: column;
  color: #64748b;
  text-align: center;
}

.home-status--accept-error {
  border-color: rgba(220, 38, 38, 0.22);
  background: #fff8f8;
  color: #b91c1c;
}

.home-status--error p,
.home-status--accept-error p {
  margin: 0;
}

.home-status__retry,
.home-status__dismiss {
  padding: 0.45rem 1.2rem;
  border: none;
  border-radius: 8px;
  background: var(--kb-brand, #00467f);
  color: #fff;
  font: inherit;
  font-size: 0.86rem;
  font-weight: 650;
  cursor: pointer;
}

.home-status__dismiss {
  background: transparent;
  color: #b91c1c;
  border: 1px solid rgba(185, 28, 28, 0.35);
}

.home-status__retry:hover,
.home-status__dismiss:hover {
  filter: brightness(1.06);
}

.home-status__retry:focus-visible,
.home-status__dismiss:focus-visible {
  outline: 3px solid rgba(0, 69, 126, 0.25);
  outline-offset: 3px;
}

.home-status__dismiss:focus-visible {
  outline-color: rgba(185, 28, 28, 0.25);
}

.home-status__retry:active,
.home-status__dismiss:active {
  transform: scale(0.98);
}

@keyframes home-spin {
  to { transform: rotate(360deg); }
}

@keyframes home-skeleton-shift {
  to { background-position: -220% 0; }
}

@media (prefers-reduced-motion: reduce) {
  .home-status--loading::before {
    animation: none;
    border-right-color: var(--kb-brand, #00467f);
  }

  .home-skeleton__section {
    animation: none;
  }

  .home-status__retry:active,
  .home-status__dismiss:active {
    transform: none;
  }
}
</style>
