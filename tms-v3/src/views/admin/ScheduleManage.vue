<script setup>
import { ref, onMounted, computed, nextTick } from 'vue'
import { ElMessage, dayjs } from 'element-plus'
import Sortable from 'sortablejs'

import MovieSource from '@/components/MovieSource.vue'
import ScheduleItem from '@/components/ScheduleItem.vue'
import DataApi from '@/utils/API/Data'
import ConfigApi from '@/utils/API/System'

/* ========= 基础配置 ========= */
const emptyInterval = ref(14)

/* ========= 数据 ========= */
const movieList = ref([])
const hallList = ref([])
const currentHallId = ref('')
const allSchedule = ref({})

const currentSchedule = computed(() => allSchedule.value[currentHallId.value] || [])

// 日期限制：今天 ±3 天
const Show_date = ref(dayjs().format('YYYY-MM-DD'))

const disabledDate = (time) => {
  const today = dayjs().startOf('day')
  const min = today.subtract(3, 'day')
  const max = today.add(3, 'day')
  return dayjs(time).isBefore(min, 'day') || dayjs(time).isAfter(max, 'day')
}

const movieSourceRef = ref(null)
const scheduleDropRef = ref(null)

/* ========= 时间工具（影院业务日：06:00 → 次日） ========= */

/**
 * 将 "HH:MM" 转成「影院业务分钟」
 * 规则：06:00 作为业务日起点
 * - 06:00~23:59 => 原分钟
 * - 00:00~05:59 => 视为次日 => +24小时
 */
const toBusinessMinutes = (time) => {
  if (!time || typeof time !== 'string') return Infinity
  if (!/^\d{2}:\d{2}$/.test(time)) return Infinity

  let [h, m] = time.split(':').map(Number)
  if (Number.isNaN(h) || Number.isNaN(m)) return Infinity
  if (h < 0 || h > 23 || m < 0 || m > 59) return Infinity

  // 小于 6 点归到次日
  if (h < 6) h += 24
  return h * 60 + m
}

/**
 * 业务分钟转回 "HH:MM"
 * 允许输出 24:xx / 25:xx（更符合影院排片与后端扩展小时制）
 */
