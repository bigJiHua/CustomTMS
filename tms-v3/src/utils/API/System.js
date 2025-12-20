import request from '@/utils/request'

const addSystemValue = (data) => {
  const params = new URLSearchParams()
  params.append('group_key', data.group_key)
  params.append('setting_key', data.setting_key)
  params.append('setting_value', String(data.setting_value))
  params.append('value_type', data.value_type || 'string')
  params.append('description', data.description || '')
  params.append('updated_by', data.updated_by || 'system')
  params.append('is_system', data.is_system ?? 0)
  return request.post('/system/add', params)
}

const getSystemValue = (setting_key) => {
  if (setting_key) return request.get('/system/get?setting_key=' + setting_key)
  return request.get('/system/get')
}

const updateSystemValue = (data) => {
  const params = new URLSearchParams()
  params.append('id', data.id)
  params.append('setting_value', String(data.setting_value))
  params.append('updated_by', data.updated_by || 'system')
  return request.post('/system/update', params)
}

export default {
  addSystemValue,
  getSystemValue,
  updateSystemValue,
}
