<script setup lang="ts">
import type { TaskCard } from '@/types/task'
import { useI18n } from '@/composables/useI18n'

defineProps<{ tasks: TaskCard[] }>()

const { t } = useI18n()
</script>

<template>
  <section class="home-section" aria-label="CBM Recommendations">
    <div class="home-section__header">
      <h2 class="home-section__title">
        <span class="home-section__icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8">
            <path d="M12 3.8V20.2M3.8 12H20.2" stroke-linecap="round" />
            <path d="M6.2 6.2 17.8 17.8M17.8 6.2 6.2 17.8" stroke-linecap="round" />
            <circle cx="12" cy="12" r="8.2" />
          </svg>
        </span>
        {{ t.homeCbmTitle }}
      </h2>
    </div>

    <div class="ios-list-group" aria-label="CBM recommendation list">
      <div class="ios-list-scroll" :class="{ 'is-empty': !tasks.length }">
        <button v-for="card in tasks" :key="`${card.maint}-${card.title}-${card.deadline}`" type="button" class="ios-list-item">
          <span class="item-icon-area" aria-hidden="true">
            <span class="ai-icon">✦</span>
          </span>
          <span class="item-content">
            <span class="item-title">{{ card.title }} {{ t.homeRecoSuffix }}</span>
            <span class="item-subtitle">{{ card.meta || 'CCBII · Maintenance' }}</span>
          </span>
          <span class="item-right" aria-hidden="true">
            <span class="priority-indicator" :class="card.maint.toLowerCase() === 'c4c6' ? 'bg-high' : 'bg-med'"></span>
            <span class="chevron">›</span>
          </span>
        </button>
        <p v-if="!tasks.length" class="ios-list-empty">{{ t.homeNoTasksFound }}</p>
      </div>
    </div>

    <div class="home-cbm-meta" role="note">
      <p class="home-section__subtitle home-cbm-meta__hint">{{ t.homeCbmSubtitle }}</p>
      <div class="home-legend home-cbm-meta__legend" aria-label="priority legend">
        <span class="home-legend__item"><i class="home-legend__dot bg-low"></i>{{ t.legendLow }}</span>
        <span class="home-legend__item"><i class="home-legend__dot bg-med"></i>{{ t.legendMedium }}</span>
        <span class="home-legend__item"><i class="home-legend__dot bg-high"></i>{{ t.legendHigh }}</span>
      </div>
    </div>
  </section>
</template>
