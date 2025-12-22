<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { dayjs } from 'element-plus'
import { ElMessage } from 'element-plus'
import GetDataFunc from '@/utils/API/Data'
import PickTime from '@/components/Item/PickTime.vue'
import PickNum from '@/components/Item/PickNum.vue'

// 引入date工具函数（如果没全局引入，这里手动定义）
const formatDate = (v?: string) => {
  if (!v) return ''
  return dayjs(v).format('YYYY-MM-DD')
}

/* ================= 状态 ================= */
const loading = ref(false)
const movies = ref<any[]>([])
const dialogVisible = ref(false)
const isEdit = ref(false)
const tableHeader = ref([
  { label: 'ID' },
  { label: '名称' },
  { label: '时长' },
  { label: '开灯' },
  { label: '彩蛋' },
  { label: '上映' },
  { label: '截至' },
  { label: '操作' },
])

/* ================= 表单 ================= */
const form = ref({
  id: '',
  movie_name: '',
  duration_minutes: 90,
  movie_source_id: '',

  // 👉 开灯提前量（前端展示用）
  light_offset_minute: 0,
  light_offset_second: 0,

  release_date: '', // 上映日期（默认今日）
  valid_until: '', // 下线日期（默认今日+60天）
  egg: 0,
})

/* ================= 数据加载 ================= */
const loadMovies = async () => {
  try {
    loading.value = true
    const { data: res } = await GetDataFunc.GetMoviesInfo('get')

    // 👇 永远保证是数组，防止 el-table 炸
    if (Array.isArray(res.data)) {
      movies.value = res.data
    } else {
      movies.value = []
    }
  } catch {
    movies.value = []
  } finally {
    loading.value = false
  }
}

onMounted(loadMovies)

/* ================= 新建 ================= */
const openCreate = () => {
  isEdit.value = false
  // 1. 获取今日日期（YYYY-MM-DD）
  const today = dayjs().format('YYYY-MM-DD')
  // 2. 计算今日+60天的日期
  const validUntil = dayjs().add(60, 'day').format('YYYY-MM-DD')

  form.value = {
    id: '',
    movie_source_id: '',
    movie_name: '',
    duration_minutes: 90,
    light_offset_minute: 0,
    light_offset_second: 0,
    release_date: today, // 默认今日
    valid_until: validUntil, // 默认今日+60天
    egg: 0,
  }
  dialogVisible.value = true
}

/* ================= 编辑 ================= */
const openEdit = (row: any) => {
  isEdit.value = true

  const total = row.light_offset_seconds ?? 0

  form.value = {
    id: row.id,
    movie_source_id: row.movie_source_id,
    movie_name: row.movie_name,
    duration_minutes: Math.floor(row.duration_seconds / 60),

    // 👇 秒 → 分 + 秒
    light_offset_minute: Math.floor(total / 60),
    light_offset_second: total % 60,

    release_date: row.release_date,
    valid_until: row.valid_until,
    egg: row.egg ?? 0,
  }

  dialogVisible.value = true
}

