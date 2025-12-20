<script setup>
import { ref, reactive, watch } from 'vue'
import { ElMessage } from 'element-plus'
import * as XLSX from 'xlsx'
import dayjs from 'dayjs'
import GetDataFunc from '@/utils/API/Data'
import DataApi from '@/utils/API/Data'
// 引入Element Plus的图标
import { Check, Warning } from '@element-plus/icons-vue'

/* ================== 系统配置 ================== */
const SYSTEM_HALL_COUNT = 11

/* ================== 全局排期日期 ================== */
const show_date = ref(dayjs().format('YYYY-MM-DD'))

// 日期限制：今天 ±3 天
const disabledDate = (time) => {
  const today = dayjs().startOf('day')
  const max = today.add(3, 'day')

  return dayjs(time).isBefore(today, 'day') || dayjs(time).isAfter(max, 'day')
}

/* ================== 基础状态 ================== */
const file = ref(null)
const parseError = ref('')
const isParsing = ref(false)
const fileStatus = ref('未选择文件')

/* ================== 数据状态 ================== */
const rawExcelData = ref([])
const validHallData = ref([])
const filteredData = ref([])

/* ================== 筛选 / 校验状态 ================== */
const filterForm = reactive({
  hallName: '',
  movieName: '',
})

const detectResult = reactive({
  halls: [],
  movies: [],
})

// 优化movieCheckResult结构：存储{exist: boolean, duration: number}
const movieCheckResult = ref({})

/* ================== Excel 时间解析 ================== */
/**
 * Excel 时间字段可能是：
 *  - 字符串：'00:05'
 *  - 数字：0.0034722222
 * 统一转成 HH:mm
 */
const parseExcelTime = (value) => {
  if (value === null || value === undefined || value === '') return ''

  if (typeof value === 'number') {
    const totalMinutes = Math.round(value * 24 * 60)
    const h = String(Math.floor(totalMinutes / 60)).padStart(2, '0')
    const m = String(totalMinutes % 60).padStart(2, '0')
    return `${h}:${m}`
  }

  return String(value).trim()
}

/* ================== Excel 解析 ================== */
const parseExcel = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.readAsArrayBuffer(file)

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result)
        const workbook = XLSX.read(data, { type: 'array' })
        const sheet = workbook.Sheets[workbook.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json(sheet)

        if (!rows.length) {
          reject('Excel 内容为空')
          return
        }

        const result = []

        rows.forEach((row, index) => {
          const movieName = String(row['影片'] || '').trim()
          const hallOrigin = String(row['影厅'] || '').trim()
          const hallNum = hallOrigin.replace(/[^0-9]/g, '')
          const startTime = parseExcelTime(row['放映时间'])

          result.push({
            rowNum: index + 2,
            show_date: show_date.value,
            data: {
              movie_name: movieName,
              hall_name: hallNum,
              hall_origin: hallOrigin,
              start_time: startTime,
              duration: '', // 后续从接口获取时长填充
            },
            basicValid: true,
            basicError: '',
            isDuplicate: false,
            statusType: 'normal',
          })
        })

        resolve(result)
      } catch (err) {
        reject('解析 Excel 失败')
      }
    }

    reader.onerror = () => reject('读取文件失败')
  })
}

/* ================== 基础校验 & 影厅校验 ================== */
const filterValidHall = (data) => {
  const valid = []
  const halls = new Set()
  const movies = new Set()

  data.forEach((item) => {
    const d = item.data

    if (!d.movie_name) {
      item.basicValid = false
      item.basicError = '缺少影片'
    }

    if (!d.hall_name) {
      item.basicValid = false
      item.basicError = '缺少影厅'
    }

    if (!d.start_time) {
      item.basicValid = false
      item.basicError = '缺少放映时间'
    }

    const hallNum = Number(d.hall_name)
    if (item.basicValid && (!hallNum || hallNum < 1 || hallNum > SYSTEM_HALL_COUNT)) {
      item.basicValid = false
      item.basicError = `影厅 ${d.hall_origin} 无效`
    }

    if (item.basicValid) {
      valid.push(item)
      halls.add(d.hall_name)
      movies.add(d.movie_name)
    }
  })

  detectResult.halls = [...halls].sort((a, b) => a - b)
  detectResult.movies = [...movies]

  return valid
}

