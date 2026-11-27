<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from '@/composables/useI18n'

export type SlotUploadStatus = 'idle' | 'processing' | 'queued' | 'uploading' | 'success' | 'failed'

const props = withDefaults(defineProps<{
  slotId: string
  label: string
  inputId: string
  imageUrl: string
  status: SlotUploadStatus
  metaLines: string[]
  /** 槽位名称（与上传按钮文案一致），显示在拍摄时间之上 */
  metaTitle?: string
  /** 非 DOING 状态时禁止上传/更换图片 */
  disabled?: boolean
  /** 主图已上传时显示「添加照片」 */
  showAddPhoto?: boolean
  /** 附加照片槽位显示「删除」 */
  showRemove?: boolean
}>(), {
  disabled: false,
  status: 'idle',
  metaTitle: '',
  showAddPhoto: false,
  showRemove: false,
})

const emit = defineEmits<{
  (e: 'change', event: Event): void
  (e: 'retry'): void
  (e: 'preview'): void
  (e: 'add-photo'): void
  (e: 'remove'): void
}>()

const { lang } = useI18n()
const hasImage = computed(() => !!props.imageUrl)
const canReplace = computed(() => !props.disabled && props.status !== 'processing' && props.status !== 'uploading')
const statusText = computed(() => {
  if (props.status === 'processing') return lang.value === 'zh' ? '处理中...' : 'Processing...'
  if (props.status === 'queued') return lang.value === 'zh' ? '等待上传...' : 'Waiting...'
  if (props.status === 'uploading') return lang.value === 'zh' ? '上传中...' : 'Uploading...'
  if (props.status === 'failed') return lang.value === 'zh' ? '上传失败' : 'Upload failed'
  if (props.status === 'success') return lang.value === 'zh' ? '上传成功' : 'Uploaded'
  return ''
})
const showStatusOverlay = computed(() =>
  props.status === 'processing'
  || props.status === 'queued'
  || props.status === 'uploading'
  || props.status === 'failed'
  || (props.status === 'success' && !props.metaLines.length && !props.metaTitle),
)
</script>

<template>
  <div
    class="tl-upload-slot"
    :class="{
      'is-disabled': disabled,
      [`is-${status}`]: status !== 'idle',
    }"
  >
    <input
      :id="inputId"
      class="tl-file"
      :class="{ 'is-hidden': (!hasImage && disabled) || (hasImage && !canReplace) }"
      type="file"
      accept="image/*"
      :disabled="disabled || !canReplace"
      @change="emit('change', $event)"
    />
    <label
      v-show="!hasImage"
      class="tl-upload-btn"
      :class="{ 'is-disabled': disabled }"
      :for="disabled || !canReplace ? undefined : inputId"
      :aria-disabled="disabled || !canReplace ? 'true' : undefined"
    >{{ label }}</label>
    <div v-show="hasImage" class="tl-thumb is-visible">
      <button
        type="button"
        class="tl-thumb__preview-btn"
        :aria-label="lang === 'zh' ? '放大预览' : 'Enlarge preview'"
        @click="emit('preview')"
      >
        <img :src="imageUrl" alt="" decoding="async" />
      </button>
      <div v-if="showStatusOverlay" class="tl-thumb__meta">
        <span class="tl-thumb__meta-line">{{ statusText }}</span>
        <button
          v-if="status === 'failed' && !disabled"
          type="button"
          class="tl-thumb__retry"
          @click.stop="emit('retry')"
        >{{ lang === 'zh' ? '重试' : 'Retry' }}</button>
      </div>
      <div v-else-if="metaTitle || metaLines.length" class="tl-thumb__meta">
        <span v-if="metaTitle" class="tl-thumb__meta-title">{{ metaTitle }}</span>
        <span v-for="(line, li) in metaLines" :key="li" class="tl-thumb__meta-line">{{ line }}</span>
      </div>
      <div
        v-if="hasImage && (canReplace || showAddPhoto || showRemove)"
        class="tl-thumb__actions"
      >
        <label
          v-if="canReplace"
          class="tl-thumb__action tl-thumb__replace"
          :for="inputId"
        >{{ lang === 'zh' ? '更换' : 'Replace' }}</label>
        <button
          v-if="showAddPhoto"
          type="button"
          class="tl-thumb__action tl-thumb__add"
          @click.stop="emit('add-photo')"
        >{{ lang === 'zh' ? '添加照片' : 'Add photo' }}</button>
        <button
          v-if="showRemove"
          type="button"
          class="tl-thumb__action tl-thumb__remove"
          @click.stop="emit('remove')"
        >{{ lang === 'zh' ? '删除' : 'Remove' }}</button>
      </div>
    </div>
  </div>
</template>