/* ================= 保存 ================= */
const onSubmit = async () => {
  const {
    movie_source_id,
    movie_name,
    duration_minutes,
    light_offset_minute,
    light_offset_second,
    release_date,
    valid_until,
    egg,
  } = form.value

  // 核心校验：只校验影片名称（快速提交）
  if (!movie_name) {
    ElMessage.warning('请填写影片名称')
    return
  }

  const duration_seconds = Number(duration_minutes) * 60

  // ✅ 分 + 秒 → 总秒（强制 number）
  const minute = Number(light_offset_minute) || 0
  const second = Number(light_offset_second) || 0
  const light_offset_seconds = minute * 60 + second

  // ✅ 日期只保留 YYYY-MM-DD
  const toDateOnly = (v: string) => v?.slice(0, 10)

  try {
    if (isEdit.value) {
      await GetDataFunc.CagMoviesInfo(
        movie_source_id,
        movie_name,
        duration_seconds,
        light_offset_seconds,
        toDateOnly(release_date),
        toDateOnly(valid_until),
        egg,
      )
    } else {
      await GetDataFunc.AddMoviesInfo(
        movie_name,
        duration_seconds,
        light_offset_seconds,
        toDateOnly(release_date),
        toDateOnly(valid_until),
        Number(egg) || 0,
      )
    }
    ElMessage.success(isEdit.value ? '编辑成功' : '新建成功')
    dialogVisible.value = false
    loadMovies()
  } catch (err) {
    ElMessage.error(isEdit.value ? '编辑失败' : '新建失败')
    console.error('提交失败：', err)
  }
}
/* ================= 删除 ================= */
const deleteInfo = async (id: string) => {
  // 1. 删除前确认（避免误操作）
  try {
    // Element Plus 的 ElMessageBox 确认弹窗（需要先引入）
    const { ElMessageBox } = await import('element-plus')
    const result = await ElMessageBox.confirm('此操作将永久删除该影片数据, 是否继续?', '删除确认', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning',
      // 适配你的深色主题样式
      customClass: 'mobile-dialog',
    })

    // 2. 用户确认后执行删除
    if (result === 'confirm') {
      await GetDataFunc.DelMoviesInfo(id)
      ElMessage.success('删除成功')
      dialogVisible.value = false // ✅ 关键：删除成功后关闭弹窗
      isEdit.value = false // 重置编辑状态
      loadMovies() // 重新加载列表
    }
  } catch (err) {
    // 3. 处理取消/错误场景
    if (err !== 'cancel') {
      // 排除用户点击取消的情况
      ElMessage.error('删除失败，请稍后重试')
      console.error('删除失败：', err)
    }
  }
}
</script>

