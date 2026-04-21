<script setup lang="ts">
import PageShell from '@/components/layout/PageShell.vue'
import TopBrandBar from '@/components/layout/TopBrandBar.vue'
import ManagerAssignmentBoard from '@/components/home/ManagerAssignmentBoard.vue'
import { useI18n } from '@/composables/useI18n'

const { t } = useI18n()
</script>

<template>
  <div class="manager-assignments-page">
    <PageShell>
      <TopBrandBar :title="t.navAssignments" />
      <main class="main main--manager-assignments">
        <ManagerAssignmentBoard />
      </main>
    </PageShell>
  </div>
</template>

<style scoped>
.manager-assignments-page .page {
  background: transparent;
}

.main.main--manager-assignments {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.78rem;
  padding: 1.05rem 1rem 0.8rem;
}
</style>
