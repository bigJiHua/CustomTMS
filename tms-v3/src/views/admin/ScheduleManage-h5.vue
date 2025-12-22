<script setup>
import { ref, onMounted, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import dayjs from 'dayjs'
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

/* ================== 日期 ================== */
const Show_date = ref(dayjs().format('YYYY-MM-DD'))

const disabledDate = (time) => {
  const today = dayjs().startOf('day')
  return (
    dayjs(time).isBefore(today.subtract(3, 'day'), 'day') ||
    dayjs(time).isAfter(today.add(3, 'day'), 'day')
  )
}

/* ================== 新增排期 ================== */
const selectedMovieId = ref('')
const selectedStartTime = ref('')

/* ================== 编辑弹窗 ================== */
const editDialogVisible = ref(false)
const currentEditItem = ref(null)

const editForm = ref({
  id: '',
  movieId: '',
  startTime: '',
})

/* ================== 时间工具（业务日：06:00 → 次日） ================== */
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
/**
 * 允许开场：07:00 ～ 次日 05:30
 */
const isStartTimeAllowed = (time) => {
  const m = toBusinessMinutes(time)
  if (!Number.isFinite(m)) return false

  const OPEN = 7 * 60
  const CLOSE = 24 * 60 + 5 * 60 + 30

  return m >= OPEN && m <= CLOSE
}

/* ================== 计算时间 ================== */
const calcNextStartTime = () => {
  const list = currentSchedule.value
  if (!list.length) return '10:00'

  const last = [...list]
    .sort((a, b) => toBusinessMinutes(a.startTime) - toBusinessMinutes(b.startTime))
    .at(-1)

  const start = toBusinessMinutes(last?.startTime)
  if (!Number.isFinite(start)) return '10:00'

  return minutesToTime(start + Number(last.duration || 0) + Number(emptyInterval.value || 0))
}

const calcEndTime = (startTime, duration) => {
  if (!startTime || !duration) return '--:--'
  return minutesToTime(toBusinessMinutes(startTime) + Number(duration))
}

const calcItemInterval = (item, list) => {
  const index = list.findIndex((i) => i.id === item.id)
  if (index <= 0) return emptyInterval.value
  const prev = list[index - 1]
  return toBusinessMinutes(item.startTime) - (toBusinessMinutes(prev.startTime) + prev.duration)
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
  await DataApi.AddMovies(item.movieName, hall.val, item.startTime, Show_date.value)
}

const updateSchedule = async (item) => {
  if (!canEditSchedule(Show_date.value)) {
    ElMessage.error('当前日期不允许编辑')
    return
  }

  if (!isStartTimeAllowed(item.startTime)) {
    ElMessage.error('开场时间超出营业范围（07:00 ~ 次日 05:30）')
    return
  }

  await DataApi.CagMovies(
    item.id,
    JSON.stringify({
      movie_name: item.movieName,
      start_time: item.startTime,
    }),
  )

  ElMessage.success('排期已更新')
  await getSchedule()
}

const deleteSchedule = async (id) => {
  await DataApi.CagMovies(id, JSON.stringify({ deleted_at: 1 }))
  ElMessage.success('排期已删除')
  await getSchedule()
}

/* ================== 获取排期 ================== */
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
          movieId: movie?.id ?? '',
          movieName: row.movie_name,
          duration: movie?.duration ?? 0,
          startTime: row.start_time,
        }
      })
      .sort((a, b) => toBusinessMinutes(a.startTime) - toBusinessMinutes(b.startTime))

    selectedStartTime.value = calcNextStartTime()
  } catch {
    allSchedule.value[currentHallId.value] = []
    selectedStartTime.value = '10:00'
  }
}

/* ================== 新增排期 ================== */
const handleAddSchedule = async () => {
  if (!selectedMovieId.value) return ElMessage.warning('请选择影片')
  if (!selectedStartTime.value) return ElMessage.warning('请选择开始时间')

  if (!isStartTimeAllowed(selectedStartTime.value)) {
    ElMessage.error('开场时间超出营业范围（07:00 ~ 次日 05:30）')
    return
  }

  const movie = movieList.value.find((m) => m.id === selectedMovieId.value)
  if (!movie) return

  const item = {
    id: Date.now(),
    movieId: movie.id,
    movieName: movie.name,
    duration: movie.duration,
    startTime: selectedStartTime.value,
  }

  allSchedule.value[currentHallId.value].push(item)
  allSchedule.value[currentHallId.value].sort(
    (a, b) => toBusinessMinutes(a.startTime) - toBusinessMinutes(b.startTime),
  )
  allSchedule.value = { ...allSchedule.value }

  await submitSingleSchedule(item)
  await getSchedule()

  selectedMovieId.value = ''
}

