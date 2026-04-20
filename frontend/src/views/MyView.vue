<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import TopBrandBar from '@/components/layout/TopBrandBar.vue'
import { useI18n } from '@/composables/useI18n'

const auth = useAuthStore()
const router = useRouter()
const user = auth.user!
const { t } = useI18n()

const aboutOpen = ref(false)
const contactOpen = ref(false)

function logout() {
  auth.logout()
  router.replace('/login')
}
</script>

<template>
  <div class="page page--my">
    <TopBrandBar />
    <header class="my-header">
      <div class="my-header__avatar" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="40" height="40" fill="none">
          <circle cx="12" cy="9" r="3.5" fill="currentColor" />
          <path fill="currentColor" d="M6 20.5c0-3.3 2.7-6 6-6s6 2.7 6 6" opacity="0.95" />
        </svg>
      </div>
      <div class="my-header__meta">
        <p class="my-header__name">{{ user.username }}</p>
        <p class="my-header__line">{{ t.myHeaderEmail }}: {{ user.email }}</p>
        <p class="my-header__line">{{ t.myHeaderEmployeeId }}: {{ user.employeeId }}</p>
        <p class="my-header__line">{{ t.myHeaderRegion }}: {{ user.region || '-' }}</p>
        <p class="my-header__line">{{ t.myHeaderRole }}: {{ auth.roleLabel }}</p>
      </div>
    </header>

    <main class="main main--my">
      <section class="my-info-card" aria-labelledby="my-info-heading">
        <h2 id="my-info-heading" class="my-info-card__title">{{ t.myOtherInfo }}</h2>
        <button type="button" class="my-info-row my-info-row--action" @click="aboutOpen = true">
          <span class="my-info-row__icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="22" height="22"><circle cx="12" cy="12" r="10" fill="var(--kb-brand)" /><path fill="#fff" d="M12 7.25a1.1 1.1 0 1 1 0 2.2 1.1 1.1 0 0 1 0-2.2Zm-1 4.5h2v6h-2v-6Z" /></svg>
          </span>
          <span class="my-info-row__text">
            <span class="my-info-row__title">{{ t.myAbout }}</span>
            <span class="my-info-row__sub">{{ t.myAboutSub }}</span>
          </span>
        </button>
        <button type="button" class="my-info-row my-info-row--action" @click="contactOpen = true">
          <span class="my-info-row__icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="var(--kb-brand)" stroke-width="1.75"><path stroke-linecap="round" stroke-linejoin="round" d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" /></svg>
          </span>
          <span class="my-info-row__text">
            <span class="my-info-row__title">{{ t.myContact }}</span>
            <span class="my-info-row__sub">{{ t.myContactSub }}</span>
          </span>
        </button>
      </section>

      <button type="button" class="my-logout" :aria-label="t.myLogout" @click="logout">
        <svg class="my-logout__icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
        </svg>
        <span>{{ t.myLogout }}</span>
      </button>
    </main>
  </div>

  <Teleport to="body">
    <dialog class="my-dialog" :open="aboutOpen" @click.self="aboutOpen = false">
      <h3 class="my-dialog__title">{{ t.myDialogAboutTitle }}</h3>
      <p class="my-dialog__body">Knorr-Bremse RVS China Digital Team<br />Digital CBM Mobile app v1.0.0</p>
      <button type="button" class="my-dialog__ok" @click="aboutOpen = false">{{ t.myDialogOk }}</button>
    </dialog>
    <dialog class="my-dialog" :open="contactOpen" @click.self="contactOpen = false">
      <h3 class="my-dialog__title">{{ t.myDialogContactTitle }}</h3>
      <p class="my-dialog__body my-dialog__body--muted">Knorr-Bremse RVS China Digital<br />Team Please contact us via<br />Knorr-Bremse email</p>
      <button type="button" class="my-dialog__ok" @click="contactOpen = false">{{ t.myDialogOk }}</button>
    </dialog>
  </Teleport>
</template>

