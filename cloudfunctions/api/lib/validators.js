const { fail, parseDateOnly } = require('./utils')

function string(value, { name = '字段', required = false, max = 500, trim = true } = {}) {
  if (value === undefined || value === null) {
    if (required) throw fail('INVALID_PARAMETER', `${name}不能为空`)
    return ''
  }
  let out = String(value)
  if (trim) out = out.trim()
  if (required && !out) throw fail('INVALID_PARAMETER', `${name}不能为空`)
  if (out.length > max) throw fail('INVALID_PARAMETER', `${name}最多${max}个字符`)
  return out
}

function enumValue(value, allowed, { name = '字段', defaultValue } = {}) {
  if (allowed.includes(value)) return value
  if (defaultValue !== undefined) return defaultValue
  throw fail('INVALID_PARAMETER', `${name}不合法`)
}

function date(value, { name = '日期', required = true } = {}) {
  if (!value && !required) return ''
  if (!parseDateOnly(value)) throw fail('INVALID_PARAMETER', `${name}格式不合法`)
  return String(value)
}

function stringArray(value, { name = '列表', maxItems = 20, maxItemLength = 50 } = {}) {
  if (!Array.isArray(value)) return []
  if (value.length > maxItems) throw fail('INVALID_PARAMETER', `${name}最多${maxItems}项`)
  const result = []
  for (const item of value) {
    const text = String(item || '').trim()
    if (!text) continue
    if (text.length > maxItemLength) throw fail('INVALID_PARAMETER', `${name}单项过长`)
    if (!result.includes(text)) result.push(text)
  }
  return result
}

module.exports = { string, enumValue, date, stringArray }
