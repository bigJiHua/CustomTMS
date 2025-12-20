<script setup>
import { defineProps, onMounted, onUnmounted, watch } from 'vue'
import Sortable from 'sortablejs'

/* ========= Props定义 - 父组件传入数据 ========= */
/**
 * 父组件传入的影片列表
 * @type {Array<{id: string, name: string, duration: number}>}
 * @required true
 */
const props = defineProps({
  movieList: {
    type: Array,
    required: true,
    default: () => [],
  },
})

/* ========= 拖拽实例管理 - 响应式数据 ========= */
/**
 * Sortable拖拽实例：用于后续销毁，避免内存泄漏
 * @type {Sortable|null}
 */
let sortableInstance = null

/* ========= 拖拽初始化方法 ========= */
/**
 * 初始化影片拖拽功能（暴露给父组件调用）
 * 配置为克隆拖拽，拖拽时不删除原影片项
 * @param {Function} callback - 拖拽成功后的回调函数（接收movieId参数）
 * @returns {void}
 */
const initDrag = (callback) => {
  // 获取拖拽容器DOM元素
  const el = document.getElementById('movie-source-container')
  if (!el) {
    console.warn('影片拖拽容器未找到，初始化失败')
    return
  }

  // 如果已有拖拽实例，先销毁（避免重复初始化）
  if (sortableInstance) {
    sortableInstance.destroy()
  }

  // 初始化Sortable拖拽实例
  sortableInstance = new Sortable(el, {
    group: {
      name: 'movie', // 与父组件拖拽组名一致，保证跨区域拖拽
      pull: 'clone', // 克隆模式：拖拽时复制元素，不删除原项
      put: false, // 不允许接收其他元素放入
    },
    sort: false, // 禁用列表内部排序
    animation: 150, // 拖拽动画时长（ms）
    ghostClass: 'sortable-ghost', // 拖拽时的占位样式类
    chosenClass: 'sortable-chosen', // 选中元素的样式类
    /**
     * 拖拽添加成功时的回调
     * @param {Object} evt - Sortable事件对象
     */
    onAdd: (evt) => {
      // 获取拖拽元素的影片ID（data-movie-id属性）
      const movieId = evt.item.dataset.movieId
      // 执行父组件传入的回调函数
      callback && callback(movieId)
    },
  })
}

/* ========= 监听影片列表变化 ========= */
/**
 * 监听父组件传入的影片列表变化，重新初始化拖拽
 * 保证影片列表更新后拖拽功能正常
 */
watch(
  () => props.movieList,
  () => {
    // 如果已有实例，先销毁再重新初始化（这里简化处理，实际可优化为仅更新列表）
    if (sortableInstance) {
      sortableInstance.destroy()
      sortableInstance = null
    }
  },
  { deep: true }, // 深度监听数组元素变化
)

/* ========= 生命周期钩子 ========= */
/**
 * 组件卸载时销毁拖拽实例：避免内存泄漏
 * @returns {void}
 */
onUnmounted(() => {
  if (sortableInstance) {
    sortableInstance.destroy()
    sortableInstance = null
  }
})

/* ========= 暴露方法给父组件 ========= */
defineExpose({
  initDrag, // 暴露初始化拖拽方法
})
</script>

<template>
  <div class="movie-source-container">
    <!-- 组件标题 -->
    <div class="movie-source-title">影片资源库</div>
    <!-- 影片列表拖拽容器 -->
    <div id="movie-source-container" class="movie-list">
      <!-- 循环渲染影片项 -->
      <div v-for="movie in movieList" :key="movie.id" :data-movie-id="movie.id" class="movie-item">
        <div class="movie-name">{{ movie.name }}</div>
        <div class="movie-duration">{{ movie.duration }}分钟</div>
      </div>
      <!-- 空状态提示 -->
      <div v-if="movieList.length === 0" class="empty-movie-tip">暂无影片数据</div>
    </div>
  </div>
</template>

<style scoped>
/* 组件容器样式 - 统一深色风格 */
.movie-source-container {
  width: 140px; /* 适度加宽，提升体验 */
  padding: 12px;
  background: #151520;
  border-radius: 8px;
  border: 1px solid #0ea5e9; /* 统一浅蓝色边框 */
  user-select: none; /* 禁止文字选中 */
  -webkit-user-select: none;
  -moz-user-select: none;
}

/* 组件标题样式 */
.movie-source-title {
  font-size: 16px;
  font-weight: 600;
  color: #0ea5e9; /* 统一主题色 */
  margin-bottom: 12px;
  text-align: center;
  padding-bottom: 8px;
  border-bottom: 1px solid #2d3748;
}

/* 影片列表容器 */
.movie-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 60vh; /* 限制高度，超出滚动 */
  overflow-y: auto;
  padding-right: 4px;
}

/* 影片项样式 - 统一交互效果 */
.movie-item {
  padding: 12px 8px;
  background: #0a0a0f;
  border-radius: 6px;
  cursor: move; /* 拖拽光标 */
  text-align: center;
  transition: all 0.2s ease;
  border: 1px solid transparent;
}
/* 鼠标悬浮效果 */
.movie-item:hover {
  transform: translateY(-2px);
  box-shadow: 0 0 10px rgba(14, 165, 233, 0.3);
  border-color: #0ea5e9;
}
/* 拖拽选中效果 */
:deep(.sortable-chosen) {
  background: #1f2937;
  border-color: #38bdf8;
}
/* 拖拽占位效果 */
:deep(.sortable-ghost) {
  opacity: 0.5;
  background: #2d3748;
}

/* 影片名称样式 */
.movie-name {
  color: #ffffff;
  font-size: 14px;
  margin-bottom: 4px;
  font-weight: 500;
}

/* 影片时长样式 */
.movie-duration {
  font-size: 12px;
  color: #94a3b8; /* 统一浅灰色 */
}

/* 空状态提示 */
.empty-movie-tip {
  text-align: center;
  padding: 20px 0;
  color: #6b7280;
  font-size: 12px;
}

/* 滚动条样式统一 */
.movie-list::-webkit-scrollbar {
  width: 4px;
}
.movie-list::-webkit-scrollbar-track {
  background: #151520;
}
.movie-list::-webkit-scrollbar-thumb {
  background: #374151;
  border-radius: 2px;
}
.movie-list::-webkit-scrollbar-thumb:hover {
  background: #0ea5e9;
}

/* 响应式适配 */
@media (max-width: 768px) {
  .movie-source-container {
    width: 100%;
    margin-bottom: 16px;
  }
  .movie-list {
    flex-direction: row;
    flex-wrap: wrap;
    max-height: none;
    gap: 8px;
  }
  .movie-item {
    width: calc(33.33% - 8px);
    padding: 8px 4px;
  }
}
</style>
