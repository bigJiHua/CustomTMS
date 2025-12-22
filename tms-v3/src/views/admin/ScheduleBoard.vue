<script setup>
import { ref, onMounted, onUnmounted, computed, watch } from 'vue'
import dayjs from 'dayjs'
import GetDataFunc from '@/utils/API/Data'

/* ================== 核心：影院业务日工具函数 ================== */
/**
 * 将 "HH:MM:SS" 或 "HH:MM" 转成「影院业务分钟」
 * 规则：当日06:00 ~ 次日03:00 属于今日业务日
 * @param time 时间字符串 HH:MM 或 HH:MM:SS
 * @param baseDate 基准自然日期（YYYY-MM-DD）
 * @returns 业务分钟数（06:00=360, 23:59=1439, 00:00=1440, 03:00=1620）
 */
const toBusinessMinutes = (time, baseDate) => {
  if (!time || !baseDate) return Infinity
  // 兼容 HH:MM 和 HH:MM:SS 格式
  const timeParts = time.split(':').map(Number)
  const h = timeParts[0] || 0
  const m = timeParts[1] || 0

  // 基础时间：基准日期的 06:00
  const baseTime = dayjs(`${baseDate} 06:00:00`).valueOf()
  // 当前时间：基准日期的 HH:MM
  let currentTime = dayjs(
    `${baseDate} ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`,
  ).valueOf()

  // 如果是 00:00~05:59，视为基准日期的次日
  if (h < 6) {
    currentTime = dayjs(currentTime).add(1, 'day').valueOf()
  }

  // 计算与 06:00 的差值（分钟）
  const diffMinutes = Math.floor((currentTime - baseTime) / 60000)
  return diffMinutes
}

/**
 * 业务分钟数转回时间字符串（带日期标识）
 * @param minutes 业务分钟数
 * @param baseDate 基准自然日期
 * @returns { time: string, isNextDay: boolean } 时间字符串 + 是否是次日
 */
const businessMinutesToTime = (minutes, baseDate) => {
  if (minutes === Infinity) return { time: '--:--', isNextDay: false }

  // 基准时间：基准日期的 06:00
  const baseTime = dayjs(`${baseDate} 06:00:00`)
  // 计算实际时间
  const actualTime = baseTime.add(minutes, 'minute')
  // 判断是否是次日
  const isNextDay = actualTime.format('YYYY-MM-DD') !== baseDate
  // 只返回 HH:MM 或 HH:MM:SS
  const time = actualTime.format('HH:mm:ss')

  return { time, isNextDay }
}

/**
 * 判断时间是否属于今日业务日
 * @param time 时间字符串 HH:MM 或 HH:MM:SS
 * @param baseDate 基准自然日期
 * @returns boolean
 */
const isInTodayBusinessDay = (time, baseDate) => {
  const minutes = toBusinessMinutes(time, baseDate)
  // 今日业务日范围：06:00(360) ~ 次日03:00(1620)
  return minutes >= 360 && minutes <= 1620
}

/* ================== 状态 ================== */
const list = ref([])
const movieSources = ref([])
const now = ref(Date.now())
let timer = null

const activeTab = ref('valid')
const hallExpandStates = ref({})

// 日期限制：今天 ±3 天
const Show_date = ref(dayjs().format('YYYY-MM-DD'))

// 新增：影厅区域选择状态（从localStorage读取）
const currentHallArea = ref(localStorage.getItem('cinema_hall_area') || 'all')

const disabledDate = (time) => {
  const today = dayjs().startOf('day')
  const min = today.subtract(3, 'day')
  const max = today.add(3, 'day')
  return dayjs(time).isBefore(min, 'day') || dayjs(time).isAfter(max, 'day')
}

// 核心：判断选中日期与今天的关系
const isSelectedDatePast = computed(() => {
  const selectedDate = dayjs(Show_date.value).startOf('day')
  const today = dayjs().startOf('day')
  return selectedDate.isBefore(today)
})

// 监听日期变化，自动切换tab
watch(
  isSelectedDatePast,
  () => {
    activeTab.value = isSelectedDatePast.value ? 'finished' : 'valid'
  },
  { immediate: true },
)

