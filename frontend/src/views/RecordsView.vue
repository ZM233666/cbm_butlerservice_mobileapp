<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import PageShell from '@/components/layout/PageShell.vue'
import TopBrandBar from '@/components/layout/TopBrandBar.vue'
import { searchRecords, type RecordRow } from '@/api/records'
import { useI18n } from '@/composables/useI18n'

const query = ref('')
const rows = ref<RecordRow[]>([])
const { t } = useI18n()
const placeholderState = ref<'default' | 'loading' | 'empty' | 'fail'>('default')
const placeholder = computed(() => {
  if (placeholderState.value === 'loading') return t.value.recordsPlaceholderLoading
  if (placeholderState.value === 'empty') return t.value.recordsPlaceholderEmpty
  if (placeholderState.value === 'fail') return t.value.recordsPlaceholderFail
  return t.value.recordsPlaceholderDefault
})
const showList = ref(false)
const resultCount = computed(() => rows.value.length)

async function onSearch() {
  const q = query.value.trim().toLowerCase()
  if (!q) { rows.value = []; showList.value = false; placeholderState.value = 'default'; return }
  placeholderState.value = 'loading'
  showList.value = false
  try {
    const data = await searchRecords(q)
    if (data.rows.length) { rows.value = data.rows; showList.value = true }
    else { rows.value = []; placeholderState.value = 'empty' }
  } catch {
    rows.value = []; placeholderState.value = 'fail'
  }
}

// 需求：当用户清空搜索框时，结果立即清空，等待重新搜索（无需再次点击按钮）
watch(
  () => query.value,
  (v) => {
    if (String(v || '').trim()) return
    rows.value = []
    showList.value = false
    placeholderState.value = 'default'
  },
)

watch(() => t.value.recordsPlaceholderDefault, () => {
  if (!showList.value && !query.value.trim()) placeholderState.value = 'default'
})
</script>

<template>
  <div class="records-page">
    <PageShell>
      <TopBrandBar :title="t.recordsTitle" />
      <main class="main main--records">
        <section class="records-card" :aria-label="t.recordsTitle">
          <div class="records-head">
            <div class="records-head__copy">
              <p class="records-head__eyebrow">{{ t.recordsTitle }}</p>
              <h1 class="records-head__title">{{ t.recordsHead }}</h1>
              <p class="records-head__subtitle">{{ t.recordsInputLabel }}</p>
            </div>
          </div>
          <form class="records-search" @submit.prevent="onSearch">
            <label class="sr-only" for="records-query-input">{{ t.recordsInputLabel }}</label>
            <div class="records-search__field">
              <span class="records-search__icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8">
                  <circle cx="11" cy="11" r="6.5" />
                  <path d="m16 16 4.2 4.2" stroke-linecap="round" />
                </svg>
              </span>
              <input id="records-query-input" v-model="query" class="records-search__input" type="text" :placeholder="t.recordsInputPlaceholder" autocomplete="off" />
            </div>
            <button type="submit" class="records-search__btn">{{ t.recordsBtnSearch }}</button>
          </form>
          <section class="records-result" aria-live="polite" :aria-label="t.recordsPlaceholderDefault">
            <h2 class="sr-only">{{ t.recordsPlaceholderDefault }}</h2>
            <div v-if="showList" class="records-result__topbar">
              <p class="records-result__summary">{{ t.recordsResultCount.replace('{n}', String(resultCount)) }}</p>
            </div>
            <p v-if="!showList" class="records-result__placeholder">
              <span class="records-result__placeholder-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.7">
                  <circle cx="11" cy="11" r="6.5" />
                  <path d="m16 16 4.2 4.2" stroke-linecap="round" />
                </svg>
              </span>
              <span>{{ placeholder }}</span>
            </p>
            <ul v-else class="records-result__list">
              <li v-for="r in rows" :key="r.id" class="records-item">
                <div class="records-item__top">
                  <p class="records-item__title">{{ r.code }}</p>
                  <span class="records-item__date">{{ r.date }}</span>
                </div>
                <div class="records-item__meta-grid">
                  <p class="records-item__meta"><span>{{ t.recordsRowId }}</span><strong>{{ r.id }}</strong></p>
                  <p class="records-item__meta"><span>{{ t.recordsRowSeq }}</span><strong>{{ r.taskSeq }}</strong></p>
                  <p class="records-item__meta"><span>{{ t.recordsRowTrain }}</span><strong>{{ r.trainNo }}</strong></p>
                  <p class="records-item__meta"><span>{{ t.recordsRowMaint }}</span><strong>{{ r.maintType }}</strong></p>
                </div>
                <p class="records-item__desc">{{ r.desc }}</p>
              </li>
            </ul>
          </section>
        </section>
      </main>
    </PageShell>
  </div>
</template>