/* ================== 编辑 ================== */
const openEditDialog = (item) => {
  currentEditItem.value = item
  editForm.value = {
    id: item.id,
    movieId: item.movieId,
    startTime: item.startTime,
  }
  editDialogVisible.value = true
}

const saveEdit = async () => {
  const movie = movieList.value.find((m) => m.id === editForm.value.movieId)
  if (!movie) return ElMessage.warning('影片不存在')

  await updateSchedule({
    id: editForm.value.id,
    movieName: movie.name,
    startTime: editForm.value.startTime,
  })

  editDialogVisible.value = false
}

const handleDelete = async () => {
  try {
    await ElMessageBox.confirm('确定删除该排期吗？', '删除确认', { type: 'warning' })
    await deleteSchedule(currentEditItem.value.id)
    editDialogVisible.value = false
  } catch {}
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
})
</script>

<template>
  <div class="h5-schedule-page">
    <!-- 顶部工具栏 - 并排布局 -->
    <div class="toolbar">
      <el-select v-model="currentHallId" size="large" @change="getSchedule" class="hall-select">
        <el-option v-for="h in hallList" :key="h.id" :label="h.name" :value="h.id" />
      </el-select>

      <el-date-picker
        v-model="Show_date"
        type="date"
        value-format="YYYY-MM-DD"
        :clearable="false"
        :editable="false"
        :disabled-date="disabledDate"
        @change="getSchedule"
        class="date-picker"
      />
    </div>

    <!-- 新增排期面板 -->
    <div class="add-panel">
      <el-select
        v-model="selectedMovieId"
        size="large"
        placeholder="请选择影片"
        class="movie-select"
      >
        <el-option
          v-for="m in movieList"
          :key="m.id"
          :label="`${m.name}（${m.duration}分钟）`"
          :value="m.id"
        />
      </el-select>

      <div class="interval-setting">
        <span class="interval-label">空场间隔：</span>
        <el-input-number
          v-model="emptyInterval"
          :min="0"
          :max="60"
          size="large"
          class="interval-input"
        />
        <span class="interval-unit">分钟</span>
      </div>

      <div class="time-picker-wrap">
        <span class="time-label">开始时间：</span>
        <el-time-picker
          v-model="selectedStartTime"
          size="large"
          format="HH:mm"
          value-format="HH:mm"
          :disabled-hours="disabledHours"
          :placeholder="calcNextStartTime()"
          class="time-picker"
          @change="(val) => val || (selectedStartTime = calcNextStartTime())"
        />
        <el-button
          type="text"
          class="refresh-time"
          @click="selectedStartTime = calcNextStartTime()"
        >
          推荐
        </el-button>
      </div>

      <el-button type="primary" size="large" @click="handleAddSchedule" class="add-btn">
        添加排期
      </el-button>
    </div>

    <!-- 排期列表 - 带表头 -->
    <div class="schedule-list">
      <!-- 列表表头 -->
      <div class="schedule-header">
        <div class="header-col col-movie">影片</div>
        <div class="header-col col-start">开始</div>
        <div class="header-col col-end">结束</div>
        <div class="header-col col-duration">时长</div>
        <div class="header-col col-interval">间隔</div>
        <div class="header-col col-action">操作</div>
      </div>

      <!-- 列表内容 -->
      <div class="schedule-items">
        <div v-for="(item, index) in currentSchedule" :key="item.id" class="schedule-item">
          <div class="item-col col-movie">{{ item.movieName }}</div>
          <div class="item-col col-start">{{ item.startTime }}</div>
          <div class="item-col col-end">{{ calcEndTime(item.startTime, item.duration) }}</div>
          <div class="item-col col-duration">{{ item.duration }}分钟</div>
          <div class="item-col col-interval">{{ calcItemInterval(item, currentSchedule) }}分钟</div>
          <div class="item-col col-action">
            <el-button type="primary" size="small" @click="openEditDialog(item)" class="edit-btn">
              编辑
            </el-button>
          </div>
        </div>

        <div v-if="!currentSchedule.length" class="empty">
          <div class="empty-icon">📅</div>
          <div class="empty-text">暂无排期</div>
          <div class="empty-desc">点击下方"添加排期"创建新的放映计划</div>
        </div>
      </div>
    </div>

    <!-- 编辑/删除弹窗 - 居中非全屏 -->
    <el-dialog
      v-model="editDialogVisible"
      title="编辑排期"
      width="90%"
      max-width="500px"
      :close-on-click-modal="false"
      class="edit-dialog"
      center
    >
      <div class="edit-dialog-content">
        <el-form :model="editForm" label-width="80px" class="edit-form">
          <el-form-item label="影片">
            <el-select
              v-model="editForm.movieId"
              size="large"
              placeholder="请选择影片"
              style="width: 100%"
            >
              <el-option
                v-for="m in movieList"
                :key="m.id"
                :label="`${m.name}（${m.duration}分钟）`"
                :value="m.id"
              />
            </el-select>
          </el-form-item>

          <el-form-item label="开始时间">
            <el-time-picker
              v-model="editForm.startTime"
              size="large"
              format="HH:mm"
              value-format="HH:mm"
              :disabled-hours="disabledHours"
              style="width: 100%"
            />
          </el-form-item>

          <!-- 删除按钮移到间隔下方 -->
          <el-form-item class="delete-btn-item">
            <el-button @click="handleDelete" type="danger" size="large" class="delete-btn">
              🗑️ 删除此排期
            </el-button>
            <div class="delete-tip">删除后数据将无法恢复，请谨慎操作！</div>
          </el-form-item>
        </el-form>
      </div>

      <!-- 底部操作按钮（放大） -->
      <template #footer>
        <div class="dialog-footer">
          <el-button @click="editDialogVisible = false" size="large" class="cancel-btn">
            取消
          </el-button>
          <el-button @click="saveEdit" type="primary" size="large" class="save-btn">
            保存修改
          </el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
