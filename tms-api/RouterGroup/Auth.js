const express = require('express')
const router = express.Router()
const expressJoi = require('@escook/express-joi')
const { CheckUserReg } = require('../Middleware/CheckUserRole')

const Auth_Func = require('../RouterFunction/Auth')
const user_schema_M = require('../Rules/users')

router.post('/login', expressJoi(user_schema_M.users), Auth_Func.UserLogin) // 登录
router.post('/reguser', expressJoi(user_schema_M.users), CheckUserReg, Auth_Func.UserReg) // 注册

module.exports = router
