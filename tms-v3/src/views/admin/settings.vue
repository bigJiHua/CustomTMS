<script setup>
import { ref, onMounted, computed } from 'vue'
import { ElMessage, ElInput, ElInputNumber, ElSwitch, ElButton } from 'element-plus'
import SystemValue from '@/utils/API/System'

/* ================= 状态 ================= */
const loading = ref(false)
const settings = ref([])
const isEditor = ref(false)
const data = ref({
  api: [],
  config: {},
})

// 新增：记录当前编辑的行ID和临时值
const editingId = ref(null)
const editValue = ref('')

/* ================= 创建配置表单 ================= */
const createForm = ref({
  group_key: '',
  setting_key: '',
  value_type: 'string',
  setting_value: '',
  description: '',
})

/* ================= 加载配置 ================= */
const loadSettings = async () => {
  loading.value = true
  try {
    const { data: res } = await SystemValue.getSystemValue()
    settings.value = res.data
    data.value.config = res.data.filter((item) => item.group_key === 'config')
    data.value.api = res.data.filter((item) => item.group_key === 'api')
  } finally {
    loading.value = false
  }
}

onMounted(loadSettings)

/* ================= 创建配置 ================= */
const createSetting = async () => {
  const f = createForm.value
  if (!f.group_key || !f.setting_key) {
    ElMessage.warning('group_key 和 setting_key 必填')
    return
  }

  await SystemValue.addSystemValue({
    ...f,
    updated_by: 'admin',
  })
  createForm.value = {
    group_key: '',
    setting_key: '',
    value_type: 'string',
    setting_value: '',
    description: '',
  }
  isEditor.value = false
  loadSettings()
}

/* ================= 更新布尔开关 ================= */
const toggleSetting = async (row) => {
  await SystemValue.updateSystemValue({
    id: row.id,
    setting_value: String(row.setting_value),
    updated_by: 'admin',
  })
}

/* ================= 编辑相关方法 ================= */
// 开始编辑
const ChangeItem = (row) => {
  editingId.value = row.id
  // 根据值类型初始化编辑值
  if (row.value_type === 'boolean') {
    editValue.value = row.setting_value === 'true' || row.setting_value === true
  } else if (row.value_type === 'number') {
    editValue.value = Number(row.setting_value)
  } else {
    editValue.value = row.setting_value
  }
}

// 取消编辑
const cancelEdit = () => {
  editingId.value = null
  editValue.value = ''
}

// 保存编辑
const saveEdit = async (row) => {
  try {
    let finalValue = editValue.value

    // 根据值类型处理最终值
    if (row.value_type === 'boolean') {
      finalValue = String(finalValue)
    } else if (row.value_type === 'number') {
      finalValue = String(finalValue)
    }
    await SystemValue.updateSystemValue({
      id: row.id,
      setting_value: finalValue,
      updated_by: 'admin',
    })
    // 重新加载数据
    loadSettings()
    // 退出编辑状态
    cancelEdit()
  } catch (error) {
    console.error('保存失败:', error)
  }
}
// 处理超长文本的计算属性（Vue3 setup 语法）
const formatLongText = computed(() => {
  return (text) => {
    // 空值处理
    if (!text) return ''
    // 统一转为字符串，兼容数字/布尔等类型
    const str = String(text)
    // 超过100字符则显示前20字符+省略号，否则显示原文本
    return str.length > 100 ? `${str.substring(0, 20)}...` : str
  }
})
</script>

