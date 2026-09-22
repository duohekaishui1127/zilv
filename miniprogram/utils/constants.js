const PLAN_CATEGORIES = [
  { label: '学习', value: 'STUDY' },
  { label: '健身', value: 'WORKOUT' },
  { label: '饮食', value: 'DIET' },
  { label: '睡眠', value: 'SLEEP' },
  { label: '护肤', value: 'SKINCARE' },
  { label: '健康', value: 'HEALTH' },
  { label: '自定义', value: 'CUSTOM' }
]
const TARGET_TYPES = [
  { label: '完成/未完成', value: 'BOOLEAN' },
  { label: '次数', value: 'COUNT' },
  { label: '时长', value: 'DURATION' },
  { label: '数值', value: 'VALUE' }
]
const REPEAT_TYPES = [
  { label: '仅一次', value: 'ONE_TIME' },
  { label: '每天', value: 'DAILY' },
  { label: '工作日', value: 'WEEKDAYS' },
  { label: '周末', value: 'WEEKENDS' },
  { label: '指定星期', value: 'SPECIFIC_WEEKDAYS' },
  { label: '每周 N 次', value: 'WEEKLY_COUNT' }
]
const TIMER_MODES = [
  { label: '不计时', value: 'NONE' },
  { label: '正计时', value: 'COUNT_UP' },
  { label: '倒计时', value: 'COUNT_DOWN' }
]
const LONG_TERM_GOAL_TYPES = [
  { label: '考试 / 日期', value: 'DEADLINE' },
  { label: '习惯养成', value: 'HABIT' },
  { label: '数量积累', value: 'ACCUMULATION' }
]
const CATEGORY_LABELS = PLAN_CATEGORIES.reduce((map, item) => { map[item.value] = item.label; return map }, {})
const REPEAT_LABELS = REPEAT_TYPES.reduce((map, item) => { map[item.value] = item.label; return map }, {})
const MOODS = Object.freeze([
  { value: 'GREAT', label: '很棒', icon: '/assets/moods/great.png' },
  { value: 'GOOD', label: '不错', icon: '/assets/moods/good.png' },
  { value: 'OKAY', label: '一般', icon: '/assets/moods/okay.png' },
  { value: 'TIRED', label: '疲惫', icon: '/assets/moods/tired.png' },
  { value: 'BAD', label: '低落', icon: '/assets/moods/bad.png' }
])
const MOOD_LABELS = Object.freeze(Object.fromEntries(MOODS.map(item => [item.value, item.label])))
const MOOD_ICONS = Object.freeze(Object.fromEntries(MOODS.map(item => [item.value, item.icon])))

const NOTE_TYPES = Object.freeze([
  { key: 'GENERAL', label: '日常' },
  { key: 'BODY', label: '体态' },
  { key: 'STUDY', label: '学习' },
  { key: 'WORKOUT', label: '训练' },
  { key: 'DIET', label: '饮食' }
])

const POSE_TYPES = Object.freeze([
  { key: 'OTHER', label: '普通照片' },
  { key: 'FRONT', label: '正面' },
  { key: 'SIDE', label: '侧面' },
  { key: 'BACK', label: '背面' }
])

module.exports = { NOTE_TYPES, POSE_TYPES, PLAN_CATEGORIES, TARGET_TYPES, REPEAT_TYPES, TIMER_MODES, LONG_TERM_GOAL_TYPES, CATEGORY_LABELS, REPEAT_LABELS, MOODS, MOOD_LABELS, MOOD_ICONS }