/* ================== 重复检测（影厅 + 放映时间） ================== */
const detectDuplicate = (data) => {
  const map = new Map()

  data.forEach((item) => {
    item.isDuplicate = false
    item.statusType = 'normal'
  })

  data.forEach((item, idx) => {
    if (!item.basicValid) return
    const key = `${item.data.hall_name}_${item.data.start_time}`
    if (!map.has(key)) map.set(key, [])
    map.get(key).push(idx)
  })

  map.forEach((indexes) => {
    if (indexes.length > 1) {
      indexes.forEach((i) => {
        data[i].isDuplicate = true
        data[i].statusType = 'duplicate'
      })
    }
  })

  data.forEach((item) => {
    if (
      item.basicValid &&
      !item.isDuplicate &&
      movieCheckResult.value[item.data.movie_name]?.exist === false
    ) {
      item.statusType = 'movie_not_exist'
    }
  })

  return data
}

/* ================== 筛选 ================== */
const filterScheduleData = () => {
  let result = [...validHallData.value]

  if (filterForm.hallName) {
    result = result.filter((i) => i.data.hall_name === filterForm.hallName)
  }

  if (filterForm.movieName) {
    result = result.filter((i) => i.data.movie_name.includes(filterForm.movieName))
  }

  filteredData.value = detectDuplicate(result)
}

/* ================== 影片校验（完善API逻辑） ================== */
const checkMovieExist = async (movieName) => {
  try {
    const { data: res } = await GetDataFunc.GetMoviesInfo(movieName, 1)
    console.log('影片校验结果：', res)

    // 根据status判断影片是否存在
    if (res.status === 200) {
      // 200表示存在，存储状态和时长（duration_seconds转分钟）
      movieCheckResult.value[movieName] = {
        exist: true,
        duration: Math.floor(res.data[0].duration_seconds / 60), // 转成分钟数
      }
      ElMessage.success(`${movieName} 影片校验通过`)
    } else if (res.status === 203) {
      // 203表示不存在/已过期
      movieCheckResult.value[movieName] = {
        exist: false,
        duration: 0,
      }
      ElMessage.warning(`${movieName} ${res.message}`)
    } else {
      // 其他状态码
      movieCheckResult.value[movieName] = {
        exist: false,
        duration: 0,
      }
      ElMessage.error(`影片校验异常：${res.message || '未知错误'}`)
    }

    // 重新筛选数据，更新状态展示
    filterScheduleData()
  } catch (err) {
    console.error('影片校验失败：', err)
    movieCheckResult.value[movieName] = {
      exist: false,
      duration: 0,
    }
    ElMessage.error(`校验${movieName}失败：网络异常`)
  }
}

/* ================== 批量校验所有影片（可直接调用） ================== */
/**
 * 批量校验检测到的所有影片
 * @param {Array} movieList - 检测到的影片名称数组（detectResult.movies）
 * @returns {Promise<Object>} 校验结果汇总
 */
const batchCheckAllMovies = async (movieList) => {
  // 空数组直接返回
  if (!movieList || movieList.length === 0) {
    ElMessage.info('暂无需要校验的影片')
    return { success: true, existCount: 0, notExistCount: 0, errorCount: 0 }
  }
  // 初始化结果统计
  let existCount = 0 // 存在的影片数
  let notExistCount = 0 // 不存在的影片数
  let errorCount = 0 // 校验失败数

  try {
    // 优化：如果是单影片校验，显示加载中（避免用户重复点击）
    const isSingleMovie = movieList.length === 1
    if (isSingleMovie) {
      isParsing.value = true // 复用isParsing状态，禁用提交/校验按钮
    }

    // 遍历所有影片，逐个校验（也可以用Promise.all并发，根据接口抗压能力选择）
    for (const movieName of movieList) {
      try {
        const { data: res } = await GetDataFunc.GetMoviesInfo(movieName, 1)

        // 根据接口status更新校验结果
        if (res.status === 200) {
          movieCheckResult.value[movieName] = {
            exist: true,
            duration: Math.floor(res.data[0].duration_seconds / 60),
          }
          existCount++
        } else if (res.status === 203) {
          movieCheckResult.value[movieName] = {
            exist: false,
            duration: 0,
          }
          notExistCount++
        } else {
          movieCheckResult.value[movieName] = {
            exist: false,
            duration: 0,
          }
          errorCount++
        }
      } catch (err) {
        // 单个影片校验失败（网络/接口异常）
        console.error(`校验影片【${movieName}】失败：`, err)
        movieCheckResult.value[movieName] = {
          exist: false,
          duration: 0,
        }
        errorCount++
      }
    }

    // 单影片校验完成，关闭加载
    if (isSingleMovie) {
      isParsing.value = false
      ElMessage.success(`影片【${movieList[0]}】校验完成`)
    } else {
      // 批量校验完成提示
      ElMessage.success(
        `批量校验完成：共${movieList.length}部影片，存在${existCount}部，不存在${notExistCount}部，异常${errorCount}部`,
      )
    }

    // 重新筛选数据，更新页面展示
    filterScheduleData()

    return {
      success: true,
      existCount,
      notExistCount,
      errorCount,
      total: movieList.length,
    }
  } catch (err) {
    isParsing.value = false // 异常时关闭加载
    ElMessage.error('批量校验影片异常：' + err.message)
    return {
      success: false,
      existCount: 0,
      notExistCount: 0,
      errorCount: movieList.length,
      total: movieList.length,
    }
  }
}

