<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from '@/composables/useI18n'

const props = defineProps<{
  slotId: string
  label: string
  inputId: string
  imageUrl: string
  processing: boolean
  uploading: boolean
  metaLines: string[]
}>()

const emit = defineEmits<{
  (e: 'change', event: Event): void
}>()

const { lang } = useI18n()
const hasImage = computed(() => !!props.imageUrl)
</script>

<template>
  <div class="tl-upload-slot">
    <input
      :id="inputId"
      class="tl-file"
      :class="{ 'is-hidden': hasImage }"
      type="file"
      accept="image/*"
      @change="emit('change', $event)"
    />
    <label v-show="!hasImage" class="tl-upload-btn" :for="inputId">{{ label }}</label>
    <div v-show="hasImage" class="tl-thumb is-visible">
      <img :src="imageUrl" alt="" decoding="async" />
      <div v-if="processing" class="tl-thumb__meta">
        <span class="tl-thumb__meta-line">{{ lang === 'zh' ? '处理中...' : 'Processing...' }}</span>
      </div>
      <div v-else-if="uploading" class="tl-thumb__meta">
        <span class="tl-thumb__meta-line">{{ lang === 'zh' ? '上传中...' : 'Uploading...' }}</span>
      </div>
      <div v-else-if="metaLines.length" class="tl-thumb__meta">
        <span v-for="(line, li) in metaLines" :key="li" class="tl-thumb__meta-line">{{ line }}</span>
      </div>
    </div>
  </div>
</template>
