<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import dayjs from 'dayjs'
import { ElMessage, ElMessageBox, ElDialog } from 'element-plus'
import GetDataFunc from '@/utils/API/Data'
import DataApi from '@/utils/API/Data'
import ConfigApi from '@/utils/API/System'

/* =========================
   时间系统常量
========================= */
const OPEN_MIN = 7 * 60
const CLOSE_MIN = 24 * 60 + 5 * 60 + 30
const LEFT_COL_W = 120 // 固定列宽度

/* =========================
   基础状态
========================= */
// 缩放系统
const pxPerMin = ref(1.3)
const MIN_ZOOM = 0.5
const MAX_ZOOM = 6

// 日期相关
const Show_date = ref(dayjs().format('YYYY-MM-DD'))
const disabledDate = (time) => {
  const today = dayjs().startOf('day')
  return (
    dayjs(time).isBefore(today.subtract(3, 'day'), 'day') ||
    dayjs(time).isAfter(today.add(3, 'day'), 'day')
  )
}

// 动态时间轴起始点（仅在数据加载时计算）
const timelineStartMin = ref(OPEN_MIN) // 默认7:00
const isDataLoaded = ref(false) // 标记数据是否已加载完成

// 影院配置
const emptyInterval = ref(12)
const hallList = ref([])
const currentHallId = ref('')
const movieList = ref([])

// 数据存储
const schedulesRaw = ref([])
const sourcesRaw = ref([])
const halls = ref([])
const now = ref(Date.now())
let timer = null

// 编辑相关
const selectedSchedule = ref(null)
const editDialogVisible = ref(false)
const form = ref({
  id: null,
  hallId: '',
  movieId: '',
  startTime: '',
  duration: 0,
})

// 滚动同步引用 - 纯JS写法
const fixedColRef = ref(null)
const scrollableTimelineRef = ref(null)

// 滚动同步控制 - 优化跟手性
let scrollSyncing = false // 防止循环触发
const SCROLL_DEBOUNCE = 0 // 取消防抖，立即同步（关键优化跟手性）
let scrollTimeout = null

/* =========================
   计算属性
========================= */
// 动态时间轴宽度（从起始点到5:30）
const timelineWidth = computed(() => (CLOSE_MIN - timelineStartMin.value) * pxPerMin.value)
const canvasWidth = computed(() => timelineWidth.value + LEFT_COL_W)

// 结束时间计算
const endTime = computed(() =>
  form.value.startTime
    ? bizMinToTime(toBizMin(form.value.startTime) + form.value.duration)
    : '--:--',
)

// 排期数据加工
const processedSchedules = computed(() =>
  schedulesRaw.value.map((s) => {
    const src = sourcesRaw.value.find((x) => x.movie_source_id === s.movie_source_id)
    const duration = Math.floor((src?.duration_seconds || 0) / 60)

    const startBizMin = toBizMin(s.start_time)
    const endBizMin = startBizMin + duration

    const startTs = toActualStartTs(s.show_date, s.start_time)
    const endTs = dayjs(startTs).add(duration, 'minute').valueOf()

    let status = 'invalid'
    if (now.value < startTs) status = 'pending'
    else if (now.value >= endTs) status = 'finished'
    else status = 'playing'

    return {
      id: s.id,
      hallId: Number(s.hall_name),
      hallName: `${s.hall_name}号厅`,
      movieName: s.movie_name,
      movieId: s.movie_source_id,
      startTime: s.start_time,
      duration,
      startBizMin,
      endBizMin,
      status,
    }
  }),
)

// 动态时间刻度（仅在数据加载时计算一次）
const ticks = computed(() => {
  const arr = []
  // 从动态起始点开始，每30分钟一个刻度，直到5:30
  for (let m = timelineStartMin.value; m <= CLOSE_MIN; m += 30) {
    arr.push({ min: m, label: bizMinToTime(m), major: m % 60 === 0 })
  }
  return arr
})

// 当前时间线（适配动态起始点）
const nowX = computed(() => {
  const t = dayjs()
  let min = t.hour() * 60 + t.minute()
  if (t.hour() < 6) min += 1440
  // 计算相对于动态起始点的X坐标
  return (min - timelineStartMin.value) * pxPerMin.value
})

// 缩放按钮状态
const isZoomInDisabled = computed(() => pxPerMin.value >= MAX_ZOOM)
const isZoomOutDisabled = computed(() => pxPerMin.value <= MIN_ZOOM)