<template>
  <div class="page">
    <div class="header">
      <h2>🎬 影片库管理</h2>
      <el-button type="primary" @click="openCreate"> 新建影片 </el-button>
    </div>

    <!-- 列表 -->
    <div class="tableBox">
      <div class="tableHeader">
        <div v-for="(value, key) in tableHeader" :key="key">{{ value.label }}</div>
      </div>
      <div class="tableContent">
        <div v-for="(item, index) in movies" :key="index" class="tableItem">
          <div class="Node">{{ item.movie_source_id }}</div>
          <div class="Node moviename">{{ item.movie_name }}</div>
          <div class="Node">{{ Math.floor(item.duration_seconds / 60) }} 分钟</div>
          <div class="Node">{{ item.light_offset_seconds }} 秒</div>
          <div class="Node">{{ item.egg }}</div>
          <div class="Node">{{ formatDate(item.release_date) }}</div>
          <div class="Node">{{ formatDate(item.valid_until) }}</div>
          <div class="Node">
            <el-button size="small" type="primary" plain @click="openEdit(item)"> 编辑 </el-button>
          </div>
        </div>
      </div>
    </div>
    <!-- 弹窗 -->
    <el-dialog
      v-model="dialogVisible"
      width="80%"
      :close-on-click-modal="false"
      class="mobile-dialog"
      :before-close="() => (dialogVisible = false)"
    >
      <template #title>
        <span class="dialog-title">
          {{ isEdit ? '编辑影片' : '新建影片' }}
        </span>
      </template>
      <div class="dialog-content">
        <el-form label-position="top" class="movie-form">
          <!-- 基本信息 -->
          <div class="form-section basic-info">
            <div class="section-header">
              <div class="section-icon">🎬</div>
              <h4 class="section-title">基本信息</h4>
            </div>

            <div class="section-content">
              <el-form-item label="影片名称" required>
                <el-input v-model="form.movie_name" placeholder="请输入影片名称" />
              </el-form-item>

              <el-form-item label="影片时长（分钟）" required>
                <el-input-number
                  v-model="form.duration_minutes"
                  :min="1"
                  :max="500"
                  style="width: 100%"
                />
              </el-form-item>
            </div>
          </div>

          <!-- 播放设置 -->
          <div class="form-section playback-settings">
            <div class="section-header">
              <div class="section-icon">⚙️</div>
              <h4 class="section-title">播放设置</h4>
            </div>
            <div class="section-content double-flex">
              <el-form-item label="开灯提前量" required>
                <div class="time-picker-group">
                  <div class="time-input-wrapper">
                    <PickNum v-model="form.light_offset_minute" :min="0" :max="60" />
                    <span class="time-unit">分</span>
                    <PickNum v-model="form.light_offset_second" :min="0" :max="59" />
                    <span class="time-unit">秒</span>
                  </div>
                </div>
              </el-form-item>

              <el-form-item label="彩蛋数量">
                <div class="egg-input-wrapper">
                  <PickNum v-model="form.egg" :min="0" :max="10" />
                  <span class="egg-hint">个彩蛋</span>
                </div>
              </el-form-item>
            </div>
          </div>

          <!-- 日期范围 -->
          <div class="form-section date-range">
            <div class="section-header">
              <div class="section-icon">📅</div>
              <h4 class="section-title">日期范围</h4>
            </div>

            <div class="section-content">
              <el-form-item label="上映日期" required>
                <PickTime v-model="form.release_date" />
              </el-form-item>

              <el-form-item label="有效期截止" required>
                <PickTime v-model="form.valid_until" />
              </el-form-item>
            </div>
          </div>
          <!-- 日期范围 -->
          <div class="form-section date-range">
            <div class="section-header">
              <div class="section-icon">⚠</div>
              <h4 class="section-title">操作</h4>
            </div>

            <div class="section-content">
              <el-button size="small" type="danger" plain @click="deleteInfo(form.movie_source_id)">
                删除
              </el-button>
            </div>
          </div>
        </el-form>
      </div>

      <template #footer>
        <div class="dialog-footer">
          <el-button @click="dialogVisible = false" class="cancel-btn">取消</el-button>
          <el-button type="primary" @click="onSubmit" class="submit-btn">提交</el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.page {
  padding: 6px;
  color: #ffffff;
  min-height: 100vh;
  font-family: 'Arial', sans-serif;
}
.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  padding: 15px;
  background: linear-gradient(90deg, #151520 0%, #0a0a0f 100%);
  border-radius: 8px;
  box-shadow: 0 4px 15px rgba(0, 81, 255, 0.1);
  border-left: 4px solid #0051ff;
}
.header h2 {
  margin: 0;
  color: #ffffff;
  text-shadow: 0 0 10px rgba(0, 81, 255, 0.5);
}
.offset {
  display: flex;
  flex-direction: row;
  flex-wrap: nowrap;
  align-items: center;
  justify-content: space-between;
}
.title {
  margin: 0 20px;
  color: #a8c7ff;
}
.content {
  max-width: 100px;
  word-wrap: break-word;
}

