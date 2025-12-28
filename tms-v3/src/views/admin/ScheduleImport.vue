<script setup>
import { ref, reactive, watch } from 'vue'
import { ElMessage, ElMessageBox, ElNotification } from 'element-plus'
import * as XLSX from 'xlsx'
import dayjs from 'dayjs'
import GetDataFunc from '@/utils/API/Data'
import DataApi from '@/utils/API/Data'
// 引入Element Plus的图标
import { Check, Warning, CircleCheck, CircleClose } from '@element-plus/icons-vue'

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

/* ================== 文本粘贴导入（新增） ================== */
const pasteText = ref('')
const pasteStatus = ref('')

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

/* ================== 批量提交相关状态 ================== */
// 批量提交弹窗显示状态
const showBatchSubmitDialog = ref(false)
// 待提交的列表（深拷贝过滤后的数据）
const batchSubmitList = ref([])
// 批量提交状态：{ rowIndex: { success: boolean, loading: boolean } }
const batchSubmitStatus = ref({})
// 批量提交是否正在进行中
const isBatchSubmitting = ref(false)

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

/* ================== 文本粘贴解析（新增） ================== */
/**
 * 解析粘贴的排期文本
 * 支持格式：2025-12-28|阿凡达3|7|13:35|16:53
 */
const parsePasteText = () => {
  if (!pasteText.value.trim()) {
    ElMessage.warning('请输入排期文本')
    return
  }

  isParsing.value = true
  parseError.value = ''
  fileStatus.value = '解析中（文本）...'

  try {
    // 清空原有文件和数据
    file.value = null
    rawExcelData.value = []
    validHallData.value = []
    filteredData.value = []
    detectResult.halls = []
    detectResult.movies = []
    movieCheckResult.value = {}
    filterForm.hallName = ''
    filterForm.movieName = ''
    showBatchSubmitDialog.value = false
    batchSubmitList.value = []
    batchSubmitStatus.value = {}
    isBatchSubmitting.value = false

    // 解析文本
    const lines = pasteText.value
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)

    if (!lines.length) {
      throw new Error('文本为空')
    }

    const result = []

    lines.forEach((line, index) => {
      const parts = line.split('|')
      if (parts.length < 4) return

      const [date, movie, hall, start] = parts

      result.push({
        rowNum: index + 1,
        show_date: date || show_date.value,
        data: {
          movie_name: movie?.trim() || '',
          hall_name: String(hall || '').replace(/[^0-9]/g, ''),
          hall_origin: hall || '',
          start_time: start?.trim() || '',
          duration: '',
        },
        basicValid: true,
        basicError: '',
        isDuplicate: false,
        statusType: 'normal',
      })
    })

    if (!result.length) {
      throw new Error('未识别到有效排期')
    }

    rawExcelData.value = result
    validHallData.value = filterValidHall(result)
    filterScheduleData()

    fileStatus.value = `文本解析完成（${validHallData.value.length} 条有效数据）`
    pasteStatus.value = 'success'
    ElMessage.success('排期文本识别成功')
  } catch (err) {
    parseError.value = err.message || '文本解析失败'
    ElMessage.error(parseError.value)
    pasteStatus.value = 'error'
  } finally {
    isParsing.value = false
  }
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

  try {
    await DataApi.AddMovies(
      submitData.movie_name,
      submitData.hall_name,
      submitData.start_time,
      submitData.show_date,
    )
    ElMessage.success(
      `已提交：${submitData.movie_name} ${submitData.hall_name}号厅 ${submitData.start_time}`,
    )
  } catch (err) {
    console.error('单行提交失败：', err)
    ElMessage.error(`提交失败：${err.message || '网络异常'}`)
  }
}

/* ================== 批量提交功能 ================== */
/**
 * 打开批量提交弹窗
 */
