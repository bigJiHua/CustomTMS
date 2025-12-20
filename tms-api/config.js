const dayjs = require('dayjs')

// 配置对象
const config = {
  // 项目端口
  Port: 666,
  // 数据库配置
  dbUser: 'root',
  dbBase: 'tms',
  dbPassword: '',
  // token的有效期
  expiresIn: '24h',
  // 配置一个token加密密钥
  jwtSecretKey: 'sadhasdasdhua23123h@#$$^bjn2%$@#*hbbhbdasggd@^#%@*HDvdgsg#^&@^@ybGDyhds5ds89ad4as5das984ds8ad4asd84as56d',
  // session密钥
  sessionKey: 'sadhasdasdhua23123h@#$$^bjn2%$@#*hbbhbdasggd@^#%@*HDvdgsg#^&@^@ybGDyhds5ds89ad4as5das984ds8ad4asd84as56d',
  // 校验规则
  get options() {
    return {
      secret: this.jwtSecretKey,
      algorithms: ['HS256'],
      credentialsRequired: true,
    }
  },
  // 文件上传条数Max
  MaxFile: 20,
  // 动态获取当前日期
  get pub_date() {
    return dayjs(new Date()).format('YYYY-MM-DD')
  },
  // 动态获取当前月份
  get pub_month() {
    return dayjs(new Date()).format('MM')
  },
  // 生成唯一ID
  generateId(num) {
    const { v4: uuid } = require('uuid')
    return uuid().replace(/-/g, '').substring(1, num)
  },
}

// 导出配置
module.exports = config
