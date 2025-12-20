const {
  ExecuteFunctionData,
  ExecuteFunction,
} = require("../Middleware/ExecuteFunc");
const {string} = require("joi");

exports.addSystemValue = async (req, res) => {
  try {
    const {
      group_key,
      setting_key,
      setting_value,
      value_type = "string",
      description = "",
      updated_by = "system",
      is_system = 0,
    } = req.body;
    const data = {
      group_key,
      setting_key,
      setting_value,
      value_type,
      description,
      updated_by,
      is_system
    }
    if (!group_key || !setting_key) {
      return res.say("group_key 和 setting_key 必填");
    }
    const allowTypes = ["string", "number", "boolean"];
    if (!allowTypes.includes(value_type)) {
      return res.say("非法的 value_type");
    }
    // 查重
    const checkSql = `
      SELECT id FROM system_settings
      WHERE group_key = ? AND setting_key = ?
      LIMIT 1
    `;
    const exists = await ExecuteFunctionData(checkSql, [
      group_key,
      setting_key,
    ]);
    if (exists.length) {
      return res.say("该配置已存在");
    }
    const insertSql = `INSERT INTO system_settings set ?`;

    await ExecuteFunctionData(insertSql, data);
    return res.status(200).send({
      status: 200,
      message: "创建成功",
    });
  } catch (err) {
    return res.say("创建失败");
  }
};

exports.getSystemValue = async (req, res) => {
  try {
    const { setting_key } = req.query;
    let sql = `
      SELECT
        id,
        group_key,
        setting_key,
        setting_value,
        value_type,
        description,
        is_system,
        updated_at
      FROM system_settings
    `;
    const params = [];
    let rows = []
    if (setting_key) {
      sql = "Select setting_value from system_settings WHERE setting_key = ?";
      params.push(setting_key);
      rows = await ExecuteFunctionData(sql, params);
      return res.status(200).send({
        status: 200,
        message: '获取成功',
        data: rows[0]
      })
    }
    sql += " ORDER BY group_key ASC, id ASC";
    rows = await ExecuteFunction(sql);
    // 👉 按 value_type 解析
    const data = rows.map((row) => {
      let value = row.setting_value;
      if (row.value_type === "number") value = Number(value);
      if (row.value_type === "boolean") value = value === "true";
      return {
        ...row,
        setting_value: value,
      };
    });
    if (data.length === 0) return res.say('空空如也', 203)
    return res.status(200).send({
      status: 200,
      message: '获取成功',
      data,
    });
  } catch (err) {
    return res.say("获取配置失败");
  }
};

exports.updateSystemValue = async (req, res) => {
  const { id, setting_value, updated_by } = req.body
  if (!id) return res.say('id 必填')
  const sql = `
    UPDATE system_settings
    SET setting_value = ?, updated_by = ?, updated_at = NOW()
    WHERE id = ?
  `
  const result = await ExecuteFunctionData(sql, [
    String(setting_value),
    updated_by || 'system',
    id,
  ])
  if (result.affectedRows === 0) {
    return res.say('更新失败')
  }
  return res.status(200).send({
    status: 200,
    message: '更新成功',
  })
}