<template>
  <div class="page">
    <!-- 创建系统变量 -->
    <div class="card-container" v-if="isEditor">
      <div class="card-header">
        <div style="display: flex; align-items: center; gap: 12px">
          <div class="header-icon">➕</div>
          <h4 class="header-title">创建系统变量</h4>
        </div>
        <div class="btn" @click="isEditor = false">
          <span>[查看状态]</span>
        </div>
      </div>
      <div class="card-content">
        <el-form label-position="top" class="settings-form">
          <el-form-item label="分组 (group_key)">
            <el-input v-model="createForm.group_key" placeholder="site / schedule / crawler" />
          </el-form-item>

          <el-form-item label="键名 (setting_key)">
            <el-input v-model="createForm.setting_key" placeholder="open_register" />
          </el-form-item>

          <el-form-item label="值类型 (value_type)">
            <el-select v-model="createForm.value_type">
              <el-option label="字符串" value="string" />
              <el-option label="数字" value="number" />
              <el-option label="布尔" value="boolean" />
            </el-select>
          </el-form-item>

          <el-form-item label="值 (setting_value)">
            <el-input v-model="createForm.setting_value" />
          </el-form-item>

          <el-form-item label="说明">
            <el-input v-model="createForm.description" />
          </el-form-item>

          <el-button type="primary" @click="createSetting" class="submit-btn">创建变量</el-button>
        </el-form>
      </div>
    </div>

    <!-- 系统开关 -->
    <div class="table-container" v-else>
      <div class="table-header">
        <div style="display: flex; align-items: center; gap: 12px">
          <div class="header-icon">🔘</div>
          <h4 class="header-title">系统开关</h4>
        </div>
        <div class="btn" @click="isEditor = true">
          <span>[创建变量]</span>
        </div>
      </div>
      <div class="table-content">
        <table class="settings-table" v-for="(newVal, key) in data" :key="key">
          <thead>
            <tr class="table-header-row">
              <th width="20">分组</th>
              <th width="100">说明</th>
              <th width="100">状态</th>
              <th width="100">配置项</th>
              <th width="100">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(item, index) in newVal" :key="index" class="table-row">
              <td>{{ item.group_key }}</td>
              <td>{{ item.description }}</td>
              <td>
                <!-- 编辑状态显示对应输入控件 -->
                <template v-if="editingId === item.id">
                  <div style="display: flex; gap: 8px; align-items: center">
                    <!-- 布尔类型 -->
                    <el-switch
                      v-if="item.value_type === 'boolean'"
                      v-model="editValue"
                      class="setting-switch"
                    />
                    <!-- 数字类型 -->
                    <el-input-number
                      v-else-if="item.value_type === 'number'"
                      v-model="editValue"
                      style="width: 100%"
                    />
                    <!-- 字符串类型 -->
                    <el-input v-else v-model="editValue" style="width: 100%" />
                  </div>
                </template>
                <!-- 非编辑状态显示文本 -->
                <template v-else>
                  <span v-if="item.value_type === 'boolean'">
                    {{
                      item.setting_value === 'true' || item.setting_value === true ? '开启' : '关闭'
                    }}
                  </span>
                  <span v-else>{{ formatLongText(item.setting_value) }}</span>
                </template>
              </td>
              <td>{{ item.setting_key }}</td>
              <td style="display: flex; gap: 8px">
                <!-- 编辑状态显示保存/取消 -->
                <template v-if="editingId === item.id">
                  <span @click="saveEdit(item)" style="color: #00d4ff; cursor: pointer"
                    >[保存]</span
                  >
                  <span @click="cancelEdit" style="color: #ff6b00; cursor: pointer">[取消]</span>
                </template>
                <!-- 非编辑状态显示编辑 -->
                <template v-else>
                  <span @click="ChangeItem(item)" style="color: #0055ff; cursor: pointer"
                    >[编辑]</span
                  >
                </template>
              </td>
            </tr>
          </tbody>
        </table>
        <div v-if="loading" class="loading-overlay">
          <div class="loading-spinner"></div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 原有样式保持不变，这里省略 */
.page {
  padding: 6px;
  /* background-color: #0a0a0f; */
  color: #ffffff;
  min-height: 100vh;
  font-family: 'Arial', sans-serif;
  padding: 30px;
}
.btn {
  color: #0055ff;
}
.btn > span:hover {
  cursor: pointer;
}
.card-header::after,
.table-header::after {
  pointer-events: none;
}
:deep(.el-form-item__label) {
  font-size: 1.2rem;
  font-weight: 800;
  color: rgb(255, 255, 255);
}

/* 卡片容器样式 */
.card-container {
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid rgba(0, 81, 255, 0.2);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.3);
  background: linear-gradient(145deg, #151520 0%, #0a0a0f 100%);
  margin-bottom: 25px;
  border-left: 4px solid #ff6b00;
  transition: all 0.4s ease;
}

.card-container:hover {
  box-shadow: 0 8px 25px rgba(255, 107, 0, 0.15);
  border-color: rgba(255, 107, 0, 0.4);
}

.card-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 20px;
  background: linear-gradient(90deg, rgba(255, 107, 0, 0.2) 0%, rgba(10, 10, 15, 0.9) 100%);
  border-bottom: 2px solid rgba(255, 107, 0, 0.4);
  position: relative;
  overflow: hidden;
  justify-content: space-between;
}

