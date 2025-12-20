<template>
  <div class="bg">
    <div class="circle"></div>
    <div class="strip"></div>
  </div>
</template>
<style scoped>
.bg {
  width: 40px;
  height: 40px;
  background-color: red; /* 关机键底色 */
  position: relative;
  overflow: hidden;
  border-radius: 5px; /* 可选：让整体更现代 */
}
.bg:hover {
  cursor: pointer;
}
/* 圆环 */
.circle {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 4px solid #fff;
  background: transparent;
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
}

/* 中间竖线 */
.strip {
  width: 6px;
  height: 16px;
  background-color: #fff;
  position: absolute;
  top: 9px; /* 关键：从上方插入 */
  left: 50%;
  transform: translateX(-50%);
  border-radius: 3px;
}
</style>