/* 杜比风格表格容器 */
.tableBox {
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
  background: llinear-gradient(135deg, #151520 0%, #0000003b 100%);
  border: 1px solid rgba(0, 81, 255, 0.3);
}

/* 表头样式 */
.tableHeader {
  width: 100%;
  display: flex;
  justify-content: space-around;
  align-items: center;
  background: linear-gradient(90deg, #151520 0%, #0a0a0f 100%);
  padding: 15px 0;
  border-bottom: 2px solid #0051ff;
  box-shadow: 0 4px 8px rgba(0, 81, 255, 0.2);
}
.tableHeader div {
  width: 100px;
  text-align: center;
  color: #ffffff;
  font-weight: bold;
  text-shadow: 0 0 8px rgba(0, 81, 255, 0.7);
  font-size: 14px;
  position: relative;
}
.tableHeader div::after {
  content: '';
  position: absolute;
  bottom: -2px;
  left: 0;
  right: 0;
  height: 1px;
  background: linear-gradient(90deg, transparent, #0051ff, transparent);
}

/* 表格内容区域 */
.tableContent {
  max-height: 70vh;
  overflow-y: auto;
}

/* 滚动条样式 */
.tableContent::-webkit-scrollbar {
  width: 8px;
}
.tableContent::-webkit-scrollbar-track {
  background: rgba(21, 22, 32, 0.5);
}
.tableContent::-webkit-scrollbar-thumb {
  background: linear-gradient(180deg, #0051ff, #0031cc);
  border-radius: 4px;
}

/* 表格行样式 */
.tableItem {
  width: 100%;
  display: flex;
  justify-content: space-around;
  align-items: center;
  padding: 12px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  transition: all 0.3s ease;
  position: relative;
  overflow: hidden;
}
.tableItem::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  background: #0051ff;
  transform: scaleY(0);
  transition: transform 0.3s ease;
}
.tableItem:hover {
  background: rgba(0, 81, 255, 0.1);
  /* transform: translateX(3px); */
}
.tableItem:hover::before {
  transform: scaleY(1);
}

/* 单元格样式 */
.Node {
  width: 100px;
  text-align: center;
  color: #a8c7ff;
  word-wrap: break-word;
  padding: 5px;
}
.Node.moviename {
  font-weight: bold;
  color: #ffffff;
}

/* 移动端弹窗样式 */
.mobile-dialog {
  --el-dialog-bg-color: #151520;
  --el-dialog-border-color: rgba(0, 81, 255, 0.3);
  --el-text-color-primary: #ffffff;
  --el-border-color: rgba(255, 255, 255, 0.2);
  --el-fill-color-blank: #151520;
}

/* 弹窗内容容器 */
.mobile-dialog .el-dialog {
  border-radius: 12px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.7);
  border: 1px solid rgba(0, 81, 255, 0.3);
  overflow: hidden;
}

/* 弹窗标题 */
.mobile-dialog .el-dialog__header {
  background: linear-gradient(90deg, #151520 0%, #0a0a0f 100%);
  padding: 15px 20px;
  border-bottom: 1px solid rgba(0, 81, 255, 0.3);
  margin: 0;
}

.mobile-dialog .el-dialog__title {
  color: #ffffff;
  font-weight: bold;
  text-shadow: 0 0 10px rgba(0, 81, 255, 0.5);
}

/* 弹窗关闭按钮 */
.mobile-dialog .el-dialog__headerbtn {
  top: 15px;
  right: 15px;
}

.mobile-dialog .el-dialog__headerbtn .el-dialog__close {
  color: #a8c7ff;
  font-size: 18px;
}

.mobile-dialog .el-dialog__headerbtn .el-dialog__close:hover {
  color: #0051ff;
}

/* 弹窗主体 */
.mobile-dialog .el-dialog__body {
  background: #151520;
  padding: 20px;
  max-height: 70vh;
  overflow-y: auto;
}

/* 表单项样式 */
.mobile-dialog .el-form-item {
  margin-bottom: 18px;
}

.mobile-dialog .el-form-item__label {
  color: #a8c7ff;
  font-weight: bold;
  margin-bottom: 8px;
}

/* 输入框样式 */
.mobile-dialog .el-input {
  --el-input-border-color: rgba(255, 255, 255, 0.2);
  --el-input-focus-border-color: #0051ff;
  --el-input-hover-border-color: rgba(0, 81, 255, 0.5);
}

.mobile-dialog .el-input__wrapper {
  background: #0a0a0f;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 6px;
  box-shadow: none;
  transition: all 0.3s ease;
}

.mobile-dialog .el-input__wrapper:hover {
  border-color: rgba(0, 81, 255, 0.5);
  box-shadow: 0 0 5px rgba(0, 81, 255, 0.2);
}

.mobile-dialog .el-input__wrapper.is-focus {
  border-color: #0051ff;
  box-shadow: 0 0 8px rgba(0, 81, 255, 0.3);
}

.mobile-dialog .el-input__inner {
  color: #ffffff;
  background: transparent;
}

/* 数字输入框样式 */
.mobile-dialog .el-input-number {
  width: 100%;
  --el-input-number-border-color: rgba(255, 255, 255, 0.2);
  --el-input-number-focus-border-color: #0051ff;
}

.mobile-dialog .el-input-number .el-input__wrapper {
  background: #0a0a0f;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 6px;
}

.mobile-dialog .el-input-number__increase,
.mobile-dialog .el-input-number__decrease {
  background: #151520;
  border-color: rgba(255, 255, 255, 0.2);
  color: #a8c7ff;
}

/* 弹窗底部按钮区域 */
.mobile-dialog .el-dialog__footer {
  background: #151520;
  padding: 15px 20px;
  border-top: 1px solid rgba(0, 81, 255, 0.3);
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

/* 按钮样式 */
.mobile-dialog .el-button {
  border-radius: 6px;
  padding: 10px 20px;
  font-weight: bold;
}

.mobile-dialog .el-button--default {
  background: #0a0a0f;
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: #a8c7ff;
}

.mobile-dialog .el-button--default:hover {
  border-color: #0051ff;
  color: #ffffff;
  box-shadow: 0 0 8px rgba(0, 81, 255, 0.3);
}

.mobile-dialog .el-button--primary {
  background: linear-gradient(90deg, #0051ff, #0031cc);
  border: 1px solid #0051ff;
  color: #ffffff;
}

.mobile-dialog .el-button--primary:hover {
  background: linear-gradient(90deg, #0061ff, #0041dd);
  box-shadow: 0 0 8px rgba(0, 81, 255, 0.5);
}

/* 移动端适配 - 大屏幕 */
@media (min-width: 768px) {
  .mobile-dialog {
    width: 500px;
  }
}

/* 移动端适配 - 小屏幕 */
@media (max-width: 767px) {
  .mobile-dialog {
    width: 95%;
    margin-top: 10vh !important;
  }

  .mobile-dialog .el-dialog__body {
    padding: 15px;
  }

  .mobile-dialog .el-dialog__footer {
    flex-direction: column;
    gap: 8px;
  }

  .mobile-dialog .el-button {
    width: 100%;
    margin: 0;
  }

  .tableHeader div {
    font-size: 1rem;
  }
  .Node {
    font-size: 10px;
    word-break: break-all;
  }
}

/* 超小屏幕适配 */
@media (max-width: 480px) {
  .mobile-dialog {
    width: 98%;
    margin-top: 5vh !important;
  }

  .mobile-dialog .el-dialog__header {
    padding: 12px 15px;
  }

  .mobile-dialog .el-dialog__body {
    padding: 10px 15px;
    max-height: 75vh;
  }
}

/* 弹窗内容容器 */
.dialog-content {
  padding: 5px;
  height: 50vh;
  overflow-y: scroll;
}
:deep(.el-dialog) {
  background-color: #223d57;
}
/* 表单布局优化 */
.movie-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
:deep(.el-form-item__label),
.dialog-title {
  font-size: 1.2rem;
  font-weight: 800;
  color: rgb(255, 255, 255);
}
/* 表单分区样式 */
.form-section {
  border-radius: 10px;
  overflow: hidden;
  border: 1px solid rgba(0, 81, 255, 0.2);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
  transition: all 0.3s ease;
}

.form-section:hover {
  border-color: rgba(0, 81, 255, 0.4);
  box-shadow: 0 6px 16px rgba(0, 81, 255, 0.1);
}

/* 分区头部 */
.section-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  background: linear-gradient(90deg, rgba(0, 81, 255, 0.1) 0%, rgba(10, 10, 15, 0.8) 100%);
  border-bottom: 1px solid rgba(0, 81, 255, 0.2);
}

.section-icon {
  font-size: 18px;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 81, 255, 0.15);
  border-radius: 50%;
  box-shadow: 0 0 8px rgba(0, 81, 255, 0.3);
}

.section-title {
  color: #ffffff;
  margin: 0;
  font-size: 16px;
  font-weight: bold;
  text-shadow: 0 0 5px rgba(0, 81, 255, 0.5);
}

/* 分区内容 */
.section-content {
  padding: 16px;
  background: rgba(10, 10, 15, 0.4);
}

@media only screen and (min-width: 755px) {
  .double-flex {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
  }
}
/* 特定分区的主题色 */
.basic-info {
  border-left: 4px solid #0051ff;
}

.basic-info .section-header {
  background: linear-gradient(90deg, rgba(0, 81, 255, 0.15) 0%, rgba(10, 10, 15, 0.8) 100%);
}

.playback-settings {
  border-left: 4px solid #ff6b00;
}

.playback-settings .section-header {
  background: linear-gradient(90deg, rgba(255, 107, 0, 0.15) 0%, rgba(10, 10, 15, 0.8) 100%);
}

.date-range {
  border-left: 4px solid #00d4ff;
}

.date-range .section-header {
  background: linear-gradient(90deg, rgba(0, 212, 255, 0.15) 0%, rgba(10, 10, 15, 0.8) 100%);
}

/* 时间选择器组 */
.time-picker-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.time-input-wrapper {
  display: flex;
  align-items: center;
  background: rgba(10, 10, 15, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 6px;
  padding: 4px;
  flex: 1;
}

.time-unit {
  color: #a8c7ff;
  font-weight: bold;
  margin-left: 8px;
  margin-right: 4px;
}
/* 彩蛋输入组 */
.egg-input-wrapper {
  display: flex;
  align-items: center;
  gap: 10px;
}

.egg-hint {
  color: #a8c7ff;
  font-weight: bold;
}

/* 弹窗底部按钮优化 */
.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 5px;
}

.cancel-btn,
.submit-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 10px 20px;
  border-radius: 6px;
  font-weight: bold;
  min-width: 80px;
  height: 40px;
}

.cancel-btn {
  background: #0a0a0f;
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: #a8c7ff;
}

.cancel-btn:hover {
  border-color: #0051ff;
  color: #ffffff;
  box-shadow: 0 0 8px rgba(0, 81, 255, 0.3);
}

.submit-btn {
  background: linear-gradient(90deg, #0051ff, #0031cc);
  border: 1px solid #0051ff;
  color: #ffffff;
}

.submit-btn:hover {
  background: linear-gradient(90deg, #0061ff, #0041dd);
  box-shadow: 0 0 8px rgba(0, 81, 255, 0.5);
}

/* 移动端适配 - 中等屏幕 */
@media (max-width: 755px) {
  .section-header {
    padding: 10px 12px;
  }

  .section-content {
    padding: 12px;
  }

  .movie-form {
    gap: 12px;
  }

  .dialog-footer {
    gap: 10px;
  }

  .cancel-btn,
  .submit-btn {
    flex: 1;
    height: 44px;
  }
}

/* 移动端适配 - 小屏幕 */
@media (max-width: 480px) {
  .dialog-content {
    padding: 0;
  }

  .time-picker-group {
    flex-direction: column;
    gap: 10px;
  }

  .time-input-wrapper {
    width: 100%;
    justify-content: space-between;
  }

  .time-separator {
    display: none;
  }

  .dialog-footer {
    /* 保持按钮顺序，不反转 */
    gap: 8px;
  }

  .cancel-btn,
  .submit-btn {
    flex: 1;
    justify-content: center;
    padding: 12px 0;
    height: 44px;
  }

  .section-header {
    padding: 8px 12px;
  }

  .section-content {
    padding: 10px 12px;
  }
}
</style>
