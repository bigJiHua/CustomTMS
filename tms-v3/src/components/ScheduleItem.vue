<script setup>
import { ref, computed, watch, defineProps, defineEmits } from 'vue'
import { ElRow, ElCol, ElSelect, ElOption, ElTimePicker, ElButton, ElMessage } from 'element-plus'
import DataApi from '@/utils/API/Data'

/* ================= Props定义（父组件传入） ================= */
const props = defineProps({
  item: {
    type: Object,
    required: true,
    description: '单条排期数据',
  },
  index: {
    type: Number,
    required: true,
    description: '当前排期在列表中的索引',
  },
  list: {
    type: Array,
    required: true,
    description: '完整的排期列表（用于计算下一场间隔）',
  },
  movieList: {
    type: Array,
    required: true,
    description: '所有可选影片列表',
  },
})

/* ================= 自定义事件（向父组件通信） ================= */
const emit = defineEmits(['updated', 'deleted'])

/* ================= 本地响应式数据（避免直接修改Props） ================= */
// 本地排期数据（深拷贝父组件数据）
const localItem = ref({ ...props.item })
// 编辑前的原始数据（取消编辑时恢复）
const originItem = ref({ ...props.item })
// 编辑状态控制
const editing = ref(false)

/* ================= 监听父组件数据变化（同步本地数据） ================= */
watch(
  () => props.item,
  (newVal) => {
    localItem.value = { ...newVal }
    originItem.value = { ...newVal }
  },
  { deep: true }, // 深度监听对象属性变化
)

/* ================= 时间转换工具（纯数学转换，无跨天修正） ================= */
/**
 * 将 HH:mm 格式时间转换为总分钟数
 * @param {string} time - 格式如 "10:00" 的时间字符串
 * @returns {number} 总分钟数（非法格式返回0）
 */
const toMinutes = (time) => {
  // 严格校验时间格式
  if (!time || !/^\d{2}:\d{2}$/.test(time)) return 0
  const [hour, minute] = time.split(':').map(Number)
  // 校验时间范围合法性
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return 0
  return hour * 60 + minute
}

/**
 * 将总分钟数转换回 HH:mm 格式
 * @param {number} minutes - 总分钟数
 * @returns {string} 格式化时间（非法值返回 "--:--"）
 */