/* =========================
   时间工具函数
========================= */
// 转换为业务分钟（0-5点算次日）
const toBizMin = (time) => {
  if (!/^\d{2}:\d{2}$/.test(time)) return Infinity
  let [h, m] = time.split(':').map(Number)
  if (h < 6) h += 24
  return h * 60 + m
}

// 分钟转换为时间字符串
const bizMinToTime = (min) => {
  if (!Number.isFinite(min)) return '--:--'
  const n = ((min % 1440) + 1440) % 1440
  const h = Math.floor(n / 60)
  const m = n % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

// 时间转X坐标（适配动态起始点）
const timeToX = (bizMin) => (bizMin - timelineStartMin.value) * pxPerMin.value

// 实际时间戳计算
const toActualStartTs = (date, time) => {
  const [h] = time.split(':').map(Number)
  let d = date
  if (h < 6) d = dayjs(date).add(1, 'day').format('YYYY-MM-DD')
  return dayjs(`${d} ${time}`).valueOf()
}

// 计算时间轴起始点（仅在数据加载时调用）
const calculateTimelineStart = () => {
  // 数据加载完成后不再重新计算
  if (isDataLoaded.value) return

  // 获取所有排期的开始分钟
  const allStartMins = processedSchedules.value
    .map((s) => s.startBizMin)
    .filter((min) => Number.isFinite(min))

  if (allStartMins.length === 0) {
    // 无排期时默认7:00
    timelineStartMin.value = OPEN_MIN
    return
  }

  // 找到最早的排期开始时间
  const earliestMin = Math.min(...allStartMins)
  // 最早排期-30分钟作为起始点，不早于7:00
  const calculatedStart = Math.max(OPEN_MIN, earliestMin - 30)

  // 调整到最近的30分钟整点（保证刻度对齐）
  const roundedStart = Math.floor(calculatedStart / 30) * 30

  timelineStartMin.value = roundedStart

  // 只在首次加载时滚动到起始位置
  nextTick(() => {
    if (scrollableTimelineRef.value) {
      scrollableTimelineRef.value.scrollTo({
        left: 0,
        behavior: 'auto',
      })
    }
  })
}

// 检查开始时间是否在营业范围内
const isStartTimeAllowed = (time) => {
  const m = toBizMin(time)
  if (!Number.isFinite(m)) return false
  return m >= OPEN_MIN && m <= CLOSE_MIN
}

// 检查日期是否可编辑
const canEditSchedule = (dateStr) => {
  const today = dayjs().startOf('day')
  const d = dayjs(dateStr).startOf('day')
  return !d.isBefore(today) && !d.isAfter(today.add(3, 'day'))
}

// 冲突校验
const hasConflict = () => {
  if (!form.value.startTime || !form.value.hallId) return false

  const start = toBizMin(form.value.startTime)
  const end = start + form.value.duration

  return processedSchedules.value.some((s) => {
    if (form.value.id && s.id === form.value.id) return false
    if (s.hallId !== Number(form.value.hallId)) return false
    return Math.max(start, s.startBizMin) < Math.min(end, s.endBizMin)
  })
}

/* =========================
   缩放控制函数
========================= */
// 放大
const zoomIn = () => {
  if (pxPerMin.value >= MAX_ZOOM) return
  pxPerMin.value = Math.min(MAX_ZOOM, pxPerMin.value + 0.25)
}

// 缩小
const zoomOut = () => {
  if (pxPerMin.value <= MIN_ZOOM) return
  pxPerMin.value = Math.max(MIN_ZOOM, pxPerMin.value - 0.25)
}

// 重置缩放
const resetZoom = () => {
  pxPerMin.value = 1.3
}

/* =========================
   滚轮缩放
========================= */
const onWheel = (e) => {
  if (!e.ctrlKey) return
  e.preventDefault()
  e.stopPropagation()

  const delta = e.deltaY > 0 ? -0.25 : 0.25
  pxPerMin.value = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, pxPerMin.value + delta))
}

/* =========================
   滚动同步函数（核心优化跟手性）
========================= */
// 立即同步滚动（取消防抖，提升跟手性）
const immediateScrollSync = (source, target) => {
  if (scrollSyncing) return
  scrollSyncing = true

  // 立即同步，不使用setTimeout
  try {
    // 关键优化：使用scrollTo而非直接赋值，更平滑
    target.scrollTo({
      top: source.scrollTop,
      left: target.scrollLeft,
      behavior: 'auto', // 立即滚动，无延迟
    })

    // 双重校验，确保同步到位
    if (Math.abs(target.scrollTop - source.scrollTop) > 1) {
      target.scrollTop = source.scrollTop
    }
  } finally {
    scrollSyncing = false
  }
}