const openBatchSubmitDialog = () => {
  // 1. 过滤出可提交的有效数据
  const validSubmitList = filteredData.value.filter((item) => {
    // 基础校验通过 + 无重复 + 影片存在
    return (
      item.basicValid &&
      !item.isDuplicate &&
      movieCheckResult.value[item.data.movie_name]?.exist === true
    )
  })

  if (validSubmitList.length === 0) {
    ElMessage.warning('暂无可提交的有效排期数据（请检查数据校验状态）')
    return
  }

  // 2. 深拷贝数据，避免修改原列表
  batchSubmitList.value = JSON.parse(JSON.stringify(validSubmitList))
  // 3. 重置提交状态
  batchSubmitStatus.value = {}
  batchSubmitList.value.forEach((_, index) => {
    batchSubmitStatus.value[index] = {
      success: null, // null: 未提交, true: 成功, false: 失败
      loading: false, // 是否正在提交
    }
  })
  // 4. 打开弹窗
  showBatchSubmitDialog.value = true
}

/**
 * 执行批量提交
 */
const executeBatchSubmit = async () => {
  if (isBatchSubmitting.value) return
  isBatchSubmitting.value = true

  // 遍历待提交列表，间隔500ms调用API
  for (let i = 0; i < batchSubmitList.value.length; i++) {
    const item = batchSubmitList.value[i]
    // 更新当前行加载状态
    batchSubmitStatus.value[i].loading = true

    // 组装提交数据
    const submitData = {
      show_date: show_date.value,
      movie_name: item.data.movie_name,
      hall_name: Number(item.data.hall_name),
      start_time: item.data.start_time,
    }

    try {
      // 调用提交API
      await DataApi.AddMovies(
        submitData.movie_name,
        submitData.hall_name,
        submitData.start_time,
        submitData.show_date,
      )
      // 提交成功
      batchSubmitStatus.value[i].success = true
      batchSubmitStatus.value[i].loading = false
    } catch (err) {
      // 提交失败
      console.error(`批量提交第${i + 1}条数据失败：`, err)
      batchSubmitStatus.value[i].success = false
      batchSubmitStatus.value[i].loading = false
    }

    // 最后一条数据不需要等待
    if (i < batchSubmitList.value.length - 1) {
      // 间隔500ms
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
  }

  // 全部提交完成，更新状态（弹窗不关闭）
  isBatchSubmitting.value = false

  // 统计成功/失败数量
  const successCount = Object.values(batchSubmitStatus.value).filter(
    (item) => item.success === true,
  ).length
  const failCount = Object.values(batchSubmitStatus.value).filter(
    (item) => item.success === false,
  ).length

  ElNotification({
    title: '批量提交完成',
    message: `共提交${batchSubmitList.value.length}条数据，成功${successCount}条，失败${failCount}条`,
    type: failCount > 0 ? 'warning' : 'success',
    duration: 5000,
  })
}

/**
 * 确认批量提交
 */
const confirmBatchSubmit = () => {
  ElMessageBox.confirm('请确认是否添加以下排期数据', '批量提交确认', {
    confirmButtonText: '确认提交',
    cancelButtonText: '取消',
    type: 'warning',
    draggable: true,
  })
    .then(async () => {
      await executeBatchSubmit()
    })
    .catch(() => {
      // 取消提交，仅关闭确认弹窗，批量提交弹窗不关闭
      ElMessage.info('已取消批量提交')
    })
}

/* ================== 文件事件 ================== */
const onFileChange = async (uploadFile) => {
  // 清空文本粘贴相关状态
  pasteText.value = ''
  pasteStatus.value = ''

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
  // 重置批量提交状态
  showBatchSubmitDialog.value = false
  batchSubmitList.value = []
  batchSubmitStatus.value = {}
  isBatchSubmitting.value = false
  // 重置文本粘贴状态
  pasteText.value = ''
  pasteStatus.value = ''
}
// 刷新页面
const refresh = () => {
  window.location.reload()
}
/* ================== 监听筛选 ================== */
watch([() => filterForm.hallName, () => filterForm.movieName], filterScheduleData)
</script>

<template>
  <!-- 核心：限制移动端最大宽度95vw，居中显示 -->
  <div class="page" :style="{ maxWidth: '95vw', margin: '0 auto' }">
    <div class="head">
      <div class="head-left">
        <h2>排期导入工具</h2>
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
            size="small"
          />
        </div>
      </div>
      <div>
        <el-button type="warning" plain @click="refresh" size="small">刷新</el-button>
        <router-link to="/py/" target="_blank">
          <el-button type="primary" plain size="small">获取排期</el-button></router-link
        >
      </div>
    </div>

    <el-card class="card">
      <!-- 新增：文本粘贴导入区域 - 移动端适配 -->
      <div class="paste-section" style="margin-bottom: 24px">
        <h3 style="margin-bottom: 8px; font-size: 16px; font-weight: 600; color: #ffffff">
          方式一：粘贴排期文本
        </h3>
        <el-input
          v-model="pasteText"
          type="textarea"
          :rows="4"
          placeholder="示例：
2025-12-28|阿凡达3|7|13:35|16:53
2025-12-28|阿凡达3|3|14:45|18:03"
          style="margin-bottom: 8px"
          size="small"
        />
        <div style="display: flex; gap: 10px; align-items: center; flex-wrap: wrap">
          <el-button type="primary" @click="parsePasteText" :loading="isParsing" size="small">
            识别文本
          </el-button>
          <el-tag v-if="pasteStatus === 'success'" type="success" size="small">识别成功</el-tag>
          <el-tag v-if="pasteStatus === 'error'" type="danger" size="small">识别失败</el-tag>
        </div>
      </div>

      <el-divider />

      <!-- 1. 文件选择区 + 状态展示 - 移动端适配 -->
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
            <el-button type="primary" :loading="isParsing" size="small">选择 Excel 文件</el-button>
          </el-upload>
        </div>
        <div class="file-status" style="flex-wrap: wrap">
          <span class="status-label">文件状态：</span>
          <el-tag
            :type="
              fileStatus.includes('已检测到')
                ? 'success'
                : fileStatus.includes('失败')
                  ? 'danger'
                  : 'info'
            "
            size="small"
          >
            {{ fileStatus }}
          </el-tag>
        </div>
        <div v-if="parseError" class="error-tip">{{ parseError }}</div>
      </div>

      <!-- 2. 检测结果区（overflow处理）- 移动端适配 -->
      <div class="detect-section" v-if="file || (pasteText && pasteStatus === 'success')">
        <!-- 2.1 影厅检测 -->
        <div class="detect-item" style="flex-wrap: wrap">
          <span class="detect-label">检测到影厅：</span>
          <div class="tag-container">
            <el-tag
              v-for="hall in detectResult.halls"
              :key="hall"
              type="info"
              class="detect-tag"
              size="small"
            >
              {{ hall }}号厅
            </el-tag>
          </div>
          <span v-if="!detectResult.halls.length" class="empty-text">无有效影厅</span>
        </div>

        <!-- 2.2 影片检测 + 校验 -->
        <div class="detect-item" style="flex-wrap: wrap; align-items: flex-start">
          <span class="detect-label">检测到影片：</span>
          <div class="movie-container" style="max-height: 100px">
            <div v-for="movie in detectResult.movies" :key="movie" class="movie-item">
              <span class="movie-name">{{ movie }}</span>
              <el-button type="text" size="mini" @click="checkMovieExist(movie)" class="check-btn">
                【校验】
              </el-button>
              <!-- 影片校验结果标识 -->
              <div v-if="movieCheckResult[movie] !== undefined" class="check-icon-container">
                <!-- 存在：绿色√ -->
                <el-icon color="#4CAF50" v-if="movieCheckResult[movie].exist" size="14">
                  <Check />
                </el-icon>
                <!-- 不存在：黄色警告 -->
                <el-icon color="#FFC107" v-else size="14">
                  <Warning />
                </el-icon>
              </div>
              <!-- 未校验：空 -->
              <div v-else class="check-icon-container empty-icon"></div>
            </div>
          </div>
          <span v-if="!detectResult.movies.length" class="empty-text">无有效影片</span>
          <el-button
            type="primary"
            plain
            @click="batchCheckAllMovies(detectResult.movies)"
            size="small"
            style="margin-top: 8px"
          >
            一键校验
          </el-button>
        </div>
      </div>

      <!-- 3. 筛选区 - 移动端适配（纵向布局） -->
      <div class="filter-section" v-if="file || (pasteText && pasteStatus === 'success')">
        <el-form :model="filterForm" class="filter-form" label-width="100px">
          <el-form-item label="按影厅筛选：">
            <el-select
              v-model="filterForm.hallName"
              placeholder="选择影厅"
              clearable
              class="filter-select"
              style="width: 100px; margin-bottom: 8px"
              size="small"
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
              style="width: 150px; margin-bottom: 8px"
              size="small"
            >
              <el-option
                v-for="movie in detectResult.movies"
                :key="movie"
                :label="movie"
                :value="movie"
              />
            </el-select>
          </el-form-item>

          <el-form-item style="display: flex; gap: 8px; flex-wrap: wrap">
            <el-button
              @click="
                () => {
                  filterForm.hallName = ''
                  filterForm.movieName = ''
                }
              "
              class="reset-btn"
              size="small"
              >重置筛选</el-button
            >

            <!-- 新增：一键提交按钮 -->
            <el-button
              type="primary"
              @click="openBatchSubmitDialog"
              :disabled="isParsing || filteredData.length === 0"
              size="small"
            >
              一键提交
            </el-button>
          </el-form-item>
        </el-form>
      </div>

      <!-- 4. 排期列表区（overflow滚动处理）- 移动端适配 -->
      <div class="schedule-section" v-if="filteredData.length">
        <h3 class="section-title" style="font-size: 14px">排期列表</h3>
        <div class="table-container" style="max-height: 300px">
          <!-- 移动端降低表格高度 -->
          <el-table
            :data="filteredData"
            border
            stripe
            style="width: 100%"
            height="auto"
            class="schedule-table"
            size="small"
          >
            <el-table-column label="影厅" prop="data.hall_name" width="60">
              <template #default="scope"> {{ scope.row.data.hall_name }}号厅 </template>
            </el-table-column>
            <el-table-column label="影片" prop="data.movie_name" min-width="100">
              <template #default="scope">
                <span>{{ scope.row.data.movie_name }}</span>
                <!-- 列表中也展示影片校验标识 -->
                <el-icon
                  v-if="movieCheckResult[scope.row.data.movie_name] !== undefined"
                  :color="movieCheckResult[scope.row.data.movie_name].exist ? '#4CAF50' : '#FFC107'"
                  style="margin-left: 4px"
                  size="12"
                >
                  <Check v-if="movieCheckResult[scope.row.data.movie_name].exist" />
                  <Warning v-else />
                </el-icon>
              </template>
            </el-table-column>
            <el-table-column label="放映时间" prop="data.start_time" width="100" />
            <el-table-column label="状态" width="120">
              <template #default="scope">
                <el-tag v-if="!scope.row.basicValid" type="danger" size="mini">{{
                  scope.row.basicError
                }}</el-tag>
                <el-tag v-else-if="scope.row.statusType === 'duplicate'" type="danger" size="mini"
                  >数据重复</el-tag
                >
                <el-tag
                  v-else-if="scope.row.statusType === 'movie_not_exist'"
                  type="warning"
                  size="mini"
                  >影片不存在</el-tag
                >
                <el-tag v-else type="success" size="mini">数据正常</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="80">
              <template #default="scope">
                <el-button
                  type="primary"
                  size="mini"
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
      <div
        class="empty-section"
        v-if="
          (file || (pasteText && pasteStatus === 'success')) && !filteredData.length && !parseError
        "
      >
        暂无有效排期数据
      </div>
    </el-card>

    <!-- 批量提交弹窗 - 移动端适配 -->
    <el-dialog
      v-model="showBatchSubmitDialog"
      title="批量提交排期确认"
      width="85vw"
      fullscreen="true"
      :close-on-click-modal="false"
      :close-on-press-escape="false"
      :before-close="() => !isBatchSubmitting.value"
    >
      <div class="batch-submit-content">
        <div class="batch-submit-tip" style="font-size: 12px">
          请确认是否添加以下排期至 <span class="hall-text">{{ filterForm.hallName || '指定' }}</span
          >号厅 日期：<span class="date-text">{{ dayjs(show_date).format('YYYY年MM月DD日') }}</span>
        </div>

        <!-- 批量提交列表 - 移动端适配 -->
        <div class="batch-submit-list">
          <el-table
            :data="batchSubmitList"
            border
            stripe
            style="width: 100%; color: #6495ed; background-color: black"
            height="70vh"
            size="small"
          >
            <el-table-column label="影厅" prop="data.hall_name" width="60">
              <template #default="scope"> {{ scope.row.data.hall_name }}号厅 </template>
            </el-table-column>
            <el-table-column label="影片" prop="data.movie_name" min-width="100" />
            <el-table-column label="放映时间" prop="data.start_time" width="100" />
            <el-table-column label="提交状态" width="100">
              <template #default="scope">
                <el-space>
                  <!-- 加载中 -->
                  <el-skeleton
                    circle
                    variant="text"
                    width="20px"
                    height="20px"
                    v-if="batchSubmitStatus[scope.$index].loading"
                  />
                  <!-- 成功 -->
                  <el-icon
                    color="#4CAF50"
                    v-else-if="batchSubmitStatus[scope.$index].success === true"
                    size="14"
                  >
                    <CircleCheck />
                  </el-icon>
                  <!-- 失败 -->
                  <el-icon
                    color="#F44336"
                    v-else-if="batchSubmitStatus[scope.$index].success === false"
                    size="14"
                  >
                    <CircleClose />
                  </el-icon>
                  <!-- 未提交 -->
                  <span v-else class="pending-text" style="font-size: 12px">待提交</span>
                </el-space>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </div>

      <template #footer>
        <el-button
          @click="showBatchSubmitDialog = false"
          :disabled="isBatchSubmitting.value"
          size="small"
        >
          关闭
        </el-button>
        <el-button
          type="primary"
          @click="confirmBatchSubmit"
          :loading="isBatchSubmitting.value"
          :disabled="isBatchSubmitting.value"
          size="small"
        >
          确认提交
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
/* 黑色主题基础样式 - 移动端适配 */
.page {
  padding: 10px 5px; /* 移动端减少内边距 */
  min-height: 100vh;
  color: #e0e0e0;
  overflow-x: hidden;
  box-sizing: border-box; /* 关键：包含padding在宽度内 */
}

.head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  margin: 0 0 10px 0;
  gap: 8px; /* 移动端增加间隙 */
}

