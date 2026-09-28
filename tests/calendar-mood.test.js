const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const zlib = require('node:zlib')
const { MOODS } = require('../miniprogram/utils/constants')
const { calendarMoodIcon } = require('../miniprogram/utils/calendar-mood')

function pixelsOf(file) {
  const png = fs.readFileSync(file)
  const width = png.readUInt32BE(16)
  const chunks = []
  for (let offset = 8; offset < png.length;) {
    const length = png.readUInt32BE(offset)
    if (png.toString('ascii', offset + 4, offset + 8) === 'IDAT') {
      chunks.push(png.subarray(offset + 8, offset + 8 + length))
    }
    offset += length + 12
  }
  const raw = zlib.inflateSync(Buffer.concat(chunks))
  return (x, y) => {
    assert.equal(raw[y * (width * 4 + 1)], 0)
    const offset = y * (width * 4 + 1) + 1 + x * 4
    return [...raw.subarray(offset, offset + 4)]
  }
}

test('所有日历心情保留不透明黑色轮廓和表情，仅填充使用淡绿/淡红', () => {
  for (const mood of MOODS) {
    for (const state of ['COMPLETE', 'INCOMPLETE']) {
      const icon = calendarMoodIcon(mood.value, state)
      const pixel = pixelsOf(path.join(__dirname, '../miniprogram', icon))
      assert.deepEqual(pixel(5 * 4, 1 * 4), [17, 24, 39, 255], `${icon} 轮廓`)
      assert.deepEqual(pixel(5 * 4, 6 * 4), [17, 24, 39, 255], `${icon} 表情`)
      assert.deepEqual(pixel(7 * 4, 7 * 4), state === 'COMPLETE' ? [22, 163, 74, 46] : [220, 38, 38, 38], `${icon} 填充`)
      assert.deepEqual(pixel(0, 0), [0, 0, 0, 0], `${icon} 外部透明`)
    }
  }
})

test('没有打卡状态的心情仍用原素材，不识别的心情不显示图标', () => {
  assert.equal(calendarMoodIcon('GOOD'), '/assets/moods/good.png')
  assert.equal(calendarMoodIcon('', 'COMPLETE'), '')
  assert.equal(calendarMoodIcon('UNKNOWN', 'INCOMPLETE'), '')
})