/* 基础重置 */
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
  touch-action: manipulation;
}

/* 页面容器 */
.h5-schedule-page {
  min-height: 100vh;
  min-height: -webkit-fill-available;
  background: #0a0a0f;
  color: #e5e7eb;
  padding: 16px 16px 32px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  font-size: 16px;
  overflow-x: hidden;
}

/* 顶部工具栏 - 并排布局+缩小尺寸 */
.toolbar {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
}

.hall-select,
.date-picker {
  flex: 1;
  height: 40px !important;
  min-width: 120px;
}

/* Element组件样式覆盖 */
:deep(.el-select .el-input__wrapper),
:deep(.el-date-editor .el-input__wrapper) {
  background-color: #1f2937 !important;
  border-radius: 8px !important;
  border: none !important;
  padding: 0 12px !important;
  height: 40px !important;
}

:deep(.el-input__inner) {
  color: #e5e7eb !important;
  font-size: 14px !important;
  line-height: 40px !important;
  height: 100% !important;
}

:deep(.el-select .el-icon) {
  color: #94a3b8 !important;
  font-size: 16px !important;
}

/* 新增排期面板 */
.add-panel {
  background: #111827;
  border-radius: 18px;
  padding: 20px 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
}

.movie-select {
  width: 100%;
  height: 50px;
}

.interval-setting {
  display: flex;
  align-items: center;
  gap: 8px;
}

.interval-label {
  font-size: 15px;
  color: #94a3b8;
  white-space: nowrap;
}

.interval-input {
  flex: 1;
  max-width: 120px;
}
:deep(.interval-input .el-input__inner) {
  color: #020f29 !important;
}

rgb(34, 90, 203) .interval-unit {
  font-size: 15px;
  color: #94a3b8;
}

.time-picker-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}

.time-label {
  font-size: 15px;
  color: #94a3b8;
  white-space: nowrap;
}

.time-picker {
  flex: 1;
  height: 50px;
}

.refresh-time {
  color: #38bdf8 !important;
  font-size: 14px !important;
  padding: 0 !important;
}

.add-btn {
  height: 56px;
  border-radius: 12px !important;
  font-size: 18px !important;
  font-weight: 600 !important;
  background: linear-gradient(135deg, #2563eb, #3b82f6) !important;
  border: none !important;
}

/* 排期列表 - 带表头 */
.schedule-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1;
  overflow-y: auto;
  padding-bottom: 20px;
}

/* 列表表头 */
.schedule-header {
  display: flex;
  padding: 12px 8px;
  background: #1f2937;
  border-radius: 8px 8px 0 0;
  font-weight: 600;
  font-size: 14px;
}

