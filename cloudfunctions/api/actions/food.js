const { cloud, db, C } = require('../lib/db')
const { SYSTEM_FOODS } = require('../lib/constants')
const { now, fail, sanitizeNumber, escapeRegExp, round1 } = require('../lib/utils')
const { nutritionTargetForDate } = require('../services/nutrition')
const { nutritionSummary } = require('../services/summaries')
async function ensureSystemFoods() {
  const count = await db.collection(C.FOODS).where({ ownerType: 'SYSTEM', enabled: true }).count()
  if (count.total > 0) return 0
  let added = 0
  for (const [name, energy, protein, carb, fat] of SYSTEM_FOODS) {
    await db.collection(C.FOODS).add({ data: {
      ownerType: 'SYSTEM', ownerUserId: null, name, brand: '', defaultUnit: 'g',
      energyKcalPer100: energy, proteinPer100: protein, carbPer100: carb, fatPer100: fat,
      enabled: true, createdAt: now(), updatedAt: now()
    } })
    added++
  }
  return added
}
async function bootstrapFoods() { return { added: await ensureSystemFoods() } }
async function searchFood({ user, event }) {
  await ensureSystemFoods()
  const keyword = String(event.keyword || '').trim()
  const limit = Math.min(Math.max(Number(event.limit || 30), 1), 50)
  const baseSystem = { enabled: true, ownerType: 'SYSTEM' }
  const baseUser = { enabled: true, ownerUserId: user._id }
  if (keyword) {
    const regex = db.RegExp({ regexp: escapeRegExp(keyword), options: 'i' })
    baseSystem.name = regex
    baseUser.name = regex
  }
  const [systemFoods, userFoods] = await Promise.all([
    db.collection(C.FOODS).where(baseSystem).limit(limit).get(),
    db.collection(C.FOODS).where(baseUser).limit(limit).get()
  ])
  const foods = [...userFoods.data, ...systemFoods.data].slice(0, limit)
  return { foods }
}
async function createCustomFood({ user, event }) {
  const f = event.food || {}
  const name = String(f.name || '').trim()
  if (!name) throw fail('INVALID_PARAMETER', '食物名称不能为空')
  const data = {
    ownerType: 'USER', ownerUserId: user._id, name: name.slice(0, 80), brand: String(f.brand || '').slice(0, 80),
    defaultUnit: 'g', enabled: true, createdAt: now(), updatedAt: now()
  }
  for (const key of ['energyKcalPer100', 'proteinPer100', 'carbPer100', 'fatPer100']) {
    const value = sanitizeNumber(f[key], 0, 2000)
    if (value == null) throw fail('INVALID_PARAMETER', `${key}不合法`)
    data[key] = value
  }
  const add = await db.collection(C.FOODS).add({ data })
  return { food: { _id: add._id, ...data } }
}
async function addMealEntry({ user, event, localDate }) {
  const note = String(event.note || '').trim().slice(0, 500)
  const photoFileIds = Array.isArray(event.photoFileIds)
    ? [...new Set(event.photoFileIds.map(String).filter(id => id.startsWith('cloud://')))].slice(0, 3)
    : []
  let food = null
  let amountGram = null
  if (event.foodId) {
    food = await db.collection(C.FOODS).doc(event.foodId).get().then(x => x.data).catch(() => null)
    if (!food || (food.ownerType !== 'SYSTEM' && food.ownerUserId !== user._id)) throw fail('FOOD_NOT_FOUND', '食物不存在')
    amountGram = sanitizeNumber(event.amountGram, 0.1, 10000)
    if (amountGram == null) throw fail('INVALID_PARAMETER', '食用量不合法')
  }
  if (!food && !note && !photoFileIds.length) throw fail('INVALID_PARAMETER', '请选择食物、填写备注或添加照片')

  const timestamp = now()
  const mealData = {
    userId: user._id,
    recordDate: localDate,
    mealType: 'OTHER',
    recordedAt: timestamp,
    note,
    photoFileIds,
    createdAt: timestamp,
    updatedAt: timestamp
  }
  const mealAdd = await db.collection(C.MEALS).add({ data: mealData })
  const meal = { _id: mealAdd._id, ...mealData }
  let item = null
  if (food) {
    const ratio = amountGram / 100
    const data = {
      mealId: meal._id, userId: user._id, recordDate: localDate, mealType: 'OTHER', foodId: food._id,
      foodNameSnapshot: food.name, amountGram,
      energyKcal: round1(food.energyKcalPer100 * ratio), proteinGram: round1(food.proteinPer100 * ratio),
      carbGram: round1(food.carbPer100 * ratio), fatGram: round1(food.fatPer100 * ratio), createdAt: timestamp
    }
    const add = await db.collection(C.MEAL_ITEMS).add({ data })
    item = { _id: add._id, ...data }
  }
  return { entry: entryOf(meal, item ? [item] : []), item, summary: await nutritionSummary(user._id, localDate) }
}