// 初始化滚动同步
const initScrollSync = () => {
  const fixedCol = fixedColRef.value
  const timeline = scrollableTimelineRef.value

  if (!fixedCol || !timeline) return

  // 移除旧的事件监听
  fixedCol.removeEventListener('scroll', handleFixedColScroll)
  timeline.removeEventListener('scroll', handleTimelineScroll)

  // 绑定滚动事件（使用passive: true提升性能）
  fixedCol.addEventListener('scroll', handleFixedColScroll, { passive: true })
  timeline.addEventListener('scroll', handleTimelineScroll, { passive: true })

  // 初始同步
  syncScrollPositions()
}

// 左侧固定列滚动事件处理
const handleFixedColScroll = () => {
  const fixedCol = fixedColRef.value
  const timeline = scrollableTimelineRef.value

  if (fixedCol && timeline) {
    immediateScrollSync(fixedCol, timeline)
  }
}

// 右侧时间轴滚动事件处理
const handleTimelineScroll = () => {
  const fixedCol = fixedColRef.value
  const timeline = scrollableTimelineRef.value

  if (fixedCol && timeline) {
    immediateScrollSync(timeline, fixedCol)
  }
}

// 强制同步滚动位置
const syncScrollPositions = () => {
  const fixedCol = fixedColRef.value
  const timeline = scrollableTimelineRef.value

  if (fixedCol && timeline) {
    // 以左侧列为基准强制同步
    timeline.scrollTop = fixedCol.scrollTop
    fixedCol.scrollTop = timeline.scrollTop

    // 额外优化：同步滚动的滚动行为
    timeline.scrollBehavior = 'auto'
    fixedCol.scrollBehavior = 'auto'
  }
}

/* =========================
   核心功能方法
========================= */
// 获取推荐的下一个开始时间
const calcNextStartTime = () => {
  const hallId = Number(currentHallId.value.replace('hall_', ''))
  const list = processedSchedules.value.filter((i) => i.hallId === hallId)

  if (!list.length) return '10:00'

  const last = [...list].sort((a, b) => a.startBizMin - b.startBizMin).at(-1)

  if (!last) return '10:00'
  return bizMinToTime(last.endBizMin + Number(emptyInterval.value || 0))
}

// 刷新数据
const fetchData = async () => {
  try {
    isDataLoaded.value = false

    // 获取排期列表
    const s = await GetDataFunc.GetMoviesList('all', Show_date.value)
    schedulesRaw.value = s?.data?.data || []

    // 获取影片列表
    const m = await GetDataFunc.GetMoviesInfo('get')
    sourcesRaw.value = m?.data?.data || []
    movieList.value = m?.data?.data || []

    // 处理影厅列表
    halls.value = [...new Set(schedulesRaw.value.map((s) => Number(s.hall_name)))]
      .sort((a, b) => a - b)
      .map((id) => ({ id, name: `${id}号厅` }))

    // 计算时间轴起始点
    calculateTimelineStart()

    // 数据加载后同步滚动
    nextTick(() => {
      syncScrollPositions()
    })

    isDataLoaded.value = true
    ElMessage.success('数据刷新成功')
  } catch (e) {
    console.error('获取数据失败', e)
    ElMessage.error('数据加载失败')
    timelineStartMin.value = OPEN_MIN
    isDataLoaded.value = true
  }
}

// 选择排期（编辑）
const selectSchedule = (s) => {
  selectedSchedule.value = s
  form.value = {
    id: s.id,
    hallId: s.hallId,
    movieId: s.movieId,
    startTime: s.startTime,
    duration: s.duration,
  }
  editDialogVisible.value = true
}

