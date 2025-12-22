<script setup>
import { ref, onUnmounted, watch, onMounted } from 'vue'
import iconLogout from '@/components/icons/IconLogout.vue'
import { useRouter } from 'vue-router'
import dayjs from 'dayjs' // 新增：引入dayjs处理时间

const router = useRouter()

// 退出确认相关
const showConfirm = ref(false)
const isLock = ref(false)
const time = ref(10)
let timer = null

// 新增：全屏状态标识
const isFullscreen = ref(false)

// 移动端折叠菜单相关
const isMobileMenuOpen = ref(false) // 移动端菜单展开/收起状态
const isMobile = ref(false) // 是否为移动端

// ================== 心跳时间 ==================
const heartbeatTime = ref(dayjs().format('YYYY-MM-DD HH:mm:ss'))
let heartbeatTimer = null

const startHeartbeat = () => {
  heartbeatTime.value = dayjs().format('YYYY-MM-DD HH:mm:ss')
  heartbeatTimer = setInterval(() => {
    heartbeatTime.value = dayjs().format('YYYY-MM-DD HH:mm:ss')
  }, 1000)
}

const stopHeartbeat = () => {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer)
    heartbeatTimer = null
  }
}

// ================== 全屏功能 ==================
// 切换全屏状态
const toggleFullscreen = () => {
  // 防止在退出确认弹窗时操作全屏
  if (isLock.value) return

  if (!isFullscreen.value) {
    // 进入全屏
    const docEl = document.documentElement
    if (docEl.requestFullscreen) {
      docEl.requestFullscreen()
    } else if (docEl.mozRequestFullScreen) {
      // 火狐
      docEl.mozRequestFullScreen()
    } else if (docEl.webkitRequestFullscreen) {
      // 谷歌/ Safari
      docEl.webkitRequestFullscreen()
    } else if (docEl.msRequestFullscreen) {
      // IE/Edge
      docEl.msRequestFullscreen()
    }
  } else {
    // 退出全屏
    if (document.exitFullscreen) {
      document.exitFullscreen()
    } else if (document.mozCancelFullScreen) {
      document.mozCancelFullScreen()
    } else if (document.webkitExitFullscreen) {
      document.webkitExitFullscreen()
    } else if (document.msExitFullscreen) {
      document.msExitFullscreen()
    }
  }
}

// 监听全屏状态变化
const handleFullscreenChange = () => {
  isFullscreen.value =
    !!document.fullscreenElement ||
    !!document.mozFullScreenElement ||
    !!document.webkitFullscreenElement ||
    !!document.msFullscreenElement
}

// 检测设备类型
const checkMobile = () => {
  isMobile.value = window.innerWidth < 768
  // 切换到桌面端时自动关闭移动端菜单
  if (!isMobile.value) {
    isMobileMenuOpen.value = false
  }
}

// 监听窗口大小变化
watch(
  [isMobile],
  () => {
    // 响应式适配逻辑
  },
  { immediate: true },
)

// 初始化检测
checkMobile()
window.addEventListener('resize', checkMobile)

const startCountdown = () => {
  if (timer) return
  timer = setInterval(() => {
    if (time.value <= 1) {
      stopCountdown()
      confirmLogout()
    } else {
      time.value--
    }
  }, 1000)
}

const stopCountdown = () => {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}

const onLogoutClick = () => {
  time.value = 10
  showConfirm.value = true
  isLock.value = true
  startCountdown()
  // 点击退出时关闭移动端菜单
  isMobileMenuOpen.value = false
}

const cancelLogout = () => {
  showConfirm.value = false
  isLock.value = false
  stopCountdown()
}

const confirmLogout = () => {
  stopCountdown()
  setTimeout(() => {
    localStorage.removeItem('token')
    router.push('/')
  }, 600)
}

// 切换移动端菜单
const toggleMobileMenu = () => {
  isMobileMenuOpen.value = !isMobileMenuOpen.value
}

// 关闭移动端菜单
const closeMobileMenu = () => {
  if (isMobile.value) {
    isMobileMenuOpen.value = false
  }
}