<style scoped>
@import '@/assets/styles/variables.css';
.records-page .page { background: transparent; }
.main.main--records { flex: 1; display: flex; flex-direction: column; justify-content: flex-start; gap: 0.78rem; padding: 1.05rem 1rem 0.8rem; }
.records-card {
  width: 100%;
  background:
    radial-gradient(circle at top right, rgba(0, 102, 179, 0.08), transparent 32%),
    linear-gradient(180deg, #ffffff 0%, #f8fbff 100%);
  border: 1px solid #d9e3ee;
  border-radius: 1.35rem;
  padding: 1rem 0.95rem 0.95rem;
  box-shadow: 0 1px 0 rgba(255,255,255,0.92) inset, 0 12px 28px rgba(15,23,42,0.08);
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}
.records-head { display: flex; align-items: flex-start; justify-content: flex-start; margin-bottom: 0.75rem; }
.records-head__copy { display: grid; gap: 0.18rem; }
.records-head__eyebrow {
  margin: 0;
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  color: #6b86a4;
}
.records-head__title {
  margin: 0;
  font-size: 1.08rem;
  line-height: 1.15;
  font-weight: 820;
  letter-spacing: -0.02em;
  color: #0b4a82;
}
.records-head__subtitle {
  margin: 0;
  font-size: 0.78rem;
  line-height: 1.4;
  color: #62748a;
  max-width: 30rem;
}
.records-search { display: grid; grid-template-columns: minmax(0,1fr) auto; gap: 0.55rem; align-items: stretch; }
.records-search__field {
  display: flex;
  align-items: center;
  gap: 0.58rem;
  min-height: 2.82rem;
  padding: 0 0.85rem;
  border: 1px solid #d6e1ed;
  border-radius: 999px;
  background: rgba(255,255,255,0.92);
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.85);
}
.records-search__icon {
  flex-shrink: 0;
  color: #6f88a6;
  display: flex;
  align-items: center;
  justify-content: center;
}
.records-search__field:focus-within {
  border-color: var(--kb-brand);
  box-shadow: 0 0 0 3px rgba(0,70,127,0.12);
}
.records-search__input {
  width: 100%;
  min-height: 2.65rem;
  border: 0;
  border-radius: 0;
  padding: 0;
  font: inherit;
  font-size: 0.88rem;
  color: #18181b;
  background: transparent;
  appearance: none;
  -webkit-appearance: none;
  box-shadow: none;
  outline: none;
}

.records-search__input:focus,
.records-search__input:focus-visible {
  border: 0;
  background: transparent;
  box-shadow: none;
  outline: none;
}
.records-search__btn {
  min-width: 5.1rem;
  min-height: 2.82rem;
  border-radius: 999px;
  border: 1px solid #00467f;
  background: linear-gradient(180deg, #0a5c9f 0%, #00467f 100%);
  color: #fff;
  font: inherit;
  font-size: 0.84rem;
  font-weight: 780;
  letter-spacing: 0.01em;
  cursor: pointer;
  box-shadow: 0 8px 16px rgba(0,70,127,0.16);
}
.records-search__btn:active { transform: translateY(1px); filter: brightness(0.96); }
.records-result {
  margin-top: 0.72rem;
  flex: 1;
  min-height: clamp(20rem,58vh,30rem);
  border: 1px solid #dce5ef;
  border-radius: 1.02rem;
  background: linear-gradient(180deg,#fcfdff 0%,#f7fbff 100%);
  padding: 0.72rem;
  display: flex;
  flex-direction: column;
}
.records-result__topbar {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  margin-bottom: 0.5rem;
}
.records-result__summary {
  margin: 0;
  padding: 0.22rem 0.55rem;
  border-radius: 999px;
  background: #edf4fb;
  color: #43678f;
  font-size: 0.72rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.records-result__placeholder {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.55rem;
  border: 1px dashed #d5dbe4;
  border-radius: 0.9rem;
  color: #64748b;
  font-size: 0.9rem;
  font-weight: 600;
  margin: 0;
  text-align: center;
}
.records-result__placeholder-icon {
  color: #7c93af;
  opacity: 0.92;
}
.records-result__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.72rem;
}
.records-item {
  border: 1px solid #dbe4ee;
  border-radius: 1rem;
  background: linear-gradient(180deg, #ffffff 0%, #fbfdff 100%);
  padding: 0.78rem 0.8rem;
  box-shadow: 0 8px 18px rgba(15,23,42,0.05);
}
.records-item__top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.8rem;
}
.records-item__title {
  margin: 0;
  color: #0b4a82;
  font-size: 0.95rem;
  line-height: 1.2;
  font-weight: 800;
  letter-spacing: -0.015em;
}
.records-item__date {
  flex-shrink: 0;
  padding: 0.18rem 0.46rem;
  border-radius: 999px;
  background: #eef4fb;
  color: #59738f;
  font-size: 0.68rem;
  font-weight: 750;
}
.records-item__meta-grid {
  margin-top: 0.42rem;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.42rem 0.65rem;
}
.records-item__meta {
  margin: 0;
  display: grid;
  gap: 0.08rem;
}
.records-item__meta > span {
  font-size: 0.68rem;
  color: #708398;
  font-weight: 700;
  letter-spacing: 0.02em;
}
.records-item__meta > strong {
  font-size: 0.78rem;
  color: #1f2f44;
  font-weight: 700;
}
.records-item__desc {
  margin: 0.55rem 0 0;
  font-size: 0.81rem;
  color: #273548;
  line-height: 1.55;
}
@media (max-width: 420px) {
  .records-search { grid-template-columns: 1fr; }
  .records-search__btn { width: 100%; }
  .records-item__top { flex-direction: column; gap: 0.38rem; }
  .records-item__meta-grid { grid-template-columns: 1fr; }
}
</style>