// 新增排期
const handleAddSchedule = async () => {
  if (!form.value.movieId) return ElMessage.warning('请选择影片')
  if (!form.value.startTime) return ElMessage.warning('请选择开始时间')
  if (!form.value.hallId) return ElMessage.warning('请选择影厅')

  if (!canEditSchedule(Show_date.value)) {
    return ElMessage.error('当前日期不允许排期')
  }

  if (!isStartTimeAllowed(form.value.startTime)) {
    return ElMessage.error('开场时间超出营业范围（07:00 ~ 次日 05:30）')
  }

  if (hasConflict()) {
    return ElMessage.error('排期时间冲突，请调整时间')
  }

  try {
    const movie = movieList.value.find((m) => m.movie_source_id === form.value.movieId)
    if (!movie) return ElMessage.error('影片信息不存在')

    const hall = hallList.value.find((h) => h.id === form.value.hallId)
    if (!hall) return ElMessage.error('影厅信息不存在')

    await DataApi.AddMovies(movie.movie_name, hall.val, form.value.startTime, Show_date.value)

    editDialogVisible.value = false
    await fetchData()
    resetForm()
  } catch (e) {
    console.error('添加排期失败', e)
    ElMessage.error('添加排期失败')
  }
}

// 保存修改
const saveEdit = async () => {
  if (!form.value.startTime) return ElMessage.error('请选择时间')
  if (!canEditSchedule(Show_date.value)) {
    return ElMessage.error('当前日期不允许编辑')
  }

  if (!isStartTimeAllowed(form.value.startTime)) {
    return ElMessage.error('开场时间超出营业范围（07:00 ~ 次日 05:30）')
  }

  if (hasConflict()) {
    return ElMessage.error('排期时间冲突，请调整时间')
  }

  try {
    const movie = movieList.value.find((m) => m.movie_source_id === form.value.movieId)
    if (!movie) return ElMessage.error('影片不存在')

    await DataApi.CagMovies(
      form.value.id,
      JSON.stringify({
        movie_name: movie.movie_name,
        start_time: form.value.startTime,
      }),
    )

    ElMessage.success('排期修改成功')
    await fetchData()
    editDialogVisible.value = false
  } catch (e) {
    console.error('修改排期失败', e)
    ElMessage.error('修改排期失败')
  }
}

// 删除排期
const handleDelete = async () => {
  if (!form.value.id) return

  try {
    await ElMessageBox.confirm('确定删除该排期吗？', '删除确认', {
      type: 'warning',
      customClass: 'dark-message-box',
    })

    await DataApi.CagMovies(form.value.id, JSON.stringify({ deleted_at: 1 }))

    ElMessage.success('排期删除成功')
    await fetchData()
    editDialogVisible.value = false
  } catch (e) {
    // 用户取消删除
  }
}

// 重置表单
const resetForm = () => {
  selectedSchedule.value = null
  form.value = {
    id: null,
    hallId: currentHallId.value || '',
    movieId: '',
    startTime: calcNextStartTime(),
    duration: 0,
  }
}

// 打开新增排期弹窗
const openAddDialog = () => {
  resetForm()
  editDialogVisible.value = true
}

/* =========================
   生命周期
========================= */
onMounted(async () => {
  // 获取影厅配置
  try {
    const hallNum = Number(
      (await ConfigApi.getSystemValue('hall_num'))?.data?.data?.setting_value || 1,
    )

    hallList.value = Array.from({ length: hallNum }, (_, i) => ({
      id: `hall_${i + 1}`,
      name: `${i + 1}号厅`,
      val: i + 1,
    }))

    currentHallId.value = hallList.value[0].id
  } catch (e) {
    console.error('获取影厅配置失败', e)
  }

  // 加载数据
  await fetchData()

  // 定时器更新当前时间
  timer = setInterval(() => (now.value = Date.now()), 1000)

  // 绑定滚动和缩放事件
  await nextTick()
  if (scrollableTimelineRef.value && fixedColRef.value) {
    // 绑定滚轮缩放
    scrollableTimelineRef.value.addEventListener('wheel', onWheel, {
      passive: false,
      capture: true,
    })

    // 初始化滚动同步
    initScrollSync()
  }

  // 初始化表单
  resetForm()
})

onUnmounted(() => {
  // 清理定时器
  if (timer) clearInterval(timer)

  // 清理滚动防抖定时器
  if (scrollTimeout) clearTimeout(scrollTimeout)

  // 移除事件监听
  if (scrollableTimelineRef.value && fixedColRef.value) {
    scrollableTimelineRef.value.removeEventListener('wheel', onWheel)

    // 移除滚动同步监听
    fixedColRef.value.removeEventListener('scroll', handleFixedColScroll)
    scrollableTimelineRef.value.removeEventListener('scroll', handleTimelineScroll)
  }
})

