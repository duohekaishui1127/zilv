const { db, C } = require('../lib/db')
const { now } = require('../lib/utils')
const { pendingChangesForGroup } = require('./group-plan-changes')

async function allRecords(collection, where) {
  const records=[]
  while (true) {
    const result=await db.collection(collection).where(where).skip(records.length).limit(100).get()
    records.push(...result.data)
    if (result.data.length < 100) return records
  }
}

async function updateMany(items, update) {
  for (let index=0;index<items.length;index+=20) {
    await Promise.all(items.slice(index,index+20).map(update))
  }
}

async function disbandGroupRecords(groupId, ownerUserId, groupName) {
  const timestamp=now()
  const [members,bindings,changes,invitations] = await Promise.all([
    allRecords(C.GROUP_MEMBERS,{ groupId }),
    allRecords(C.PLAN_GROUPS,{ groupId }),
    pendingChangesForGroup(groupId),
    allRecords(C.NOTIFICATIONS,{ groupId })
  ])
  const ownerMembership=members.find(item => item.userId === ownerUserId && item.role === 'OWNER')
  await Promise.all([
    updateMany(bindings,item => db.collection(C.PLAN_GROUPS).doc(item._id).update({ data:{
      enabled:false,disabledReason:'GROUP_DISBANDED',updatedAt:timestamp
    } })),
    updateMany(changes,item => db.collection(C.GROUP_PLAN_CHANGES).doc(item._id).update({ data:{
      status:'REJECTED',rejectedGroupIds:[...new Set([...(item.rejectedGroupIds || []),groupId])],
      rejectionReason:'GROUP_DISBANDED',reviewedAt:timestamp,updatedAt:timestamp
    } })),
    updateMany(members.filter(item => item._id !== (ownerMembership?._id)),item =>
      db.collection(C.GROUP_MEMBERS).doc(item._id).update({ data:{
        previousStatus:item.status,status:'DISBANDED',disbandedAt:timestamp,updatedAt:timestamp
      } })),
    updateMany(invitations,item => db.collection(C.NOTIFICATIONS).doc(item._id).update({ data:{
      title:'群组已解散',content:`「${groupName || '群组'}」已由群主解散`,status:'READ',readAt:timestamp,
      invitationStatus:'GROUP_DISBANDED',page:'/pages/circle/groups',updatedAt:timestamp
    } }))
  ])
  await db.collection(C.GROUPS).doc(groupId).update({ data:{
    status:'DISBANDED',disbandedAt:timestamp,disbandedBy:ownerUserId,updatedAt:timestamp
  } })
  if (ownerMembership) await db.collection(C.GROUP_MEMBERS).doc(ownerMembership._id).update({ data:{
    previousStatus:ownerMembership.status,status:'DISBANDED',disbandedAt:timestamp,updatedAt:timestamp
  } })
}

module.exports = { disbandGroupRecords }