async function addMealItem(context) { return addMealEntry(context) }

function entryOf(meal, items) {
  return {
    _id: meal._id,
    recordedAt: meal.recordedAt || meal.createdAt,
    note: meal.note || '',
    photoFileIds: meal.photoFileIds || [],
    items,
    energyKcal: round1(items.reduce((sum, item) => sum + Number(item.energyKcal || 0), 0)),
    proteinGram: round1(items.reduce((sum, item) => sum + Number(item.proteinGram || 0), 0)),
    carbGram: round1(items.reduce((sum, item) => sum + Number(item.carbGram || 0), 0)),
    fatGram: round1(items.reduce((sum, item) => sum + Number(item.fatGram || 0), 0))
  }
}

async function getDailyMeals({ user, localDate }) {
  const [items, meals, summary, target] = await Promise.all([
    db.collection(C.MEAL_ITEMS).where({ userId: user._id, recordDate: localDate }).orderBy('createdAt', 'asc').limit(100).get(),
    db.collection(C.MEALS).where({ userId: user._id, recordDate: localDate }).orderBy('createdAt', 'asc').limit(100).get(),
    nutritionSummary(user._id, localDate),
    nutritionTargetForDate(user._id, localDate)
  ])
  const itemsByMeal = items.data.reduce((map, item) => {
    if (!map[item.mealId]) map[item.mealId] = []
    map[item.mealId].push(item)
    return map
  }, {})
  const mealIds = new Set(meals.data.map(meal => meal._id))
  const entries = meals.data.map(meal => entryOf(meal, itemsByMeal[meal._id] || []))
  items.data.filter(item => !mealIds.has(item.mealId)).forEach(item => entries.push(entryOf({ _id: item.mealId || item._id, createdAt: item.createdAt }, [item])))
  entries.sort((a, b) => new Date(b.recordedAt || 0) - new Date(a.recordedAt || 0))
  return { items: items.data, entries, summary, target }
}

async function deleteMealItem({ user, event }) {
  const item = await db.collection(C.MEAL_ITEMS).doc(event.itemId).get().then(x => x.data).catch(() => null)
  if (!item || item.userId !== user._id) throw fail('FORBIDDEN', '无权删除')
  await db.collection(C.MEAL_ITEMS).doc(item._id).remove()
  const remaining = await db.collection(C.MEAL_ITEMS).where({ mealId: item.mealId, userId: user._id }).count()
  if (!remaining.total) await removeMeal(user._id, item.mealId)
  return { summary: await nutritionSummary(user._id, item.recordDate) }
}

async function removeMeal(userId, mealId) {
  const meal = await db.collection(C.MEALS).doc(mealId).get().then(x => x.data).catch(() => null)
  if (!meal || meal.userId !== userId) return
  await db.collection(C.MEALS).doc(mealId).remove()
  if (meal.photoFileIds?.length) await cloud.deleteFile({ fileList: meal.photoFileIds }).catch(() => null)
}

async function deleteMealEntry({ user, event }) {
  const meal = await db.collection(C.MEALS).doc(event.entryId).get().then(x => x.data).catch(() => null)
  if (!meal || meal.userId !== user._id) throw fail('FORBIDDEN', '无权删除')
  const items = await db.collection(C.MEAL_ITEMS).where({ userId: user._id, mealId: meal._id }).get()
  await Promise.all(items.data.map(item => db.collection(C.MEAL_ITEMS).doc(item._id).remove()))
  await removeMeal(user._id, meal._id)
  return { summary: await nutritionSummary(user._id, meal.recordDate) }
}

module.exports = { bootstrapFoods, searchFood, createCustomFood, addMealEntry, addMealItem, getDailyMeals, deleteMealItem, deleteMealEntry }
