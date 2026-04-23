<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { computed } from 'vue'
import { useI18nStore } from '@/stores/i18n'
import { storeToRefs } from 'pinia'
import { loginUser } from '@/api/users'
import { fetchCaptcha } from '@/api/captcha'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()
const i18n = useI18nStore()
const { lang } = storeToRefs(i18n)
const toggleLabel = computed(() => (lang.value === 'zh' ? 'CN/EN' : 'EN/CN'))
const copy = computed(() => {
  if (lang.value === 'en') {
    return {
      title: 'Digital CBM Login',
      subtitle: 'Enter your employee ID and password to continue',
      username: 'Employee ID',
      password: 'Password',
      captcha: 'Captcha',
      submit: 'Login',
      errFillAll: 'Please fill in employee ID and password',
      errLoginFail: 'Login failed',
      copyrightTail: 'All rights reserved',
    } as const
  }
  return {
    title: 'Digital CBM 登录',
    subtitle: '请输入工号和密码后登录',
    username: '工号',
    password: '密码',
    captcha: '验证码',
    submit: '登录',
    errFillAll: '请填写工号与密码',
    errLoginFail: '登录失败',
    copyrightTail: '版权所有',
  } as const
})

const username = ref('')
const password = ref('')
const captcha = ref('')
const captchaKey = ref<string | number>('')
const captchaImg = ref('')
const captchaLoading = ref(false)
const error = ref('')

async function loadCaptcha() {
  captchaLoading.value = true
  error.value = ''
  try {
    const data = await fetchCaptcha()
    captchaKey.value = data.key
    captchaImg.value = data.image_base
  } catch {
    error.value = lang.value === 'en' ? 'Failed to load captcha' : '验证码加载失败'
  } finally {
    captchaLoading.value = false
  }
}

onMounted(() => {
  loadCaptcha()
})

async function submit() {
  error.value = ''
  const u = username.value.trim()
  const p = password.value
  if (!u || !p) { error.value = copy.value.errFillAll; return }
  try {
    if (!captchaKey.value) throw new Error('captcha_missing')
    const cap = captcha.value.trim()
    if (!cap) throw new Error('captcha_required')
    const resp = await loginUser({ username: u, password: p, captcha: cap, captchaKey: captchaKey.value })
    auth.login(resp.user, resp.token)
    // 登录后拉取真实用户信息（邮箱/角色/区域等），用于个人信息卡片展示
    await auth.refreshProfile()
    const next = typeof route.query.next === 'string' && route.query.next.startsWith('/') ? route.query.next : '/'
    router.replace(next)
  } catch (e: any) {
    const msg = String(e?.message || '').trim()
    error.value = msg && msg !== 'Error' ? `${copy.value.errLoginFail}: ${msg}` : copy.value.errLoginFail
    // 登录失败时刷新验证码，避免重复命中同一 key
    loadCaptcha()
  }
}
</script>

<template>
  <div class="page login-page-wrap">
    <button type="button" class="login-lang" :aria-label="toggleLabel" @click="i18n.toggleLang">
      {{ toggleLabel }}
    </button>
    <main class="login-main">
      <section class="login-card" aria-label="登录">
        <h1 class="login-title">{{ copy.title }}</h1>
        <p class="login-subtitle">{{ copy.subtitle }}</p>
        <form class="login-form" @submit.prevent="submit">
          <div class="login-field">
            <label for="login-username">{{ copy.username }}</label>
            <input id="login-username" v-model="username" class="login-input" type="text" autocomplete="username" required />
          </div>
          <div class="login-field">
            <label for="login-password">{{ copy.password }}</label>
            <input
              id="login-password"
              v-model="password"
              class="login-input"
              type="password"
              autocomplete="current-password"
              required
            />
          </div>
          <div class="login-field">
            <div class="captcha-row">
              <div class="captcha-input">
                <label for="login-captcha">{{ copy.captcha }}</label>
                <input
                  id="login-captcha"
                  v-model="captcha"
                  class="login-input login-input--captcha"
                  type="text"
                  autocomplete="off"
                />
              </div>
              <button
                type="button"
                class="captcha-box"
                :disabled="captchaLoading"
                @click="loadCaptcha"
                aria-label="Refresh captcha"
              >
                <span v-if="captchaLoading" class="captcha-loading">{{ lang === 'en' ? 'Loading…' : '加载中…' }}</span>
                <img v-else-if="captchaImg" class="captcha-img" :src="captchaImg" alt="captcha" />
                <span v-else class="captcha-loading">{{ lang === 'en' ? 'Retry' : '重试' }}</span>
              </button>
            </div>
          </div>
          <button type="submit" class="login-submit">{{ copy.submit }}</button>
          <p class="login-error" role="status" aria-live="polite">{{ error }}</p>
        </form>
      </section>
    </main>
    <p class="site-copyright">© 2026 Knorr-Bremse. {{ copy.copyrightTail }}</p>
  </div>
