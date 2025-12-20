<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch } from 'vue'
import dayjs from 'dayjs'
import GetDataFunc from '@/utils/API/Data'

/* ================== 类型 ================== */
interface MovieSource {
  movie_source_id: string
  movie_name: string
  duration_seconds: number
  light_offset_seconds: number
}

interface Schedule {
  id: number
  show_date: string
  movie_name: string
  hall_name: string
  movie_source_id: string
  start_time: string
}

interface ScheduleWithSource extends Schedule {
  duration_seconds?: number
  light_offset_seconds?: number
  actual_show_date: string
  actual_start_time: number
  end_time?: number
  light_on_time?: number
}

type DisplayRow = { __type: 'anchor' } | (ScheduleWithSource & { __type?: undefined })

/* ================== 状态 ================== */
const list = ref<ScheduleWithSource[]>([])
const movieSources = ref<MovieSource[]>([])
const now = ref(Date.now())
let timer: ReturnType<typeof setInterval> | null = null

const activeTab = ref<'valid' | 'finished'>('valid')

// 日期限制：今天 ±3 天
const Show_date = ref(dayjs().format('YYYY-MM-DD'))

const disabledDate = (time) => {
  const today = dayjs().startOf('day')
  const min = today.subtract(3, 'day')
  const max = today.add(3, 'day')

  return dayjs(time).isBefore(min, 'day') || dayjs(time).isAfter(max, 'day')
}
/* ================== 列表计算 ================== */
const validList = computed(() =>
  list.value
    .filter((r) => {
      const s = getStatus(r)
      return s === '未开始' || s === '播放中'
    })
    .sort((a, b) => a.actual_start_time - b.actual_start_time),
)

const finishedList = computed(() =>
  list.value
    .filter((r) => getStatus(r) === '已结束')
    .sort((a, b) => (b.end_time || 0) - (a.end_time || 0)),
)

const currentList = computed(() =>
  activeTab.value === 'valid' ? validList.value : finishedList.value,
)

/* ================== 次日锚点列表（核心） ================== */
const displayList = computed<DisplayRow[]>(() => {
  const result: DisplayRow[] = []
  let anchorInserted = false

  for (const row of currentList.value) {
    if (!anchorInserted && row.actual_show_date !== row.show_date) {
      result.push({ __type: 'anchor' })
      anchorInserted = true
    }
    result.push(row)
  }

  return result
})

/* ================== 数据拉取 + 跨天修复 ================== */
const fetchData = async () => {
  try {
    const scheduleRes = await GetDataFunc.GetMoviesList('all', Show_date.value)
    const rawSchedules = scheduleRes.data.data as Schedule[]

    const sourceRes = await GetDataFunc.GetMoviesInfo('get')
    movieSources.value = sourceRes.data.data as MovieSource[]

    list.value = rawSchedules.map((schedule) => {
      const source = movieSources.value.find((s) => s.movie_source_id === schedule.movie_source_id)

      // 跨天规则：0~5 点算次日
      const hour = Number(schedule.start_time.split(':')[0])
      let actualShowDate = schedule.show_date

      if (hour < 6) {
        actualShowDate = dayjs(schedule.show_date).add(1, 'day').format('YYYY-MM-DD')
      }

      const actualStartTime = dayjs(`${actualShowDate} ${schedule.start_time}`).valueOf()

      const row: ScheduleWithSource = {
        ...schedule,
        actual_show_date: actualShowDate,
        actual_start_time: actualStartTime,
        duration_seconds: source?.duration_seconds,
        light_offset_seconds: source?.light_offset_seconds || 0,
      }

      if (!isInvalid(row)) {
        const t = getTimes(row)
        row.end_time = t.end
        row.light_on_time = t.light
      }

      return row
    })
  } catch (e) {
    console.error('排期数据加载失败', e)
    list.value = []
  }
  // 核心：判断选中日期与今天的关系
  const isSelectedDatePast = computed(() => {
    const selectedDate = dayjs(Show_date.value).startOf('day')
    const today = dayjs().startOf('day')
    return selectedDate.isBefore(today) // 选中日期 < 今天 → true
  })

  // 监听日期变化，自动切换tab
  watch(
    [isSelectedDatePast],
    () => {
      activeTab.value = isSelectedDatePast.value ? 'finished' : 'valid'
    },
    { immediate: true },
  ) // 立即执行，初始化时就生效
}

