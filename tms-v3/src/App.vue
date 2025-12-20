<template>
  <!-- 整个应用的根容器 -->
  <el-config-provider>
    <router-view />
  </el-config-provider>
</template>

<script setup lang="ts">
// 现在这里什么都不要写
</script>

<style>
/* 全局基础样式（尽量少） */

html,
body,
#app {
  margin: 0;
  padding: 0;
  height: 100%;
}

body {
  background-color: #f5f7fa; /* Element Plus 默认背景 */
  font-family:
    -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans',
    'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif;
}
</style>