.head-left h2 {
  font-size: 18px; /* 移动端缩小标题 */
  font-weight: 600;
  margin: 0 0 8px 0;
  color: #ffffff;
}

/* 卡片样式 - 深色主题 + 移动端适配 */
.card {
  height: 80vh; /* 保证最小高度 */
  border-radius: 8px; /* 移动端减小圆角 */
  /* padding: 16px 10px; 移动端减少内边距 */
  background-color: #0d153130;
  border: 1px solid #333;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  box-sizing: border-box;
}

/* 新增：文本粘贴区域样式 - 移动端适配 */
.paste-section {
  padding: 12px 8px;
  background-color: #252525;
  border-radius: 6px;
  border: 1px solid #333;
  box-sizing: border-box;
}

.paste-section :deep(.el-textarea__wrapper) {
  background-color: #333;
  border: 1px solid #444;
  box-shadow: none;
  min-height: 100px; /* 移动端文本框最小高度 */
}

.paste-section :deep(.el-textarea__inner) {
  color: #e0e0e0;
  font-size: 14px; /* 移动端缩小字体 */
}

/* 文件选择区 - 移动端适配 */
.file-section {
  margin-bottom: 16px;
  box-sizing: border-box;
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
  font-size: 14px;
}

.status-label {
  font-size: 13px; /* 移动端缩小字体 */
  color: #b0b0b0;
}