/* ================== 时间工具 ================== */
const isInvalid = (row: ScheduleWithSource): boolean => {
  if (!row.start_time) return true
  if (!row.duration_seconds) return true
  return !dayjs(row.actual_start_time).isValid()
}

const getTimes = (row: ScheduleWithSource) => {
  if (isInvalid(row)) return null
  const start = dayjs(row.actual_start_time)
  const end = start.add(row.duration_seconds!, 'second')
  const light = end.subtract(row.light_offset_seconds || 0, 'second')
  return {
    start: start.valueOf(),
    end: end.valueOf(),
    light: light.valueOf(),
  }
}

const getStatus = (row: ScheduleWithSource): string => {
  const t = getTimes(row)
  if (!t) return '影片不存在'
  if (now.value < t.start) return '未开始'
  if (now.value >= t.end) return '已结束'
  return '播放中'
}

const getProgress = (row: ScheduleWithSource): number => {
  const t = getTimes(row)
  if (!t) return 0
  if (now.value <= t.start) return 0
  if (now.value >= t.end) return 100
  return Math.floor(((now.value - t.start) / (t.end - t.start)) * 100)
}

const fmt = (time?: number): string => (time ? dayjs(time).format('HH:mm') : '--')

/* ================== 生命周期 ================== */
onMounted(() => {
  fetchData()
  timer = setInterval(() => {
    now.value = Date.now()
  }, 1000)
})

onUnmounted(() => {
  if (timer) clearInterval(timer)
})
</script>

<template>
  <div class="board">
    <div class="header-wrapper">
      <h2 class="title">
        🎬 排期
        <el-date-picker
          v-model="Show_date"
          type="date"
          value-format="YYYY-MM-DD"
          format="YYYY-MM-DD"
          :editable="false"
          :clearable="false"
          :disabled-date="disabledDate"
          placeholder="选择日期"
          style="width: 150px"
          @change="fetchData"
        />
      </h2>

      <div class="tab-switch">
        <button
          class="tab-btn"
          :class="{ active: activeTab === 'valid' }"
          @click="activeTab = 'valid'"
        >
          有效场次
        </button>
        <button
          class="tab-btn"
          :class="{ active: activeTab === 'finished' }"
          @click="activeTab = 'finished'"
        >
          已完成场次
        </button>
      </div>
    </div>

    <div class="custom-table-container">
      <div class="table-header">
        <div class="table-cell w-180">影片</div>
        <div class="table-cell w-100">厅号</div>
        <div class="table-cell w-120">状态</div>
        <div class="table-cell w-120">开始</div>
        <div class="table-cell w-220">进度</div>
        <div class="table-cell w-120">结束</div>
        <div class="table-cell w-120">开灯时间</div>
      </div>

      <div class="table-body scrollable">
        <template v-for="(row, index) in displayList" :key="index">
          <!-- 次日锚点 -->
          <div v-if="row.__type === 'anchor'" class="day-anchor">
            ----------------- 次日 -----------------
          </div>

          <!-- 正常排期行 -->
          <div v-else class="table-row">
            <div class="table-cell w-180">{{ row.movie_name }}</div>
            <div class="table-cell w-100">{{ row.hall_name }}号厅</div>
            <div class="table-cell w-120">{{ getStatus(row) }}</div>

            <div class="table-cell w-120">{{ fmt(getTimes(row)?.start) }}</div>

            <div class="table-cell w-220">
              <div class="progress-container">
                <div class="progress-bar" :style="{ width: `${getProgress(row)}%` }" />
                <span class="progress-text">{{ getProgress(row) }}%</span>
              </div>
            </div>
            <div class="table-cell w-120">{{ fmt(getTimes(row)?.end) }}</div>
            <div class="table-cell w-120">{{ fmt(getTimes(row)?.light) }}</div>
          </div>
        </template>

        <div v-if="!displayList.length" class="empty-tip">暂无数据</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.board {
  padding: 20px;
  /* background: #121212; */
  min-height: 100vh;
  color: #e0e0e0;
}

