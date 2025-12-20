const express = require('express')
const router = express.Router()
const System_Func = require('../RouterFunction/System')
// 拦截访客
const { CheckUserRole } = require('../Middleware/CheckUserRole')
router.use((req, res, next) => {
  CheckUserRole(req, res, next)
})

router.post('/add', System_Func.addSystemValue) // 添加系统变量
router.get('/get', System_Func.getSystemValue) // 获取系统设置
router.post('/update', System_Func.updateSystemValue)
module.exports = router
