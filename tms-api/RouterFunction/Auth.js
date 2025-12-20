const bcrypt = require('bcryptjs')

// 导入生成token 处理模块
const jwt = require('jsonwebtoken')
const config = require('../config')
const { ExecuteFunctionData, ExecuteFunction } = require('../Middleware/ExecuteFunc')

// 用户登录
exports.UserLogin = async (req, res) => {
  const { username, password } = req.body
  if (!username || !password) {
    return res.status(400).json({ message: '参数不完整' })
  }

  // 查用户
  const sql = `
    SELECT id, username, password_hash, role, is_active, role
    FROM users
    WHERE username = ?
    LIMIT 1
  `
  const rows = await ExecuteFunctionData(sql, username)

  if (rows.length !== 1) {
    return res.status(401).json({ message: '账号不存在' })
  }

  const user = rows[0]

  // 是否激活
  if (!user.is_active) {
    return res.status(403).json({ message: '账号未激活' })
  }

  // 校验密码
  const ok = bcrypt.compareSync(password, user.password_hash)
  if (!ok) {
    return res.status(401).json({ message: '密码错误' })
  }

  // 生成 token
  const token = jwt.sign(
    {
      uid: user.id,
      username: user.username,
      role: user.role
    },
    config.jwtSecretKey,
    { expiresIn: config.expiresIn }
  )

  return res.send({
    status: 200,
    message: '登录成功',
    token: 'Bearer ' + token,
    role: user.role
  })
}

// 用户注册（支持首次用户为 admin）
exports.UserReg = async (req, res) => {
  const { username, password } = req.body
  if (!username || !password) {
    return res.status(400).json({ message: '参数不完整' })
  }

  // 查重
  const checkSql = `SELECT id FROM users WHERE username = ?`
  const exists = await ExecuteFunctionData(checkSql, username)
  if (exists.length > 0) {
    return res.status(409).json({ message: '用户名已存在' })
  }

  // 判断是否是第一个用户
  const countSql = `SELECT COUNT(*) AS total FROM users`
  const [{ total }] = await ExecuteFunction(countSql)

  const role = total === 0 ? 'admin' : 'viewer'

  // 加密密码
  const password_hash = bcrypt.hashSync(password, 10)

  // 插入
  const insertSql = `
    INSERT INTO users
      (username, password_hash, role, is_active, created_at, updated_at)
    VALUES (?, ?, ?, ?, NOW(), NOW())
  `

  const result = await ExecuteFunctionData(insertSql, [
    username,
    password_hash,
    role,
    1
  ])

  if (result.affectedRows !== 1) {
    return res.status(500).json({ message: '注册失败' })
  }

  return res.send({
    status: 200,
    message: role === 'admin'
      ? '管理员账户创建成功'
      : '注册成功',
    role
  })
}