/* ================== 单行提交（增加前置校验逻辑） ================== */
const submitRow = async (item) => {
  // 1. 基础校验
  if (!item.basicValid) {
    ElMessage.warning(item.basicError)
    return
  }

  if (item.isDuplicate) {
    ElMessage.warning(`${item.data.hall_name}号厅 ${item.data.start_time} 场次重复`)
    return
  }

  const movieName = item.data.movie_name
  // 2. 判断影片是否已校验
  if (movieCheckResult.value[movieName] === undefined) {
    // 2.1 未校验：先执行一键校验（仅校验当前影片）
    ElMessage.info(`正在校验影片【${movieName}】，请稍候...`)
    try {
      // 调用批量校验函数，仅传入当前影片
      const checkResult = await batchCheckAllMovies([movieName])
      // 校验失败（网络/接口异常）
      if (!checkResult.success || checkResult.errorCount > 0) {
        ElMessage.error(`影片【${movieName}】校验失败，无法提交`)
        return
      }
    } catch (err) {
      ElMessage.error(`影片【${movieName}】校验异常：${err.message}`)
      return
    }
  }

  // 3. 校验完成后，判断影片是否存在
  const movieCheck = movieCheckResult.value[movieName]
  if (!movieCheck?.exist) {
    ElMessage.warning(`${movieName} 影片不存在/已过期，无法提交`)
    return
  }

  // 4. 所有校验通过，组装提交数据
  const submitData = {
    show_date: show_date.value,
    movie_name: movieName,
    hall_name: Number(item.data.hall_name),
    start_time: item.data.start_time,
  }

  await DataApi.AddMovies(
    submitData.movie_name,
    submitData.hall_name,
    submitData.start_time,
    submitData.show_date,
  )
  // TODO: 对接你的提交API
  // console.log('【提交排期】', submitData)
  // ElMessage.success(
  //   `已提交：${submitData.movie_name} ${submitData.hall_name}号厅 ${submitData.start_time}`,
  // )
}

/* ================== 文件事件 ================== */
const onFileChange = async (uploadFile) => {
  file.value = uploadFile.raw
  parseError.value = ''
  fileStatus.value = '解析中...'
  isParsing.value = true

  try {
    const parsed = await parseExcel(file.value)
    rawExcelData.value = parsed
    validHallData.value = filterValidHall(parsed)
    filterScheduleData()
    fileStatus.value = `解析完成（${validHallData.value.length} 条有效数据）`
  } catch (err) {
    parseError.value = err
    ElMessage.error(err)
  } finally {
    isParsing.value = false
  }
}

const onFileRemove = () => {
  file.value = null
  rawExcelData.value = []
  validHallData.value = []
  filteredData.value = []
  detectResult.halls = []
  detectResult.movies = []
  movieCheckResult.value = {}
  filterForm.hallName = ''
  filterForm.movieName = ''
}

/* ================== 监听筛选 ================== */
watch([() => filterForm.hallName, () => filterForm.movieName], filterScheduleData)
</script>

