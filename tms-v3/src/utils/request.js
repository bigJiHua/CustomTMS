import axios from 'axios'
import { ElNotification, ElMessage } from 'element-plus'
import router from '@/router'
import config from '@/config'
const { URL } = config
// 创建axios实例
const request = axios.create({
  // TODO 上线时修改
  baseURL: URL,
  withCredentials: true, // 允许携带cookie
})

// axios请求拦截器
request.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token')
    if (token && token !== '' && token !== null && token !== undefined && token !== 'undefined') {
      config.headers.Authorization = token
    }
    return config
  },
  (error) => {
    ElMessage.error({
      message: error.message,
      duration: 2000,
    })
    return Promise.reject(error)
  },
)

// axios响应式拦截器
request.interceptors.response.use(
  (response) => {
    const { data: res } = response
    if (res.message === false) return response
    if (res.status !== 200) {
      ElMessage.warning({
        message: res.message,
        duration: 2000,
      })
    } else {
      ElMessage.success({
        message: res.message,
        duration: 1000,
      })
    }
    return response
  },
  (error) => {
    const errorCode = error.response.status ? error.response.status : 200
    const message = error.response.data.message ? error.response.data.message : error.message
    // 在需要显示通知的地方调用函数
    ElMessage.error({
      message: message,
      duration: 2000,
    })
    if (errorCode === 401) {
      localStorage.removeItem('token')
      router.push('/')
    }
    return Promise.reject(error.response)
  },
)

export default request
