const express = require("express");
const router = express.Router();
const expressJoi = require("@escook/express-joi");
const {
  CheckScheduleConflict_add,
  CheckScheduleConflict_cag,
} = require("../Middleware/CheckTime");
const { CheckUserRole } = require("../Middleware/CheckUserRole");

const Movie_Func = require("../RouterFunction/Movie");
const Movie_Schema = require("../Rules/Movie");

router.get("/list", Movie_Func.getMovieList); // 获取电影列表
router.get(
  "/getInfo",
  expressJoi(Movie_Schema.getMovieInfo),
  Movie_Func.getMovieInfo
); // 获取电影详情

// 以下接口拦截访客
router.use((req, res, next) => {
  CheckUserRole(req, res, next);
});
router.post(
  "/add",
  expressJoi(Movie_Schema.addMovie),
  async (req, res, next) => {
    await CheckScheduleConflict_add(req, res, next);
  },
  Movie_Func.addMovie
); // 手动添加电影今日排片
router.post(
  "/cag",
  expressJoi(Movie_Schema.cagMovie),
  async (req, res, next) => {
    await CheckScheduleConflict_cag(req, res, next);
  },
  Movie_Func.cagMovie
); // 修改电影今日排片

router.post(
  "/addInfo",
  expressJoi(Movie_Schema.MovieInfo),
  Movie_Func.MovieInfo
); // 新建电影详情
router.post(
  "/cagInfo",
  expressJoi(Movie_Schema.cagMovieInfo),
  Movie_Func.cagMovieInfo
); // 新建电影详情
router.post(
  "/delInfo",
  expressJoi(Movie_Schema.delMovieInfo),
  Movie_Func.delMovieInfo
); // 新建电影详情
module.exports = router;
