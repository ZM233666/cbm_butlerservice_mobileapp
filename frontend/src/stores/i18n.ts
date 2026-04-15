import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

export type Lang = 'zh' | 'en'

const LANG_KEY = 'butler.i18n.lang'

function readLang(): Lang {
  try {
    const raw = localStorage.getItem(LANG_KEY)
    return raw === 'en' ? 'en' : 'zh'
  } catch {
    return 'zh'
  }
}

export const useI18nStore = defineStore('i18n', () => {
  const lang = ref<Lang>(readLang())
  const isZh = computed(() => lang.value === 'zh')

  function setLang(next: Lang) {
    lang.value = next
    try { localStorage.setItem(LANG_KEY, next) } catch { /* ignore */ }
  }

  function toggleLang() {
    setLang(lang.value === 'zh' ? 'en' : 'zh')
  }

  return { lang, isZh, setLang, toggleLang }
})

