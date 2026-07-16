<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useI18nStore } from '@/stores/i18n'
import { storeToRefs } from 'pinia'
import { loginUser, fetchCaptcha } from '@/api/users'
import LangSwitch from '@/components/common/LangSwitch.vue'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()
const { lang } = storeToRefs(useI18nStore())

const copy = computed(() => {
  if (lang.value === 'en') {
    return {
      title: 'Digital CBM Login',
      subtitle: 'Sign in with your account credentials',
      username: 'Username',
      password: 'Password',
      captcha: 'Verification Code',
      captchaPlaceholder: 'Enter code',
      captchaRefresh: 'Refresh',
      submit: 'Login',
      errFillAll: 'Please fill in all fields',
      errLoginFail: 'Login failed',
      errCaptchaLoad: 'Failed to load captcha, please refresh',
      copyrightTail: 'All rights reserved',
    } as const
  }
  return {
    title: 'Digital CBM 登录',
    subtitle: '请使用账号密码登录系统',
    username: '用户名 / 工号',
    password: '密码',
    captcha: '图形验证码',
    captchaPlaceholder: '请输入验证码',
    captchaRefresh: '刷新',
    submit: '登录',
    errFillAll: '请填写全部字段',
    errLoginFail: '登录失败',
    errCaptchaLoad: '验证码加载失败，请刷新',
    copyrightTail: '版权所有',
  } as const
})

const username = ref('')
const password = ref('')
const captchaInput = ref('')
const captchaKey = ref<number | string>('')
const captchaImg = ref('')
const captchaRequired = ref(true)
const loadingCaptcha = ref(false)
const submitting = ref(false)
const error = ref('')

async function loadCaptcha() {
  if (loadingCaptcha.value) return
  loadingCaptcha.value = true
  error.value = ''
  try {
    const data = await fetchCaptcha()
    if (!data) {
      captchaRequired.value = false
      captchaKey.value = ''
      captchaImg.value = ''
      captchaInput.value = ''
      return
    }
    captchaRequired.value = true
    captchaKey.value = data.key
    captchaImg.value = data.image_base
  } catch {
    error.value = copy.value.errCaptchaLoad
  } finally {
    loadingCaptcha.value = false
  }
}

onMounted(loadCaptcha)

