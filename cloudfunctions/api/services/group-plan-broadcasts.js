const crypto = require('crypto')
const { db, C } = require('../lib/db')
const { now } = require('../lib/utils')
const { planChangeAnnouncement } = require('../domain/group-plan-change')
const { trimNotificationHistory } = require('./notification-retention')

function idOf(kind, sourceId, targetId) {
  return crypto.createHash('sha256').update(`${kind}:${sourceId}:${targetId}`).digest('hex').slice(0,32)
}

async function document(collection, id) {
  return db.collection(collection).doc(id).get().then(result => result.data).catch(() => null)
}

async function activeMembers(groupId) {
  const records=[]
  while(true) {
    const result=await db.collection(C.GROUP_MEMBERS).where({ groupId,status:'ACTIVE' }).skip(records.length).limit(100).get()
    records.push(...result.data)
    if(result.data.length < 100)return records
  }
}

async function broadcastGroupPlanChange({ actor, change, sourceId }) {
  const groupIds=[...new Set(change.groupIds || [])]
  if(!groupIds.length)return { groups:0,recipients:0 }
  const timestamp=now()
  const message=planChangeAnnouncement(change,actor.nickname || '群成员')
  const recipients=new Map()
  await Promise.all(groupIds.map(async groupId => {
    const group=await db.collection(C.GROUPS).doc(groupId).get().then(result => result.data).catch(() => null)
    if(!group || group.status === 'DISBANDED')return
    const eventId=idOf('group-plan-event',sourceId,groupId)
    if(!await document(C.GROUP_EVENTS,eventId))await db.collection(C.GROUP_EVENTS).doc(eventId).set({ data:{
      groupId,userId:actor._id,eventType:'PLAN_CHANGED',planChangeType:change.type,planId:change.planId,
      sourceId,title:message.title,summary:message.content,status:'ACTIVE',likeCount:0,
      createdAt:timestamp,updatedAt:timestamp
    } })
    const members=await activeMembers(groupId)
    members.filter(item => item.userId !== actor._id).forEach(item => {
      if(!recipients.has(item.userId))recipients.set(item.userId,[])
      recipients.get(item.userId).push(groupId)
    })
  }))
  await Promise.all([...recipients].map(async ([userId,recipientGroupIds]) => {
    const notificationId=idOf('group-plan-notification',sourceId,userId)
    if(await document(C.NOTIFICATIONS,notificationId))return
    await db.collection(C.NOTIFICATIONS).doc(notificationId).set({ data:{
      userId,type:'GROUP_PLAN_CHANGED',actorUserId:actor._id,planId:change.planId,
      groupIds:recipientGroupIds,planChangeType:change.type,title:message.title,content:message.content,
      page:`/pages/circle/group-detail?id=${recipientGroupIds[0]}`,status:'UNREAD',pushStatus:'INTERNAL_ONLY',
      createdAt:timestamp,updatedAt:timestamp
    } })
    await trimNotificationHistory(userId)
  }))
  return { groups:groupIds.length,recipients:recipients.size }
}

module.exports = { broadcastGroupPlanChange }
