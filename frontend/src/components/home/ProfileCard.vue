<script setup lang="ts">
import { useAuthStore } from '@/stores/auth'
const auth = useAuthStore()
const user = auth.user!
</script>

<template>
  <section class="profile-card" aria-label="User Profile">
    <div class="profile-card__grid">
      <div class="profile-card__row profile-card__row--split">
        <div class="profile-card__field">
          <span class="profile-card__icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Z" /><path d="M4 20a8 8 0 0 1 16 0" stroke-linecap="round" /></svg>
          </span>
          <span class="profile-card__value">{{ user.username }}</span>
        </div>
        <div class="profile-card__field">
          <span class="profile-card__icon profile-card__icon--at" aria-hidden="true">@</span>
          <span class="profile-card__value">{{ user.employeeId }}</span>
        </div>
      </div>
      <div class="profile-card__row profile-card__row--split">
        <div class="profile-card__field">
          <span class="profile-card__icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.75"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" stroke-linecap="round" stroke-linejoin="round" /></svg>
          </span>
          <span class="profile-card__value profile-card__value--email">{{ user.email }}</span>
        </div>
        <div class="profile-card__field">
          <span class="profile-card__icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M4 20V10l8-5 8 5v10" stroke-linecap="round" stroke-linejoin="round" /><path d="M9 20v-6h6v6" stroke-linecap="round" stroke-linejoin="round" /></svg>
          </span>
          <span class="profile-card__value">{{ auth.roleLabel || user.role }}</span>
        </div>
      </div>
    </div>
  </section>
</template>