// 监听影厅切换
watch(currentHallId, () => {
  form.value.hallId = currentHallId.value
  form.value.startTime = calcNextStartTime()
})

// 监听日期切换（重新加载数据）
watch(Show_date, fetchData)

// 监听缩放变化，同步滚动位置
watch(pxPerMin, () => {
  nextTick(() => {
    syncScrollPositions()
  })
})
</script>

<template>
  <div class="board">
    <!-- Header -->
    <div class="top-toolbar glass">
      <div class="title-container">
        <div class="title">🎬 影院排期系统</div>
        <div class="zoom-controls">
          <el-button
            size="small"
            circle
            @click="zoomOut"
            :disabled="isZoomOutDisabled"
            class="zoom-btn"
          >
            缩小
          </el-button>
          <span class="zoom-value">{{ pxPerMin.toFixed(1) }} px/min</span>
          <el-button
            size="small"
            circle
            @click="zoomIn"
            :disabled="isZoomInDisabled"
            class="zoom-btn"
          >
            放大
          </el-button>
          <el-button size="small" circle @click="resetZoom" class="zoom-btn reset-zoom-btn">
            恢复
          </el-button>
        </div>
      </div>
      <div class="tools">
        <el-select
          v-model="currentHallId"
          size="default"
          class="hall-select"
          style="width: 120px; margin-right: 10px"
        >
          <el-option v-for="h in hallList" :key="h.id" :label="h.name" :value="h.id" />
        </el-select>

        <el-date-picker
          v-model="Show_date"
          type="date"
          value-format="YYYY-MM-DD"
          :disabled-date="disabledDate"
          style="width: 160px; margin-right: 10px"
        />

        <el-button type="primary" size="default" @click="openAddDialog" style="margin-right: 10px">
          添加排期
        </el-button>

        <el-button type="default" size="default" @click="fetchData"> 刷新 </el-button>
      </div>
    </div>

    <div class="layout">
      <!-- Timeline -->
      <div class="timeline-container glass">
        <!-- 固定的影厅标题列 -->
        <div ref="fixedColRef" class="fixed-col">
          <!-- 时间刻度占位行 -->
          <div class="fixed-time-header"></div>

          <!-- 影厅标题列表 -->
          <div v-for="h in halls" :key="h.id" class="fixed-lane-title">
            {{ h.name }}
          </div>
        </div>

        <!-- 可滚动的时间轴区域 -->
        <div
          ref="scrollableTimelineRef"
          class="scrollable-timeline"
          style="will-change: scroll-position"
        >
          <div class="timeline-canvas" :style="{ width: canvasWidth + 'px' }">
            <!-- 时间刻度头部 -->
            <div class="time-header">
              <div
                v-for="t in ticks"
                :key="t.min"
                class="tick"
                :class="{ major: t.major }"
                :style="{ left: timeToX(t.min) + 'px' }"
              >
                {{ t.label }}
              </div>
              <div class="now-line" :style="{ left: nowX + 'px' }" />
            </div>

            <!-- 影厅排期行 -->
            <div v-for="h in halls" :key="h.id" class="lane">
              <div class="lane-body" :style="{ width: timelineWidth + 'px' }">
                <div
                  v-for="s in processedSchedules.filter((i) => i.hallId === h.id)"
                  :key="s.id"
                  class="schedule-block"
                  :class="s.status"
                  :style="{
                    left: timeToX(s.startBizMin) + 'px',
                    width: (s.endBizMin - s.startBizMin) * pxPerMin + 'px',
                  }"
                  @click="selectSchedule(s)"
                >
                  <div class="movie-title">{{ s.movieName }}</div>
                  <div v-if="(s.endBizMin - s.startBizMin) * pxPerMin > 90" class="time-range">
                    {{ s.startTime }} - {{ bizMinToTime(s.endBizMin) }}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 编辑/新增弹窗 -->
      <el-dialog
        v-model="editDialogVisible"
        :title="form.id ? '编辑排期' : '新增排期'"
        width="90%"
        max-width="500px"
        :close-on-click-modal="false"
        class="edit-dialog"
        center
      >
        <div class="edit-dialog-content">
          <el-form :model="form" label-width="80px" class="edit-form">
            <el-form-item label="影厅" class="dark-form-item">
              <el-select
                v-model="form.hallId"
                placeholder="请选择影厅"
                style="width: 100%"
                disabled
                class="dark-select"
              >
                <el-option v-for="h in hallList" :key="h.id" :label="h.name" :value="h.id" />
              </el-select>
            </el-form-item>

            <el-form-item label="影片" class="dark-form-item">
              <el-select
                v-model="form.movieId"
                placeholder="请选择影片"
                style="width: 100%"
                class="dark-select"
                @change="
                  (val) => {
                    const movie = movieList.find((m) => m.movie_source_id === val)
                    if (movie) form.duration = Math.floor(movie.duration_seconds / 60)
                  }
                "
              >
                <el-option
                  v-for="m in movieList"
                  :key="m.movie_source_id"
                  :label="`${m.movie_name}（${Math.floor(m.duration_seconds / 60)}分钟）`"
                  :value="m.movie_source_id"
                  class="dark-option"
                />
              </el-select>
            </el-form-item>

            <el-form-item label="开始时间" class="dark-form-item">
              <el-time-picker
                v-model="form.startTime"
                format="HH:mm"
                value-format="HH:mm"
                style="width: 100%"
                :placeholder="calcNextStartTime()"
                @change="(val) => val || (form.startTime = calcNextStartTime())"
                class="dark-time-picker"
              />
              <div style="font-size: 12px; color: #999; margin-top: 5px">
                营业范围：07:00 ~ 次日 05:30
              </div>
            </el-form-item>

            <el-form-item label="结束时间" class="dark-form-item">
              <div class="form-control-static">{{ endTime }}</div>
            </el-form-item>

            <el-form-item v-if="form.id" class="delete-btn-item">
              <el-button @click="handleDelete" type="danger" size="large" class="delete-btn">
                🗑️ 删除此排期
              </el-button>
              <div class="delete-tip">删除后数据将无法恢复，请谨慎操作！</div>
            </el-form-item>
          </el-form>
        </div>

        <template #footer>
          <div class="dialog-footer">
            <el-button @click="editDialogVisible = false" size="large" class="cancel-btn">
              取消
            </el-button>
            <el-button
              @click="form.id ? saveEdit() : handleAddSchedule()"
              type="primary"
              size="large"
              class="save-btn"
              :disabled="!form.movieId || !form.startTime"
            >
              {{ form.id ? '保存修改' : '添加排期' }}
            </el-button>
          </div>
        </template>
      </el-dialog>
    </div>
  </div>