const minutesToTime = (minutes) => {
  if (typeof minutes !== 'number' || Number.isNaN(minutes) || minutes === Infinity) return '--:--'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/**
 * 计算下一个推荐开始时间：取当前列表中「业务时间最晚」的一场
 */
const calcNextStartTime = () => {
  const list = currentSchedule.value
  if (!list.length) return '10:00'

  // ✅ 确保按业务时间取最后一场（即使列表被外部改乱也不怕）
  const last = [...list]
    .sort((a, b) => toBusinessMinutes(a.startTime) - toBusinessMinutes(b.startTime))
    .at(-1)

  const start = toBusinessMinutes(last?.startTime)
  if (!Number.isFinite(start) || !last?.duration) return '10:00'

  return minutesToTime(start + last.duration + Number(emptyInterval.value || 0))
}

// 计算有效日期
const canEditSchedule = (dateStr) => {
  const today = dayjs().startOf('day')
  const d = dayjs(dateStr).startOf('day')
  return !d.isBefore(today) && !d.isAfter(today.add(3, 'day'))
}

/* ========= API ========= */
const submitSingleSchedule = async (item) => {
  if (!canEditSchedule(Show_date.value)) {
    ElMessage.error('当前日期不允许排期')
    return
  }

  const hall = hallList.value.find((h) => h.id === currentHallId.value)
  if (!hall) return
  await DataApi.AddMovies(item.movieName, hall.val, item.startTime, Show_date.value)
}

const getSchedule = async () => {
  try {
    const hall_num = hallList.value.find((h) => h.id === currentHallId.value)
    if (!hall_num) return

    const res = await DataApi.GetMoviesList(hall_num.val, Show_date.value)

    const normalized = (res?.data?.data || [])
      .map((row) => {
        const movie = movieList.value.find((m) => m.name === row.movie_name)
        return {
          id: row.id,
          movieId: movie?.id ?? null,
          movieName: row.movie_name,
          duration: movie?.duration ?? 0,
          startTime: row.start_time || '--:--',
        }
      })
      // ✅ 核心：按「影院业务分钟」排序（06:00 → 次日）
      .sort((a, b) => toBusinessMinutes(a.startTime) - toBusinessMinutes(b.startTime))

    allSchedule.value[hall_num.id] = normalized
  } catch {
    allSchedule.value[currentHallId.value] = []
  }
}

/* ========= 拖拽逻辑 ========= */
const handleMovieDrag = async (movieId) => {
  if (!movieId) return

  const movie = movieList.value.find((m) => m.id === movieId)
  if (!movie) {
    ElMessage.warning('影片数据丢失')
    return
  }

  if (!canEditSchedule(Show_date.value)) {
    ElMessage.error('当前日期不允许排期')
    return
  }

  const newItem = {
    id: Date.now(),
    movieId: movie.id,
    movieName: movie.name,
    duration: movie.duration,
    startTime: calcNextStartTime(), // ✅ 基于业务时间轴计算
  }

  const list = allSchedule.value[currentHallId.value] || []
  list.push(newItem)

  // ✅ push 后立刻按业务分钟重排（避免乱序导致 interval/end 异常）
  allSchedule.value[currentHallId.value] = list.sort(
    (a, b) => toBusinessMinutes(a.startTime) - toBusinessMinutes(b.startTime),
  )
  allSchedule.value = { ...allSchedule.value }

  await submitSingleSchedule(newItem)
  await getSchedule()
}

const initScheduleDrop = () => {
  if (!scheduleDropRef.value) return

  new Sortable(scheduleDropRef.value, {
    group: { name: 'movie', pull: false, put: true },
    sort: false,
    animation: 150,
    onAdd(evt) {
      const movieId = evt.item.dataset.movieId
      evt.item.remove()
      handleMovieDrag(movieId)
    },
  })
}

/* ========= 子组件回调 ========= */
const onItemUpdated = () => getSchedule()
const onItemDeleted = () => getSchedule()

const currentMovieCount = computed(() => currentSchedule.value.length)

/* ========= 生命周期 ========= */
onMounted(async () => {
  const hallConfig = await ConfigApi.getSystemValue('hall_num')
  const hallNum = Number(hallConfig?.data?.data?.setting_value || 1)

  hallList.value = Array.from({ length: hallNum }, (_, i) => ({
    id: `hall_${i + 1}`,
    name: `${i + 1}号厅`,
    val: i + 1,
  }))

  currentHallId.value = hallList.value[0].id

  hallList.value.forEach((h) => {
    allSchedule.value[h.id] = []
  })

  const movieRes = await DataApi.GetMoviesInfo('get')
  movieList.value = (movieRes?.data?.data || []).map((m) => ({
    id: m.movie_source_id,
    name: m.movie_name,
    duration: Math.floor(m.duration_seconds / 60),
  }))

  await getSchedule()
  await nextTick()

  movieSourceRef.value?.initDrag(handleMovieDrag)
  initScheduleDrop()
})
</script>

<template>
  <div class="cinema-schedule-page">
    <MovieSource ref="movieSourceRef" :movie-list="movieList" />

    <div class="schedule-content">
      <div class="schedule-toolbar">
        <p>影厅：</p>
        <ElSelect v-model="currentHallId" @change="getSchedule" size="small" style="width: 80px">
          <ElOption v-for="h in hallList" :key="h.id" :label="h.name" :value="h.id" />
        </ElSelect>
        <div>已排 {{ currentMovieCount }} 场</div>
        <p>每场空隙：</p>
        <ElInputNumber v-model="emptyInterval" :min="0" :max="60" />
        日期：
        <el-date-picker
          v-model="Show_date"
          type="date"
          value-format="YYYY-MM-DD"
          format="YYYY-MM-DD"
          :editable="false"
          :clearable="false"
          :disabled-date="disabledDate"
          placeholder="选择日期"
          style="width: 120px"
          @change="getSchedule"
        />
      </div>
      <div ref="scheduleDropRef" class="schedule-list-container">
        <ElRow class="schedule-header">
          <ElCol :span="5">影片</ElCol>
          <ElCol :span="4">开始</ElCol>
          <ElCol :span="3">结束</ElCol>
          <ElCol :span="3">时长</ElCol>
          <ElCol :span="3">间隔</ElCol>
          <ElCol :span="6">操作</ElCol>
        </ElRow>

        <ScheduleItem
          v-for="(item, index) in currentSchedule"
          :key="item.id"
          :item="item"
          :index="index"
          :list="currentSchedule"
          :movie-list="movieList"
          :default-interval="emptyInterval"
          @updated="onItemUpdated"
          @deleted="onItemDeleted"
        />

        <div v-if="!currentMovieCount" class="empty-tip">暂无排期</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 全局页面布局 - 统一深色风格 */
.cinema-schedule-page {
  display: flex;
  gap: 24px;
  padding: 24px;
  background: #0a0a0f;
  min-height: 100vh;
  color: #e5e7eb;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

/* 右侧排期内容区 */
.schedule-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* 顶部工具栏 - 统一样式 */
.schedule-toolbar {
  display: flex;
  gap: 24px;
  align-items: center;
  padding: 16px 20px;
  background: #111827;
  border-radius: 8px;
  border: 1px solid #1f2937;
}

/* 影厅选择器样式 */
.hall-selector {
  width: 180px;
}

/* 空场间隔设置样式 */
.interval-setting {
  display: flex;
  align-items: center;
  gap: 8px;
}
.interval-setting .label {
  color: #94a3b8;
  font-size: 14px;
}
.interval-input {
  width: 80px;
}
.interval-setting .unit {
  color: #94a3b8;
  font-size: 14px;
}

/* 排期数量统计样式 */
.count-stat {
  color: #e5e7eb;
  font-size: 14px;
}
.count-num {
  color: #38bdf8;
  font-weight: 600;
  padding: 2px 6px;
  background: rgba(56, 189, 248, 0.1);
  border-radius: 4px;
  margin: 0 4px;
}

/* 影厅标题样式 */
.hall-title {
  color: #38bdf8;
  font-weight: 600;
  font-size: 16px;
}

/* 排期列表容器 */
.schedule-list-container {
  height: calc(100vh - 300px);
  overflow-y: scroll;
  padding: 20px;
  border: 2px dashed #38bdf8;
  border-radius: 8px;
  background: #111827;
  display: flex;
  flex-direction: column;
  gap: 12px;
  transition: border-color 0.2s ease;
}
.schedule-list-container:hover {
  border-color: #0ea5e9;
}
.schedule-list-container::-webkit-scrollbar {
  width: 12px;
}

.schedule-list-container::-webkit-scrollbar-track {
  background: #111827; /* 轨道背景 */
}

.schedule-list-container::-webkit-scrollbar-thumb {
  background-color: #2755b7; /* 滑块颜色 */
  border-radius: 8px;
  border: 3px solid #111827; /* 制造“内边距”效果 */
}

.schedule-list-container::-webkit-scrollbar-thumb:hover {
  background-color: #0352ff;
}

/* 排期表头样式 */
.schedule-header {
  padding: 8px 0;
  border-bottom: 1px solid #1f2937;
  margin-bottom: 8px;
  text-align: center;
}
.header-text {
  color: #94a3b8;
  font-weight: 600;
  font-size: 14px;
}

/* 空状态提示 */
.empty-tip {
  text-align: center;
  padding: 40px 0;
  color: #6b7280;
  font-size: 14px;
}

/* ElementUI组件样式穿透 - 统一深色风格 */
:deep(.el-select .el-input__wrapper) {
  background: #1f2937;
  border: 1px solid #374151;
  color: #e5e7eb;
  box-shadow: none;
}
:deep(.el-select .el-input__wrapper:hover) {
  border-color: #38bdf8;
}
:deep(.el-select-dropdown) {
  background: #1f2937;
  border: 1px solid #374151;
}
:deep(.el-select-dropdown__item) {
  color: #e5e7eb;
}
:deep(.el-select-dropdown__item:hover) {
  background: #374151;
}
:deep(.el-select-dropdown__item.selected) {
  color: #38bdf8;
  background: rgba(56, 189, 248, 0.1);
}
:deep(.el-input-number__wrapper) {
  background: #1f2937;
  border: 1px solid #374151;
  color: #e5e7eb;
}
:deep(.el-input-number__wrapper:hover) {
  border-color: #38bdf8;
}
:deep(.el-divider) {
  background-color: #1f2937;
}
:deep(.el-divider__text) {
  color: #94a3b8;
}

/* 响应式适配 - 移动端友好 */
@media (max-width: 768px) {
  .cinema-schedule-page {
    flex-direction: column;
    padding: 16px;
    gap: 16px;
  }
  .schedule-toolbar {
    flex-wrap: wrap;
    gap: 12px;
  }
  .schedule-list-container {
    padding: 16px;
  }
}

/* 列文字颜色统一 */
.el-col {
  color: #f5e7c1; /* 统一浅麦色 */
  font-size: 14px;
}
</style>