<template>
  <div class="page">
    <div class="head">
      <h2>Excel 排期导入工具</h2>
      <div style="margin-bottom: 12px">
        排期日期：
        <el-date-picker
          v-model="show_date"
          type="date"
          value-format="YYYY-MM-DD"
          format="YYYY-MM-DD"
          :editable="false"
          :clearable="false"
          :disabled-date="disabledDate"
          style="width: 150px"
        />
      </div>
    </div>

    <el-card class="card">
      <!-- 1. 文件选择区 + 状态展示 -->
      <div class="file-section">
        <div class="file-upload">
          <el-upload
            :auto-upload="false"
            :limit="1"
            accept=".xlsx,.xls,.csv"
            :on-change="onFileChange"
            :on-remove="onFileRemove"
            :file-list="file ? [file] : []"
            :disabled="isParsing"
            class="upload-component"
          >
            <el-button type="primary" :loading="isParsing">选择 Excel 文件</el-button>
          </el-upload>
        </div>
        <div class="file-status">
          <span class="status-label">文件状态：</span>
          <el-tag
            :type="
              fileStatus.includes('已检测到')
                ? 'success'
                : fileStatus.includes('失败')
                  ? 'danger'
                  : 'info'
            "
          >
            {{ fileStatus }}
          </el-tag>
        </div>
        <div v-if="parseError" class="error-tip">{{ parseError }}</div>
      </div>

      <!-- 2. 检测结果区（overflow处理） -->
      <div class="detect-section" v-if="file">
        <!-- 2.1 影厅检测 -->
        <div class="detect-item">
          <span class="detect-label">检测到影厅：</span>
          <div class="tag-container">
            <el-tag v-for="hall in detectResult.halls" :key="hall" type="info" class="detect-tag">
              {{ hall }}号厅
            </el-tag>
          </div>
          <span v-if="!detectResult.halls.length" class="empty-text">无有效影厅</span>
        </div>

        <!-- 2.2 影片检测 + 校验 -->
        <div class="detect-item">
          <span class="detect-label">检测到影片：</span>
          <div class="movie-container">
            <div v-for="movie in detectResult.movies" :key="movie" class="movie-item">
              <span class="movie-name">{{ movie }}</span>
              <el-button type="text" size="small" @click="checkMovieExist(movie)" class="check-btn">
                【校验】
              </el-button>
              <!-- 影片校验结果标识 -->
              <div v-if="movieCheckResult[movie] !== undefined" class="check-icon-container">
                <!-- 存在：绿色√ -->
                <el-icon color="#4CAF50" v-if="movieCheckResult[movie].exist">
                  <Check />
                </el-icon>
                <!-- 不存在：黄色警告 -->
                <el-icon color="#FFC107" v-else>
                  <Warning />
                </el-icon>
              </div>
              <!-- 未校验：空 -->
              <div v-else class="check-icon-container empty-icon"></div>
            </div>
          </div>
          <span v-if="!detectResult.movies.length" class="empty-text">无有效影片</span>
          <el-button type="primary" plain @click="batchCheckAllMovies(detectResult.movies)"
            >一键校验</el-button
          >
        </div>
      </div>

      <!-- 3. 筛选区 -->
      <div class="filter-section" v-if="file">
        <el-form :inline="true" :model="filterForm" class="filter-form">
          <el-form-item label="按影厅筛选：">
            <el-select
              v-model="filterForm.hallName"
              placeholder="选择影厅"
              clearable
              class="filter-select"
              style="width: 120px"
            >
              <el-option
                v-for="hall in detectResult.halls"
                :key="hall"
                :label="`${hall}号厅`"
                :value="hall"
              />
            </el-select>
          </el-form-item>

          <el-form-item label="按影片筛选：">
            <el-select
              v-model="filterForm.movieName"
              placeholder="选择/输入影片"
              filterable
              clearable
              class="filter-select"
            >
              <el-option
                v-for="movie in detectResult.movies"
                :key="movie"
                :label="movie"
                :value="movie"
              />
            </el-select>
          </el-form-item>

          <el-form-item>
            <el-button
              @click="
                () => {
                  filterForm.hallName = ''
                  filterForm.movieName = ''
                }
              "
              class="reset-btn"
              >重置筛选</el-button
            >
          </el-form-item>
        </el-form>
      </div>

      <!-- 4. 排期列表区（overflow滚动处理） -->
      <div class="schedule-section" v-if="filteredData.length">
        <h3 class="section-title">排期列表</h3>
        <div class="table-container">
          <el-table
            :data="filteredData"
            border
            stripe
            style="width: 100%"
            height="500"
            class="schedule-table"
          >
            <el-table-column label="影厅" prop="data.hall_name" width="80">
              <template #default="scope"> {{ scope.row.data.hall_name }}号厅 </template>
            </el-table-column>
            <el-table-column label="影片" prop="data.movie_name" min-width="150">
              <template #default="scope">
                <span>{{ scope.row.data.movie_name }}</span>
                <!-- 列表中也展示影片校验标识 -->
                <el-icon
                  v-if="movieCheckResult[scope.row.data.movie_name] !== undefined"
                  :color="movieCheckResult[scope.row.data.movie_name].exist ? '#4CAF50' : '#FFC107'"
                  style="margin-left: 4px"
                >
                  <Check v-if="movieCheckResult[scope.row.data.movie_name].exist" />
                  <Warning v-else />
                </el-icon>
              </template>
            </el-table-column>
            <el-table-column label="放映时间" prop="data.start_time" width="120" />
            <el-table-column label="状态" width="180">
              <template #default="scope">
                <el-tag v-if="!scope.row.basicValid" type="danger">{{
                  scope.row.basicError
                }}</el-tag>
                <el-tag v-else-if="scope.row.statusType === 'duplicate'" type="danger"
                  >数据重复</el-tag
                >
                <el-tag v-else-if="scope.row.statusType === 'movie_not_exist'" type="warning"
                  >影片不存在</el-tag
                >
                <el-tag v-else type="success">数据正常</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="100">
              <template #default="scope">
                <el-button
                  type="primary"
                  size="small"
                  @click="submitRow(scope.row)"
                  :disabled="
                    !scope.row.basicValid ||
                    scope.row.isDuplicate ||
                    movieCheckResult[scope.row.data.movie_name]?.exist === false ||
                    isParsing
                  "
                  :loading="isParsing && movieCheckResult[scope.row.data.movie_name] === undefined"
                >
                  提交
                </el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </div>

      <!-- 空状态 -->
      <div class="empty-section" v-if="file && !filteredData.length && !parseError">
        暂无有效排期数据
      </div>
    </el-card>
  </div>
