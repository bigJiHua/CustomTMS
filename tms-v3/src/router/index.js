import { createRouter, createWebHistory } from 'vue-router'
import { ElMessage, ElNotification } from 'element-plus'
import config from '@/config'
import RouterMap from '@/router/routerMap'

const router = createRouter({
  history: createWebHistory(config.BASE_URL),
  routes: RouterMap,
})

// 纯原生解析 JWT payload（只取 role，不验证签名）
const parseJwtPayload = (tokenStr) => {
  if (!tokenStr) return null
  try {
    const jwt = tokenStr.replace(/^Bearer\s*/i, '')
    const payloadPart = jwt.split('.')[1]
    if (!payloadPart) return null
    const paddedPayload = payloadPart.padEnd(
      payloadPart.length + ((4 - (payloadPart.length % 4)) % 4),
      '=',
    )
    const decoded = atob(paddedPayload)
    return JSON.parse(decoded)
  } catch (err) {
    console.error('Token 解析失败:', err)
    return null
  }
}

// 权限分层白名单
const whiteList = {
  // 所有人可访问（包括未登录）
  all: ['/login', '/register', '/'],
  // admin 专属（白名单 + admin 角色）
  admin: ['/admin/schedule'],
  // 访客专属（仅 viewer 角色可访问）
  viewer: ['/viewer/schedule'],
}

router.beforeEach((to, from, next) => {
  localStorage.removeItem('userRole')

  // 1. 先判断「所有人可访问」的白名单 → 直接放行
  if (whiteList.all.includes(to.path)) {
    next()
    return
  }

  // 2. 解析用户角色
  const rawToken = localStorage.getItem('token')
  const payload = parseJwtPayload(rawToken)
  const userRole = payload?.role || 'visitor' // 无角色默认视为访客

  // 3. 按角色分层校验
  // 3.1 admin 角色：放行 admin 白名单 + 拦截其他路由
  if (userRole === 'admin') {
    if (whiteList.admin.includes(to.path)) {
      next() // admin 访问自己的专属路由 → 放行
    } else {
      // admin 访问非专属路由 → 按原有逻辑放行（如需限制可调整）
      next()
    }
    return
  }

  // 3.2 访客（非 admin）：仅放行访客专属路由，其他全部跳转到访客路由
  if (whiteList.viewer.includes(to.path)) {
    next() // 访客访问自己的专属路由 → 放行
  } else {
    // 访客访问其他路由 → 拦截并跳转到访客专属路由
    ElMessage.error({
      message: '暂无访问权限！',
      type: 'error',
    })
    next('/viewer/schedule') // 强制跳转到访客专属路由
  }
})

export default router
