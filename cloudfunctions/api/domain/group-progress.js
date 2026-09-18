function progressState(member) {
  const total = Math.max(0, Number(member?.total || 0))
  const completed = Math.max(0, Number(member?.completed || 0))
  if (!total) return { progressState:'NO_PLAN', rank:1, ratio:null, completedAll:false }
  const ratio = Math.min(1, completed / total)
  if (completed >= total) return { progressState:'COMPLETE', rank:2, ratio:1, completedAll:true }
  return { progressState:'INCOMPLETE', rank:0, ratio, completedAll:false }
}

function sortGroupMemberProgress(members) {
  return members.map(member => ({ ...member,...progressState(member) }))
    .sort((a,b) => a.rank - b.rank || (a.ratio ?? 1) - (b.ratio ?? 1) || String(a.nickname || '').localeCompare(String(b.nickname || ''), 'zh-CN'))
}

module.exports = { progressState, sortGroupMemberProgress }