.card-header::after {
  content: '';
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: 80px;
  background: linear-gradient(90deg, transparent, rgba(255, 107, 0, 0.1));
}

.header-icon {
  font-size: 20px;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, rgba(255, 107, 0, 0.3), rgba(255, 107, 0, 0.1));
  border-radius: 50%;
  box-shadow: 0 0 12px rgba(255, 107, 0, 0.4);
  border: 1px solid rgba(255, 107, 0, 0.3);
}

.header-title {
  color: #ffffff;
  margin: 0;
  font-size: 18px;
  font-weight: bold;
  text-shadow: 0 0 8px rgba(255, 107, 0, 0.6);
  letter-spacing: 0.5px;
}

.card-content {
  padding: 20px;
  background: linear-gradient(145deg, rgba(10, 10, 15, 0.6), rgba(10, 10, 15, 0.3));
}

/* 表单样式 */
.settings-form {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 20px;
}

.settings-form .el-form-item {
  margin-bottom: 0;
  position: relative;
}

.settings-form .el-form-item__label {
  color: #a8c7ff;
  font-weight: bold;
  margin-bottom: 8px;
  font-size: 14px;
  letter-spacing: 0.3px;
}

.settings-form .el-input {
  --el-input-border-color: rgba(255, 255, 255, 0.3);
  --el-input-focus-border-color: #ff6b00;
  --el-input-hover-border-color: rgba(255, 107, 0, 0.6);
}

.settings-form .el-input__wrapper {
  background: linear-gradient(145deg, rgba(20, 20, 30, 0.8), rgba(10, 10, 15, 0.9));
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
  transition: all 0.4s ease;
}

.settings-form .el-input__wrapper:hover {
  border-color: rgba(255, 107, 0, 0.6);
  box-shadow: 0 4px 12px rgba(255, 107, 0, 0.2);
  transform: translateY(-2px);
}

.settings-form .el-input__wrapper.is-focus {
  border-color: #ff6b00;
  box-shadow: 0 0 15px rgba(255, 107, 0, 0.4);
  transform: translateY(-2px);
}

.settings-form .el-input__inner {
  color: #ffffff;
  background: transparent;
  font-size: 14px;
}

.settings-form .el-select {
  --el-select-border-color: rgba(255, 255, 255, 0.3);
  --el-select-focus-border-color: #ff6b00;
}

.settings-form .el-select .el-input__wrapper {
  background: linear-gradient(145deg, rgba(20, 20, 30, 0.8), rgba(10, 10, 15, 0.9));
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
  transition: all 0.4s ease;
}

.settings-form .el-select .el-input__wrapper:hover {
  border-color: rgba(255, 107, 0, 0.6);
  box-shadow: 0 4px 12px rgba(255, 107, 0, 0.2);
  transform: translateY(-2px);
}

.settings-form .el-select .el-input__inner {
  color: #ffffff;
  background: transparent;
  font-size: 14px;
}