async function submit() {
  error.value = ''
  if (!username.value.trim() || !password.value || (captchaRequired.value && !captchaInput.value.trim())) {
    error.value = copy.value.errFillAll
    return
  }
  submitting.value = true
  try {
    const resp = await loginUser({
      username: username.value.trim(),
      password: password.value,
      captcha: captchaRequired.value ? captchaInput.value.trim() : '',
      captchaKey: captchaRequired.value ? captchaKey.value : undefined,
    })

    auth.login(resp.user, resp.token, resp.refreshToken)
    await auth.refreshProfile(true).catch(() => {})
    const next = typeof route.query.next === 'string' && route.query.next.startsWith('/') ? route.query.next : '/'
    router.replace(next)
  } catch (e: unknown) {
    const msg = String((e as Error)?.message || '').trim()
    error.value = msg && msg !== 'Error' ? `${copy.value.errLoginFail}: ${msg}` : copy.value.errLoginFail
    // 登录失败时刷新验证码
    captchaInput.value = ''
    if (captchaRequired.value) await loadCaptcha()
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="page login-page-wrap">
    <LangSwitch class="login-lang" />
    <main class="login-main">
      <section class="login-card" aria-label="登录">
        <h1 class="login-title">{{ copy.title }}</h1>
        <p class="login-subtitle">{{ copy.subtitle }}</p>
        <form class="login-form" @submit.prevent="submit">
          <div class="login-field">
            <label for="login-username">{{ copy.username }}</label>
            <input
              id="login-username"
              v-model="username"
              class="login-input"
              type="text"
              autocomplete="username"
              :disabled="submitting"
              required
            />
          </div>
          <div class="login-field">
            <label for="login-password">{{ copy.password }}</label>
            <input
              id="login-password"
              v-model="password"
              class="login-input"
              type="password"
              autocomplete="current-password"
              :disabled="submitting"
              required
            />
          </div>
          <div v-if="captchaRequired" class="login-field">
            <label for="login-captcha">{{ copy.captcha }}</label>
            <div class="captcha-row">
              <input
                id="login-captcha"
                v-model="captchaInput"
                class="login-input captcha-input"
                type="text"
                inputmode="text"
                autocomplete="one-time-code"
                :placeholder="copy.captchaPlaceholder"
                :disabled="submitting"
                required
              />
              <button
                type="button"
                class="captcha-img-btn"
                :disabled="loadingCaptcha || submitting"
                :aria-label="copy.captchaRefresh"
                @click="loadCaptcha"
              >
                <img
                  v-if="captchaImg"
                  :src="captchaImg"
                  alt="captcha"
                  class="captcha-img"
                />
                <span v-else class="captcha-placeholder">{{ loadingCaptcha ? '…' : copy.captchaRefresh }}</span>
              </button>
            </div>
          </div>
          <button type="submit" class="login-submit" :disabled="submitting">
            {{ submitting ? '…' : copy.submit }}
          </button>
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
}

.login-main { width: 100%; padding: 1.25rem 1.25rem 1.35rem; }
.login-card { background: #fff; border: 1px solid var(--zinc-200); border-radius: 1.35rem; padding: 1rem; box-shadow: 0 1px 0 rgba(255,255,255,0.9) inset, 0 10px 32px rgba(15,23,42,0.08); border-color: rgba(148,163,184,0.26); }
.login-title { margin: 0; font-size: 1.15rem; font-weight: 900; letter-spacing: -0.02em; color: var(--kb-brand); text-align: center; }
.login-subtitle { margin: 0.3rem 0 1rem; font-size: 0.8rem; color: #64748b; text-align: center; }
.login-form { display: grid; gap: 0.65rem; }
.login-field { display: grid; gap: 0.25rem; }
.login-field label { font-size: 0.74rem; font-weight: 700; color: #334155; }
.login-input { min-height: 2.6rem; padding: 0.5rem 0.7rem; border-radius: 10px; border: 1px solid #cbd5e1; background: #fff; font: inherit; font-size: 0.9rem; color: #111827; }
.login-input--select { appearance: none; background-image: linear-gradient(45deg, transparent 50%, #64748b 50%), linear-gradient(135deg, #64748b 50%, transparent 50%); background-position: calc(100% - 18px) calc(50% - 3px), calc(100% - 12px) calc(50% - 3px); background-size: 6px 6px, 6px 6px; background-repeat: no-repeat; padding-right: 2rem; }
.login-input:focus { outline: 2px solid rgba(0,70,127,0.22); outline-offset: 0; border-color: var(--kb-brand); }
.login-submit { margin-top: 0.2rem; min-height: 2.9rem; border-radius: 9999px; border: 1px solid transparent; background: linear-gradient(180deg, #0066b3 0%, #00467f 100%); color: #fff; font: inherit; font-size: 0.92rem; font-weight: 800; letter-spacing: 0.03em; cursor: pointer; }
.login-submit:active { filter: brightness(0.95); }
.login-submit:disabled { opacity: 0.6; cursor: not-allowed; }
.login-error { margin: 0.2rem 0 0; min-height: 1rem; font-size: 0.74rem; color: #dc2626; text-align: center; }

.captcha-row { display: flex; gap: 0.5rem; align-items: stretch; }
.captcha-input { flex: 1; min-width: 0; }
.captcha-img-btn {
  flex-shrink: 0;
  width: 6.5rem;
  height: 2.6rem;
  border-radius: 10px;
  border: 1px solid #cbd5e1;
  background: #f1f5f9;
  padding: 0;
  overflow: hidden;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}
.captcha-img-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.captcha-img { width: 100%; height: 100%; object-fit: cover; display: block; }
.captcha-placeholder { font-size: 0.72rem; color: #64748b; }
</style>