.header-col {
  flex: 1;
  text-align: center;
  color: #38bdf8;
}

/* 列宽适配 */
.col-movie {
  flex: 2;
  text-align: left;
  padding-left: 8px;
}
.col-start {
  flex: 1;
}
.col-end {
  flex: 1;
}
.col-duration {
  flex: 1;
}
.col-interval {
  flex: 1;
}
.col-action {
  flex: 1;
}

/* 列表内容 */
.schedule-items {
  display: flex;
  flex-direction: column;
  gap: 4px;
  background: #111827;
  border-radius: 0 0 8px 8px;
  padding: 8px;
}

/* 列表项 */
.schedule-item {
  display: flex;
  align-items: center;
  padding: 12px 8px;
  background: #1f2937;
  border-radius: 8px;
  font-size: 14px;
}

.item-col {
  flex: 1;
  text-align: center;
  color: #e5e7eb;
}

.item-col.col-movie {
  flex: 2;
  text-align: left;
  padding-left: 8px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.edit-btn {
  padding: 4px 8px !important;
  font-size: 12px !important;
  height: 30px !important;
}

/* 空状态 */
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  color: #6b7280;
  text-align: center;
  gap: 12px;
}

.empty-icon {
  font-size: 48px;
  margin-bottom: 8px;
}

.empty-text {
  font-size: 18px;
  color: #94a3b8;
}

.empty-desc {
  font-size: 14px;
  color: #6b7280;
  max-width: 280px;
}

/* 编辑弹窗样式 - 居中非全屏 */
:deep(.edit-dialog) {
  --el-dialog-bg-color: #111827;
  --el-dialog-title-color: #e5e7eb;
  --el-dialog-header-text-align: center;
}

:deep(.edit-dialog .el-dialog__header) {
  border-bottom: 1px solid #273449;
  padding: 16px 20px;
  margin: 0;
}

:deep(.edit-dialog .el-dialog__title) {
  font-size: 18px;
  font-weight: 600;
}

