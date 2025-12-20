import request from '@/utils/request'
import dayjs from 'dayjs'
// 获取今日排期列表
const GetMoviesList = (hall_name, show_date) => {
  let type = hall_name
  let time = show_date
  if (!hall_name) type = 'all'
  if (!show_date) time = dayjs().format('YYYY-MM-DD')
  return request.get('/movie/list?hall_name=' + type + '&show_date=' + time)
}
// 添加电影排期
const AddMovies = (name, hallName, startTime, show_date) => {
  const params = new URLSearchParams()
  params.append('movie_name', name)
  params.append('hall_name', hallName)
  params.append('start_time', startTime)
  params.append('show_date', show_date)
  return request.post('/movie/add', params)
}
// 修改排期
const CagMovies = (id, data) => {
  const params = new URLSearchParams()
  params.append('movie_id', id)
  params.append('data', data) // data必须压缩过去
  return request.post('/movie/cag', params)
}
// 获取电影信息
const GetMoviesInfo = (name, status) => {
  return request.get('/movie/getInfo?movie_name=' + name + '&status=' + status)
} // 获取电影信息
const DelMoviesInfo = (id) => {
  const params = new URLSearchParams()
  params.append('movie_id', id)
  return request.post('/movie/delInfo', params)
}
// 添加电影信息
const AddMoviesInfo = (name, full_time, light_time, release_time, valid_until, egg) => {
  const params = new URLSearchParams()
  params.append('movie_name', name)
  params.append('duration_seconds', full_time)
  params.append('light_offset_seconds', light_time)
  params.append('release_date', release_time)
  params.append('valid_until', valid_until)
  params.append('egg', egg)
  return request.post('/movie/addInfo', params)
}
// 修改电影信息
const CagMoviesInfo = (id, name, full_time, light_time, release_time, valid_until, egg) => {
  const params = new URLSearchParams()
  params.append('id', id)
  params.append('movie_name', name)
  params.append('duration_seconds', full_time)
  params.append('light_offset_seconds', light_time)
  params.append('release_date', release_time)
  params.append('valid_until', valid_until)
  params.append('egg', egg)
  return request.post('/movie/cagInfo', params)
}
export default {
  GetMoviesList,
  AddMovies,
  CagMovies,
  GetMoviesInfo,
  AddMoviesInfo,
  CagMoviesInfo,
  DelMoviesInfo,
}
