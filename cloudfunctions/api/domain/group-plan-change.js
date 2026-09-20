function approvalGroups(groupIds = [], ownerGroupIds = []) {
  const all=[...new Set(groupIds.filter(Boolean))]
  const owned=new Set(ownerGroupIds.filter(Boolean))
  const approvedGroupIds=all.filter(groupId => owned.has(groupId))
  const requiredGroupIds=all.filter(groupId => !owned.has(groupId))
  return { groupIds:all,approvedGroupIds,requiredGroupIds,approvalRequired:requiredGroupIds.length > 0 }
}

function planChangeAnnouncement(change = {}, actorName = '群成员') {
  const current=change.currentPlan || {}
  const proposed=change.proposedPlan || change.payload?.plan || {}
  const name=current.name || proposed.name || '计划'
  if(change.type === 'UPDATE') {
    const nextName=proposed.name || name
    const target=`${proposed.targetValue || 1}${proposed.unit || ''}`
    return { title:'群监督计划已修改',content:`${actorName}将「${name}」更新为「${nextName}」，目标 ${target}` }
  }
  if(change.type === 'SET_ENABLED') {
    return { title:change.payload?.enabled ? '群监督计划已启用' : '群监督计划已停用',content:`${actorName}${change.payload?.enabled ? '启用了' : '停用了'}「${name}」` }
  }
  if(change.type === 'DELETE') return { title:'群监督计划已删除',content:`${actorName}删除了「${name}」` }
  return { title:'群监督计划已解绑',content:`${actorName}解除了「${name}」的群组绑定` }
}

module.exports = { approvalGroups, planChangeAnnouncement }
