<script setup lang="ts">
import { reactive, ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import Auth from '@/utils/API/auth'

const router = useRouter()
const islogin = ref(true)
const isreg = ref(false)
const form = reactive({
  username: '',
  password: '',
})

// 新增：自动跳转核心函数
const checkTokenAndRedirect = () => {
  try {
    // 1. 获取并校验 token
    const token = localStorage.getItem('token')
    // 排除 token 为 undefined、null、空字符串的情况
    if (!token || token === 'undefined' || token.trim() === '') {
      return // 无有效 token，不跳转
    }

    // 2. 获取并校验 role（建议：实际项目中最好通过接口校验 token 有效性并获取用户信息）
    // 注意：如果 role 不是存在 localStorage，而是需要接口获取，这里要改成异步请求
    const role = localStorage.getItem('role')
    if (!role || !['admin', 'viewer'].includes(role)) {
      localStorage.removeItem('token') // 角色无效，清除无效 token
      localStorage.removeItem('role')
      ElMessage.warning('登录状态失效，请重新登录')
      return
    }

    // 3. 自动跳转到对应页面
    ElMessage.success('欢迎回来！')
    setTimeout(() => {
      void router.push(`/${role}`)
    }, 800)
  } catch (error) {
    // 捕获异常，避免代码报错导致页面无法使用
    console.error('校验登录状态失败：', error)
    localStorage.removeItem('token')
    localStorage.removeItem('role')
  }
}

// 组件挂载时执行自动跳转检查
onMounted(() => {
  checkTokenAndRedirect()
})

const onLogin = async () => {
  // 第 5 步我们再接后端 /api/auth/login
  if (!form.username || !form.password) {
    ElMessage.warning('请输入用户名和密码')
    return
  }

  try {
    const { data: res } = await Auth.LoginMenu(form.username, form.password)
    if (res.status === 200) {
      // 登录成功：存储 token 和 role
      localStorage.setItem('token', res.token)
      localStorage.setItem('role', res.role) // 新增：存储角色信息
      const targetPath = res.role === 'admin' ? '/admin' : '/viewer'
      setTimeout(() => {
        void router.push(targetPath)
      }, 500)
    }
  } catch (error) {
    console.error('登录失败：', error)
    ElMessage.error('登录失败，请检查用户名或密码')
  }
}

const onRegister = async () => {
  if (!form.username || !form.password) {
    ElMessage.warning('请输入用户名和密码')
    return
  }

  try {
    const { data: res } = await Auth.RegisterMenu(form.username, form.password)
    if (res.status === 200) {
      ElMessage.success('注册成功，请登录')
      isreg.value = false
      islogin.value = true
    }
  } catch (error) {
    console.error('注册失败：', error)
    ElMessage.error('注册失败，请重试')
  }
}

const onReg = () => {
  islogin.value = !islogin.value
  isreg.value = !isreg.value
}
</script>

<template>
  <div class="wrap">
    <div class="card">
      <h2 class="title">TMS {{ islogin ? '登录' : '注册' }}</h2>
      <el-form label-position="top">
        <el-form-item label="用户名">
          <el-input v-model="form.username" placeholder="请输入用户名" />
        </el-form-item>
        <el-form-item label="密码">
          <el-input
            v-model="form.password"
            type="password"
            show-password
            placeholder="请输入密码"
          />
        </el-form-item>
        <div class="btn">
          <el-button
            type="primary"
            :color="'rgb(144, 174, 83)'"
            style="color: white"
            @click="onReg"
            v-if="!isreg && islogin"
            >注册</el-button
          >
          <el-button
            type="primary"
            :color="'rgb(144, 174, 83)'"
            style="color: white"
            @click="onReg"
            v-else
            >返回</el-button
          >
          <el-button
            type="primary"
            :color="'rgb(144, 174, 83)'"
            style="color: white"
            @click="onRegister"
            v-if="isreg && !islogin"
            >提交</el-button
          >
          <el-button
            type="primary"
            :color="'rgb(144, 174, 83)'"
            style="color: white"
            @click="onLogin"
            v-else-if="!isreg && islogin"
            >登录</el-button
          >
        </div>
        <div class="tips">⚠ 暂不对外开放，请勿扫描站点数据！</div>
      </el-form>
    </div>
  </div>
</template>

<style scoped>
.wrap {
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background-color: rgb(111, 115, 120);
  color: white;
}
.card {
  width: 380px;
  border-radius: 12px;
  padding: 20px;
  background-color: rgba(53, 54, 58, 0.652);
}
.title {
  margin: 0 0 16px;
  font-size: 2rem;
  font-weight: 700;
  /* color: rgb(17, 218, 237); */
  color: rgb(108, 178, 185);
  text-align: center;
}
.tips {
  margin-top: 12px;
  color: #ff0000;
  font-size: 12px;
}
:deep(.el-form-item__label) {
  color: white;
  font-size: 14px;
  font-weight: 600;
}
.btn {
  display: flex;
  justify-content: space-between;
  > button {
    width: 50%;
  }
}
</style>
