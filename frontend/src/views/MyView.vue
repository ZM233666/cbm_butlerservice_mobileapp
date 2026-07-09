<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import TopBrandBar from '@/components/layout/TopBrandBar.vue'
import { useI18n } from '@/composables/useI18n'
import { updateMyCertificates, uploadMyCertificatePhoto } from '@/api/users'
import type { UserCertificate } from '@/types/user'

const auth = useAuthStore()
const router = useRouter()
const user = computed(() => auth.user!)
const { t, lang } = useI18n()

const aboutOpen = ref(false)
const contactOpen = ref(false)
const isFseProfile = computed(() => auth.isFse)
const certificates = computed(() => user.value?.specialWorkCertificates || [])
const qualifications = computed(() => user.value?.qualifications || [])
const skillTypes = computed(() => user.value?.skillTypes || [])
const skillLevel = computed(() => user.value?.skillLevel || '-')
const hasCertificates = computed(() => certificates.value.length > 0)
const hasQualifications = computed(() => qualifications.value.length > 0)
const hasSkillTypes = computed(() => skillTypes.value.length > 0)
const hasProfileData = computed(() => hasCertificates.value || hasQualifications.value || hasSkillTypes.value || skillLevel.value !== '-')
const profileMetrics = computed(() => [
  { label: t.value.myCertCount, value: certificates.value.length },
  { label: t.value.myQualificationCount, value: qualifications.value.length },
  { label: t.value.mySkillTypeCount, value: skillTypes.value.length },
])
const certificatesDialogOpen = ref(false)
type CertificateDraft = {
  name: string
  photoUrl: string
  uploading: boolean
}
const certificateDrafts = ref<CertificateDraft[]>([])
const certificateSaving = ref(false)
const certificateFeedback = ref('')

const PROFILE_TERM_LABELS = {
  qualification: {
    zh: {
      engineer: '工程师',
    },
    en: {
      engineer: 'Engineer',
    },
  },
  certificate: {
    zh: {
      working_at_height: '登高证',
    },
    en: {
      working_at_height: 'Working at Height',
    },
  },
  skillType: {
    zh: {
      emu: 'EMU',
      loco: 'LOCO',
    },
    en: {
      emu: 'EMU',
      loco: 'LOCO',
    },
  },
} as const

function normalizeProfileTerm(value: string): string {
  const raw = String(value || '').trim()
  if (!raw) return ''
  const compact = raw.replace(/\s+/g, '').toLowerCase()
  if (compact === '工程师' || compact === 'engineer') return 'engineer'
  if (compact === '登高证' || compact === 'workingatheight' || compact === 'workingatheightcertificate') return 'working_at_height'
  if (compact === 'emu') return 'emu'
  if (compact === 'loco') return 'loco'
  return ''
}

function translateProfileTerm(category: keyof typeof PROFILE_TERM_LABELS, value: string): string {
  const normalized = normalizeProfileTerm(value)
  if (!normalized) return value
  return PROFILE_TERM_LABELS[category][lang.value][normalized as keyof typeof PROFILE_TERM_LABELS[typeof category]['zh']] || value
}

const translatedQualifications = computed(() => qualifications.value.map(item => translateProfileTerm('qualification', item)))
const translatedSkillTypes = computed(() => skillTypes.value.map(item => translateProfileTerm('skillType', item)))
const translatedCertificates = computed(() => certificates.value.map(cert => ({
  ...cert,
  translatedName: translateProfileTerm('certificate', String(cert.name || '')),
})))

function certificateStatusLabel(status?: string) {
  if (status === 'expiring') return t.value.myStatusExpiring
  if (status === 'expired') return t.value.myStatusExpired
  return t.value.myStatusValid
}

function certificateStatusClass(status?: string) {
  if (status === 'expiring') return 'is-expiring'
  if (status === 'expired') return 'is-expired'
  return 'is-valid'
}

function createEmptyDraft(): CertificateDraft {
  return { name: '', photoUrl: '', uploading: false }
}

function syncCertificateDrafts() {
  certificateDrafts.value = certificates.value.map((item) => ({
    name: String(item.name || '').trim(),
    photoUrl: String(item.photoUrl || '').trim(),
    uploading: false,
  }))
}

