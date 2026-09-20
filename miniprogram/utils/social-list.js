function pinnedFirst(items = []) {
  return items.map((item,index) => ({ item,index }))
    .sort((left,right) => {
      const pinnedOrder=Number(Boolean(right.item.pinned))-Number(Boolean(left.item.pinned))
      if(pinnedOrder)return pinnedOrder
      if(left.item.pinned&&right.item.pinned){
        const leftTime=new Date(left.item.pinnedAt || 0).getTime() || 0
        const rightTime=new Date(right.item.pinnedAt || 0).getTime() || 0
        if(leftTime!==rightTime)return rightTime-leftTime
      }
      return left.index-right.index
    })
    .map(entry => entry.item)
}

module.exports = { pinnedFirst }