// 新增：监听影厅区域变化，存入localStorage
watch(
  currentHallArea,
  (val) => {
    localStorage.setItem('cinema_hall_area', val)
  },
  { immediate: true },
)

/* ================== 工具函数：判断影厅所属区域 ================== */
// 新增：判断影厅属于哪个区域
const getHallArea = (hallName) => {
  const hallNum = Number(hallName)
  if (Number.isNaN(hallNum)) return 'all'
  if (hallNum >= 1 && hallNum <= 6) return 'area1'
  if (hallNum >= 7 && hallNum <= 11) return 'area2'
  return 'all'
}

// 新增：过滤符合当前选择区域的影厅
const filterHallByArea = (hallName) => {
  if (currentHallArea.value === 'all') return true
  return getHallArea(hallName) === currentHallArea.value
}

/* ================== 数据分组：按影厅分组（适配业务日） ================== */
const hallGroups = computed(() => {
  // 筛选逻辑修改：
  // 1. 过去日期：不筛选，全部显示为已完成（但保留分组结构）
  // 2. 今日/未来日期：保留原有有效场次筛选逻辑
  let validSchedules = list.value
  if (!isSelectedDatePast.value) {
    validSchedules = list.value.filter((r) => {
      const status = getStatus(r)
      // 只保留未开始和播放中的场次
      return status === '未开始' || status === '播放中'
    })
  }

  const groupMap = {}
  validSchedules.forEach((schedule) => {
    // 新增：过滤当前选择区域的影厅
    if (!filterHallByArea(schedule.hall_name)) return

    if (!groupMap[schedule.hall_name]) {
      groupMap[schedule.hall_name] = []
    }
    groupMap[schedule.hall_name].push(schedule)
  })

  // 按业务日分钟数排序
  Object.keys(groupMap).forEach((hallName) => {
    groupMap[hallName].sort((a, b) => a.business_start_time - b.business_start_time)
  })

  const groups = Object.keys(groupMap).map((hallName) => {
    const sortedSchedules = groupMap[hallName]
    // 过去日期：默认第一个为当前场次（已完成）
    // 今日/未来日期：保留原有逻辑
    let currentSchedule = null
    if (isSelectedDatePast.value) {
      currentSchedule = sortedSchedules[0] || null
    } else {
      // 优先选播放中的场次作为当前场次
      const playingSchedule = sortedSchedules.find((s) => getStatus(s) === '播放中')
      // 没有播放中的则选第一个未开始的
      currentSchedule = playingSchedule || sortedSchedules[0] || null
    }

    const remainingSchedules = sortedSchedules.filter((s) => {
      if (!currentSchedule) return false
      return s.id !== currentSchedule.id
    })

    return {
      hallName,
      currentSchedule,
      remainingSchedules,
    }
  })

  // 按厅号排序
  return groups.sort((a, b) => Number(a.hallName) - Number(b.hallName))
})

// 已完成场次列表（适配业务日）
const finishedSchedules = computed(() => {
  // 过去日期：返回所有场次（全部视为已完成）
  let filtered = list.value
  if (isSelectedDatePast.value) {
    filtered = list.value
  } else {
    // 今日/未来日期：保留原有筛选逻辑
    filtered = list.value.filter((r) => getStatus(r) === '已结束')
  }

  // 新增：过滤当前选择区域的影厅
  filtered = filtered.filter((item) => filterHallByArea(item.hall_name))

  return filtered.sort((a, b) => a.business_start_time - b.business_start_time)
})

/* ================== 核心1：开场关灯提醒等级判断（适配业务日） ================== */
const getTurnOffLightLevel = (row) => {
  // 过去日期：直接返回无提醒
  if (isSelectedDatePast.value) return 'none'

  if (!row.actual_start_time) return 'none'

  const startTime = dayjs(row.actual_start_time) // 电影实际开场时间
  const currentTime = dayjs(now.value)
  const diffMinutes = startTime.diff(currentTime, 'minute') // 距离开场的分钟数

  // 规则：开场前10→5分钟绿灯、5→2分钟橙灯、≤2分钟红灯，开场后无提醒
  if (currentTime >= startTime) return 'none'
  if (diffMinutes <= 2) return 'red'
  if (diffMinutes <= 5) return 'orange'
  if (diffMinutes <= 10) return 'green'
  return 'none'
}