</template>
<style scoped>
/* 黑色主题基础样式 */
.page {
  padding: 20px;
  /* background-color: #121212;  */
  min-height: 100vh;
  color: #e0e0e0; /* 浅灰色文字 */
  overflow-x: hidden; /* 防止横向溢出 */
}

.head h2 {
  font-size: 20px;
  font-weight: 600;
  margin: 0 0 15px 0;
  color: #ffffff; /* 白色标题 */
}

/* 卡片样式 - 深色主题 */
.card {
  height: 75vh;
  border-radius: 12px;
  padding: 24px;
  background-color: #0d153130; /* 深灰色卡片 */
  border: 1px solid #333;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
}

/* 文件选择区 */
.file-section {
  margin-bottom: 24px;
}

.file-upload {
  margin-bottom: 8px;
}

.upload-component :deep(.el-upload) {
  color: #e0e0e0;
}

.file-status {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.status-label {
  font-size: 14px;
  color: #b0b0b0; /* 灰色标签文字 */
}

.error-tip {
  color: #ff6b6b; /* 红色错误提示 */
  font-size: 14px;
}

/* 检测结果区 - overflow处理 */
.detect-section {
  margin-bottom: 24px;
  padding: 16px;
  background-color: #252525; /* 更深的灰色背景 */
  border-radius: 8px;
  border: 1px solid #333;
}

.detect-item {
  margin-bottom: 12px;
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.detect-label {
  font-size: 14px;
  color: #b0b0b0;
  font-weight: 500;
  min-width: 80px;
}

/* 影厅标签容器 - 横向滚动 */
.tag-container {
  display: flex;
  gap: 6px;
  padding: 2px 0;
  overflow-x: auto; /* 横向滚动 */
  flex: 1;
  scrollbar-width: thin; /* 细滚动条 */
  scrollbar-color: #444 #252525;
}

.tag-container::-webkit-scrollbar {
  height: 6px;
}

.tag-container::-webkit-scrollbar-track {
  background: #252525;
}

.tag-container::-webkit-scrollbar-thumb {
  background-color: #444;
  border-radius: 3px;
}

.detect-tag {
  background-color: #333;
  border: 1px solid #444;
  color: #e0e0e0;
}

/* 影片容器 - 横向滚动 */
.movie-container {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 2px 0;
  overflow-x: auto; /* 横向滚动 */
  flex: 1;
  max-height: 120px; /* 限制高度 */
  overflow-y: auto; /* 纵向滚动 */
  scrollbar-width: thin;
  scrollbar-color: #444 #252525;
}

.movie-container::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

.movie-container::-webkit-scrollbar-track {
  background: #252525;
}

.movie-container::-webkit-scrollbar-thumb {
  background-color: #444;
  border-radius: 3px;
}

.movie-item {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  background-color: #333;
  border: 1px solid #444;
  border-radius: 4px;
  white-space: nowrap; /* 防止文字换行 */
}

.movie-name {
  font-size: 14px;
  color: #e0e0e0;
}

.check-btn {
  padding: 0;
  color: #64b5f6; /* 浅蓝色按钮 */
}

/* 校验图标容器样式 */
.check-icon-container {
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.empty-icon {
  /* 未校验时占位，保持布局一致 */
  visibility: hidden;
}

.check-tag {
  margin-left: 4px;
}

.empty-text {
  font-size: 14px;
  color: #777;
}

/* 筛选区 */
.filter-section {
  margin-bottom: 24px;
  padding: 16px;
  background-color: #252525;
  border-radius: 8px;
  border: 1px solid #333;
}

.filter-form {
  width: 100%;
}

.filter-select :deep(.el-select) {
  width: 200px;
}

.filter-select :deep(.el-input__wrapper) {
  background-color: #333;
  border: 1px solid #444;
  box-shadow: none;
}

.filter-select :deep(.el-input__inner) {
  color: #e0e0e0;
}

.reset-btn {
  background-color: #333;
  border: 1px solid #444;
  color: #e0e0e0;
}

/* 排期列表区 - overflow滚动处理 */
.schedule-section {
  margin-top: 16px;
}

.section-title {
  font-size: 16px;
  font-weight: 600;
  margin: 0 0 12px 0;
  color: #ffffff;
}

/* 表格容器 - 固定高度+滚动 */
.table-container {
  max-height: 600px; /* 固定最大高度 */
  overflow-y: auto; /* 纵向滚动 */
  scrollbar-width: thin;
  scrollbar-color: #444 #1e1e1e;
  border-radius: 8px;
}

.table-container::-webkit-scrollbar {
  width: 8px;
}

.table-container::-webkit-scrollbar-track {
  background: #1e1e1e;
}

.table-container::-webkit-scrollbar-thumb {
  background-color: #444;
  border-radius: 4px;
}

/* 深色表格样式 */
.schedule-table :deep(.el-table) {
  --el-table-header-text-color: #e0e0e0;
  --el-table-row-hover-bg-color: #2a2a2a;
  --el-table-row-stripe-bg-color: #222;
  --el-table-text-color: #e0e0e0;
  background-color: #1e1e1e;
  color: #e0e0e0;
}

.schedule-table :deep(.el-table th) {
  background-color: #252525;
  border-bottom: 1px solid #444;
}

.schedule-table :deep(.el-table td) {
  border-bottom: 1px solid #333;
}

.schedule-table :deep(.el-table--border) {
  border: 1px solid #444;
}

.schedule-table :deep(.el-table--border th, .el-table--border td) {
  border-right: 1px solid #444;
}

/* 空状态 */
.empty-section {
  text-align: center;
  padding: 40px;
  color: #777;
  font-size: 16px;
}

/* Element Plus 组件深色适配 */
:deep(.el-button--primary) {
  background-color: #1976d2;
  border-color: #1976d2;
  color: white;
}

:deep(.el-tag--success) {
  background-color: #2e7d32;
  border-color: #2e7d32;
  color: white;
}

:deep(.el-tag--danger) {
  background-color: #c62828;
  border-color: #c62828;
  color: white;
}

:deep(.el-tag--warning) {
  background-color: #f57c00;
  border-color: #f57c00;
  color: white;
}

:deep(.el-tag--info) {
  background-color: #333;
  border-color: #444;
  color: white;
}
</style>