const minutesToTime = (minutes) => {
  if (!minutes || isNaN(minutes)) return '--:--'
  const hour = Math.floor(minutes / 60) % 24
  const minute = minutes % 60
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

/* ================= 计算属性（派生数据） ================= */
/**
 * 当前排期的结束时间（开始时间+影片时长）
 */
const endTime = computed(() => {
  if (!localItem.value.startTime || !localItem.value.duration) return '--:--'
  const startMinutes = toMinutes(localItem.value.startTime)
  const totalMinutes = startMinutes + localItem.value.duration
  return minutesToTime(totalMinutes)
})

/**
 * 空场间隔（核心：当前场结束时间 - 下一场开始时间）
 * - 有下一场：显示分钟数 | 时间异常：显示"异常"
 * - 无下一场：显示"--"
 */
const interval = computed(() => {
  // 获取紧邻的下一场排期
  const nextItem = props.list[props.index + 1]

  // 无下一场 → 显示--
  if (!nextItem || !nextItem.startTime) return '--'

  // 计算时间差
  const currentEndMinutes = toMinutes(endTime.value)
  const nextStartMinutes = toMinutes(nextItem.startTime)
  const gapMinutes = nextStartMinutes - currentEndMinutes

  // 正常显示分钟数，异常显示"异常"
  return gapMinutes >= 0 ? `${gapMinutes} 分` : '异常'
})

/* ================= 业务逻辑方法 ================= */
/**
 * 影片选择变更回调
 * @param {string} movieId - 选中的影片ID
 */
const onMovieChange = (movieId) => {
  const movie = props.movieList.find((m) => m.id === movieId)
  if (!movie) {
    ElMessage.warning('未找到选中的影片信息')
    return
  }
  // 更新本地排期数据（影片相关）
  localItem.value.movieId = movie.id
  localItem.value.movieName = movie.name
  localItem.value.duration = movie.duration
}

/**
 * 进入编辑模式（备份原始数据）
 */
const enterEdit = () => {
  originItem.value = { ...localItem.value }
  editing.value = true
}

/**
 * 取消编辑（恢复原始数据）
 */
const cancelEdit = () => {
  localItem.value = { ...originItem.value }
  editing.value = false
  ElMessage.info('已取消编辑，未保存任何修改')
}

/**
 * 保存排期修改（调用API）
 */
const saveUpdate = async () => {
  try {
    // 基础参数校验
    if (!localItem.value.id) {
      ElMessage.warning('排期ID不存在，无法更新')
      return
    }
    if (!localItem.value.movieName || !localItem.value.startTime) {
      ElMessage.warning('影片名称和开始时间不能为空')
      return
    }

    // 构造API请求参数（转为JSON字符串适配后端）
    const updateData = JSON.stringify({
      movie_name: localItem.value.movieName,
      start_time: localItem.value.startTime,
    })

    // 调用更新排期API
    await DataApi.CagMovies(localItem.value.id, updateData)

    // 状态重置 + 提示 + 通知父组件刷新
    editing.value = false
    emit('updated')
  } catch (error) {
    console.error('更新排期失败：', error)
  }
}

/**
 * 删除当前排期（调用API）
 */
const deleteItem = async () => {
  // 二次确认防误删
  if (!confirm('确定要删除该排期吗？')) return

  try {
    // 基础参数校验
    if (!localItem.value.id) {
      ElMessage.warning('排期ID不存在，无法删除')
      return
    }
    const data = JSON.stringify({
      deleted_at: 1,
    })
    // 调用删除排期API
    await DataApi.CagMovies(localItem.value.id, data)
    emit('deleted')
  } catch (error) {
    console.error('删除排期失败：', error)
  }
}
</script>

<template>
  <ElRow class="schedule-item" align="middle">
    <!-- 影片名称列 -->
    <ElCol :span="5" class="col-content">
      <ElSelect
        v-if="editing"
        v-model="localItem.movieId"
        @change="onMovieChange"
        placeholder="选择影片"
        size="small"
        style="width: 100px"
      >
        <ElOption
          v-for="movie in movieList"
          :key="movie.id"
          :label="movie.name"
          :value="movie.id"
        />
      </ElSelect>
      <span v-else>{{ localItem.movieName || '--' }}</span>
    </ElCol>
    <!-- 开始时间列 -->
    <ElCol :span="4" class="col-content">
      <ElTimePicker
        v-if="editing"
        v-model="localItem.startTime"
        format="HH:mm"
        value-format="HH:mm"
        placeholder="选择开始时间"
        size="small"
        style="width: 100px"
      />
      <span v-else>{{ localItem.startTime || '--:--' }}</span>
    </ElCol>
    <!-- 结束时间列 -->
    <ElCol :span="3" class="col-content">
      <span>{{ endTime }}</span>
    </ElCol>
    <!-- 影片时长列 -->
    <ElCol :span="3" class="col-content">
      <span>{{ localItem.duration || 0 }} 分</span>
    </ElCol>
    <!-- 空场间隔列（异常标红） -->
    <ElCol :span="3" class="col-content">
      <span :style="{ color: interval === '异常' ? '#f56c6c' : 'inherit' }">
        {{ interval }}
      </span>
    </ElCol>
    <!-- 操作列 -->
    <ElCol :span="5" class="col-content">
      <ElButton
        v-if="!editing"
        size="small"
        type="primary"
        @click="enterEdit"
        style="margin-right: 4px"
      >
        编辑
      </ElButton>
      <ElButton
        v-if="editing"
        size="small"
        type="success"
        @click="saveUpdate"
        style="margin-right: 4px"
      >
        保存
      </ElButton>
      <ElButton
        v-if="editing"
        size="small"
        type="info"
        @click="cancelEdit"
        style="margin-right: 4px"
      >
        取消
      </ElButton>
      <ElButton size="small" type="danger" @click="deleteItem"> 删除 </ElButton>
    </ElCol>
  </ElRow>
</template>
<style scoped>
/* 单条排期项样式 */
.schedule-item {
  padding: 12px 0;
  border-bottom: 1px solid #1f2937;
  transition: background-color 0.2s ease;
}
.schedule-item:hover {
  background-color: rgba(31, 41, 55, 0.5);
  border-radius: 4px;
}

/* 列内容容器 */
.col-content {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4px 0;
  color: #f5e7c1;
  font-size: 14px;
}

/* 文本内容兜底 */
.text-content {
  line-height: 1.5;
}

/* 跨天标签样式 */
.day-tag {
  color: #f59e0b;
  font-size: 12px;
  margin-left: 4px;
}

/* 表单控件样式 */
.form-control {
  width: 100%;
  font-size: 14px;
}

/* 操作按钮容器 */
.operation-col {
  display: flex;
  gap: 8px;
  justify-content: center;
}

/* 按钮样式统一 */
.btn-edit {
  background-color: #2563eb;
  border-color: #2563eb;
}
.btn-edit:hover {
  background-color: #1d4ed8;
}
.btn-save {
  background-color: #059669;
  border-color: #059669;
}
.btn-save:hover {
  background-color: #047857;
}
.btn-cancel {
  background-color: #64748b;
  border-color: #64748b;
}
.btn-cancel:hover {
  background-color: #475569;
}
.btn-delete {
  background-color: #dc2626;
  border-color: #dc2626;
}
.btn-delete:hover {
  background-color: #b91c1c;
}

/* ElementUI样式穿透（深色模式适配） */
:deep(.el-select .el-input__wrapper),
:deep(.el-time-editor) {
  background: #1f2937;
  border: 1px solid #374151;
  color: #e5e7eb;
}
:deep(.el-select .el-input__wrapper:hover),
:deep(.el-time-editor:hover) {
  border-color: #38bdf8;
}
:deep(.el-time-editor__content) {
  color: #e5e7eb;
}
:deep(.el-button--small) {
  padding: 6px 12px;
  font-size: 12px;
  border-radius: 4px;
}

/* 响应式适配 */
@media (max-width: 768px) {
  .operation-col {
    flex-wrap: wrap;
    gap: 4px;
  }
  .el-button--small {
    padding: 4px 8px;
  }
}
</style>
