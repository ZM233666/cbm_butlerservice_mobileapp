<script setup lang="ts">
import { computed } from 'vue'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const user = auth.user!

const roleText = computed(() => {
  const raw = String(auth.roleLabel || user.role || '').trim()
  if (!raw || /[\s\u4e00-\u9fff]/.test(raw)) return raw
  return raw.replace(/([a-z])([A-Z])/g, '$1 $2')
})
</script>

<template>
  <section class="profile-card" aria-label="User Profile">
    <div class="profile-card__grid">
      <div class="profile-card__cell profile-card__cell--name">
        <span class="profile-card__icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Z" /><path d="M4 20a8 8 0 0 1 16 0" stroke-linecap="round" /></svg>
        </span>
        <h2 class="profile-card__name">{{ user.username }}</h2>
      </div>
      <div class="profile-card__cell profile-card__cell--id">
        <span class="profile-card__icon profile-card__icon--at" aria-hidden="true">@</span>
        <p class="profile-card__id">{{ user.employeeId }}</p>
      </div>
      <div class="profile-card__cell profile-card__cell--role">
        <span class="profile-card__role" :title="roleText">{{ roleText }}</span>
      </div>
      <div class="profile-card__cell profile-card__cell--email">
        <span class="profile-card__icon profile-card__icon--mail" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" stroke-linecap="round" stroke-linejoin="round" /></svg>
        </span>
        <p class="profile-card__email" :title="user.email || '-'">{{ user.email || '-' }}</p>
      </div>
    </div>
  </section>
</template>
