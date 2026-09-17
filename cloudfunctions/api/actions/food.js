const { db, C } = require('../lib/db')
const { SYSTEM_FOODS } = require('../lib/constants')
const { now, fail, sanitizeNumber, escapeRegExp, round1 } = require('../lib/utils')
const { nutritionTargetForDate } = require('../services/nutrition')
const { nutritionSummary, ensureMeal } = require('../services/summaries')


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

async function addMealItem({ user, event, localDate }) {
  const food = await db.collection(C.FOODS).doc(event.foodId).get().then(x => x.data).catch(() => null)
  if (!food || (food.ownerType !== 'SYSTEM' && food.ownerUserId !== user._id)) throw fail('FOOD_NOT_FOUND', '食物不存在')
  const amountGram = sanitizeNumber(event.amountGram, 0.1, 10000)
  if (amountGram == null) throw fail('INVALID_PARAMETER', '食用量不合法')
  const mealTypes = ['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK', 'OTHER']
  const mealType = mealTypes.includes(event.mealType) ? event.mealType : 'OTHER'
  const meal = await ensureMeal(user._id, localDate, mealType)
  const ratio = amountGram / 100
  const data = {
    mealId: meal._id, userId: user._id, recordDate: localDate, mealType, foodId: food._id,
    foodNameSnapshot: food.name, amountGram,
    energyKcal: round1(food.energyKcalPer100 * ratio), proteinGram: round1(food.proteinPer100 * ratio),
    carbGram: round1(food.carbPer100 * ratio), fatGram: round1(food.fatPer100 * ratio), createdAt: now()
  }
  const add = await db.collection(C.MEAL_ITEMS).add({ data })
  return { item: { _id: add._id, ...data }, summary: await nutritionSummary(user._id, localDate) }
}

async function getDailyMeals({ user, localDate }) {
  const [items, summary, target] = await Promise.all([
    db.collection(C.MEAL_ITEMS).where({ userId: user._id, recordDate: localDate }).orderBy('createdAt', 'asc').get(),
    nutritionSummary(user._id, localDate),
    nutritionTargetForDate(user._id, localDate)
  ])
  return { items: items.data, summary, target }
}

async function deleteMealItem({ user, event }) {
  const item = await db.collection(C.MEAL_ITEMS).doc(event.itemId).get().then(x => x.data).catch(() => null)
  if (!item || item.userId !== user._id) throw fail('FORBIDDEN', '无权删除')
  await db.collection(C.MEAL_ITEMS).doc(item._id).remove()
  return { summary: await nutritionSummary(user._id, item.recordDate) }
}

module.exports = { bootstrapFoods, searchFood, createCustomFood, addMealItem, getDailyMeals, deleteMealItem }
