<script setup lang="ts">
import { computed, watch, ref, onMounted } from 'vue'

/* ========= props / emits ========= */
const props = defineProps<{
  modelValue: string
  min?: string
  max?: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
}>()

/* ========= 内部时间状态 ========= */
const time = ref({
  year: 2025,
  month: 1,
  day: 1,
})

/* ========= 工具函数 ========= */
const pad = (n: number) => String(n).padStart(2, '0')

// 修复：准确计算当月天数
const daysInMonth = (y: number, m: number) => {
  return new Date(y, m, 0).getDate()
}

// 修复：限制日期范围（防止手动输入超出当月天数）
const limitDay = () => {
  const maxDay = daysInMonth(time.value.year, time.value.month)
  if (time.value.day > maxDay) {
    time.value.day = maxDay
  } else if (time.value.day < 1) {
    time.value.day = 1
  }
}

/* ========= 从父组件同步进来 ========= */
watch(
  () => props.modelValue,
  (val) => {
    if (!val) return
    const [y, m, d] = val.split('-').map(Number)
    if (!y || !m || !d) return
    time.value.year = y
    time.value.month = m
    time.value.day = d
    limitDay() // 同步后限制日期
  },
  { immediate: true },
)

/* ========= 计算并回传给父组件 ========= */
watch(
  time,
  () => {
    limitDay() // 先限制日期
    const y = time.value.year
    const m = time.value.month
    const d = time.value.day

    const result = `${y}-${pad(m)}-${pad(d)}`
    emit('update:modelValue', result)
  },
  { deep: true, immediate: false },
)

/* ========= 年月日调整（修复按钮逻辑） ========= */
const incYear = () => {
  time.value.year += 1
  limitDay() // 年份变化后重新计算日期
}
const decYear = () => {
  time.value.year -= 1
  limitDay() // 年份变化后重新计算日期
}

const incMonth = () => {
  if (time.value.month === 12) {
    time.value.month = 1
    incYear()
  } else {
    time.value.month++
  }
  limitDay() // 月份变化后重新计算日期
}
const decMonth = () => {
  if (time.value.month === 1) {
    time.value.month = 12
    decYear()
  } else {
    time.value.month--
  }
  limitDay() // 月份变化后重新计算日期
}

const incDay = () => {
  const max = daysInMonth(time.value.year, time.value.month)
  if (time.value.day < max) {
    time.value.day++
  }
}
const decDay = () => {
  if (time.value.day > 1) {
    time.value.day--
  }
}

// 监听手动输入的日期，限制范围
watch([() => time.value.day], () => {
  limitDay()
})
</script>

<template>
  <div class="picker">
    <!-- 年 -->
    <div class="col">
      <p class="btn metal" @click="incYear">∧</p>
      <input class="value-input" type="number" v-model.number="time.year" min="2000" max="2100" />
      <p class="btn metal" @click="decYear">∨</p>
    </div>
    <div class="time-unit">年</div>
    <!-- 月 -->
    <div class="col">
      <p class="btn metal" @click="incMonth">∧</p>
      <input class="value-input" type="number" v-model.number="time.month" min="1" max="12" />
      <p class="btn metal" @click="decMonth">∨</p>
    </div>
    <div class="time-unit">月</div>

    <!-- 日 -->
    <div class="col">
      <p class="btn metal" @click="incDay">∧</p>
      <input
        class="value-input"
        type="number"
        v-model.number="time.day"
        :min="1"
        :max="daysInMonth(time.year, time.month)"
      />
      <p class="btn metal" @click="decDay">∨</p>
    </div>
    <div class="time-unit">日</div>
  </div>
</template>

<style scoped>
.picker {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: auto;
  text-align: center;
  border-radius: 6px;
  user-select: none;
  padding: 4px;
  gap: 8px;
  background: rgba(10, 10, 15, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.2);
}

.time-unit {
  color: #a8c7ff;
  font-weight: bold;
  margin-left: 8px;
  margin-right: 4px;
}

.col {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 45px;
}

/* ===== input 样式优化 ===== */
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
  color: #ffffff; /* 改为白色，适配深色主题 */
  appearance: none;
  background: linear-gradient(180deg, #2c2c2c, #1a1a1a); /* 深色背景 */
  border-radius: 4px;
  padding: 2px 0;
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

/* ===== 金属按钮优化 ===== */
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
  color: #333333; /* 改为深色文字，提高可读性 */
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
  line-height: 20px; /* 固定行高，防止按钮变形 */
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
