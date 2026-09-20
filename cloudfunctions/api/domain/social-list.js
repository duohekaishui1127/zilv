function pinnedFirst(items = []) {
  return items.map((item,index) => ({ item,index }))
    .sort((left,right) => Number(Boolean(right.item.pinned)) - Number(Boolean(left.item.pinned)) || left.index - right.index)
    .map(entry => entry.item)
}

module.exports = { pinnedFirst }