.error-tip {
  color: #ff6b6b;
  font-size: 13px; /* 移动端缩小字体 */
}

/* 检测结果区 - overflow处理 + 移动端适配 */
.detect-section {
  margin-bottom: 16px;
  padding: 12px 8px;
  background-color: #252525;
  border-radius: 6px;
  border: 1px solid #333;
  box-sizing: border-box;
}

.detect-item {
  margin-bottom: 8px;
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 13px;
}

.detect-label {
  font-size: 13px;
  color: #b0b0b0;
  font-weight: 500;
  min-width: 70px; /* 移动端减小最小宽度 */
}

/* 影厅标签容器 - 横向滚动 + 移动端适配 */
.tag-container {
  display: flex;
  gap: 4px;
  padding: 2px 0;
  overflow-x: auto;
  flex: 1;
  scrollbar-width: thin;
  scrollbar-color: #444 #252525;
  min-width: 200px; /* 移动端最小宽度 */
}

.tag-container::-webkit-scrollbar {
  height: 4px; /* 移动端缩小滚动条 */
}

.tag-container::-webkit-scrollbar-track {
  background: #252525;
}

.tag-container::-webkit-scrollbar-thumb {
  background-color: #444;
  border-radius: 2px;
}

.detect-tag {
  background-color: #333;
  border: 1px solid #444;
  color: #e0e0e0;
  white-space: nowrap;
}

