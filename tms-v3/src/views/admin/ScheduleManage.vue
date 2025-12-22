<script setup>
import { ref, onMounted, computed, nextTick } from 'vue'
import { ElMessage, dayjs } from 'element-plus'
import Sortable from 'sortablejs'

import MovieSource from '@/components/MovieSource.vue'
import ScheduleItem from '@/components/ScheduleItem.vue'
import DataApi from '@/utils/API/Data'
import ConfigApi from '@/utils/API/System'

/* ================== 基础配置 ================== */
const emptyInterval = ref(12)

/* ================== 数据 ================== */
const movieList = ref([])
const hallList = ref([])
const currentHallId = ref('')
const allSchedule = ref({})

const currentSchedule = computed(() => allSchedule.value[currentHallId.value] || [])

/** ✅【修复】模板中使用了但之前没定义 */
const currentMovieCount = computed(() => currentSchedule.value.length)

/* ================== 日期 ================== */
const Show_date = ref(dayjs().format('YYYY-MM-DD'))

const disabledDate = (time) => {
  const today = dayjs().startOf('day')
  return (
    dayjs(time).isBefore(today.subtract(3, 'day'), 'day') ||
    dayjs(time).isAfter(today.add(3, 'day'), 'day')
  )
}

/* ================== 拖拽引用 ================== */
const movieSourceRef = ref(null)
const scheduleDropRef = ref(null)

/* ================== 时间工具（影院业务日 06:00 → 次日） ================== */
const toBusinessMinutes = (time) => {
  if (!/^\d{2}:\d{2}$/.test(time)) return Infinity
  let [h, m] = time.split(':').map(Number)
  if (h < 0 || h > 23 || m < 0 || m > 59) return Infinity
  if (h < 6) h += 24
  return h * 60 + m
}

const minutesToTime = (minutes) => {
  if (!Number.isFinite(minutes)) return '--:--'
  const normalized = minutes % (24 * 60)
  const h = Math.floor(normalized / 60)
  const m = normalized % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/* ================== 超级营业时间锁 ================== */
/** 07:00 ～ 次日 05:30 */
const isStartTimeAllowed = (time) => {
  const m = toBusinessMinutes(time)
  if (!Number.isFinite(m)) return false
  const OPEN = 7 * 60
  const CLOSE = 24 * 60 + 5 * 60 + 30
  return m >= OPEN && m <= CLOSE
}

/* ================== 计算下一场时间 ================== */
const calcNextStartTime = () => {
  const list = currentSchedule.value
  if (!list.length) return '10:00'

  const last = [...list]
    .sort((a, b) => toBusinessMinutes(a.startTime) - toBusinessMinutes(b.startTime))
    .at(-1)

  if (!last) return '10:00'

  const start = toBusinessMinutes(last.startTime)
  if (!Number.isFinite(start)) return '10:00'

  return minutesToTime(start + Number(last.duration || 0) + Number(emptyInterval.value || 0))
}

/* ================== 日期权限 ================== */
const canEditSchedule = (dateStr) => {
  const today = dayjs().startOf('day')
  const d = dayjs(dateStr).startOf('day')
  return !d.isBefore(today) && !d.isAfter(today.add(3, 'day'))
}

/* ================== API ================== */
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
    const hall = hallList.value.find((h) => h.id === currentHallId.value)
    if (!hall) return

    const res = await DataApi.GetMoviesList(hall.val, Show_date.value)

    allSchedule.value[hall.id] = (res?.data?.data || [])
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
      .sort((a, b) => toBusinessMinutes(a.startTime) - toBusinessMinutes(b.startTime))
  } catch {
    allSchedule.value[currentHallId.value] = []
  }
}

const selectHall = (id) => {
  currentHallId.value = id
  getSchedule()
}
/* ================== 拖拽新增 ================== */
const handleMovieDrag = async (movieId) => {
  const movie = movieList.value.find((m) => m.id === movieId)
  if (!movie) return ElMessage.warning('影片数据丢失')
  if (!canEditSchedule(Show_date.value)) return ElMessage.error('当前日期不允许排期')

  const startTime = calcNextStartTime()

  if (!isStartTimeAllowed(startTime)) {
    ElMessage.error('开场时间超出营业范围（07:00 ~ 次日 05:30）')
    return
  }

  const newItem = {
    id: Date.now(),
    movieId: movie.id,
    movieName: movie.name,
    duration: movie.duration,
    startTime,
  }

  const list = allSchedule.value[currentHallId.value] || []
  list.push(newItem)

  allSchedule.value[currentHallId.value] = list.sort(
    (a, b) => toBusinessMinutes(a.startTime) - toBusinessMinutes(b.startTime),
  )
  allSchedule.value = { ...allSchedule.value }

  await submitSingleSchedule(newItem)
  await getSchedule()
}