function openCertificateEditor() {
  syncCertificateDrafts()
  if (!certificateDrafts.value.length) certificateDrafts.value = [createEmptyDraft()]
  certificateFeedback.value = ''
  certificatesDialogOpen.value = true
}

function closeCertificateEditor() {
  certificatesDialogOpen.value = false
  certificateFeedback.value = ''
}

function addCertificateDraft() {
  certificateDrafts.value.push(createEmptyDraft())
  certificateFeedback.value = ''
}

function removeCertificateDraft(index: number) {
  certificateDrafts.value.splice(index, 1)
  if (!certificateDrafts.value.length) certificateDrafts.value.push(createEmptyDraft())
}

async function onCertificatePhotoChange(index: number, event: Event) {
  const input = event.target as HTMLInputElement | null
  const file = input?.files?.[0]
  if (!file) return
  certificateFeedback.value = ''
  certificateDrafts.value[index].uploading = true
  try {
    const resp = await uploadMyCertificatePhoto(file)
    certificateDrafts.value[index].photoUrl = resp.photoUrl
  } catch {
    certificateFeedback.value = t.value.myCertificateUploadFail
  } finally {
    certificateDrafts.value[index].uploading = false
    if (input) input.value = ''
  }
}

async function saveCertificates() {
  if (certificateSaving.value) return
  const normalized = certificateDrafts.value
    .map((item) => ({
      name: String(item.name || '').trim(),
      photoUrl: String(item.photoUrl || '').trim(),
    }))
    .filter((item) => item.name || item.photoUrl)
  if (normalized.some((item) => !item.name)) {
    certificateFeedback.value = t.value.myCertificateRequired
    return
  }
  if (normalized.some((item) => !item.photoUrl)) {
    certificateFeedback.value = t.value.myCertificatePhotoRequired
    return
  }
  certificateSaving.value = true
  certificateFeedback.value = ''
  try {
    const payload: UserCertificate[] = normalized.map((item) => ({
      name: item.name,
      photoUrl: item.photoUrl,
      status: 'valid',
    }))
    const resp = await updateMyCertificates(payload)
    auth.login(resp.user, auth.token)
    certificateFeedback.value = t.value.myCertificateSaveSuccess
    setTimeout(() => {
      certificatesDialogOpen.value = false
      certificateFeedback.value = ''
    }, 500)
  } catch {
    certificateFeedback.value = t.value.myCertificateSaveFail
  } finally {
    certificateSaving.value = false
  }
}

function logout() {
  auth.logout()
  router.replace('/login')
}