/* ================== 核心2：散场开灯提醒等级判断（保留原有逻辑） ================== */
const getTurnOnLightLevel = (row) => {
  // 过去日期：直接返回无提醒
  if (isSelectedDatePast.value) return 'none'

  if (!row.light_on_time) return 'none'

  const lightTime = dayjs(row.light_on_time) // 散场开灯时间
  const currentTime = dayjs(now.value)
  const diffMinutes = lightTime.diff(currentTime, 'minute') // 距离开灯的分钟数

  // 规则：开灯前10→5分钟绿灯、5→2分钟橙灯、≤2分钟红灯，散场后持续到结束
  if (diffMinutes <= 2) return 'red'
  if (diffMinutes <= 5) return 'orange'
  if (diffMinutes <= 10) return 'green'
  return 'none'
}

/* ================== 工具方法 ================== */
const isInvalid = (row) => {
  if (!row.start_time) return true
  if (!row.duration_seconds) return true
  return !dayjs(row.actual_start_time).isValid()
}

const getTimes = (row) => {
  if (isInvalid(row)) return null

  // 计算实际开始/结束时间（适配业务日）
  const start = dayjs(row.actual_start_time)
  const end = start.add(row.duration_seconds, 'second')
  const light = end.subtract(row.light_offset_seconds || 0, 'second')

  return {
    start: start.valueOf(),
    end: end.valueOf(),
    light: light.valueOf(),
  }
}

// 状态判断（适配业务日：次日0-3点仍算未开始）
const getStatus = (row) => {
  // 过去日期：全部标记为已结束
  if (isSelectedDatePast.value) return '已结束'

  const t = getTimes(row)
  if (!t) return '影片不存在'

  const currentTime = dayjs(now.value)
  const startTime = dayjs(t.start)
  const endTime = dayjs(t.end)

  // 开始时间在未来 → 未开始
  if (currentTime.isBefore(startTime)) return '未开始'
  // 结束时间在过去 → 已结束
  if (currentTime.isAfter(endTime)) return '已结束'
  // 中间状态 → 播放中
  return '播放中'
}

// 计算进度（适配业务日）
const getProgress = (row) => {
  // 过去日期：进度直接设为100%
  if (isSelectedDatePast.value) return 100

  const status = getStatus(row)
  if (status === '未开始') return 0
  if (status === '已结束') return 100

  const t = getTimes(row)
  if (!t) return 0

  const totalDuration = t.end - t.start
  const elapsed = now.value - t.start
  const progress = Math.floor((elapsed / totalDuration) * 100)

  return Math.min(progress, 100)
}

// 格式化秒数为 HH:mm:ss
const formatSecondsToHMS = (seconds) => {
  const h = Math.floor(seconds / 3600)
    .toString()
    .padStart(2, '0')
  const m = Math.floor((seconds % 3600) / 60)
    .toString()
    .padStart(2, '0')
  const s = Math.floor(seconds % 60)
    .toString()
    .padStart(2, '0')
  return `${h}:${m}:${s}`
}

// 格式化播放时长
const getPlayedTime = (row) => {
  // 过去日期：显示总时长
  if (isSelectedDatePast.value) {
    const t = getTimes(row)
    if (!t) return '00:00:00'
    const totalSeconds = Math.floor((t.end - t.start) / 1000)
    return formatSecondsToHMS(totalSeconds)
  }

  const status = getStatus(row)
  if (status === '未开始') return '未开始'

  const t = getTimes(row)
  if (!t || now.value <= t.start) return '00:00:00'

  const playedMs = Math.min(now.value - t.start, t.end - t.start)
  const playedSeconds = Math.floor(playedMs / 1000)
  return formatSecondsToHMS(playedSeconds)
}

