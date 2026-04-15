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
            <h1 class="records-head__title">{{ t.recordsHead }}</h1>
          </div>
          <form class="records-search" @submit.prevent="onSearch">
            <label class="sr-only" for="records-query-input">{{ t.recordsInputLabel }}</label>
            <input id="records-query-input" v-model="query" class="records-search__input" type="text" :placeholder="t.recordsInputPlaceholder" autocomplete="off" />
            <button type="submit" class="records-search__btn">{{ t.recordsBtnSearch }}</button>
          </form>
          <section class="records-result" aria-live="polite" :aria-label="t.recordsPlaceholderDefault">
            <h2 class="sr-only">{{ t.recordsPlaceholderDefault }}</h2>
            <p v-if="!showList" class="records-result__placeholder">{{ placeholder }}</p>
            <ul v-else class="records-result__list">
              <li v-for="r in rows" :key="r.id" class="records-item">
                <p class="records-item__title">{{ r.code }}</p>
                <p class="records-item__meta">{{ t.recordsRowId }}：{{ r.id }} · {{ t.recordsRowSeq }}：{{ r.taskSeq }}</p>
                <p class="records-item__meta">{{ t.recordsRowTrain }}：{{ r.trainNo }} · {{ t.recordsRowMaint }}：{{ r.maintType }} · {{ t.recordsRowTime }}：{{ r.date }}</p>
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
.records-card { width: 100%; background: #fff; border: 1px solid #e0e0e0; border-radius: 1.35rem; padding: 0.95rem 0.9rem 0.9rem; box-shadow: 0 1px 0 rgba(255,255,255,0.9) inset, 0 10px 26px rgba(15,23,42,0.08); display: flex; flex-direction: column; flex: 1; min-height: 0; }
.records-head { display: flex; align-items: center; justify-content: flex-start; margin-bottom: 0.65rem; }
.records-head__title { margin: 0; font-size: 1rem; font-weight: 760; color: #00467f; letter-spacing: 0.01em; }
.records-search { display: grid; grid-template-columns: minmax(0,1fr) auto; gap: 0.5rem; align-items: stretch; }
.records-search__input { width: 100%; min-height: 2.65rem; border: 1px solid #e0e0e0; border-radius: 999px; padding: 0.5rem 0.85rem; font: inherit; font-size: 0.86rem; color: #18181b; background: linear-gradient(180deg,#fff 0%,#f8fafd 100%); outline: none; }
.records-search__input:focus { border-color: var(--kb-brand); box-shadow: 0 0 0 2px rgba(0,70,127,0.14); }
.records-search__btn { min-width: 4.8rem; min-height: 2.65rem; border-radius: 999px; border: 1px solid #00467f; background: #00467f; color: #fff; font: inherit; font-size: 0.84rem; font-weight: 760; cursor: pointer; }
.records-search__btn:active { transform: translateY(1px); filter: brightness(0.96); }
.records-result { margin-top: 0.65rem; flex: 1; min-height: clamp(20rem,58vh,30rem); border: 1px solid #e0e0e0; border-radius: 1rem; background: linear-gradient(180deg,#fcfdff 0%,#f8fbff 100%); padding: 0.7rem; display: flex; flex-direction: column; }
.records-result__placeholder { flex: 1; min-height: 0; display: flex; align-items: center; justify-content: center; border: 1px dashed #d5dbe4; border-radius: 0.9rem; color: #64748b; font-size: 0.9rem; font-weight: 600; margin: 0; }
.records-result__list { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.65rem; }
.records-item { border: 1px solid #e0e0e0; border-radius: 0.95rem; background: #fff; padding: 0.72rem 0.76rem; box-shadow: 0 6px 16px rgba(15,23,42,0.05); }
.records-item__title { margin: 0; color: #00467f; font-size: 0.92rem; font-weight: 760; }
.records-item__meta { margin: 0.25rem 0 0; font-size: 0.74rem; color: #475569; }
.records-item__desc { margin: 0.38rem 0 0; font-size: 0.8rem; color: #1f2937; line-height: 1.45; }
</style>