.submit-btn {
  grid-column: 1 / -1;
  width: 220px;
  height: 44px;
  background: linear-gradient(135deg, #ff6b00, #ff4500);
  border: 1px solid #ff6b00;
  color: #ffffff;
  font-weight: bold;
  font-size: 16px;
  border-radius: 8px;
  transition: all 0.4s ease;
  box-shadow: 0 4px 12px rgba(255, 107, 0, 0.3);
  margin-top: 10px;
  position: relative;
  overflow: hidden;
}

.submit-btn:hover {
  background: linear-gradient(135deg, #ff7b00, #ff5500);
  box-shadow: 0 6px 16px rgba(255, 107, 0, 0.5);
  transform: translateY(-3px);
}

.refresh-btn {
  background: linear-gradient(135deg, #0051ff, #0031cc);
  border: 1px solid #0051ff;
  color: #ffffff;
  border-radius: 8px;
  padding: 10px 20px;
  font-weight: bold;
  font-size: 14px;
  box-shadow: 0 4px 12px rgba(0, 81, 255, 0.3);
  transition: all 0.4s ease;
}

.refresh-btn:hover {
  background: linear-gradient(135deg, #0061ff, #0041dd);
  box-shadow: 0 6px 16px rgba(0, 81, 255, 0.5);
  transform: translateY(-2px);
}

/* 表格容器样式 */
.table-container {
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid rgba(0, 212, 255, 0.3);
  box-shadow: 0 8px 25px rgba(0, 0, 0, 0.4);
  background: linear-gradient(145deg, #151520 0%, #0a0a0f 100%);
  margin-bottom: 30px;
  border-left: 5px solid #00d4ff;
  transition: all 0.4s ease;
}

.table-container:hover {
  box-shadow: 0 10px 30px rgba(0, 212, 255, 0.2);
  border-color: rgba(0, 212, 255, 0.5);
}

.table-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 20px;
  background: linear-gradient(90deg, rgba(0, 212, 255, 0.25) 0%, rgba(10, 10, 15, 0.9) 100%);
  border-bottom: 2px solid rgba(0, 212, 255, 0.4);
  position: relative;
  overflow: hidden;
  justify-content: space-between;
}

.table-header::after {
  content: '';
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: 80px;
  background: linear-gradient(90deg, transparent, rgba(0, 212, 255, 0.15));
}

.header-icon {
  font-size: 20px;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, rgba(0, 212, 255, 0.3), rgba(0, 212, 255, 0.1));
  border-radius: 50%;
  box-shadow: 0 0 12px rgba(0, 212, 255, 0.4);
  border: 1px solid rgba(0, 212, 255, 0.3);
}

.header-title {
  color: #ffffff;
  margin: 0;
  font-size: 18px;
  font-weight: bold;
  text-shadow: 0 0 8px rgba(0, 212, 255, 0.6);
  letter-spacing: 0.5px;
}

.table-content {
  position: relative;
  overflow: hidden;
}

.settings-table {
  width: 100%;
  border-collapse: collapse;
}

.settings-table th {
  background: linear-gradient(145deg, rgba(0, 212, 255, 0.2), rgba(0, 212, 255, 0.05));
  color: #ffffff;
  padding: 16px 12px;
  text-align: left;
  font-weight: bold;
  font-size: 14px;
  text-shadow: 0 0 6px rgba(0, 212, 255, 0.6);
  border-bottom: 2px solid rgba(0, 212, 255, 0.4);
  letter-spacing: 0.3px;
}

.settings-table td {
  padding: 10px 5px;
  color: #a8c7ff;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  transition: all 0.4s ease;
  font-size: 14px;
}

.table-row {
  transition: all 0.4s ease;
  position: relative;
}
.table-row:hover {
  background: linear-gradient(90deg, rgba(0, 212, 255, 0.08), rgba(0, 212, 255, 0.03));
}

/* 开关样式 */
.setting-switch {
  --el-switch-on-color: #00d4ff;
  --el-switch-off-color: #1a1a2e;
  --el-switch-border-color: rgba(255, 255, 255, 0.2);
  height: 24px;
}

/* 加载动画 */
.loading-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(10, 10, 15, 0.8);
  backdrop-filter: blur(2px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
}

.loading-spinner {
  width: 44px;
  height: 44px;
  border: 4px solid rgba(0, 212, 255, 0.2);
  border-top: 4px solid #00d4ff;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  box-shadow: 0 0 15px rgba(0, 212, 255, 0.5);
}

@keyframes spin {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}

/* 响应式设计 */
@media (max-width: 1000px) {
  .settings-form {
    grid-template-columns: 1fr;
    gap: 15px;
  }

  .submit-btn {
    width: 100%;
  }

  .card-container {
    margin-bottom: 20px;
  }
}

@media (max-width: 768px) {
  .page {
    padding: 4px;
  }

  .header {
    padding: 12px 15px;
  }

  .card-header {
    padding: 14px 16px;
  }

  .card-content {
    padding: 16px;
  }

  .settings-form {
    gap: 15px;
  }

  .settings-table th,
  .settings-table td {
    padding: 10px 8px;
    font-size: 14px;
  }

  .table-header {
    padding: 14px 16px;
  }
}

@media (max-width: 480px) {
  .page {
    padding: 12px;
  }

  .header {
    flex-direction: column;
    gap: 12px;
    padding: 12px;
  }

  .header h2 {
    font-size: 18px;
  }

  .card-header {
    padding: 12px;
    gap: 10px;
  }

  .card-content {
    padding: 14px;
  }

  .settings-form {
    gap: 12px;
  }

  .refresh-btn {
    width: 100%;
  }

  .settings-table th,
  .settings-table td {
    padding: 8px 6px;
    font-size: 13px;
  }

  .submit-btn {
    height: 40px;
    font-size: 15px;
  }
}
</style>
