const joi = require('joi')

exports.addMovie = {
  body: {
    movie_name: joi.string().required(),
    hall_name: joi.string().required(),
    start_time: joi.string().required(),
    show_date: joi.string().required()
  },
}
exports.cagMovie = {
  body: {
    movie_id: joi.number().required(),
    data: joi.string().required(),
  },
}
exports.MovieInfo = {
  body: {
    movie_name: joi.string().required(),
    duration_seconds: joi.number().required(),
    light_offset_seconds: joi.number().required(),
    release_date: joi.string().required(),
    valid_until: joi.string().required(),
    egg: joi.string().allow(null, 0)
  }
}
exports.cagMovieInfo = {
  body: {
    id: joi.string().min(1).max(255).required(),
    movie_name: joi.string().required(),
    duration_seconds: joi.number().required(),
    light_offset_seconds: joi.number().required(),
    release_date: joi.string().required(),
    valid_until: joi.string().required(),
    egg: joi.string().allow(null, 0)
  }
}
exports.delMovieInfo = {
  body: {
    movie_id: joi.string().min(2).max(15).required()
  }
}
exports.getMovieInfo = {
  query: {
    movie_name: joi.string().required(),
    status: joi.string()
  }
}
