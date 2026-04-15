<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import PageShell from '@/components/layout/PageShell.vue'
import ProfileCard from '@/components/home/ProfileCard.vue'
import ActionTasks from '@/components/home/ActionTasks.vue'
import CbmRecommendations from '@/components/home/CbmRecommendations.vue'
import ManagerDashboard from '@/components/home/ManagerDashboard.vue'
import { useAuthStore } from '@/stores/auth'
import { useI18nStore } from '@/stores/i18n'
import { fetchHomeConfig } from '@/api/tasks'
import type { TaskCard } from '@/types/task'
import { storeToRefs } from 'pinia'

const auth = useAuthStore()
const i18n = useI18nStore()
const { lang } = storeToRefs(i18n)
const toggleLabel = computed(() => (lang.value === 'zh' ? 'CN/EN' : 'EN/CN'))
const tasks = ref<TaskCard[]>([])

onMounted(async () => {
  try {
    const cfg = await fetchHomeConfig()
    if (cfg.tasks) tasks.value = cfg.tasks
  } catch { /* keep empty */ }
})
</script>

<template>
  <PageShell>
    <header class="hero" aria-label="品牌">
      <img class="hero__logo" src="/RVSChinaDT_Logo.png" width="240" height="auto" alt="RVS-CHINA DIGITAL TEAM" decoding="async" />
      <button type="button" class="hero__lang" :aria-label="toggleLabel" @click="i18n.toggleLang">
        {{ toggleLabel }}
      </button>
    </header>
    <main class="main">
      <div class="intro"><h1 class="intro__title">Digital CBM</h1></div>
      <ProfileCard />
      <ManagerDashboard v-if="auth.isManager" />
      <template v-if="auth.isFse || auth.isThirdParty">
        <ActionTasks />
        <CbmRecommendations class="home-recs-after-tasks" :tasks="tasks" />
      </template>
    </main>
  </PageShell>
</template>

<style scoped>
.hero { width: 100%; flex-shrink: 0; min-height: 118px; height: 19vh; max-height: 200px; border-radius: 0 0 38px 38px; background: linear-gradient(180deg,rgba(255,255,255,0.92) 0%,rgba(236,244,252,0.86) 100%), linear-gradient(135deg,rgba(0,70,127,0.06) 0%,rgba(0,102,179,0.12) 100%); box-shadow: inset 0 -1px 0 rgba(255,255,255,0.72), 0 10px 30px rgba(15,23,42,0.1); display: flex; align-items: center; justify-content: center; padding: 0.65rem 1.25rem; position: relative; }
.hero__logo { display: block; width: 100%; max-width: 240px; height: auto; max-height: min(120px,22vh); object-fit: contain; user-select: none; }
.hero__lang { position: absolute; top: max(0.85rem, calc(0.55rem + env(safe-area-inset-top, 0px))); right: 1rem; z-index: 6; min-height: 2.05rem; padding: 0.25rem 0.6rem; border-radius: 999px; border: 1px solid rgba(148, 163, 184, 0.55); background: rgba(255,255,255,0.84); backdrop-filter: saturate(160%) blur(12px); -webkit-backdrop-filter: saturate(160%) blur(12px); color: #0f172a; font: inherit; font-size: 0.72rem; font-weight: 760; letter-spacing: 0.02em; cursor: pointer; }
.hero__lang:active { transform: translateY(1px); filter: brightness(0.98); }
.main { flex: 1; display: flex; flex-direction: column; gap: 1.15rem; padding: 1.35rem 1.2rem 1.9rem; width: 100%; }
.intro { text-align: center; }
.intro__title { margin: 0; font-size: clamp(1.45rem,5.3vw,1.75rem); font-weight: 800; letter-spacing: -0.03em; line-height: 1.2; color: var(--kb-brand); }
/* 与 Action Tasks 区块拉开间距，提升两个模块的区分度 */
.home-recs-after-tasks { margin-top: 0.85rem; }
</style>