</template>

<style scoped>
/* ================== 全局样式 ================== */
.board {
  height: 100vh;
  padding: 20px;
  background:
    radial-gradient(circle at top, #0f172a, #020617 70%), linear-gradient(180deg, #020617, #020617);
  color: #e5e7eb;
  font-family: Inter, system-ui, sans-serif;
  overflow: hidden;
  will-change: auto;
  backface-visibility: hidden;
}

.glass {
  background: rgba(15, 23, 42, 0.75);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(148, 163, 184, 0.15);
  border-radius: 12px;
  transform: translateZ(0);
}

/* ================== Header ================== */
.top-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 20px;
  margin-bottom: 16px;
}

.title-container {
  display: flex;
  align-items: center;
  gap: 15px;
}

.title {
  font-size: 18px;
  font-weight: 700;
  letter-spacing: 0.5px;
}

.zoom-controls {
  display: flex;
  align-items: center;
  gap: 8px;
}

.zoom-btn {
  width: 50px;
  height: 50px;
  background: rgba(37, 99, 235, 0.2);
  border: 1px solid rgba(59, 130, 246, 0.3);
  color: #e5e7eb;
  transition: all 0.2s ease;
}
.zoom-btn:hover:not(:disabled) {
  background: rgba(37, 99, 235, 0.4);
  border-color: rgba(59, 130, 246, 0.5);
}

.zoom-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.reset-zoom-btn {
  background: rgba(20, 184, 166, 0.2);
  border-color: rgba(13, 148, 136, 0.3);
}

.reset-zoom-btn:hover {
  background: rgba(20, 184, 166, 0.4);
  border-color: rgba(13, 148, 136, 0.5);
}

.zoom-value {
  font-size: 12px;
  color: #94a3b8;
  min-width: 60px;
  text-align: center;
}