// 格式化剩余时长
const getRemainingTime = (row) => {
  // 过去日期：剩余时长设为0
  if (isSelectedDatePast.value) return '00:00:00'

  const status = getStatus(row)
  if (status === '未开始') {
    // 未开始：显示总片长
    const t = getTimes(row)
    if (!t) return '00:00:00'
    const totalSeconds = Math.floor((t.end - t.start) / 1000)
    return formatSecondsToHMS(totalSeconds)
  }

  const t = getTimes(row)
  if (!t || now.value >= t.end) return '00:00:00'

  const totalSeconds = Math.floor((t.end - t.start) / 1000)
  const playedSeconds = Math.floor((now.value - t.start) / 1000)
  const remainingSeconds = Math.max(totalSeconds - playedSeconds, 0)

  return formatSecondsToHMS(remainingSeconds)
}

// 格式化时间为 HH:mm:ss（带次日标识）
const fmt = (time, showDateTag = false) => {
  if (!time) return '--:--:--'

  const timeStr = dayjs(time).format('HH:mm:ss')
  // 如果需要显示次日标识
  if (showDateTag) {
    const timeDate = dayjs(time).format('YYYY-MM-DD')
    const baseDate = Show_date.value
    if (timeDate !== baseDate) {
      return `${timeStr} (次日)`
    }
  }

  return timeStr
}

// 格式化开灯提前量（秒转分钟）
const formatLightOffset = (row) => {
  if (!row.light_offset_seconds) return '0分钟'
  const minutes = Math.floor(row.light_offset_seconds / 60)
  return `${minutes}分钟`
}

// 切换影厅展开状态
const toggleHallExpand = (hallName) => {
  hallExpandStates.value[hallName] = !hallExpandStates.value[hallName]
}

// 新增：切换影厅区域
const switchHallArea = (area) => {
  currentHallArea.value = area
}

/* ================== 数据拉取 + 业务日适配 ================== */
const fetchData = async () => {
  try {
    const scheduleRes = await GetDataFunc.GetMoviesList('all', Show_date.value)
    const rawSchedules = scheduleRes?.data?.data || []

    const sourceRes = await GetDataFunc.GetMoviesInfo('get')
    movieSources.value = sourceRes?.data?.data || []

    // 处理排期数据（适配业务日）
    const processedSchedules = rawSchedules.map((schedule) => {
      const source = movieSources.value.find((s) => s.movie_source_id === schedule.movie_source_id)

      // 解析开始时间
      const rawStartTime = schedule.start_time || '00:00'
      // 计算实际开始时间戳（适配业务日）
      let actualStartTimeStr = `${Show_date.value} ${rawStartTime}`
      const [h] = rawStartTime.split(':').map(Number)

      // 如果是 00:00~05:59，视为次日
      let actualStartTime = dayjs(actualStartTimeStr)
      if (h < 6) {
        actualStartTime = actualStartTime.add(1, 'day')
      }

      // 计算业务日分钟数
      const businessStartTime = toBusinessMinutes(rawStartTime, Show_date.value)

      // 构建排期对象
      const row = {
        ...schedule,
        actual_show_date: Show_date.value,
        actual_start_time: actualStartTime.valueOf(),
        actual_end_time: actualStartTime.add(source?.duration_seconds || 0, 'second').valueOf(),
        business_start_time: businessStartTime,
        duration_seconds: source?.duration_seconds,
        light_offset_seconds: source?.light_offset_seconds || 0,
      }

      // 计算结束时间和开灯时间
      if (!isInvalid(row)) {
        const t = getTimes(row)
        row.end_time = t?.end
        row.light_on_time = t?.light
      }

      return row
    })

    // 关键修改：移除业务日筛选，保留所有场次（让历史日期能显示完整数据）
    list.value = processedSchedules
  } catch (e) {
    console.error('排期数据加载失败', e)
    list.value = []
  }
}

