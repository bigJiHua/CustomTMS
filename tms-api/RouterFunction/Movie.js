const XLSX = require('xlsx')
const fs = require('fs')
const dayjs = require('dayjs')
const config = require('../config')
const { ExecuteFunctionData, ExecuteFunction } = require('../Middleware/ExecuteFunc')
const joi = require("joi");

// 获取今日排片列表
exports.getMovieList = async (req, res) => {
  const hall_name = req.query.hall_name
  const show_date = req.query.show_date
  let getListSql = ''
  let getList = []
  switch (hall_name) {
    case 'all' :
      getListSql = `SELECT 
        id,
        show_date,
        movie_name,
        hall_name,
        movie_source_id,
        start_time,
        source,
        -- 计算时间分钟数（便于跨天排序）
        HOUR(start_time) * 60 + MINUTE(start_time) AS time_minutes
      FROM 
        schedules
      WHERE 
        deleted_at = 0
        AND show_date = '${show_date}'
      ORDER BY 
        time_minutes ASC,
        hall_name ASC;`
      getList = await ExecuteFunction(getListSql)
          break;
    default:
      getListSql = `SELECT *
        FROM schedules
        WHERE 
          deleted_at = 0
          AND hall_name = ?
          AND show_date = '${show_date}'
        ORDER BY created_at ASC`
      if (Number.isNaN(Number(hall_name))) return res.say('参数异常', 403)
      getList = await ExecuteFunctionData(getListSql, hall_name)
  }
  if (getList.length === 0) return res.say('暂无数据')
  return res.status(200).send({
    status: 200,
    message: '排期加载成功',
    data: getList
  })
}
// 手动添加今日排片
exports.addMovie = async (req, res) => {
  const user = req.auth?.username
  if (!user) return res.say('访问错误！', 401)

  const { movie_name, hall_name, start_time, show_date } = req.body
  if (!movie_name || !hall_name || !start_time) {
    return res.say('参数不完整', 400)
  }

  const data = {
    show_date,
    movie_name,
    hall_name,
    movie_source_id: null, // ❗默认 NULL
    start_time,
    source: 'manual',      // ❗修正 ENUM
    created_by: user
  }

  const SelectMovie_oidSql = `Select movie_source_id from movie_sources where movie_name = ? `
  const SelectMovie_oid = await ExecuteFunctionData(SelectMovie_oidSql, movie_name)
  if (SelectMovie_oid.length !== 0) data.movie_source_id = SelectMovie_oid[0].movie_source_id
  const addMovieSql = `INSERT INTO schedules SET ?`
  const addMovie = await ExecuteFunctionData(addMovieSql, data)
  if (addMovie.affectedRows === 0) {
    return res.say('添加失败！')
  }
  return res.status(200).send({
    status: 200,
    message: '添加成功！'
  })
}

// 修改排期
exports.cagMovie = async (req, res) => {
  const movie_id = req.body.movie_id
  const data = JSON.parse(req.body.data)
  if (!movie_id || !data) return res.say('参数不完整', 400)
  const checkMovieSql = `SELECT * FROM schedules WHERE id = ?`
  const checkMovie = await ExecuteFunctionData(checkMovieSql, movie_id)
  if (checkMovie.length === 0) return res.say('未找到该排期', 400)
  const cagMovieSql = `UPDATE schedules SET ? WHERE id = ?`
  const cagMovie = await ExecuteFunctionData(cagMovieSql, [data, movie_id])
  if (cagMovie.affectedRows === 0) return res.say('修改失败！')
  return res.status(200).send({
    status: 200,
    message: '修改成功！'
  })
}

// 新建影片信息
exports.MovieInfo = async (req, res) => {
  const { movie_name, duration_seconds, light_offset_seconds, release_date, valid_until, egg } = req.body
  const id = config.generateId(6)
  // 查重
  const checkMISql = `Select * from movie_sources where movie_name = ? OR movie_source_id =?`
  const checkMI = await ExecuteFunctionData(checkMISql, [movie_name, id])
  if (checkMI.length > 0) {
    return res.say('请重新提交！')
  }
  const data = {
    movie_source_id: id,
    movie_name,
    duration_seconds,
    light_offset_seconds,
    release_date,
    valid_until,
    egg: egg ?? 0
  }
  const addMISql = `INSERT INTO movie_sources SET ?`
  const addMI = await ExecuteFunctionData(addMISql, data)
  if (addMI.affectedRows === 0) {
    return res.say('添加失败！')
  }
  return res.status(200).send({
    status: 200,
    message: '添加成功！'
  })
}
// 更新影片信息
exports.cagMovieInfo = async (req, res) => {
  const id = req.body.id
  if (!id) return res.say('ID 不能非空',403)
  const data = {
    movie_name: req.body.movie_name ,
    duration_seconds: req.body.duration_seconds ,
    light_offset_seconds: req.body.light_offset_seconds ,
    release_date: req.body.release_date ,
    valid_until: req.body.valid_until ,
    egg: req.body.egg ,
  }
  const cagMISql = `UPDATE movie_sources SET ? WHERE movie_source_id = ?`
  const cagMI = await ExecuteFunctionData(cagMISql, [data, id])
  if (cagMI.affectedRows === 0) return res.say('更新失败！')
  return res.status(200).send({
    status: 200,
    message: '更新成功！'
  })
}
// 获取影片信息
exports.getMovieInfo = async (req, res) => {
  const movie_name = req.query.movie_name
  const getstatus = req.query.status ? req.query.status : 1
  let data = []
  if (movie_name === 'get') {
    const getMILSql = `Select * from movie_sources where status = 1 AND deleted_at = 1`
    const getMIL = await ExecuteFunction(getMILSql)
    if (getMIL.length === 0) return res.say('未找到该影片/已过期！', 203)
    data = getMIL
  } else {
    const getMISql = `Select * from movie_sources where movie_name = ? AND status = ?`
    const getMI = await ExecuteFunctionData(getMISql, [movie_name, getstatus])
    if (getMI.length === 0) return res.say('未找到该影片/已过期！', 203)
    data = getMI
  }
  return res.status(200).send({
    status: 200,
    message: '片源加载成功！',
    data
  })
}
// 删除影片信息
exports.delMovieInfo = async (req, res) => {
  const id = req.body.movie_id
  if (!id) return res.say('ID 不能非空',403)
  const delMISql = `UPDATE movie_sources SET deleted_at = 0 WHERE movie_source_id = ?`
  const delMI = await ExecuteFunctionData(delMISql, id)
  if (delMI.affectedRows !== 1) return res.say('删除失败！')
  return res.status(200).send({
    status: 200,
    message: '删除成功！'
  })
}