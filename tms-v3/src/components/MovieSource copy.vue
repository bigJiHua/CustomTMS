<!-- components/MovieSource.vue -->
<script setup>
import { defineProps, onMounted, onUnmounted } from 'vue'
import Sortable from 'sortablejs'

// 接收父组件传参：影片列表
const props = defineProps({
  movieList: {
    type: Array,
    required: true,
    default: () => [],
  },
})

// 初始化拖拽（暴露给父组件）
let sortableInstance = null
const initDrag = (callback) => {
  const el = document.getElementById('movie-source-container')
  if (!el) return

  // 销毁旧实例
  if (sortableInstance) sortableInstance.destroy()

  // 初始化拖拽（仅克隆）
  sortableInstance = new Sortable(el, {
    group: { name: 'movie', pull: 'clone', put: false },
    sort: false,
    animation: 150,
    // 拖拽到目标区触发回调
    onAdd: (evt) => {
      const movieId = evt.item.dataset.movieId
      callback && callback(movieId)
    },
  })
}

// 暴露方法给父组件
defineExpose({ initDrag })

// 卸载时销毁
onUnmounted(() => {
  if (sortableInstance) sortableInstance.destroy()
})
</script>

<template>
  <div class="movie-source">
    <div class="title">影片资源</div>
    <div id="movie-source-container" class="movie-list">
      <div v-for="movie in movieList" :key="movie.id" :data-movie-id="movie.id" class="movie-item">
        <div class="name">{{ movie.name }}</div>
        <div class="duration">{{ movie.duration }}分钟</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.movie-source {
  width: 200px;
  padding: 10px;
  background: #151520;
  border-radius: 6px;
  border: 1px solid #00d4ff;
  user-select: none; /* 核心：禁止文本选择 */
  -webkit-user-select: none;
  -moz-user-select: none;
}

.title {
  font-size: 16px;
  font-weight: bold;
  color: #00d4ff;
  margin-bottom: 10px;
  text-align: center;
}

.movie-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.movie-item {
  padding: 10px;
  background: #0a0a0f;
  border-radius: 4px;
  cursor: move; /* 明确拖拽光标 */
  text-align: center;
  transition: transform 0.2s;
  user-select: none; /* 子元素禁止选中文本 */
}

.movie-item:hover {
  transform: translateY(-2px);
  box-shadow: 0 0 8px rgba(0, 212, 255, 0.3);
}

.name {
  color: #fff;
  margin-bottom: 4px;
}

.duration {
  font-size: 12px;
  color: #a8c7ff;
}
</style>