</template>

<style scoped>
.login-page-wrap {
  min-height: 100vh;
  min-height: 100svh;
  display: flex;
  flex-direction: column;
  justify-content: center;
  max-width: var(--column-max);
  margin: 0 auto;
  padding-top: max(0.75rem, env(safe-area-inset-top, 0px));
  padding-bottom: max(0.75rem, env(safe-area-inset-bottom, 0px));
  position: relative;
}

.login-lang {
  position: absolute;
  top: max(0.85rem, calc(0.55rem + env(safe-area-inset-top, 0px)));
  right: 0.95rem;
  z-index: 5;
  min-height: 2.05rem;
  padding: 0.25rem 0.6rem;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.55);
  background: linear-gradient(180deg, #fff 0%, #f8fafc 100%);
  color: #0f172a;
  font: inherit;
  font-size: 0.72rem;
  font-weight: 760;
  letter-spacing: 0.02em;
  cursor: pointer;
}

.login-lang:active {
  transform: translateY(1px);
  filter: brightness(0.98);
}

.login-main { width: 100%; padding: 1.25rem 1.25rem 1.35rem; }
.login-card { background: #fff; border: 1px solid var(--zinc-200); border-radius: 1.35rem; padding: 1rem; box-shadow: 0 1px 0 rgba(255,255,255,0.9) inset, 0 10px 32px rgba(15,23,42,0.08); border-color: rgba(148,163,184,0.26); }
.login-title { margin: 0; font-size: 1.15rem; font-weight: 900; letter-spacing: -0.02em; color: var(--kb-brand); text-align: center; }
.login-subtitle { margin: 0.3rem 0 1rem; font-size: 0.8rem; color: #64748b; text-align: center; }
.login-form { display: grid; gap: 0.65rem; }
.login-field { display: grid; gap: 0.25rem; }
.login-field label { font-size: 0.74rem; font-weight: 700; color: #334155; }
.login-input { min-height: 2.6rem; padding: 0.5rem 0.7rem; border-radius: 10px; border: 1px solid #cbd5e1; background: #fff; font: inherit; font-size: 0.9rem; color: #111827; }
.login-input:focus { outline: 2px solid rgba(0,70,127,0.22); outline-offset: 0; border-color: var(--kb-brand); }
.login-submit { margin-top: 0.2rem; min-height: 2.9rem; border-radius: 9999px; border: 1px solid transparent; background: linear-gradient(180deg, #0066b3 0%, #00467f 100%); color: #fff; font: inherit; font-size: 0.92rem; font-weight: 800; letter-spacing: 0.03em; cursor: pointer; }
.login-submit:active { filter: brightness(0.95); }
.login-error { margin: 0.2rem 0 0; min-height: 1rem; font-size: 0.74rem; color: #dc2626; text-align: center; }

.captcha-row {
  display: grid;
  width: 100%;
  grid-template-columns: 1fr 11.2rem;
  gap: 0.7rem;
  align-items: end;
}

.captcha-input {
  display: grid;
  gap: 0.52rem;
  max-width: 10.5rem;
}

.login-input--captcha {
  min-height: 2.2rem;
  padding: 0.4rem 0.6rem;
  font-size: 0.86rem;
  border-radius: 9px;
}

.captcha-box {
  width: 11.2rem;
  height: 3.35rem;
  border-radius: 12px;
  border: 1px solid #cbd5e1;
  background: linear-gradient(180deg, #fff 0%, #f8fafc 100%);
  padding: 0;
  overflow: hidden;
  cursor: pointer;
}

.captcha-box:disabled {
  cursor: default;
  opacity: 0.75;
}

.captcha-img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.captcha-loading {
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
  font-size: 0.74rem;
  color: #475569;
  font-weight: 700;
}
</style>