/* ================== 生命周期 ================== */
onMounted(() => {
  fetchData()
  const area = localStorage.getItem('cinema_hall_area')
  if (!area) localStorage.setItem('cinema_hall_area', 'all')
  // 每秒刷新时间戳，保证提醒等级和进度实时更新
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
    <!-- 头部 -->
    <div class="header-wrapper">
      <div class="header-left">
        <h2 class="title">🎬 今日排期</h2>
        <el-date-picker
          v-model="Show_date"
          type="date"
          value-format="YYYY-MM-DD"
          format="YYYY-MM-DD"
          :editable="false"
          :clearable="false"
          :disabled-date="disabledDate"
          placeholder="选择日期"
          class="date-picker"
          @change="fetchData"
        />
      </div>

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

    <!-- 有效场次：按影厅分组 -->
    <div v-if="activeTab === 'valid'" class="hall-group-container scrollable">
      <div v-for="group in hallGroups" :key="group.hallName" class="hall-group-item">
        <div
          v-if="group.currentSchedule"
          class="current-schedule-card"
          :class="[
            getStatus(group.currentSchedule),
            // 两个提醒的动画类，同时触发时叠加效果
            getTurnOffLightLevel(group.currentSchedule) !== 'none'
              ? `light-${getTurnOffLightLevel(group.currentSchedule)}`
              : '',
            getTurnOnLightLevel(group.currentSchedule) !== 'none'
              ? `light-${getTurnOnLightLevel(group.currentSchedule)}`
              : '',
            getTurnOffLightLevel(group.currentSchedule) !== 'none' ||
            getTurnOnLightLevel(group.currentSchedule) !== 'none'
              ? 'light-remind'
              : '',
          ]"
        >
          <!-- 影厅号（左上角）+ 开始时间（右上角） -->
          <div class="top-badges">
            <div class="hall-number-badge">{{ group.hallName }}号厅</div>
            <div class="start-time-badge">
              {{ fmt(group.currentSchedule.actual_start_time, true) }}
              -
              {{ fmt(group.currentSchedule.end_time, true) }}
            </div>
          </div>

          <!-- 影片信息 + 提醒标签 -->
          <div class="movie-info">
            <div class="movie-name">{{ group.currentSchedule.movie_name }}</div>
            <div class="schedule-status">
              {{ getStatus(group.currentSchedule) }}
              <!-- 开场关灯提醒标签 -->
              <span
                v-if="getTurnOffLightLevel(group.currentSchedule) === 'green'"
                class="remind-tag green"
              >
                开场前10分钟（关灯）
              </span>
              <span
                v-if="getTurnOffLightLevel(group.currentSchedule) === 'orange'"
                class="remind-tag orange"
              >
                开场前5分钟（关灯）
              </span>
              <span
                v-if="getTurnOffLightLevel(group.currentSchedule) === 'red'"
                class="remind-tag red"
              >
                开场前2分钟（关灯）
              </span>
              <!-- 散场开灯提醒标签 -->
              <span
                v-if="getTurnOnLightLevel(group.currentSchedule) === 'green'"
                class="remind-tag green"
                style="background: #10b981"
              >
                散场前10分钟（开灯）
              </span>
              <span
                v-if="getTurnOnLightLevel(group.currentSchedule) === 'orange'"
                class="remind-tag orange"
                style="background: #f59e0b"
              >
                散场前5分钟（开灯）
              </span>
              <span
                v-if="getTurnOnLightLevel(group.currentSchedule) === 'red'"
                class="remind-tag red"
                style="background: #ef4444"
              >
                散场前2分钟（开灯）
              </span>
            </div>
          </div>

          <!-- 进度条区域 -->
          <div class="progress-area">
            <div class="progress-bar-container">
              <div
                class="progress-played"
                :style="{ width: `${getProgress(group.currentSchedule)}%` }"
              >
                <div
                  v-if="getStatus(group.currentSchedule) === '播放中'"
                  class="progress-point"
                ></div>
              </div>
              <div
                class="progress-remaining"
                :style="{ width: `${100 - getProgress(group.currentSchedule)}%` }"
              ></div>
            </div>

            <div class="progress-text-row">
              <span class="played-time">已播放：{{ getPlayedTime(group.currentSchedule) }}</span>
              <span class="progress-percent">{{ getProgress(group.currentSchedule) }}%</span>
              <span class="remaining-time"
                >剩余：{{ getRemainingTime(group.currentSchedule) }}</span
              >
            </div>
          </div>

          <!-- 开灯信息：整行展示，左侧开灯时间，右侧开灯提前量 -->
          <div class="light-info-row">
            <div class="light-time-left">
              <i class="el-icon-lightbulb"></i> 开灯时间：{{
                fmt(group.currentSchedule.light_on_time, true)
              }}
            </div>
            <div class="light-offset-right">
              开灯提前量：{{ formatLightOffset(group.currentSchedule) }}
            </div>
          </div>

          <!-- 展开按钮 -->
          <button
            v-if="group.remainingSchedules.length > 0"
            class="expand-btn"
            @click="toggleHallExpand(group.hallName)"
          >
            {{
              hallExpandStates[group.hallName]
                ? '收起剩余排期'
                : `展开剩余${group.remainingSchedules.length}场`
            }}
          </button>
        </div>

        <!-- 展开的剩余排期 -->
        <div
          v-if="hallExpandStates[group.hallName] && group.remainingSchedules.length > 0"
          class="remaining-schedules-list"
        >
          <div
            v-for="schedule in group.remainingSchedules"
            :key="schedule.id"
            class="remaining-schedule-item"
          >
            <div class="remaining-movie-name">{{ schedule.movie_name }}</div>
            <div class="remaining-time-info">
              <span>开始：{{ fmt(schedule.actual_start_time, true) }}</span>
              <span>结束：{{ fmt(schedule.end_time, true) }}</span>
              <span class="remaining-light-time">
                <i class="el-icon-lightbulb small-light-icon"></i>
                {{ fmt(schedule.light_on_time, true) }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div v-if="hallGroups.length === 0" class="empty-tip">暂无排期</div>
    </div>

    <!-- 已完成场次：纯列表 -->
    <div v-if="activeTab === 'finished'" class="finished-list-container scrollable">
      <div v-for="schedule in finishedSchedules" :key="schedule.id" class="finished-schedule-item">
        <div class="finished-hall">{{ schedule.hall_name }}号厅</div>
        <div class="finished-movie">{{ schedule.movie_name }}</div>
        <div class="finished-time">
          <span>开始：{{ fmt(schedule.actual_start_time, true) }}</span>
          <span>结束：{{ fmt(schedule.end_time, true) }}</span>
          <span>开灯：{{ fmt(schedule.light_on_time, true) }}</span>
        </div>
      </div>

      <div v-if="finishedSchedules.length === 0" class="empty-tip">暂无已完成场次</div>
    </div>

    <!-- 新增：底部影厅区域切换栏 -->
    <div class="hall-area-switch-bar">
      <button
        class="area-btn"
        :class="{ active: currentHallArea === 'area1' }"
        @click="switchHallArea('area1')"
      >
        1号场 (1-6厅)
      </button>
      <button
        class="area-btn middle-btn"
        :class="{ active: currentHallArea === 'all' }"
        @click="switchHallArea('all')"
      >
        全局
      </button>
      <button
        class="area-btn"
        :class="{ active: currentHallArea === 'area2' }"
        @click="switchHallArea('area2')"
      >
        2号场 (7-11厅)
      </button>
    </div>
  </div>
</template>

<style scoped>
/* 基础样式 */
.board {
  padding: 12px;
  min-height: 100vh;
  color: #e0e0e0;
  background: #12121273;
  /* 新增：给底部切换栏留出空间 */
  padding-bottom: 80px;
  position: relative;
}

.header-wrapper {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-bottom: 16px;
}

.header-left {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
}

.title {
  font-size: 18px;
  font-weight: 600;
  color: #ffffff;
  margin: 0;
}

.date-picker {
  width: 140px !important;
  font-size: 14px;
}

.tab-switch {
  display: flex;
  gap: 8px;
  width: 100%;
}

.tab-btn {
  flex: 1;
  padding: 12px 0;
  border: none;
  border-radius: 8px;
  background: #e87d13;
  color: #ffffff;
  font-size: 15px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.tab-btn.active {
  background: #10b981;
}

.scrollable {
  max-height: calc(100vh - 260px);
  overflow-y: auto;
  overflow-x: hidden;
}

.hall-group-container {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
  padding: 20px;
  grid-gap: 20px;
}

.hall-group-item {
  width: 100%;
}

/* 核心：呼吸灯动画（整个Item闪烁） */
@keyframes breathe-green {
  0% {
    box-shadow:
      0 0 10px rgba(16, 185, 129, 0.3),
      inset 0 0 10px rgba(16, 185, 129, 0.1);
  }
  50% {
    box-shadow:
      0 0 20px rgba(16, 185, 129, 0.8),
      inset 0 0 20px rgba(16, 185, 129, 0.3);
  }
  100% {
    box-shadow:
      0 0 10px rgba(16, 185, 129, 0.3),
      inset 0 0 10px rgba(16, 185, 129, 0.1);
  }
}

@keyframes breathe-orange {
  0% {
    box-shadow:
      0 0 10px rgba(245, 158, 11, 0.3),
      inset 0 0 10px rgba(245, 158, 11, 0.1);
  }
  50% {
    box-shadow:
      0 0 20px rgba(245, 158, 11, 0.8),
      inset 0 0 20px rgba(245, 158, 11, 0.3);
  }
  100% {
    box-shadow:
      0 0 10px rgba(245, 158, 11, 0.3),
      inset 0 0 10px rgba(245, 158, 11, 0.1);
  }
}

@keyframes breathe-red {
  0% {
    box-shadow:
      0 0 10px rgba(239, 68, 68, 0.3),
      inset 0 0 10px rgba(239, 68, 68, 0.1);
  }
  50% {
    box-shadow:
      0 0 25px rgba(239, 68, 68, 0.9),
      inset 0 0 25px rgba(239, 68, 68, 0.4);
  }
  100% {
    box-shadow:
      0 0 10px rgba(239, 68, 68, 0.3),
      inset 0 0 10px rgba(239, 68, 68, 0.1);
  }
}

/* 提醒等级样式 */
.current-schedule-card.light-remind {
  animation-duration: 2s;
  animation-iteration-count: infinite;
  animation-timing-function: ease-in-out;
}

.current-schedule-card.light-green {
  animation-name: breathe-green;
}

.current-schedule-card.light-orange {
  animation-name: breathe-orange;
}

.current-schedule-card.light-red {
  animation-name: breathe-red;
  background: rgba(239, 68, 68, 0.1) !important;
}

/* 基础卡片样式 */
.current-schedule-card {
  padding: 16px;
  border-radius: 12px;
  background: #2d2d2d;
  position: relative;
  transition: all 0.3s ease;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.current-schedule-card.播放中 {
  background: #2a3a4a;
  border-left: 4px solid #10b981;
}
.current-schedule-card.未开始 {
  background: #2d2d3d;
  border-left: 4px solid #3b82f6;
}

/* 顶部徽章：影厅号+开始时间 */
.top-badges {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.hall-number-badge {
  font-size: 14px;
  font-weight: bold;
  color: #ffffff;
  background: rgba(0, 0, 0, 0.3);
  padding: 4px 8px;
  border-radius: 4px;
}

.start-time-badge {
  font-size: 14px;
  font-weight: bold;
  color: #ffffff;
  background: rgba(59, 130, 246, 0.3);
  padding: 4px 8px;
  border-radius: 4px;
}

/* 影片信息 + 提醒标签 */
.movie-info {
  text-align: center;
}

.movie-name {
  font-size: 18px;
  font-weight: 500;
  color: #ffffff;
  margin-bottom: 4px;
}

.schedule-status {
  font-size: 12px;
  color: #94a3b8;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: 8px;
}

/* 提醒标签样式 */
.remind-tag {
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 10px;
  color: #fff;
}

.remind-tag.green {
  background: #10b981;
}

.remind-tag.orange {
  background: #f59e0b;
}

.remind-tag.red {
  background: #ef4444;
  font-weight: bold;
}

/* 进度条区域 */
.progress-area {
  margin-bottom: 4px;
}

.progress-bar-container {
  display: flex;
  height: 8px;
  border-radius: 4px;
  overflow: hidden;
  background: #4d4d4d;
}

.progress-played {
  height: 100%;
  background: linear-gradient(to right, #e87d13, #ff9f43);
  position: relative;
}

.progress-point {
  position: absolute;
  right: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #ffffff;
  box-shadow: 0 0 4px rgba(255, 255, 255, 0.8);
}

.progress-remaining {
  height: 100%;
  background: #4d4d4d;
}

.progress-text-row {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: #94a3b8;
  margin-top: 4px;
}

/* 开灯信息行：整行展示，左右分栏 */
.light-info-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
  border-top: 1px solid #4d4d4d;
  font-size: 14px;
  color: #ffffff;
}

.light-time-left {
  display: flex;
  align-items: center;
  gap: 4px;
}

.light-offset-right {
  color: #94a3b8;
}

/* 展开按钮 */
.expand-btn {
  padding: 8px 0;
  border: none;
  border-radius: 6px;
  background: #3d3d3d;
  color: #e0e0e0;
  font-size: 14px;
  cursor: pointer;
  transition: background 0.2s;
}

.expand-btn:hover {
  background: #4d4d4d;
}

/* 剩余排期列表 */
.remaining-schedules-list {
  margin-top: 8px;
  padding: 8px;
  border-radius: 8px;
  background: #333333;
}

.remaining-schedule-item {
  padding: 8px 0;
  border-bottom: 1px dashed #4d4d4d;
}

.remaining-schedule-item:last-child {
  border-bottom: none;
}

.remaining-movie-name {
  font-size: 14px;
  color: #ffffff;
  margin-bottom: 4px;
}

.remaining-time-info {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: #94a3b8;
}

.small-light-icon {
  color: #f59e0b;
  font-size: 10px;
  margin-right: 2px;
}

/* 已完成场次 */
.finished-list-container {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.finished-schedule-item {
  padding: 12px;
  border-radius: 8px;
  background: #3d2d2d;
  opacity: 0.8;
}

.finished-hall {
  font-size: 14px;
  font-weight: bold;
  color: #ef4444;
  margin-bottom: 4px;
}

.finished-movie {
  font-size: 16px;
  color: #ffffff;
  margin-bottom: 4px;
}

.finished-time {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: #94a3b8;
}

.empty-tip {
  padding: 30px 0;
  text-align: center;
  color: #888888;
  font-size: 14px;
}

/* 滚动条 */
.scrollable::-webkit-scrollbar {
  width: 6px;
}

.scrollable::-webkit-scrollbar-track {
  background: #2d2d2d;
  border-radius: 3px;
}

.scrollable::-webkit-scrollbar-thumb {
  background: #4d4d4d;
  border-radius: 3px;
}

/* 新增：底部影厅区域切换栏样式 */
.hall-area-switch-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  padding: 12px;
  background: #1e1e1e;
  border-top: 1px solid #333;
  z-index: 100;
}

.area-btn {
  flex: 1;
  padding: 12px 8px;
  border: none;
  border-radius: 8px;
  background: #2d2d2d;
  color: #e0e0e0;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s ease;
  margin: 0 4px;
}

.area-btn.middle-btn {
  /* 中间按钮特殊样式 */
  background: #3d3d3d;
}

.area-btn.active {
  background: #e87d13;
  color: #ffffff;
  font-weight: 600;
}

.area-btn:hover {
  background: #4d4d4d;
}

/* 桌面端适配 */
@media (min-width: 755px) {
  .board {
    padding: 20px;
    max-width: 1200px;
    margin: 0 auto;
    padding-bottom: 20px;
  }

  .header-wrapper {
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
  }

  .title {
    font-size: 20px;
  }

  .date-picker {
    width: 150px !important;
  }

  .tab-switch {
    width: auto;
    gap: 12px;
  }

  .tab-btn {
    flex: none;
    padding: 8px 16px;
  }

  .current-schedule-card {
    padding: 20px;
  }

  .progress-bar-container {
    height: 10px;
  }

  .expand-btn {
    width: 100%;
  }

  .finished-schedule-item {
    padding: 16px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .finished-hall {
    margin-bottom: 0;
    width: 80px;
  }

  .finished-movie {
    margin-bottom: 0;
    flex: 1;
    text-align: center;
  }

  .finished-time {
    width: 300px;
  }

  /* 桌面端切换栏样式调整 */
  .hall-area-switch-bar {
    position: static;
    margin-top: 20px;
    border-top: none;
    background: transparent;
    padding: 0;
  }

  .area-btn {
    padding: 8px 16px;
    font-size: 15px;
  }
}
</style>