// 点击遮罩层关闭菜单
const handleMaskClick = () => {
  closeMobileMenu()
}

// 阻止菜单内部点击冒泡到遮罩层
const stopPropagation = (e) => {
  e.stopPropagation()
}

onMounted(() => {
  startHeartbeat()
  // 注册全屏状态监听
  document.addEventListener('fullscreenchange', handleFullscreenChange)
  document.addEventListener('webkitfullscreenchange', handleFullscreenChange)
  document.addEventListener('mozfullscreenchange', handleFullscreenChange)
  document.addEventListener('MSFullscreenChange', handleFullscreenChange)
})

// 清理定时器和事件监听
onUnmounted(() => {
  stopCountdown()
  stopHeartbeat() // 新增：清理心跳定时器
  window.removeEventListener('resize', checkMobile)
  // 移除全屏监听
  document.removeEventListener('fullscreenchange', handleFullscreenChange)
  document.removeEventListener('webkitfullscreenchange', handleFullscreenChange)
  document.removeEventListener('mozfullscreenchange', handleFullscreenChange)
  document.removeEventListener('MSFullscreenChange', handleFullscreenChange)

  // 组件卸载时退出全屏（可选）
  if (isFullscreen.value) {
    if (document.exitFullscreen) document.exitFullscreen()
  }
})
</script>

