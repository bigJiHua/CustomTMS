<script setup lang="ts">
import { ref, watch } from 'vue'

/* ========= props / emits ========= */
const props = defineProps<{
  modelValue: number
  min?: number
  max?: number
  step?: number
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: number): void
}>()

/* ========= 内部状态 ========= */
const value = ref<number>(props.modelValue ?? 0)

/* ========= 同步父 → 子 ========= */
watch(
  () => props.modelValue,
  (val) => {
    if (typeof val === 'number') {
      value.value = val
    }
  },
  { immediate: true },
)

/* ========= 同步子 → 父 ========= */
watch(value, (val) => {
  let v = val
  const step = props.step ?? 1

  if (props.min !== undefined) v = Math.max(props.min, v)
  if (props.max !== undefined) v = Math.min(props.max, v)

  // 步进修正
  v = Math.round(v / step) * step

  value.value = v
  emit('update:modelValue', v)
})

/* ========= 操作 ========= */
const inc = () => {
  value.value += props.step ?? 1
}
const dec = () => {
  value.value -= props.step ?? 1
}
</script>
<template>
  <div class="picknum">
    <p class="btn metal" @click="inc">∧</p>

    <input class="value-input" type="number" v-model.number="value" />

    <p class="btn metal" @click="dec">∨</p>
  </div>
</template>
<style scoped>
.picknum {
  width: 45px;
  text-align: center;
  border: 1px solid #bcbcbc;
  border-radius: 6px;
  background: linear-gradient(180deg, #fafafa, #e6e6e6);
  user-select: none;
}

/* ===== input ===== */
.value-input {
  padding: 0;
  width: 100%;
  text-align: center;
  font-size: 16px;
  font-weight: 600;
  line-height: 28px;
  border: none;
  outline: none;
  background: transparent;
  color: #2c2c2c;
  appearance: none;
}

/* 去掉 number 默认箭头 */
.value-input::-webkit-outer-spin-button,
.value-input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
.value-input[type='number'] {
  -moz-appearance: textfield;
}

/* ===== 金属按钮 ===== */
.btn.metal {
  cursor: pointer;
  margin: 0;
  width: 100%;
  box-sizing: border-box;

  background: linear-gradient(
    180deg,
    #e9e9e9 0%,
    #d5d5d5 20%,
    #c0c0c0 40%,
    #a8a8a8 60%,
    #919191 80%,
    #7a7a7a 100%
  );

  color: #ffffff;
  font-size: 1rem;
  font-weight: 800;
  border: 1px solid #6a6a6a;
  border-radius: 2px;

  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.8),
    inset 0 2px 1px rgba(255, 255, 255, 0.5),
    inset 0 -1px 0 rgba(0, 0, 0, 0.2),
    inset 0 -2px 1px rgba(0, 0, 0, 0.15),
    0 1px 2px rgba(0, 0, 0, 0.2);

  text-shadow: 0 1px 1px rgba(255, 255, 255, 0.7);
  transition: all 0.15s ease;
}

.btn.metal:hover {
  background: linear-gradient(
    180deg,
    #f5f5f5 0%,
    #e2e2e2 20%,
    #cdcdcd 40%,
    #b5b5b5 60%,
    #9e9e9e 80%,
    #868686 100%
  );
}

.btn.metal:active {
  background: linear-gradient(180deg, #8a8a8a 0%, #9e9e9e 30%, #b5b5b5 60%, #c8c8c8 100%);
  box-shadow:
    inset 0 1px 2px rgba(0, 0, 0, 0.3),
    inset 0 2px 4px rgba(0, 0, 0, 0.2);
  transform: translateY(1px);
}
</style>
