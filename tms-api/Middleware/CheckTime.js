const {
    ExecuteFunctionData
} = require("../Middleware/ExecuteFunc");

/**
 * 时间转分钟（支持 24:00 ~ 47:59，用于跨日场次）
 * @param {string} timeStr 如 "23:30" / "24:22" / "25:10"
 * @returns {number} 从当日 00:00 开始的分钟数
 */
const timeToMinutes = (timeStr) => {
    if (!timeStr || typeof timeStr !== "string" || !timeStr.includes(":")) {
        throw new Error(`时间格式错误，需传入 HH:MM，当前值：${timeStr}`);
    }

    const [hourStr, minuteStr] = timeStr.split(":");
    const hour = Number(hourStr);
    const minute = Number(minuteStr);

    if (
        isNaN(hour) ||
        isNaN(minute) ||
        hour < 0 ||
        hour >= 48 ||        // ✅ 允许到 47:59
        minute < 0 ||
        minute > 59
    ) {
        throw new Error(`时间数值非法（允许 00:00 ~ 47:59），当前值：${timeStr}`);
    }

    return hour * 60 + minute;
};


/**
 * 通用冲突校验逻辑（抽离复用，用movie_name查片长）
 * @param {string} hall_name 影厅号
 * @param {string} show_date 排期日期
 * @param {string} start_time 新场次开始时间
 * @param {string} movie_name 影片名称（前端实际传递的参数）
 * @param {number|null} excludeId 排除的排期ID（cag接口用）
 * @returns {Promise<{isConflict: boolean, message: string}>}
 */
const checkConflict = async (hall_name, show_date, start_time, movie_name, excludeId = null) => {
    // 1. 计算新场次时间区间（含15分钟间隔）
    const newStart = timeToMinutes(start_time);

    // 改用movie_name查询影片时长（贴合前端传参）
    const movieSql = `SELECT duration_seconds FROM movie_sources WHERE movie_name = ? LIMIT 1`;
    const movieRes = await ExecuteFunctionData(movieSql, [movie_name]);
    if (movieRes.length === 0) {
        return { isConflict: true, message: `未找到影片【${movie_name}】的时长信息` };
    }
    const newDuration = Math.ceil(movieRes[0].duration_seconds / 60);
    const newEnd = newStart + newDuration; // 加15分钟清场间隔

    // 2. 拉取已有排期（含15分钟间隔，INNER JOIN确保有片长）
    let scheduleSql = `
    SELECT s.start_time, ms.duration_seconds
    FROM schedules s
    INNER JOIN movie_sources ms ON s.movie_source_id = ms.movie_source_id
    WHERE s.show_date = ? AND s.hall_name = ? AND s.deleted_at = 0 `;
    const params = [show_date, hall_name];
    if (excludeId) {
        scheduleSql += " AND s.id != ?";
        params.push(excludeId);
    }
    const schedules = await ExecuteFunctionData(scheduleSql, params);

    // 3. 冲突判断（核心公式不变）
    for (const row of schedules) {
        const existStart = timeToMinutes(row.start_time);
        const existDuration = Math.ceil(row.duration_seconds / 60);
        const existEnd = existStart + existDuration; // 已有场次也加15分钟间隔

        if (newStart < existEnd && newEnd > existStart) {
            return {
                isConflict: true,
                message: `排期冲突：${hall_name}号厅 ${start_time} 开始的【${movie_name}】与已有场次时间重叠（需保留清场间隔）`,
            };
        }
    }
    return { isConflict: false, message: "" };
};

/**
 * 新增排期冲突校验（add接口）
 */
exports.CheckScheduleConflict_add = async (req, res, next) => {
    try {
        // 前端传参：movie_name（而非movie_source_id）
        const { movie_name, hall_name, start_time, show_date } = req.body;

        // 校验核心参数（贴合实际传参）
        if (!hall_name || !start_time || !show_date || !movie_name) {
            return res.say("排期参数不完整（需传影厅/开始时间/日期/影片名称）", 400);
        }

        // 通用冲突校验
        const { isConflict, message } = await checkConflict(hall_name, show_date, start_time, movie_name);
        if (isConflict) {
            return res.say(message, isConflict ? 409 : 400);
        }

        next();
    } catch (err) {
        console.error("[CheckScheduleConflict_add] 错误：", err);
        return res.say(`排期校验失败：${err.message}`, 500);
    }
};

/**
 * 修改排期冲突校验（cag接口）
 */
exports.CheckScheduleConflict_cag = async (req, res, next) => {
    try {
        const id = req.body.movie_id;
        let data = {};

        // 容错JSON解析（避免非法JSON崩溃）
        if (req.body.data) {
            try {
                data = JSON.parse(req.body.data);
            } catch (e) {
                return res.say(`data参数格式错误：${e.message}`, 400);
            }
        }

        // 删除操作直接放行
        if (data.deleted_at) return next();

        // 前端实际传参：movie_name + start_time（无movie_source_id）
        const { movie_name, start_time } = data;
        if (!movie_name || !start_time) {
            return res.say("参数不完整（需传影片名称/开始时间）", 400);
        }

        // 获取原排期的厅号和日期
        const getOldSql = `SELECT hall_name, show_date FROM schedules WHERE id = ? AND deleted_at = 0`;
        const oldRes = await ExecuteFunctionData(getOldSql, [id]);
        if (oldRes.length === 0) {
            return res.say(`未找到ID为【${id}】的排期信息`, 400);
        }
        const { hall_name, show_date } = oldRes[0];

        // 通用冲突校验（排除自身ID，用movie_name查片长）
        const { isConflict, message } = await checkConflict(hall_name, show_date, start_time, movie_name, id);
        if (isConflict) {
            return res.say(message, isConflict ? 409 : 400);
        }

        next();
    } catch (err) {
        console.error("[CheckScheduleConflict_cag] 错误：", err);
        return res.say(`排期校验失败：${err.message}`, 500);
    }
};
