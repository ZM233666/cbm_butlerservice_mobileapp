<script setup lang="ts">
import { ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import type { UserRole } from '@/types/user'
import { isValidRole } from '@/types/user'
import { computed } from 'vue'
import { useI18nStore } from '@/stores/i18n'
import { storeToRefs } from 'pinia'

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
      subtitle: 'Enter user info and select role to continue',
      username: 'Username',
      employeeId: 'Employee ID',
      email: 'Email',
      role: 'Role',
      rolePlaceholder: 'Select a role',
      roleFse: 'FSE',
      roleManager: 'Regional Manager',
      // NOTE(2026-04): 角色调整，暂时隐藏/禁用 Third-Party 角色入口（保留文案以便后续恢复）
      roleThird: 'Third-Party',
      submit: 'Login',
      errFillAll: 'Please fill in all fields',
      errRoleInvalid: 'Please select a valid role',
      errLoginFail: 'Login failed',
      copyrightTail: 'All rights reserved',
    } as const
  }
  return {
    title: 'Digital CBM 登录',
    subtitle: '请输入用户信息并选择角色后进入系统',
    username: '用户名',
    employeeId: '工号',
    email: '邮箱',
    role: '角色',
    rolePlaceholder: '请选择角色',
    roleFse: 'FSE',
    roleManager: '大区经理',
    // NOTE(2026-04): 角色调整，暂时隐藏/禁用第三方角色入口（保留文案以便后续恢复）
    roleThird: '第三方',
    submit: '登录',
    errFillAll: '请完整填写全部字段',
    errRoleInvalid: '请选择有效角色',
    errLoginFail: '登录失败',
    copyrightTail: '版权所有',
  } as const
})

const username = ref('')
const employeeId = ref('')
const email = ref('')
const role = ref<UserRole | ''>('')
const error = ref('')

function submit() {
  error.value = ''
  const u = username.value.trim()
  const eid = employeeId.value.trim()
  const em = email.value.trim()
  const r = role.value
  if (!u || !eid || !em || !r) { error.value = copy.value.errFillAll; return }
  if (!isValidRole(r)) { error.value = copy.value.errRoleInvalid; return }
  try {
    auth.login({ username: u, employeeId: eid, email: em, role: r, department: '' })
    const next = typeof route.query.next === 'string' && route.query.next.startsWith('/') ? route.query.next : '/'
    router.replace(next)
  } catch { error.value = copy.value.errLoginFail }
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
            <input id="login-username" v-model="username" class="login-input" type="text" autocomplete="name" required />
          </div>
          <div class="login-field">
            <label for="login-employee-id">{{ copy.employeeId }}</label>
            <input id="login-employee-id" v-model="employeeId" class="login-input" type="text" autocomplete="off" required />
          </div>
          <div class="login-field">
            <label for="login-email">{{ copy.email }}</label>
            <input id="login-email" v-model="email" class="login-input" type="email" autocomplete="email" required />
          </div>
          <div class="login-field">
            <label for="login-role">{{ copy.role }}</label>
            <select id="login-role" v-model="role" class="login-input" required>
              <option value="">{{ copy.rolePlaceholder }}</option>
              <option value="fse">{{ copy.roleFse }}</option>
              <option value="manager">{{ copy.roleManager }}</option>
              <!-- NOTE(2026-04): 角色调整，暂时隐藏/禁用 third_party 入口（后续如需恢复取消注释） -->
              <!-- <option value="third_party">{{ copy.roleThird }}</option> -->
            </select>
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
</style>
