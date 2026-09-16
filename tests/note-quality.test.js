const test = require('node:test')
const assert = require('node:assert/strict')
const { normalizeNotePayload } = require('../cloudfunctions/api/domain/note')
const { calculateExerciseCalories } = require('../cloudfunctions/api/domain/exercise-calculator')

test('日志默认标题由类型和日期生成，且强制保持私密', () => {
  const note = normalizeNotePayload({ type: 'BODY', content: '状态不错', visibility: 'FRIENDS' }, '2026-09-16')
  assert.equal(note.title, '体态记录 · 2026-09-16')
  assert.equal(note.visibility, 'PRIVATE')
})

test('日志标签去重并忽略空标签', () => {
  const note = normalizeNotePayload({ type: 'STUDY', tags: ['数据库', '数据库', '', '关系代数'] }, '2026-09-16')
  assert.deepEqual(note.tags, ['数据库', '关系代数'])
})

test('日志不接受未知类型', () => {
  assert.throws(() => normalizeNotePayload({ type: 'UNKNOWN' }, '2026-09-16'))
})

test('运动热量算法保持为独立纯函数', () => {
  assert.equal(calculateExerciseCalories({ met: 5, weightKg: 75, durationMinutes: 60 }), 394)
  assert.equal(calculateExerciseCalories({ met: 0, weightKg: 75, durationMinutes: 60 }), null)
})