/* 次日锚点样式 */
.day-anchor {
  text-align: center;
  color: #94a3b8;
  font-size: 13px;
  padding: 12px 0;
  letter-spacing: 1px;
  border-top: 1px dashed #374151;
  border-bottom: 1px dashed #374151;
  /* background: #0f172a; */
  margin: 6px 0;
}

/* 全局深色布局 */
.board {
  padding: 20px;
  /* background: #121212; */
  min-height: calc(100vh - 40px);
  color: #e0e0e0;
}

/* 头部容器（标题+切换标签） */
.header-wrapper {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.title {
  font-size: 24px;
  font-weight: 600;
  color: #ffffff;
  text-shadow: 0 0 8px rgba(255, 255, 255, 0.1);
  margin: 0;
}

/* 切换标签样式 */
.tab-switch {
  display: flex;
  gap: 8px;
}

.tab-btn {
  padding: 8px 16px;
  border: none;
  border-radius: 4px;
  background: #e87d13;
  color: #ffffff;
  cursor: pointer;
  transition: all 0.2s ease;
}

.tab-btn.active {
  background: #10b981;
  color: white;
}

.tab-btn:hover:not(.active) {
  background: #3d3d3d;
}

/* 自定义表格容器 */
.custom-table-container {
  width: 100%;
  border-radius: 8px;
  overflow: hidden;
  background: #1e1e1e;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

/* 表格头部 */
.table-header {
  display: flex;
  background: #2d2d2d;
  border-bottom: 1px solid #3d3d3d;
  font-weight: 600;
  padding: 0 16px;
  position: sticky;
  top: 0;
  z-index: 10;
}

/* 表格内容（核心：添加滚动） */
.table-body {
  width: 100%;
}

/* 滚动容器：固定高度+纵向滚动 */
.scrollable {
  max-height: calc(100vh - 200px); /* 可根据页面调整高度 */
  overflow-y: auto;
  overflow-x: hidden;
}

/* 表格行 */
.table-row {
  display: flex;
  padding: 0 16px;
  border-bottom: 1px solid #3d3d3d;
  transition: background 0.2s ease;
}

.table-row:hover {
  background: #252525;
}

/* 单元格通用样式 */
.table-cell {
  padding: 16px 8px;
  display: flex;
  align-items: center;
  box-sizing: border-box;
}

/* 宽度类 */
.w-60 {
  width: 60px;
  justify-content: center;
}
.w-100 {
  width: 100px;
  justify-content: center;
}
.w-120 {
  width: 120px;
  justify-content: center;
}
.w-180 {
  width: 180px;
}
.w-220 {
  width: 220px;
}

/* 状态标签样式 */
.status-tag {
  padding: 4px 12px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
}

.status-danger {
  background: #ef4444;
  color: white;
}
.status-success {
  background: #10b981;
  color: white;
}
.status-info {
  background: #3b82f6;
  color: white;
}
.status-warning {
  background: #f59e0b;
  color: white;
}

/* 进度条样式 */
.progress-container {
  width: 100%;
  height: 12px;
  background: #3d3d3d;
  border-radius: 6px;
  position: relative;
  overflow: hidden;
}

.progress-bar {
  height: 100%;
  background: #10b981;
  transition: width 0.5s ease;
  border-radius: 6px;
}

.progress-success {
  background: #3b82f6;
}

.progress-text {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 11px;
  color: #ffffff;
  text-shadow: 0 0 2px rgba(0, 0, 0, 0.5);
}

/* 行样式 */
.row-playing {
  background: #1e293b !important;
}

.row-finished {
  color: #888888;
}

.row-error {
  background: #451a1a !important;
}

/* 文字样式 */
.text-error {
  color: #ef4444;
}

.movie-name {
  color: #ffffff;
}

/* 空数据提示 */
.empty-tip {
  padding: 40px;
  text-align: center;
  color: #888888;
  font-size: 14px;
}

/* 滚动条样式优化 */
.scrollable::-webkit-scrollbar {
  width: 8px;
}

.scrollable::-webkit-scrollbar-track {
  background: #2d2d2d;
  border-radius: 4px;
}

.scrollable::-webkit-scrollbar-thumb {
  background: #4d4d4d;
  border-radius: 4px;
}

.scrollable::-webkit-scrollbar-thumb:hover {
  background: #6d6d6d;
}
</style>
