const db = require('../db')

const ExecuteFunctionData = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    if (params.length === 0 ) {
      console.log(sql + '参数不能为空')
      return
    }
    db.query(sql, params, (err, results) => {
      if (err) return reject(err)
      resolve(results)
    })
  })
}

const ExecuteFunction = (sql) => {
  return new Promise((resolve, reject) => {
    if (!sql) {
      return reject(new Error('SQL is required'))
    }
    db.query(sql, (err, results) => {
      if (err) return reject(err)
      resolve(results)
    })
  })
}

module.exports = {
  ExecuteFunctionData,
  ExecuteFunction
}
