import request from '@/utils/request'
// 用户登录
const LoginMenu = function (username, password) {
  const params = new URLSearchParams()
  params.append('username', username)
  params.append('password', password)
  return request.post('/auth/login', params)
}
const RegisterMenu = (username, password) => {
  const params = new URLSearchParams()
  params.append('username', username)
  params.append('password', password)
  return request.post('/auth/reguser', params)
}
export default {
  LoginMenu,
  RegisterMenu,
}