onMounted(() => {
  auth.refreshProfile()
  syncCertificateDrafts()
})
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
        <p class="my-header__line">{{ t.myHeaderEmail }}: {{ user.email || '-' }}</p>
        <p class="my-header__line">{{ t.myHeaderEmployeeId }}: {{ user.employeeId }}</p>
        <p class="my-header__line">{{ t.myHeaderRegion }}: {{ user.region || '-' }}</p>
        <p class="my-header__line">{{ t.myHeaderRole }}: {{ auth.roleLabel }}</p>
      </div>
    </header>

    <main class="main main--my">
      <section v-if="isFseProfile" class="my-profile-card" aria-labelledby="my-profile-heading">
        <div class="my-profile-card__head">
          <div class="my-profile-card__intro">
            <p class="my-profile-card__eyebrow">{{ t.myCapabilitySummary }}</p>
            <h2 id="my-profile-heading" class="my-profile-card__title">{{ t.myProfessionalProfile }}</h2>
            <p class="my-profile-card__sub">{{ t.myProfessionalProfileSub }}</p>
          </div>
          <div v-if="hasProfileData" class="my-skill-level">
            <span class="my-skill-level__label">{{ t.mySkillLevel }}</span>
            <strong class="my-skill-level__value">{{ skillLevel }}</strong>
          </div>
        </div>

        <p v-if="!hasProfileData" class="my-profile-empty">{{ t.myProfileEmpty }}</p>

        <div v-if="hasProfileData" class="my-metrics">
          <article v-for="item in profileMetrics" :key="item.label" class="my-metric">
            <span class="my-metric__label">{{ item.label }}</span>
            <strong class="my-metric__value">{{ item.value }}</strong>
          </article>
        </div>

        <div class="my-profile-grid">
          <article v-if="hasQualifications" class="my-panel">
            <div class="my-panel__head">
              <p class="my-panel__title">{{ t.myQualifications }}</p>
            </div>
            <div class="my-chip-group">
              <span v-for="item in translatedQualifications" :key="item" class="my-chip my-chip--qualification">{{ item }}</span>
            </div>
          </article>

          <article v-if="hasSkillTypes" class="my-panel">
            <div class="my-panel__head">
              <p class="my-panel__title">{{ t.mySkillTypes }}</p>
            </div>
            <div class="my-chip-group">
              <span v-for="item in translatedSkillTypes" :key="item" class="my-chip my-chip--skill">{{ item }}</span>
            </div>
          </article>

          <article class="my-panel my-panel--wide">
            <div class="my-panel__head my-panel__head--action">
              <p class="my-panel__title">{{ t.mySpecialCertificates }}</p>
              <button type="button" class="my-panel__action" @click="openCertificateEditor">{{ t.myEditCertificates }}</button>
            </div>
            <div v-if="hasCertificates" class="my-certificate-list">
              <article
                v-for="cert in translatedCertificates"
                :key="cert.id || cert.name"
                class="my-certificate-card"
                :class="certificateStatusClass(cert.status)"
              >
                <div v-if="cert.photoUrl" class="my-certificate-card__photo-wrap">
                  <img :src="cert.photoUrl" :alt="cert.translatedName" class="my-certificate-card__photo" />
                </div>
                <div class="my-certificate-card__top">
                  <strong class="my-certificate-card__name">{{ cert.translatedName }}</strong>
                  <span class="my-certificate-card__badge">{{ certificateStatusLabel(cert.status) }}</span>
                </div>
                <div v-if="cert.id" class="my-certificate-card__meta">
                  <span>{{ t.myCredentialNo }}</span>
                  <strong>{{ cert.id }}</strong>
                </div>
                <div v-if="cert.issuer" class="my-certificate-card__meta">
                  <span>{{ t.myIssuer }}</span>
                  <strong>{{ cert.issuer }}</strong>
                </div>
                <div v-if="cert.validUntil" class="my-certificate-card__meta">
                  <span>{{ t.myValidUntil }}</span>
                  <strong>{{ cert.validUntil }}</strong>
                </div>
              </article>
            </div>
            <div v-else class="my-certificate-empty">
              <p class="my-certificate-empty__text">{{ t.myCertificateEmpty }}</p>
              <button type="button" class="my-certificate-empty__btn" @click="openCertificateEditor">{{ t.myCertificateAdd }}</button>
            </div>
          </article>
        </div>
      </section>

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
    <dialog class="my-dialog my-dialog--editor" :open="certificatesDialogOpen" @click.self="closeCertificateEditor">
      <h3 class="my-dialog__title my-dialog__title--left">{{ t.myManageCertificates }}</h3>
      <p class="my-dialog__body my-dialog__body--left my-dialog__body--muted">{{ t.myManageCertificatesSub }}</p>

      <div class="my-cert-editor">
        <div class="my-cert-editor__toolbar">
          <button type="button" class="my-cert-editor__add-row" @click="addCertificateDraft">{{ t.myCertificateAddRow }}</button>
        </div>

        <div v-if="certificateDrafts.length" class="my-cert-editor__list">
          <div v-for="(item, idx) in certificateDrafts" :key="`${idx}-${item.photoUrl}`" class="my-cert-editor__card">
            <div class="my-cert-editor__card-head">
              <span class="my-cert-editor__index">#{{ idx + 1 }}</span>
              <button type="button" class="my-cert-editor__remove" :aria-label="t.myCertificateDelete" @click="removeCertificateDraft(idx)">×</button>
            </div>
            <input
              v-model="item.name"
              class="my-cert-editor__input"
              :placeholder="t.myCertificateInputPlaceholder"
            />
            <div class="my-cert-editor__upload-row">
              <div v-if="item.photoUrl" class="my-cert-editor__preview">
                <img :src="item.photoUrl" :alt="item.name || t.myCertificatePhoto" class="my-cert-editor__preview-img" />
              </div>
              <label class="my-cert-editor__upload-btn" :class="{ 'is-uploading': item.uploading }">
                {{ item.uploading ? `${t.myCertificateUploadPhoto}...` : (item.photoUrl ? t.myCertificateReplacePhoto : t.myCertificateUploadPhoto) }}
                <input
                  class="my-cert-editor__file"
                  type="file"
                  accept="image/*"
                  :disabled="item.uploading"
                  @change="onCertificatePhotoChange(idx, $event)"
                />
              </label>
            </div>
          </div>
        </div>
        <p v-else class="my-cert-editor__empty">{{ t.myCertificateEmpty }}</p>
      </div>

      <p class="my-cert-editor__feedback" role="status">{{ certificateFeedback }}</p>

      <div class="my-dialog__actions">
        <button type="button" class="my-dialog__ghost" @click="closeCertificateEditor">{{ t.myCertificateCancel }}</button>
        <button type="button" class="my-dialog__ok" :disabled="certificateSaving" @click="saveCertificates">
          {{ certificateSaving ? `${t.myCertificateSave}...` : t.myCertificateSave }}
        </button>
      </div>
    </dialog>

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
.page--my {
  padding-top: 0;
  background:
    radial-gradient(circle at top right, rgba(123, 176, 255, 0.14), transparent 34%),
    linear-gradient(180deg, #eef5ff 0%, #f7faff 34%, #f3f6fb 100%);
  max-width: var(--column-max, 28rem);
  margin: 0 auto;
  min-height: 100vh;
  min-height: 100svh;
  display: flex;
  flex-direction: column;
  padding-bottom: calc(var(--bottom-nav-h, 3.5rem) + 0.5rem + env(safe-area-inset-bottom, 0px));
}
.my-header {
  position: relative;
  isolation: isolate;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 0.9rem;
  padding: 1rem 1.15rem 1.2rem;
  padding-top: max(1rem, calc(0.65rem + env(safe-area-inset-top, 0px)));
  background:
    radial-gradient(circle at 100% 0%, rgba(255,255,255,0.22), transparent 28%),
    linear-gradient(180deg, #0a5a9e 0%, #00467f 100%);
  color: #fff;
  overflow: hidden;
}
.my-header::after {
  content: '';
  position: absolute;
  inset: auto -10% -48% 35%;
  height: 9rem;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(255,255,255,0.14), transparent 65%);
  z-index: -1;
}
.my-header__avatar {
  width: 4.35rem;
  height: 4.35rem;
  border-radius: 50%;
  border: 1.5px solid rgba(255,255,255,0.62);
  background: linear-gradient(180deg, rgba(255,255,255,0.2), rgba(255,255,255,0.08));
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: #fff;
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.18);
}
.my-header__meta { min-width: 0; align-self: center; }
.my-header__name {
  margin: 0 0 0.35rem;
  font-size: 1.52rem;
  font-weight: 780;
  letter-spacing: -0.03em;
  line-height: 1.02;
  color: #fff;
}
.my-header__line {
  margin: 0.22rem 0 0;
  font-size: 0.76rem;
  font-weight: 560;
  line-height: 1.45;
  color: rgba(255,255,255,0.92);
  word-break: break-word;
}
.main--my {
  flex: 1;
  justify-content: flex-start;
  gap: 1rem;
  padding: 1rem 1.05rem 1.15rem;
  width: 100%;
  display: flex;
  flex-direction: column;
}
.my-profile-card,
.my-info-card {
  margin: 0;
  border-radius: 1.3rem;
  border: 1px solid rgba(199, 214, 230, 0.88);
  box-shadow:
    0 1px 0 rgba(255,255,255,0.92) inset,
    0 16px 34px rgba(15,23,42,0.08);
}
.my-profile-card {
  padding: 0.95rem;
  background:
    linear-gradient(180deg, rgba(11,74,130,0.04), rgba(11,74,130,0.01)),
    rgba(255,255,255,0.96);
}
.my-profile-card__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.8rem;
}
.my-profile-card__eyebrow {
  margin: 0 0 0.18rem;
  font-size: 0.66rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #5c7ca3;
}
.my-profile-card__title {
  margin: 0;
  font-size: 1.08rem;
  line-height: 1.15;
  font-weight: 800;
  letter-spacing: -0.03em;
  color: #0b4a82;
}
.my-profile-empty {
  margin: 0.6rem 0 0.4rem;
  padding: 0.7rem 0.9rem;
  border-radius: 10px;
  background: #f1f5f9;
  font-size: 0.78rem;
  color: #64748b;
  text-align: center;
  line-height: 1.5;
}
.my-profile-card__sub {
  margin: 0.26rem 0 0;
  font-size: 0.74rem;
  line-height: 1.45;
  color: #61758f;
}
.my-skill-level {
  flex-shrink: 0;
  min-width: 6.2rem;
  padding: 0.52rem 0.7rem;
  border-radius: 1rem;
  background: linear-gradient(180deg, #edf5ff 0%, #e4eefc 100%);
  border: 1px solid #d1def0;
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.8);
}
.my-skill-level__label {
  display: block;
  font-size: 0.64rem;
  font-weight: 700;
  color: #6780a1;
}
.my-skill-level__value {
  display: block;
  margin-top: 0.16rem;
  font-size: 1rem;
  font-weight: 800;
  color: #0b4a82;
  letter-spacing: -0.02em;
}
.my-metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.55rem;
  margin-top: 0.82rem;
}
.my-metric {
  padding: 0.58rem 0.65rem;
  border-radius: 0.95rem;
  background: #f7faff;
  border: 1px solid #dbe7f5;
}
.my-metric__label {
  display: block;
  font-size: 0.66rem;
  line-height: 1.25;
  font-weight: 700;
  color: #657b96;
}
.my-metric__value {
  display: block;
  margin-top: 0.28rem;
  font-size: 1.15rem;
  line-height: 1;
  font-weight: 820;
  color: #0b4a82;
}
.my-profile-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.72rem;
  margin-top: 0.82rem;
}
.my-panel {
  padding: 0.82rem;
  border-radius: 1.05rem;
  background: #fff;
  border: 1px solid #e0e8f2;
}
.my-panel--wide { grid-column: 1 / -1; }
.my-panel__head { margin-bottom: 0.6rem; }
.my-panel__head--action {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.6rem;
}
.my-panel__title {
  margin: 0;
  font-size: 0.82rem;
  font-weight: 780;
  color: #123f68;
}
.my-panel__action {
  min-height: 2rem;
  padding: 0.34rem 0.75rem;
  border-radius: 999px;
  border: 1px solid #cfe0f2;
  background: #f7fbff;
  color: #0b4a82;
  font: inherit;
  font-size: 0.7rem;
  font-weight: 760;
}
.my-certificate-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.58rem;
}
.my-certificate-empty {
  display: grid;
  gap: 0.8rem;
  padding: 1rem;
  border-radius: 0.95rem;
  background: linear-gradient(180deg, #f8fbff 0%, #f3f7fc 100%);
  border: 1px dashed #c8d7e8;
}
.my-certificate-empty__text {
  margin: 0;
  font-size: 0.76rem;
  line-height: 1.5;
  color: #5d728b;
}
.my-certificate-empty__btn {
  width: fit-content;
  min-height: 2rem;
  padding: 0.38rem 0.85rem;
  border-radius: 999px;
  border: 1px solid #cfe0f2;
  background: #fff;
  color: #0b4a82;
  font: inherit;
  font-size: 0.72rem;
  font-weight: 760;
}
.my-certificate-card {
  padding: 0.72rem;
  border-radius: 0.95rem;
  border: 1px solid #dce7f2;
  background:
    linear-gradient(180deg, rgba(248,250,252,0.96), rgba(244,247,251,0.92));
}
.my-certificate-card__photo-wrap {
  margin-bottom: 0.62rem;
  aspect-ratio: 16 / 10;
  border-radius: 0.82rem;
  overflow: hidden;
  background: #e8eef6;
  border: 1px solid #dae5f0;
}
.my-certificate-card__photo {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.my-certificate-card__top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.55rem;
  margin-bottom: 0.55rem;
}
.my-certificate-card__name {
  font-size: 0.8rem;
  line-height: 1.35;
  font-weight: 780;
  color: #16324f;
}
.my-certificate-card__badge {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  padding: 0.14rem 0.44rem;
  border-radius: 999px;
  font-size: 0.62rem;
  font-weight: 760;
}
.my-certificate-card__meta {
  display: flex;
  flex-direction: column;
  gap: 0.12rem;
  margin-top: 0.42rem;
}
.my-certificate-card__meta span {
  font-size: 0.62rem;
  line-height: 1.2;
  font-weight: 700;
  color: #74869c;
}
.my-certificate-card__meta strong {
  font-size: 0.72rem;
  line-height: 1.35;
  color: #24364b;
  font-weight: 700;
  word-break: break-word;
}
.my-certificate-card.is-valid { box-shadow: inset 3px 0 0 #16a34a; }
.my-certificate-card.is-valid .my-certificate-card__badge { background: rgba(34,197,94,0.14); color: #15803d; }
.my-certificate-card.is-expiring { box-shadow: inset 3px 0 0 #eab308; }
.my-certificate-card.is-expiring .my-certificate-card__badge { background: rgba(250,204,21,0.16); color: #a16207; }
.my-certificate-card.is-expired { box-shadow: inset 3px 0 0 #ef4444; }
.my-certificate-card.is-expired .my-certificate-card__badge { background: rgba(248,113,113,0.16); color: #b91c1c; }
.my-chip-group { display: flex; flex-wrap: wrap; gap: 0.5rem; }
.my-chip {
  display: inline-flex;
  align-items: center;
  min-height: 2rem;
  padding: 0.32rem 0.7rem;
  border-radius: 999px;
  font-size: 0.72rem;
  line-height: 1.25;
  font-weight: 700;
}
.my-chip--qualification {
  background: #eef5ff;
  color: #124c86;
  border: 1px solid #d2e2f5;
}
.my-chip--skill {
  background: #f2f7f2;
  color: #1f6a4c;
  border: 1px solid #d5e7dc;
}
.my-info-card {
  padding: 0.85rem 0.9rem 0.35rem;
  background: rgba(255,255,255,0.96);
}
.my-info-card__title { margin: 0 0 0.4rem; padding: 0 0.15rem; font-size: 0.96rem; font-weight: 760; color: #00467f; }
.my-info-row { display: flex; align-items: flex-start; gap: 0.72rem; padding: 0.82rem 0.1rem; text-decoration: none; color: inherit; border-top: 1px solid #e8edf3; width: 100%; appearance: none; background: transparent; border-left: 0; border-right: 0; border-bottom: 0; font: inherit; cursor: pointer; text-align: left; }
.my-info-row:first-of-type { border-top: none; padding-top: 0.46rem; }
.my-info-row__icon { flex-shrink: 0; width: 2.05rem; height: 2.05rem; display: flex; align-items: center; justify-content: center; }
.my-info-row__text { display: flex; flex-direction: column; gap: 0.2rem; min-width: 0; }
.my-info-row__title { font-size: 0.9rem; font-weight: 700; color: #27272a; }
.my-info-row__sub { font-size: 0.73rem; font-weight: 500; color: #64748b; }
.my-logout { display: inline-flex; align-items: center; justify-content: center; gap: 0.45rem; width: 100%; margin-top: 0.12rem; padding: 0.8rem 1.25rem; border-radius: 999px; border: 1px solid #d34d4d; background: rgba(255,255,255,0.94); color: #dc2626; font: inherit; font-size: 0.88rem; font-weight: 760; cursor: pointer; min-height: 2.72rem; box-shadow: 0 1px 0 rgba(255,255,255,0.82) inset, 0 8px 16px rgba(220,38,38,0.1); }
.my-logout:active { background: rgba(220,38,38,0.08); }
.my-logout__icon { flex-shrink: 0; display: block; }
.my-dialog {
  border: none;
  border-radius: 1.1rem;
  padding: 1.5rem 1.35rem 1.4rem;
  width: min(calc(var(--column-max, 28rem) - 1rem), 92vw);
  max-width: none;
  margin: 0;
  box-sizing: border-box;
  text-align: center;
  background: #fff;
  color: #18181b;
  box-shadow: 0 18px 42px rgba(15,23,42,0.24);
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%,-50%);
  z-index: 200;
}
.my-dialog:not([open]) { display: none; }
.my-dialog__title { margin: 0 0 1rem; font-size: 1.16rem; font-weight: 760; color: #00467f; }
.my-dialog__title--left { text-align: left; }
.my-dialog__body { margin: 0 0 1.35rem; font-size: 0.86rem; font-weight: 400; line-height: 1.5; color: #3f3f46; }
.my-dialog__body--left { text-align: left; }
.my-dialog__body--muted { color: #71717a; }
.my-dialog__ok { display: block; width: 100%; margin: 0; padding: 0.7rem 1rem; border: none; border-radius: 999px; background: #00467f; color: #fff; font: inherit; font-size: 0.95rem; font-weight: 700; cursor: pointer; }
.my-dialog--editor {
  width: min(calc(var(--column-max, 28rem) - 2.1rem), calc(100vw - 2.1rem));
}
.my-dialog__actions {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 0.6rem;
  margin-top: 1rem;
}
.my-dialog__ghost {
  display: block;
  width: 100%;
  margin: 0;
  padding: 0.7rem 1rem;
  border: 1px solid #d7e2ef;
  border-radius: 999px;
  background: #fff;
  color: #3e5875;
  font: inherit;
  font-size: 0.92rem;
  font-weight: 700;
}
.my-cert-editor { display: grid; gap: 0.8rem; }
.my-cert-editor__toolbar {
  display: flex;
  justify-content: flex-end;
}
.my-cert-editor__add-row {
  min-height: 2.2rem;
  padding: 0.45rem 0.85rem;
  border-radius: 999px;
  border: 1px solid #d7e4f2;
  background: #f6faff;
  color: #0b4a82;
  font: inherit;
  font-size: 0.78rem;
  font-weight: 760;
}
.my-cert-editor__input {
  min-height: 2.5rem;
  border-radius: 0.9rem;
  border: 1px solid #cbd5e1;
  padding: 0.55rem 0.75rem;
  font: inherit;
  font-size: 0.86rem;
  color: #0f172a;
}
.my-cert-editor__list {
  display: grid;
  gap: 0.55rem;
}
.my-cert-editor__card {
  display: grid;
  gap: 0.62rem;
  padding: 0.75rem;
  border-radius: 1rem;
  background: #f9fbfe;
  border: 1px solid #d8e3ef;
}
.my-cert-editor__card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}
.my-cert-editor__index {
  font-size: 0.7rem;
  font-weight: 760;
  color: #5f7895;
}
.my-cert-editor__upload-row {
  display: grid;
  gap: 0.55rem;
}
.my-cert-editor__preview {
  width: 100%;
  aspect-ratio: 16 / 10;
  overflow: hidden;
  border-radius: 0.9rem;
  border: 1px solid #d6e2ee;
  background: #eaf0f7;
}
.my-cert-editor__preview-img {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
}
.my-cert-editor__upload-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 2.4rem;
  width: fit-content;
  padding: 0.45rem 0.9rem;
  border-radius: 0.9rem;
  border: 1px solid #d7e4f2;
  background: #fff;
  color: #0b4a82;
  font-size: 0.78rem;
  font-weight: 760;
  position: relative;
  overflow: hidden;
}
.my-cert-editor__upload-btn.is-uploading {
  opacity: 0.72;
  pointer-events: none;
}
.my-cert-editor__file {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}
.my-cert-editor__remove {
  width: 1.5rem;
  height: 1.5rem;
  border-radius: 999px;
  border: none;
  background: rgba(18,76,134,0.14);
  color: #124c86;
  font: inherit;
  font-size: 0.95rem;
  line-height: 1;
}
.my-cert-editor__empty {
  margin: 0;
  padding: 0.9rem 0.95rem;
  border-radius: 0.95rem;
  border: 1px dashed #ccdae9;
  background: #f9fbfe;
  text-align: left;
  color: #667a92;
  font-size: 0.78rem;
  line-height: 1.45;
}
.my-cert-editor__feedback {
  min-height: 1rem;
  margin: 0.85rem 0 0;
  text-align: left;
  color: #315b86;
  font-size: 0.74rem;
  line-height: 1.35;
}
@media (max-width: 420px) {
  .my-profile-card__head {
    flex-direction: column;
  }
  .my-skill-level {
    width: 100%;
  }
  .my-metrics,
  .my-profile-grid,
  .my-certificate-list {
    grid-template-columns: 1fr;
  }
  .my-dialog__actions {
    grid-template-columns: 1fr;
  }
}
</style>
