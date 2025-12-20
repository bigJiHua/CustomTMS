const joi = require('joi')

const username = joi.string().min(3).max(15).required() //.alphanum()
const password = joi
  .string()
  .pattern(/^[\S]{6,30}$/)
  .required()
exports.users = {
  body: {
    username,
    password,
  },
}
