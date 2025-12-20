const express = require('express')
const { expressjwt: expressJWT } = require('express-jwt')
const bodyParser = require('body-parser')
const session = require('express-session')
const cors = require('cors')
const Joi = require('joi')
const config = require('./config')
const webapp = express()

/* 中间件 */
const allowedOrigin = [
    'http://192.168.0.103:5173',
    'http://localhost:5173',
]
webapp.use(
  cors({
    origin: allowedOrigin, // 指定前端地址
    credentials: true, // 允许携带 cookie
    methods: ['GET', 'POST', 'OPTIONS', 'PATCH'], // 必须包含你使用的方法
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'viewportwidth',
      'viewportheight',
      'pixelratio',
      'navigatorplatform'
    ],
  }),
)
webapp.use(
  bodyParser.urlencoded({
    limit: '10mb',
    extended: true,
  }),
)
// 配置解析session中间件
webapp.use(
  session({
    secret: config.sessionKey, // 用于加密 session ID 的字符串（必须）
    resave: false, // 强制每次请求都保存 session（推荐 false）
    saveUninitialized: true, // 初始化未设置内容的 session 也保存（推荐 true）
    cookie: {
      maxAge: 1000 * 60 * 1, // session 有效期：1分钟
      secure: false, // 确保http能发送cookie
    },
  }),
)
webapp.use(async (req, res, next) => {
  res.say = function (err, status) {
    res.status(status === undefined ? 206 : status).send({
      status: status,
      message: err instanceof Error ? err.message : err,
    })
  }
  next()
})
/* 中间件 */

/* 路由模块 */
const movie_data_Router = require('./RouterGroup/Movie')
const user_auth_Router = require('./RouterGroup/Auth')
const system_Router = require('./RouterGroup/System')

webapp.use('/api/movie', expressJWT(config.options), movie_data_Router) // 权限接口 获取片源数据
webapp.use('/api/system', expressJWT(config.options), system_Router) // 权限接口 获取系统设置
webapp.use('/api/auth', user_auth_Router) // 登录注册 非权限接口
/* 路由模块 */

// 定义错误级别中间件 拦截未知错误
webapp.use((err, req, res, next) => {
  if (err instanceof Joi.ValidationError)
    return res.send({
      message: err.message,
      status: 400,
    })
  if (err.name === 'UnauthorizedError')
    return res.status(401).send({
      message: '身份认证失败,请登录',
      status: 401,
    })
  if (err.name === 'PayloadTooLargeError')
    return res.send({
      message: '文件过大，请重试',
      status: 204,
    })
  return res.send({
    message: err.message,
    status: 204,
  })
})

//     监听项目端口，运行时要修改
webapp.listen(config.Port, () => {
  console.log('server Open ' + config.Port + ' listening')
})