/* ================== 拖拽初始化 ================== */
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

/* ================== ✅ 子组件事件（修复缺失） ================== */
const onItemUpdated = async () => {
  await getSchedule()
}

const onItemDeleted = async () => {
  await getSchedule()
}

/* ================== 生命周期 ================== */
onMounted(async () => {
  const hallNum = Number(
    (await ConfigApi.getSystemValue('hall_num'))?.data?.data?.setting_value || 1,
  )

  hallList.value = Array.from({ length: hallNum }, (_, i) => ({
    id: `hall_${i + 1}`,
    name: `${i + 1}号厅`,
    val: i + 1,
  }))

  currentHallId.value = hallList.value[0].id
  hallList.value.forEach((h) => (allSchedule.value[h.id] = []))

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
        <div>
          <p>影厅：</p>
          <div class="hall_list">
            <div
              v-for="h in hallList"
              :key="h.id"
              @click="selectHall(h.id)"
              :class="{ active: currentHallId === h.id }"
            >
              {{ h.name }}
            </div>
          </div>
        </div>
        <div>
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
  flex-wrap: wrap;
}

/* ========== 核心：影厅横向列表样式 ========== */
.hall_list {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-left: 8px;
}

/* 单个影厅选项样式 */
.hall_list > div {
  padding: 6px 16px;
  background: #1f2937;
  border: 1px solid #374151;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  color: #e5e7eb;
  transition: all 0.2s ease;
  white-space: nowrap;
}

/* 选中状态 */
.hall_list > div.active {
  background: rgba(56, 189, 248, 0.1);
  border-color: #38bdf8;
  color: #38bdf8;
  font-weight: 600;
  box-shadow: 0 0 0 2px rgba(56, 189, 248, 0.2);
}

/* 悬停效果（非选中状态） */
.hall_list > div:hover:not(.active) {
  border-color: #38bdf8;
  color: #f5e7c1;
  background: #273043;
}

/* 影厅标签样式 */
.schedule-toolbar > div:first-child {
  display: flex;
  align-items: center;
  gap: 8px;
}

.schedule-toolbar > div:first-child > p {
  margin: 0;
  color: #94a3b8;
  font-size: 14px;
}

/* 工具栏右侧内容布局 */
.schedule-toolbar > div:last-child {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
}

/* 已排场次统计 */
.schedule-toolbar > div:last-child > div:first-child {
  color: #e5e7eb;
  font-size: 14px;
  background: rgba(75, 85, 99, 0.2);
  padding: 4px 12px;
  border-radius: 4px;
}

/* 空隙设置样式 */
.schedule-toolbar > div:last-child > p {
  margin: 0;
  color: #94a3b8;
  font-size: 14px;
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
:deep(.el-input-number__wrapper) {
  background: #1f2937;
  border: 1px solid #374151;
  color: #e5e7eb;
  width: 80px;
}
:deep(.el-input-number__wrapper:hover) {
  border-color: #38bdf8;
}

:deep(.el-date-picker .el-input__wrapper) {
  background: #1f2937;
  border: 1px solid #374151;
  color: #e5e7eb;
  box-shadow: none;
}
:deep(.el-date-picker .el-input__wrapper:hover) {
  border-color: #38bdf8;
}

:deep(.el-popper) {
  background: #1f2937;
  border: 1px solid #374151;
}
:deep(.el-date-table) {
  color: #e5e7eb;
}
:deep(.el-date-table td:hover) {
  background: #374151;
}
:deep(.el-date-table .el-date-table__row.current) {
  color: #38bdf8;
}
:deep(.el-date-table .el-date-table__row.today) {
  color: #0ea5e9;
}

/* 列文字颜色统一 */
.el-col {
  color: #f5e7c1; /* 统一浅麦色 */
  font-size: 14px;
  text-align: center;
}

/* 响应式适配 - 移动端友好 */
@media (max-width: 768px) {
  .cinema-schedule-page {
    flex-direction: column;
    padding: 16px;
    gap: 16px;
  }
  .schedule-toolbar {
    gap: 12px;
  }
  .hall_list {
    width: 100%;
    margin-left: 0;
    margin-top: 8px;
  }
  .schedule-toolbar > div:first-child {
    width: 100%;
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }
  .schedule-list-container {
    padding: 16px;
    height: calc(100vh - 350px);
  }
}
</style>