.tools {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* ================== 布局 ================== */
.layout {
  display: flex;
  gap: 20px;
  height: calc(100% - 70px);
}

.timeline-container {
  display: flex;
  width: 100%;
  height: 100%;
  overflow: hidden;
  contain: layout paint;
}

/* 固定列 - 优化滚动性能 */
.fixed-col {
  width: 120px;
  flex-shrink: 0;
  border-right: 1px solid rgba(148, 163, 184, 0.15);
  height: 85%;
  overflow-y: auto;
  overflow-x: hidden;
  scrollbar-width: none;
  transform: translateZ(0);
  will-change: scroll-position;
  scroll-behavior: auto !important;
  /* 关键优化：硬件加速 */
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
}

.fixed-col::-webkit-scrollbar {
  display: none;
}

.fixed-time-header {
  height: 60px;
  background: linear-gradient(180deg, rgba(15, 23, 42, 0.9), rgba(15, 23, 42, 0.6));
  border-bottom: 1px solid rgba(148, 163, 184, 0.15);
  width: 100%;
}

.fixed-lane-title {
  height: 80px;
  padding: 12px;
  background: linear-gradient(90deg, rgba(2, 6, 23, 0.9), transparent);
  font-weight: 600;
  border-bottom: 1px dashed rgba(148, 163, 184, 0.15);
  display: flex;
  align-items: center;
  box-sizing: border-box;
  width: 100%;
}

/* 滚动区域 - 核心优化跟手性 */
.scrollable-timeline {
  flex: 1;
  overflow: auto;
  height: 85%;
  scrollbar-width: thin;
  scrollbar-color: #3b82f6 #1e293b;
  transform: translateZ(0);
  will-change: scroll-position;
  contain: layout paint;
  backface-visibility: hidden;
  perspective: 1000px;
  scroll-behavior: auto !important;
  /* 关键优化：提升滚动跟手性 */
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
  scroll-snap-type: y proximity;
}

.scrollable-timeline::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

.scrollable-timeline::-webkit-scrollbar-track {
  background: #1e293b;
  border-radius: 4px;
}

.scrollable-timeline::-webkit-scrollbar-thumb {
  background: #3b82f6;
  border-radius: 4px;
}

.scrollable-timeline::-webkit-scrollbar-thumb:hover {
  background: #60a5fa;
}

/* ================== Timeline ================== */
.timeline-canvas {
  position: relative;
  min-height: 100%;
  transform: translateZ(0);
}

.time-header {
  position: sticky;
  top: 0;
  left: 0;
  height: 60px;
  background: linear-gradient(180deg, rgba(15, 23, 42, 0.9), rgba(15, 23, 42, 0.6));
  z-index: 10;
  border-bottom: 1px solid rgba(148, 163, 184, 0.15);
  width: 100%;
  transform: translateZ(0);
}

.tick {
  position: absolute;
  top: 34px;
  font-size: 11px;
  opacity: 0.6;
  transform: translateX(-50%);
}

.tick.major {
  opacity: 1;
  font-weight: 600;
}

.now-line {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  background: linear-gradient(180deg, #22c55e, transparent);
  transform: translateX(-50%);
  box-shadow: 0 0 8px rgba(34, 197, 94, 0.4);
  z-index: 11;
}

/* ================== 泳道 ================== */
.lane {
  display: flex;
  height: 80px;
  border-bottom: 1px dashed rgba(148, 163, 184, 0.15);
  width: 100%;
  transform: translateZ(0);
}

.lane-body {
  position: relative;
  width: 100%;
  height: 100%;
}

/* ================== 排期块 ================== */
.schedule-block {
  position: absolute;
  top: 10px;
  height: 60px;
  padding: 8px 10px;
  border-radius: 10px;
  background: linear-gradient(135deg, #2563eb, #1e40af);
  box-shadow:
    0 0 0 1px rgba(255, 255, 255, 0.08) inset,
    0 10px 30px rgba(30, 64, 175, 0.25);
  cursor: pointer;
  transition: all 0.2s ease;
  min-width: 80px;
  box-sizing: border-box;
  transform: translateZ(0);
  backface-visibility: hidden;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.schedule-block.playing {
  background: linear-gradient(135deg, #22c55e, #15803d);
}

.schedule-block.finished {
  opacity: 0.5;
}

.schedule-block:hover {
  transform: translateY(-2px) translateZ(0);
  box-shadow: 0 15px 40px rgba(59, 130, 246, 0.4);
}

.movie-title {
  font-size: 14px;
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-bottom: 4px;
  line-height: 1.4;
}

.time-range {
  font-size: 12px;
  opacity: 0.9;
  line-height: 1.3;
}

/* ================== 弹窗样式 ================== */
:deep(.edit-dialog) {
  --el-dialog-bg-color: #111827;
  --el-dialog-title-color: #e5e7eb;
  --el-dialog-header-text-align: center;
  width: 80% !important;
  max-width: 400px !important;
  border-radius: 12px;
}

:deep(.edit-dialog .el-dialog__header) {
  border-bottom: 1px solid #273449;
  padding: 12px 15px !important;
  margin: 0;
}

:deep(.edit-dialog .el-dialog__title) {
  font-size: 18px;
  font-weight: 600;
}

.edit-dialog-content {
  padding: 15px !important;
}

.edit-form {
  padding: 8px 0;
}

:deep(.edit-form .el-form-item) {
  margin-bottom: 20px;
}

:deep(.edit-form .el-form-item__label) {
  color: #94a3b8;
  font-size: 16px;
}

.dark-form-item {
  --el-form-item-label-color: #cbd5e1;
}

.dark-select {
  --el-input-bg-color: #1f2937;
  --el-input-border-color: #475569;
  --el-input-text-color: #e5e7eb;
  --el-select-dropdown-bg-color: #1e293b;
  --el-select-dropdown-text-color: #e5e7eb;
  --el-select-dropdown-border-color: #475569;
}

.dark-option {
  --el-select-item-text-color: #e5e7eb;
  --el-select-item-hover-bg-color: #334155;
  --el-select-item-current-bg-color: #2563eb;
}

.dark-time-picker {
  --el-input-bg-color: #1f2937;
  --el-input-border-color: #475569;
  --el-input-text-color: #e5e7eb;
  --el-picker-panel-bg-color: #1e293b;
  --el-picker-panel-border-color: #475569;
  --el-text-color-primary: #e5e7eb;
}

:deep(.edit-form .el-select .el-input__wrapper),
:deep(.edit-form .el-time-editor .el-input__wrapper) {
  background-color: #1f2937 !important;
  border-radius: 10px !important;
  border: none !important;
  height: 48px !important;
  padding: 0 15px !important;
}

:deep(.edit-form .el-input__inner) {
  font-size: 16px !important;
  line-height: 48px !important;
}

.delete-btn-item {
  margin-top: 4px !important;
}

.delete-btn {
  background: linear-gradient(135deg, #ef4444, #f87171) !important;
  border: none !important;
  border-radius: 10px !important;
  font-size: 14px !important;
  font-weight: 600 !important;
}

.delete-tip {
  text-align: center;
  font-size: 14px;
  color: #fca5a5;
  margin-top: 8px;
}

:deep(.dialog-footer) {
  display: flex;
  gap: 10px;
  justify-content: center;
  padding: 12px 15px !important;
  border-top: 1px solid #273449;
  margin: 0;
}

.cancel-btn,
.save-btn {
  border-radius: 10px !important;
  font-size: 14px !important;
  font-weight: 600 !important;
}

.save-btn {
  background: linear-gradient(135deg, #2563eb, #3b82f6) !important;
  border: none !important;
}

:deep(.dark-message-box) {
  --el-message-box-bg-color: #111827;
  --el-message-box-title-color: #e5e7eb;
  --el-message-box-content-color: #cbd5e1;
  --el-message-box-border-color: rgba(148, 163, 184, 0.15);
}

:deep(.el-select__selected-item, .el-select__placeholder),
:deep(.el-date-editor .el-input__wrapper) {
  color: #1f2937 !important;
}

* {
  user-select: none;
  -webkit-user-select: none;
}

.schedule-block {
  user-select: text;
  -webkit-user-select: text;
}

/* 适配小屏 */
@media screen and (max-width: 768px) {
  .title-container {
    flex-direction: column;
    gap: 8px;
    align-items: flex-start;
  }

  .zoom-controls {
    gap: 5px;
  }

  :deep(.edit-dialog) {
    width: 90% !important;
    max-width: 350px !important;
  }

  .delete-btn {
    height: 44px !important;
    font-size: 13px !important;
  }

  .cancel-btn,
  .save-btn {
    padding: 8px 16px !important;
    min-width: 100px !important;
    height: 44px !important;
    font-size: 13px !important;
  }
}

@media screen and (max-width: 375px) {
  .top-toolbar {
    flex-direction: column;
    gap: 10px;
    align-items: stretch;
  }

  .tools {
    flex-wrap: wrap;
    justify-content: center;
  }

  :deep(.edit-dialog) {
    width: 95% !important;
    max-width: 320px !important;
  }
}
</style>
