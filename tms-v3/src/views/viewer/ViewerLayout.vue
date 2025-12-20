<script setup>
import { ref, onUnmounted, onMounted, watch } from 'vue'
import iconLogout from '@/components/icons/IconLogout.vue'
import { useRouter } from 'vue-router'
import dayjs from 'dayjs'

const router = useRouter()

const showConfirm = ref(false)
const isLock = ref(false)
const time = ref(10)
// 新增：全屏状态标识
const isFullscreen = ref(false)

let timer = null // 👈 关键：只允许一个定时器

const startCountdown = () => {
  // 防止重复启动
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
  }, 600) // 配合灰度过渡
}

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

onMounted(() => {
  startHeartbeat()
  // 注册全屏状态监听
  document.addEventListener('fullscreenchange', handleFullscreenChange)
  document.addEventListener('webkitfullscreenchange', handleFullscreenChange)
  document.addEventListener('mozfullscreenchange', handleFullscreenChange)
  document.addEventListener('MSFullscreenChange', handleFullscreenChange)
})

// 离开组件时兜底清理
onUnmounted(() => {
  stopHeartbeat()
  stopCountdown()
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
        <img src="/logo.webp" alt="" style="width: 80px; height: 50px" />
      </div>
      <div class="menu">
        {{ heartbeatTime }}
      </div>
      <div class="logout">
        <icon-logout @click="onLogoutClick" />
        <!-- 修改：点击全屏文字触发切换，显示不同状态文本 -->
        <span @click="toggleFullscreen" class="fullscreen-btn">{{
          isFullscreen ? '[退出]' : '[全屏]'
        }}</span>
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
  /* background-color: rgb(111, 115, 120); */
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  color: white;
  background:
    /* 🔦 更大的中央聚光灯 */
    radial-gradient(
      ellipse at center 12%,
      /* 光源再往上 */ rgba(255, 255, 255, 0.38) 0%,
      rgba(255, 255, 255, 0.26) 22%,
      rgba(255, 255, 255, 0.16) 42%,
      /* 扩大亮区 */ rgba(0, 0, 0, 0.25) 68%,
      /* 延后变暗 */ rgba(0, 0, 0, 0.55) 85%,
      rgba(0, 0, 0, 0.9) 100%
    ),
    /* 上亮下暗（金属面板） */
      linear-gradient(180deg, #4b4f53 0%, #34383c 55%, /* 中段更亮 */ #1b1e21 100%);

  /* 👇 关键 */
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
  /* 新增：flex 布局实现均匀分布 */
  display: flex;
  justify-content: space-around;
  align-items: center;
}
.header,
.logout {
  display: flex;
  align-items: center;
}
.menu {
  text-align: center;
  width: auto;
  flex: 1;
  font-size: 1rem;
  font-weight: 800;
}

.title {
  padding: 0 20px;
  text-align: center;
  height: 100%;
  width: auto;
  flex: 1;
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
.logout {
  width: auto;
  flex: 1;
  height: 50px;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 0 20px;
  font-size: 1rem;
  font-weight: 600;
  gap: 8px; /* 新增：退出图标和全屏文字间距 */
}

/* 新增：全屏按钮样式 */
.fullscreen-btn {
  cursor: pointer;
  color: #6ce2f7; /* 与边框同色，更醒目 */
  &:hover {
    text-decoration: underline;
  }
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
  border: none;
  cursor: pointer;
  border-radius: 4px;
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
</style>