<style scoped>
.page--my { padding-top: 0; background: transparent; max-width: var(--column-max, 28rem); margin: 0 auto; min-height: 100vh; min-height: 100svh; display: flex; flex-direction: column; padding-bottom: calc(var(--bottom-nav-h, 3.5rem) + 0.5rem + env(safe-area-inset-bottom, 0px)); }
.my-header { flex-shrink: 0; display: flex; align-items: center; gap: 1rem; padding: 1rem 1.2rem 1.15rem; padding-top: max(1rem, calc(0.65rem + env(safe-area-inset-top, 0px))); background: linear-gradient(180deg,#0a5a9e 0%,#00467f 100%); color: #fff; }
.my-header__avatar { width: 4.1rem; height: 4.1rem; border-radius: 50%; border: 1.5px solid rgba(255,255,255,0.62); background: rgba(255,255,255,0.12); display: flex; align-items: center; justify-content: center; flex-shrink: 0; color: #fff; }
.my-header__meta { min-width: 0; flex: 1; }
.my-header__name { margin: 0 0 0.28rem; font-size: 1.45rem; font-weight: 760; letter-spacing: -0.02em; line-height: 1.1; color: #fff; }
.my-header__line { margin: 0.2rem 0 0; font-size: 0.74rem; font-weight: 500; line-height: 1.45; color: rgba(255,255,255,0.92); word-break: break-word; }
.main--my { flex: 1; justify-content: flex-start; gap: 1rem; padding: 1.05rem 1.15rem 1.15rem; width: 100%; display: flex; flex-direction: column; }
.my-info-card { margin: 0; padding: 0.85rem 0.9rem 0.35rem; background: #fff; border-radius: 1.2rem; border: 1px solid #e0e0e0; box-shadow: 0 1px 0 rgba(255,255,255,0.9) inset, 0 10px 24px rgba(15,23,42,0.08); }
.my-info-card__title { margin: 0 0 0.4rem; padding: 0 0.15rem; font-size: 0.96rem; font-weight: 760; color: #00467f; }
.my-info-row { display: flex; align-items: flex-start; gap: 0.72rem; padding: 0.82rem 0.1rem; text-decoration: none; color: inherit; border-top: 1px solid #e8edf3; width: 100%; appearance: none; background: transparent; border-left: 0; border-right: 0; border-bottom: 0; font: inherit; cursor: pointer; text-align: left; }
.my-info-row:first-of-type { border-top: none; padding-top: 0.46rem; }
.my-info-row__icon { flex-shrink: 0; width: 2.05rem; height: 2.05rem; display: flex; align-items: center; justify-content: center; }
.my-info-row__text { display: flex; flex-direction: column; gap: 0.2rem; min-width: 0; }
.my-info-row__title { font-size: 0.9rem; font-weight: 700; color: #27272a; }
.my-info-row__sub { font-size: 0.73rem; font-weight: 500; color: #64748b; }
.my-logout { display: inline-flex; align-items: center; justify-content: center; gap: 0.45rem; width: 100%; margin-top: 0.12rem; padding: 0.8rem 1.25rem; border-radius: 999px; border: 1px solid #d34d4d; background: #fff; color: #dc2626; font: inherit; font-size: 0.88rem; font-weight: 760; cursor: pointer; min-height: 2.72rem; box-shadow: 0 1px 0 rgba(255,255,255,0.82) inset, 0 8px 16px rgba(220,38,38,0.1); }
.my-logout:active { background: rgba(220,38,38,0.08); }
.my-logout__icon { flex-shrink: 0; display: block; }
.my-dialog { border: none; border-radius: 1.1rem; padding: 1.5rem 1.35rem 1.4rem; max-width: min(92vw,22.5rem); width: 100%; text-align: center; background: #fff; color: #18181b; box-shadow: 0 18px 42px rgba(15,23,42,0.24); position: fixed; top: 50%; left: 50%; transform: translate(-50%,-50%); z-index: 200; }
.my-dialog:not([open]) { display: none; }
.my-dialog__title { margin: 0 0 1rem; font-size: 1.16rem; font-weight: 760; color: #00467f; }
.my-dialog__body { margin: 0 0 1.35rem; font-size: 0.86rem; font-weight: 400; line-height: 1.5; color: #3f3f46; }
.my-dialog__body--muted { color: #71717a; }
.my-dialog__ok { display: block; width: 100%; margin: 0; padding: 0.7rem 1rem; border: none; border-radius: 999px; background: #00467f; color: #fff; font: inherit; font-size: 0.95rem; font-weight: 700; cursor: pointer; }
</style>
