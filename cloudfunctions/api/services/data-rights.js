const { cloud, db, C } = require('../lib/db')
const { now } = require('../lib/utils')
const { disbandGroupRecords } = require('./group-lifecycle')

async function records(collection, where, limit = 100) {
  const out=[]
  let offset=0
  while (true) {
    const result=await db.collection(collection).where(where).skip(offset).limit(limit).get()
    out.push(...result.data)
    if (result.data.length < limit) return out
    offset += result.data.length
  }
}

async function count(collection, where) {
  try { return (await db.collection(collection).where(where).count()).total || 0 } catch (error) { return 0 }
}

async function removeDocs(collection, items) {
  for (let i=0;i<items.length;i+=20) {
    await Promise.all(items.slice(i,i+20).map(item => db.collection(collection).doc(item._id).remove().catch(() => null)))
  }
  return items.length
}

async function removeWhere(collection, where) {
  let removed=0
  while (true) {
    const result=await db.collection(collection).where(where).limit(100).get()
    if (!result.data.length) return removed
    removed += await removeDocs(collection,result.data)
    if (result.data.length < 100) return removed
  }
}

async function deleteCloudFiles(ids = []) {
  const fileList=[...new Set(ids.map(String).filter(id => id.startsWith('cloud://')))]
  for (let i=0;i<fileList.length;i+=50) {
    await cloud.deleteFile({ fileList:fileList.slice(i,i+50) }).catch(error => console.warn('[data-rights-files]',error?.message || error))
  }
  return fileList.length
}

async function clearNotes(userId) {
  const attachments=await records(C.NOTE_ATTACHMENTS,{ userId })
  await deleteCloudFiles(attachments.map(item => item.fileId))
  const [attachmentCount,noteCount]=await Promise.all([
    removeDocs(C.NOTE_ATTACHMENTS,attachments),
    removeWhere(C.NOTES,{ userId })
  ])
  return { removed:attachmentCount + noteCount }
}

async function clearDiet(userId) {
  const meals=await records(C.MEALS,{ userId })
  await deleteCloudFiles(meals.flatMap(item => item.photoFileIds || []))
  const [items,mealCount,customFoods]=await Promise.all([
    removeWhere(C.MEAL_ITEMS,{ userId }),
    removeDocs(C.MEALS,meals),
    removeWhere(C.FOODS,{ ownerUserId:userId })
  ])
  return { removed:items + mealCount + customFoods }
}

async function clearHealth(userId) {
  const [body,workouts,prefs,targets,profile]=await Promise.all([
    removeWhere(C.BODY,{ userId }),
    removeWhere(C.WORKOUTS,{ userId }),
    removeWhere(C.BODY_METRIC_PREFS,{ userId }),
    removeWhere(C.NUTRITION_TARGETS,{ userId }),
    removeWhere(C.NUTRITION_PROFILES,{ userId })
  ])
  return { removed:body + workouts + prefs + targets + profile }
}

async function clearActivityHistory(userId) {
  // 保留任务定义本身，只清除执行历史；用户仍可继续使用已有计划。
  const [checkins,reviews,study]=await Promise.all([
    removeWhere(C.CHECKINS,{ userId }),
    removeWhere(C.DAILY_REVIEWS,{ userId }),
    removeWhere(C.STUDY,{ userId })
  ])
  return { removed:checkins + reviews + study }
}

async function dataSummary(userId) {
  const [plans,reviews,body,meals,notes,workouts,study,friends,groups] = await Promise.all([
    count(C.PLANS,{ userId }),count(C.DAILY_REVIEWS,{ userId }),count(C.BODY,{ userId }),count(C.MEALS,{ userId }),
    count(C.NOTES,{ userId }),count(C.WORKOUTS,{ userId }),count(C.STUDY,{ userId }),
    Promise.all([count(C.FRIENDSHIPS,{ userA:userId }),count(C.FRIENDSHIPS,{ userB:userId })]).then(v => v[0]+v[1]),
    count(C.GROUP_MEMBERS,{ userId })
  ])
  return { plans,reviews,body,meals,notes,workouts,study,friends,groups }
}

async function deleteAccountData(user) {
  const userId=user._id
  // 群主注销前先解散自己创建的群，避免留下无主群。
  const ownedGroups=await records(C.GROUPS,{ ownerUserId:userId })
  for (const group of ownedGroups.filter(item => item.status !== 'DISBANDED')) {
    await disbandGroupRecords(group._id,userId,group.name).catch(error => console.warn('[account-delete-group]',error?.message || error))
  }

  const attachments=await records(C.NOTE_ATTACHMENTS,{ userId })
  const meals=await records(C.MEALS,{ userId })
  const fileIds=[user.avatar,...attachments.map(x => x.fileId),...meals.flatMap(x => x.photoFileIds || [])]
  const feedbacks=await records(C.FEEDBACKS,{ userId })
  feedbacks.forEach(item => fileIds.push(...(item.images || [])))
  await deleteCloudFiles(fileIds)

  const directUserCollections=[
    C.BODY,C.NUTRITION_PROFILES,C.NUTRITION_TARGETS,C.MEALS,C.MEAL_ITEMS,C.WORKOUTS,C.PLANS,C.CHECKINS,
    C.DAILY_REVIEWS,C.STUDY,C.FRIEND_SETTINGS,C.PRIVACY,C.GROUP_MEMBERS,C.PLAN_GROUPS,C.GROUP_PLAN_CHANGES,
    C.GROUP_EVENT_LIKES,C.SPECIAL_CARES,C.NOTES,C.NOTE_ATTACHMENTS,C.BODY_METRIC_PREFS,C.NOTIFICATIONS,C.FEEDBACKS,C.AUDIT_LOGS
  ]
  for (const collection of directUserCollections) await removeWhere(collection,{ userId })

  await Promise.all([
    removeWhere(C.FOODS,{ ownerUserId:userId }),
    removeWhere(C.FRIENDSHIPS,{ userA:userId }),
    removeWhere(C.FRIENDSHIPS,{ userB:userId }),
    removeWhere(C.FRIEND_SETTINGS,{ friendUserId:userId }),
    removeWhere(C.SPECIAL_CARES,{ targetUserId:userId }),
    removeWhere(C.NOTIFICATIONS,{ actorUserId:userId }),
    removeWhere(C.GROUP_EVENTS,{ userId:userId })
  ])

  // 已解散群保留最小生命周期记录，但移除可识别的 owner 引用。
  for (const group of ownedGroups) {
    await db.collection(C.GROUPS).doc(group._id).update({ data:{ ownerUserId:'',ownerDeletedAt:now(),updatedAt:now() } }).catch(() => null)
  }
  await db.collection(C.USERS).doc(userId).remove()
  return { deleted:true }
}

module.exports = { dataSummary, clearNotes, clearDiet, clearHealth, clearActivityHistory, deleteAccountData }