.edit-dialog-content {
  padding: 20px;
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

:deep(.edit-form .el-select .el-input__wrapper),
:deep(.edit-form .el-time-editor .el-input__wrapper),
:deep(.edit-form .el-input-number__wrapper) {
  background-color: #1f2937 !important;
  border-radius: 12px !important;
  border: none !important;
  height: 56px !important;
  padding: 0 20px !important;
}

:deep(.edit-form .el-input__inner) {
  font-size: 16px !important;
  line-height: 56px !important;
}

.unit {
  font-size: 16px;
  color: #94a3b8;
  margin-left: 12px;
}

.tip-text {
  font-size: 14px;
  color: #6b7280;
  margin-top: 8px;
}

/* 删除按钮样式（间隔下方） */
.delete-btn-item {
  margin-top: 4px !important;
}

.delete-btn {
  width: 100%;
  background: linear-gradient(135deg, #ef4444, #f87171) !important;
  border: none !important;
}

.delete-tip {
  text-align: center;
  font-size: 14px;
  color: #fca5a5;
  margin-top: 8px;
}

/* 弹窗底部操作按钮（放大） */
:deep(.dialog-footer) {
  display: flex;
  gap: 12px;
  justify-content: center;
  padding: 16px 20px;
  border-top: 1px solid #273449;
  margin: 0;
}

.cancel-btn,
.save-btn {
  padding: 14px 28px !important;
  border-radius: 12px !important;
  font-size: 16px !important;
  font-weight: 600 !important;
  min-width: 140px !important;
  height: 56px !important;
}

.save-btn {
  background: linear-gradient(135deg, #2563eb, #3b82f6) !important;
  border: none !important;
}

/* 删除确认弹窗样式 */
:deep(.delete-dialog) {
  --el-color-warning: #f87171;
  --el-messagebox-bg-color: #111827;
  --el-messagebox-content-color: #e5e7eb;
}

:deep(.delete-confirm-btn) {
  background-color: #ef4444 !important;
  border-color: #ef4444 !important;
}

:deep(.delete-cancel-btn) {
  background-color: #1f2937 !important;
  border-color: #1f2937 !important;
}

/* 适配小屏手机 */
@media screen and (max-width: 375px) {
  .h5-schedule-page {
    padding: 12px 12px 24px;
  }

  .add-panel {
    padding: 16px 12px;
  }

  .add-btn {
    height: 50px;
    font-size: 16px !important;
  }

  .hall-select,
  .date-picker {
    height: 36px !important;
    min-width: 100px;
  }

  :deep(.el-input__inner) {
    font-size: 13px !important;
    line-height: 36px !important;
  }

  /* 列表文字缩小 */
  .schedule-header,
  .schedule-item {
    font-size: 12px;
  }

  .edit-btn {
    padding: 2px 6px !important;
    font-size: 11px !important;
  }

  /* 弹窗适配小屏 */
  .delete-btn {
    height: 50px !important;
    font-size: 14px !important;
  }

  .cancel-btn,
  .save-btn {
    padding: 12px 24px !important;
    min-width: 120px !important;
    height: 50px !important;
    font-size: 14px !important;
  }
}

/* 适配横屏 */
@media screen and (orientation: landscape) {
  .h5-schedule-page {
    padding: 12px 20px;
  }

  .toolbar {
    gap: 12px;
  }

  .schedule-list {
    flex: 1;
  }
}

/* 补充样式 */
:deep(.el-time-editor .el-input__wrapper) {
  background-color: #1f2937 !important;
  border-radius: 12px !important;
  border: none !important;
  padding: 0 16px !important;
  height: 50px !important;
}

:deep(.el-input-number__wrapper) {
  background-color: #1f2937 !important;
  border-radius: 8px !important;
  border: none !important;
  height: 40px !important;
}

:deep(.el-input-number__decrease),
:deep(.el-input-number__increase) {
  background-color: #273449 !important;
  color: #e5e7eb !important;
  width: 30px !important;
}

/* =========================
   全局密度 & 字体优化
========================= */
.h5-schedule-page {
  font-size: 15px;
}

@media screen and (min-width: 900px) {
  .h5-schedule-page {
    max-width: 1280px;
    margin: 0 auto;
    padding: 24px 32px 40px;
  }
}

/* =========================
   顶部工具栏更稳
========================= */
.toolbar {
  padding: 4px 0;
}

@media screen and (min-width: 900px) {
  .toolbar {
    gap: 16px;
  }
}

/* =========================
   新增排期面板（不花，只稳）
========================= */
.add-panel {
  border-radius: 14px;
  box-shadow: none;
  border: 1px solid #273449;
}

@media screen and (min-width: 900px) {
  .add-panel {
    flex-direction: row;
    align-items: flex-end;
    gap: 16px;
  }

  .movie-select {
    flex: 2;
  }

  .interval-setting {
    flex: 1;
  }

  .time-picker-wrap {
    flex: 1.2;
  }

  .add-btn {
    flex: 0.8;
  }
}

/* =========================
   排期列表整体更“表格化”
========================= */
.schedule-list {
  background: #111827;
  border-radius: 10px;
  border: 1px solid #273449;
}

/* 表头更克制 */
.schedule-header {
  background: #1b2538;
  font-size: 13px;
  letter-spacing: 0.04em;
}

/* =========================
   列表行稳定感
========================= */
.schedule-item {
  border-radius: 6px;
  background: #1f2937;
}

.schedule-item + .schedule-item {
  margin-top: 4px;
}

@media screen and (min-width: 900px) {
  .schedule-item {
    transition: background-color 0.15s ease;
  }

  .schedule-item:hover {
    background: #25324a;
  }
}

/* =========================
   列内容对齐修正
========================= */
.header-col,
.item-col {
  align-items: center;
  justify-content: center;
}

.header-col.col-movie,
.item-col.col-movie {
  justify-content: flex-start;
}

/* =========================
   操作按钮更像系统按钮
========================= */
.edit-btn {
  border-radius: 6px !important;
  font-weight: 500 !important;
}

.edit-btn:hover {
  opacity: 0.9;
}

/* =========================
   空状态克制一点
========================= */
.empty-icon {
  font-size: 40px;
}

.empty-text {
  font-size: 16px;
}

.empty-desc {
  font-size: 13px;
}

/* =========================
   编辑弹窗：去浮夸
========================= */
:deep(.edit-dialog .el-dialog) {
  border-radius: 12px;
}

:deep(.edit-dialog .el-dialog__header) {
  padding: 14px 20px;
}

.dialog-footer {
  gap: 16px;
}

/* =========================
   桌面端：整体更“后台”
========================= */
@media screen and (min-width: 900px) {
  .schedule-header,
  .schedule-item {
    padding-left: 12px;
    padding-right: 12px;
  }

  .item-col {
    font-size: 14px;
  }

  .edit-btn {
    font-size: 13px !important;
  }
}
</style>