/* 影片容器 - 横向滚动 + 移动端适配 */
.movie-container {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 2px 0;
  overflow-x: auto;
  flex: 1;
  max-height: 80px; /* 移动端降低最大高度 */
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: #444 #252525;
  min-width: 200px;
}

.movie-container::-webkit-scrollbar {
  width: 4px;
  height: 4px;
}

.movie-container::-webkit-scrollbar-track {
  background: #252525;
}

.movie-container::-webkit-scrollbar-thumb {
  background-color: #444;
  border-radius: 2px;
}

.movie-item {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 6px;
  background-color: #333;
  border: 1px solid #444;
  border-radius: 4px;
  white-space: nowrap;
  font-size: 13px;
}

.movie-name {
  font-size: 13px;
  color: #e0e0e0;
}

.check-btn {
  padding: 0;
  color: #64b5f6;
  font-size: 12px;
}

/* 校验图标容器样式 - 移动端适配 */
.check-icon-container {
  width: 14px;
  height: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.empty-icon {
  visibility: hidden;
}

.check-tag {
  margin-left: 4px;
}

.empty-text {
  font-size: 13px;
  color: #777;
}

/* 筛选区 - 移动端适配 */
.filter-section {
  margin-bottom: 16px;
  padding: 12px 8px;
  background-color: #252525;
  border-radius: 6px;
  border: 1px solid #333;
  box-sizing: border-box;
}

.filter-form {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-start;
}

.filter-select :deep(.el-select) {
  width: 100%; /* 移动端宽度100% */
}

.filter-select :deep(.el-input__wrapper) {
  background-color: #333;
  border: 1px solid #444;
  box-shadow: none;
}

.filter-select :deep(.el-input__inner) {
  color: #e0e0e0;
  font-size: 13px;
}

.reset-btn {
  background-color: #333;
  border: 1px solid #444;
  color: #e0e0e0;
  font-size: 13px;
}

/* 排期列表区 - overflow滚动处理 + 移动端适配 */
.schedule-section {
  margin-top: 12px;
  box-sizing: border-box;
}

.section-title {
  font-size: 14px;
  font-weight: 600;
  margin: 0 0 8px 0;
  color: #ffffff;
}

/* 表格容器 - 固定高度+滚动 + 移动端适配 */
.table-container {
  max-height: 250px; /* 移动端降低表格高度 */
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: #444 #1e1e1e;
  border-radius: 6px;
  box-sizing: border-box;
}

.table-container::-webkit-scrollbar {
  width: 6px;
}

.table-container::-webkit-scrollbar-track {
  background: #1e1e1e;
}

.table-container::-webkit-scrollbar-thumb {
  background-color: #444;
  border-radius: 3px;
}

/* 深色表格样式 - 移动端适配 */
.schedule-table :deep(.el-table) {
  --el-table-header-text-color: #e0e0e0;
  --el-table-row-hover-bg-color: #2a2a2a;
  --el-table-row-stripe-bg-color: #222;
  --el-table-text-color: #e0e0e0;
  background-color: #1e1e1e;
  color: #e0e0e0;
  font-size: 13px;
}

.schedule-table :deep(.el-table th) {
  background-color: #252525;
  border-bottom: 1px solid #444;
  font-size: 12px;
  padding: 6px 4px;
}

.schedule-table :deep(.el-table td) {
  border-bottom: 1px solid #333;
  font-size: 12px;
  padding: 6px 4px;
}

.schedule-table :deep(.el-table--border) {
  border: 1px solid #444;
}

.schedule-table :deep(.el-table--border th, .el-table--border td) {
  border-right: 1px solid #444;
}

/* 空状态 - 移动端适配 */
.empty-section {
  text-align: center;
  padding: 20px 10px;
  color: #777;
  font-size: 14px;
}

/* Element Plus 组件深色适配 + 移动端 */
:deep(.el-button--primary) {
  background-color: #1976d2;
  border-color: #1976d2;
  color: white;
  font-size: 13px;
}

:deep(.el-tag--success) {
  background-color: #2e7d32;
  border-color: #2e7d32;
  color: white;
  font-size: 12px;
}

:deep(.el-tag--danger) {
  background-color: #c62828;
  border-color: #c62828;
  color: white;
  font-size: 12px;
}

:deep(.el-tag--warning) {
  background-color: #f57c00;
  border-color: #f57c00;
  color: white;
  font-size: 12px;
}

:deep(.el-tag--info) {
  background-color: #333;
  border-color: #444;
  color: white;
  font-size: 12px;
}

/* 批量提交弹窗样式 - 移动端适配 */
.batch-submit-content {
  color: #e0e0e0;
  font-size: 13px;
  box-sizing: border-box;
}

.batch-submit-tip {
  font-size: 12px;
  margin-bottom: 12px;
  padding: 6px;
  background-color: #252525;
  border-radius: 4px;
}

.hall-text,
.date-text {
  color: #64b5f6;
  font-weight: 600;
}

.batch-submit-list :deep(.el-table) {
  --el-table-header-text-color: #e0e0e0;
  --el-table-row-hover-bg-color: #2a2a2a;
  --el-table-row-stripe-bg-color: #222;
  --el-table-text-color: #e0e0e0;
  background-color: #1e1e1e;
  color: #e0e0e0;
  font-size: 12px;
}

.batch-submit-list :deep(.el-table th) {
  background-color: #252525;
  border-bottom: 1px solid #444;
  font-size: 12px;
  padding: 4px;
}

.batch-submit-list :deep(.el-table td) {
  border-bottom: 1px solid #333;
  font-size: 12px;
  padding: 4px;
}

.pending-text {
  color: #999;
  font-size: 12px;
}

/* 弹窗样式适配 - 移动端 */
:deep(.el-dialog) {
  background-color: #1e1e1e;
  border: 1px solid #333;
  border-radius: 8px;
  padding: 0;
}

:deep(.el-dialog__header) {
  border-bottom: 1px solid #333;
  padding: 12px 16px;
}

:deep(.el-dialog__title) {
  color: #e0e0e0;
  font-size: 16px;
}

:deep(.el-dialog__body) {
  padding: 12px 16px;
}

:deep(.el-dialog__footer) {
  border-top: 1px solid #333;
  padding: 12px 16px;
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

@media screen and (max-width: 755px) {
  :deep(.el-card__body) {
    padding: 2px;
  }
}
/* 响应式适配 - 小屏手机 */
@media screen and (max-width: 375px) {
  .page {
    padding: 8px 4px;
  }

  .head-left h2 {
    font-size: 16px;
  }

  .card {
    padding: 10px 6px;
  }

  .table-container {
    max-height: 200px;
  }

  .batch-submit-list :deep(.el-table) {
    height: 150px;
  }
}
</style>
