<script setup lang="ts">
import { computed } from 'vue'
import { getDaysUntilDeadline, deadlineAlertLevel } from '@/composables/useDeadlineAlert'
import { useI18n } from '@/composables/useI18n'

const props = defineProps<{ deadline: string; status: string }>()
const { t } = useI18n()
const days = computed(() => getDaysUntilDeadline(props.deadline))
const level = computed(() => deadlineAlertLevel(days.value, props.status))
const text = computed(() => {
  if (!level.value) return ''
  const d = days.value
  if (d == null) return ''
  if (d < 0) return t.value.deadlineExpired
  return String(t.value.deadlineDaysLeft).replace('{n}', String(d))
})
</script>

<template>
  <span
    v-if="level"
    class="event-card__deadline-alert"
    :class="{
      'event-card__deadline-alert--urgent': level === 'urgent',
      'event-card__deadline-alert--expired': level === 'expired',
    }"
  >{{ text }}</span>
</template>
