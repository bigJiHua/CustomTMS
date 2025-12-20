const {
    ExecuteFunctionData,
    ExecuteFunction
} = require("../Middleware/ExecuteFunc");

exports.CheckUserRole = async (req, res, next) => {
    const user = req?.auth?.username
    if (!user) return res.say('无权访问!', 403)
    const userRole = await ExecuteFunctionData('SELECT role FROM users WHERE username = ?', [user])
    const role = userRole[0].role
    if (role !== 'admin') return res.say('无权访问!', 403)
    return next()
};
exports.CheckUserReg = async (req,res, next) =>　{
    const CheckSysRegPowerSql = `Select setting_value from system_settings where setting_key = 'is_reg'`
    const CheckSysRegPower = await ExecuteFunction(CheckSysRegPowerSql)
    if (CheckSysRegPower.length === 0) return next()
    if (CheckSysRegPower[0].setting_value === 'false') return res.say('系统已关闭注册功能!', 403)
    return next()
}