<template>
  <div class="center" :class="{ lock: isLock }">
    <div class="header">
      <div class="title">
        <router-link to="/admin">
          <img src="/logo.webp" alt="" style="width: 80px; height: 50px" />
        </router-link>
      </div>

      <!-- 桌面端菜单 -->
      <div class="menu desktop-menu">
        <router-link to="/admin/schedule" @click="closeMobileMenu"> 动态看板 </router-link>
        <router-link to="/admin/list" @click="closeMobileMenu"> 排期列表 </router-link>
        <router-link to="/admin/manage" @click="closeMobileMenu"> 排期管理 </router-link>
        <router-link to="/admin/movies" @click="closeMobileMenu"> 影片管理 </router-link>
        <router-link to="/admin/import" @click="closeMobileMenu"> Excel 导入 </router-link>
        <router-link to="/admin/settings" @click="closeMobileMenu"> 系统设置 </router-link>
      </div>

      <!-- 桌面端退出按钮 -->
      <div class="logout desktop-logout menu" v-if="!isMobile">
        <span>Logout</span>
        <icon-logout @click="onLogoutClick" />
      </div>

      <!-- 移动端心跳时间 + 全屏按钮（只在移动端显示） -->
      <div class="mobile-heartbeat" v-if="isMobile">
        <span class="heartbeat-time">{{ heartbeatTime }}</span>
        <span @click="toggleFullscreen" class="fullscreen-btn">{{
          isFullscreen ? '[退出]' : '[全屏]'
        }}</span>
      </div>

      <!-- 移动端汉堡按钮 - 移到右上角 -->
      <div class="mobile-menu-toggle" @click="toggleMobileMenu" v-if="isMobile">
        <div class="hamburger">
          <span></span>
          <span></span>
          <span></span>
        </div>
      </div>
    </div>

    <!-- 移动端菜单遮罩层 -->
    <div
      v-if="isMobile && isMobileMenuOpen"
      class="mobile-menu-mask"
      @click="handleMaskClick"
    ></div>

    <!-- 移动端折叠菜单 -->
    <div
      class="mobile-menu"
      :class="{ 'mobile-menu-open': isMobile && isMobileMenuOpen }"
      @click="stopPropagation"
    >
      <router-link to="/admin/list" @click="closeMobileMenu"> 排期列表 </router-link>
      <router-link to="/admin/manageh5" @click="closeMobileMenu"> 排期管理 </router-link>
      <router-link to="/admin/movies" @click="closeMobileMenu"> 影片管理 </router-link>
      <router-link to="/admin/settings" @click="closeMobileMenu"> 系统设置 </router-link>
      <!-- 移动端退出选项 -->
      <div class="mobile-logout" @click="onLogoutClick">
        <span>Logout</span>
        <icon-logout />
      </div>
    </div>

    <div class="body">
      <router-view />
    </div>

    <!-- 灰白遮罩 -->
    <div v-if="isLock" class="mask"></div>

    <!-- 确认弹窗 -->
    <div v-if="showConfirm" class="modal">
      <div class="modal-box">
        <div class="modal-title">确认退出</div>
        <div class="modal-content">
          确定要退出当前系统吗？
          <span>{{ time }} 秒后自动退出</span>
        </div>
        <div class="modal-actions">
          <button class="btn cancel" @click="cancelLogout">取消</button>
          <button class="btn confirm" @click="confirmLogout">退出</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.center {
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  color: white;
  background:
    radial-gradient(
      ellipse at center 12%,
      rgba(255, 255, 255, 0.38) 0%,
      rgba(255, 255, 255, 0.26) 22%,
      rgba(255, 255, 255, 0.16) 42%,
      rgba(0, 0, 0, 0.25) 68%,
      rgba(0, 0, 0, 0.55) 85%,
      rgba(0, 0, 0, 0.9) 100%
    ),
    linear-gradient(180deg, #4b4f53 0%, #34383c 55%, #1b1e21 100%);
  transition:
    filter 11s ease,
    brightness 11s ease;
}

.header {
  width: 100%;
  height: 50px;
  border-top: 8px solid rgb(1, 226, 247);
  box-sizing: content-box;
  background-color: rgb(80, 80, 80);
  display: flex;
  position: relative;
  z-index: 100;
  justify-content: space-between; /* 两端对齐，让汉堡按钮靠右 */
  align-items: center; /* 垂直居中 */
}

.header,
.logout {
  display: flex;
  align-items: center;
}

/* 桌面端菜单样式 */
.desktop-menu {
  height: 100%;
  flex: 1;
  background: linear-gradient(to bottom, #535353 30%, #282828 100%);
  > a {
    display: inline-block;
    padding: 11px;
    color: rgb(142, 182, 61);
    letter-spacing: -1px;
    transform: scaleY(1.3);
    transform-origin: center;
    font-size: 17px;
    font-weight: 800;
    text-decoration: none;
    cursor: pointer;
  }
}

.title {
  padding: 0 20px;
  text-align: center;
  border-right: 8px solid rgb(1, 226, 247);
  height: 100%;
  width: 80px;
  display: flex;
  align-items: center;
  justify-content: center;
  > a {
    color: rgb(0, 255, 255);
    font-size: 2rem;
    font-weight: 800;
    text-decoration: none;
  }
}

/* 桌面端退出按钮样式 */
.desktop-logout {
  width: auto;
  padding: 0 20px;
  border-left: 2px solid rgb(1, 226, 247);
  font-size: 1rem;
  font-weight: 600;
  > span {
    color: white;
    transform: scaleY(2);
    margin-right: 8px;
  }
  cursor: pointer;
}

.body {
  width: 100vw;
  height: calc(100vh - 50px);
}

/* 页面锁死状态 */
.lock {
  filter: grayscale(100%) brightness(0.85);
}

/* 遮罩层 */
.mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.25);
  z-index: 1000;
  pointer-events: all;
}

/* 弹窗层 */
.modal {
  position: fixed;
  inset: 0;
  z-index: 1001;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: all;
}

/* 弹窗本体 */
.modal-box {
  width: 320px;
  background: #2b2b2b;
  border: 2px solid #6ce2f7;
  border-radius: 6px;
  box-shadow: 0 0 20px rgba(0, 0, 0, 0.8);
  color: #fff;
  padding: 16px;
  animation: pop 0.2s ease-out;
}

.modal-title {
  font-size: 18px;
  font-weight: bold;
  margin-bottom: 10px;
}

.modal-content {
  font-size: 14px;
  margin-bottom: 20px;
  color: #ddd;
}

/* 按钮区 */
.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.btn {
  padding: 6px 14px;
  font-size: 14px;
  border-radius: 4px;
  border: none;
  cursor: pointer;
}

