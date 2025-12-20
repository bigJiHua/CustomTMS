<script setup>
import { ref, onUnmounted } from 'vue'
import iconLogout from '@/components/icons/IconLogout.vue'
import { useRouter } from 'vue-router'

const router = useRouter()

const showConfirm = ref(false)
const isLock = ref(false)
const time = ref(10)

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

// 离开组件时兜底清理
onUnmounted(() => {
  stopCountdown()
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

      <div class="menu">
        <router-link to="/admin/schedule"> 视图 </router-link>
        <router-link to="/admin/manage"> 排期管理 </router-link>
        <router-link to="/admin/movies"> 影片管理 </router-link>
        <router-link to="/admin/import"> Excel 导入 </router-link>
        <router-link to="/admin/settings"> 系统设置 </router-link>
      </div>
      <div class="logout menu">
        <span>Logout</span>
        <icon-logout @click="onLogoutClick" />
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
}
.header {
  width: 100%;
  height: 50px;
  border-top: 8px solid rgb(1, 226, 247);
  box-sizing: content-box;
  background-color: rgb(80, 80, 80);
}
.header,
.logout {
  display: flex;
  align-items: center;
}
.menu {
  height: 100%;
  width: 100%;
  background: linear-gradient(to bottom, #535353 30%, #282828 100%);
  > a {
    display: inline-block;
    padding: 11px;
    color: rgb(142, 182, 61);
    letter-spacing: -1px;
    transform: scaleY(1.3); /* 1.2 = 拉高 20% */
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
  > a {
    color: rgb(0, 255, 255);
    font-size: 2rem;
    font-weight: 800;
    text-decoration: none;
  }
}
.logout {
  width: 30%;
  height: 50px;
  display: flex;
  justify-content: space-between;
  padding: 0 20px;
  border-left: 2px solid rgb(1, 226, 247);
  font-size: 1rem;
  font-weight: 600;
  > span {
    color: white;
    transform: scaleY(2);
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
.center {
  background-color: rgb(111, 115, 120);
  width: 100vw;
  height: 100vh;
  overflow: hidden;

  /* 👇 关键 */
  transition:
    filter 11s ease,
    brightness 11s ease;
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
</style>