.btn.cancel {
  background: #555;
  color: #fff;
}

.btn.confirm {
  background: #e53935;
  color: #fff;
}

/* 弹窗动画 */
@keyframes pop {
  from {
    transform: scale(0.9);
    opacity: 0;
  }
  to {
    transform: scale(1);
    opacity: 1;
  }
}

/* 移动端样式 */
@media (max-width: 767px) {
  .desktop-menu {
    display: none; /* 隐藏桌面端菜单 */
  }

  .desktop-logout {
    display: none; /* 隐藏桌面端退出按钮 */
  }

  .title {
    width: auto;
    padding: 0 10px;
    border-right: 4px solid rgb(1, 226, 247);
  }

  /* 移动端心跳时间 + 全屏按钮样式 */
  .mobile-heartbeat {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 10px;
    font-size: 12px;
    color: #6ce2f7;
  }

  .heartbeat-time {
    white-space: nowrap;
  }

  /* 全屏按钮样式 */
  .fullscreen-btn {
    cursor: pointer;
    color: #6ce2f7;
    &:hover {
      text-decoration: underline;
    }
  }

  /* 汉堡按钮样式 - 右上角 */
  .mobile-menu-toggle {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 50px;
    height: 50px;
    cursor: pointer;
    margin-left: auto; /* 强制靠右 */
  }

  .hamburger {
    width: 24px;
    height: 20px;
    position: relative;
  }

  .hamburger span {
    display: block;
    width: 100%;
    height: 2px;
    background: #6ce2f7;
    border-radius: 2px;
    position: absolute;
    transition: all 0.3s ease;
  }

  .hamburger span:nth-child(1) {
    top: 0;
  }

  .hamburger span:nth-child(2) {
    top: 9px;
  }

  .hamburger span:nth-child(3) {
    bottom: 0;
  }

  /* 移动端菜单遮罩层 */
  .mobile-menu-mask {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    z-index: 98;
    transition: opacity 0.3s ease;
  }

  /* 移动端折叠菜单 - 基础样式（默认收起） */
  .mobile-menu {
    position: absolute;
    top: 58px; /* 对应header高度+边框 */
    right: 0; /* 靠右对齐 */
    width: 100%;
    max-width: 280px; /* 限制最大宽度 */
    background: linear-gradient(to bottom, #535353 0%, #282828 100%);
    z-index: 99;
    display: flex;
    flex-direction: column;
    transform: translateY(-100%); /* 默认向上收起 */
    opacity: 0; /* 默认透明 */
    pointer-events: none; /* 收起时不响应点击 */
    transition:
      transform 0.3s ease-out,
      opacity 0.3s ease-out; /* 动画过渡 */
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);
    border-left: 2px solid rgb(1, 226, 247);
  }

  /* 菜单展开状态 */
  .mobile-menu-open {
    transform: translateY(0); /* 展开时回到原位 */
    opacity: 1; /* 展开时显示 */
    pointer-events: all; /* 展开时响应点击 */
  }

  .mobile-menu a {
    padding: 15px 20px;
    color: rgb(142, 182, 61);
    letter-spacing: -1px;
    font-size: 17px;
    font-weight: 800;
    text-decoration: none;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  }

  /* 移动端退出选项样式 */
  .mobile-logout {
    padding: 15px 20px;
    color: #ff6b6b; /* 红色突出退出按钮 */
    letter-spacing: -1px;
    font-size: 17px;
    font-weight: 800;
    text-decoration: none;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    display: flex;
    align-items: center;
    justify-content: space-between;
    cursor: pointer;
    background: rgba(239, 68, 68, 0.1);
  }
}

/* 桌面端隐藏汉堡按钮、移动端菜单、心跳时间和全屏按钮 */
@media (min-width: 768px) {
  .mobile-menu-toggle {
    display: none;
  }
  .mobile-menu {
    display: none !important;
  }
  .mobile-menu-mask {
    display: none !important;
  }
  .mobile-heartbeat {
    display: none !important; /* 桌面端隐藏心跳时间和全屏按钮 */
  }
}
</style>
