function drawLineChart(scope, selector, datasets, options = {}) {
  return new Promise(resolve => {
    wx.createSelectorQuery().in(scope).select(selector).fields({ node: true, size: true }).exec(result => {
      const target = result?.[0]
      if (!target?.node || !target.width || !target.height) return resolve(false)
      const canvas = target.node
      const context = canvas.getContext('2d')
      const pixelRatio = wx.getWindowInfo ? wx.getWindowInfo().pixelRatio : wx.getSystemInfoSync().pixelRatio
      canvas.width = target.width * pixelRatio
      canvas.height = target.height * pixelRatio
      context.scale(pixelRatio, pixelRatio)
      context.clearRect(0, 0, target.width, target.height)

      const allValues = datasets.flatMap(dataset => dataset.values).filter(value => value != null && Number.isFinite(Number(value))).map(Number)
      if (!allValues.length) return resolve(false)
      let min = Math.min(...allValues)
      let max = Math.max(...allValues)
      const rawRange = max - min
      const padding = rawRange ? rawRange * 0.12 : Math.max(Math.abs(max) * 0.08, 1)
      min -= padding
      max += padding
      if (options.zeroBaseline && min > 0) min = 0
      if (options.zeroBaseline && max < 0) max = 0

      const left = 50
      const right = 14
      const top = 18
      const bottom = 30
      const width = target.width - left - right
      const height = target.height - top - bottom
      const pointCount = Math.max(...datasets.map(dataset => dataset.values.length))
      const xOf = index => left + (pointCount <= 1 ? width / 2 : index / (pointCount - 1) * width)
      const yOf = value => top + (max - Number(value)) / (max - min) * height

      context.lineWidth = 1
      context.strokeStyle = '#e5e7eb'
      context.fillStyle = '#8a8f98'
      context.font = '11px sans-serif'
      context.textAlign = 'right'
      for (let index = 0; index <= 3; index++) {
        const y = top + index / 3 * height
        const value = max - index / 3 * (max - min)
        context.beginPath()
        context.moveTo(left, y)
        context.lineTo(left + width, y)
        context.stroke()
        context.fillText(`${Math.round(value)}${options.unit || ''}`, left - 6, y + 4)
      }
      if (min < 0 && max > 0) {
        context.strokeStyle = '#9ca3af'
        context.beginPath()
        context.moveTo(left, yOf(0))
        context.lineTo(left + width, yOf(0))
        context.stroke()
      }

      datasets.forEach(dataset => {
        context.strokeStyle = dataset.color || '#111827'
        context.lineWidth = 2
        context.lineJoin = 'round'
        context.lineCap = 'round'
        let drawing = false
        context.beginPath()
        dataset.values.forEach((value, index) => {
          if (value == null || !Number.isFinite(Number(value))) {
            if (!dataset.connectNulls) drawing = false
            return
          }
          const x = xOf(index)
          const y = yOf(value)
          if (!drawing) context.moveTo(x, y)
          else context.lineTo(x, y)
          drawing = true
        })
        context.stroke()
        if (pointCount <= 30) {
          context.fillStyle = dataset.color || '#111827'
          dataset.values.forEach((value, index) => {
            if (value == null || !Number.isFinite(Number(value))) return
            context.beginPath()
            context.arc(xOf(index), yOf(value), 2.5, 0, Math.PI * 2)
            context.fill()
          })
        }
      })

      context.fillStyle = '#8a8f98'
      context.font = '11px sans-serif'
      context.textAlign = 'left'
      context.fillText(options.startLabel || '', left, target.height - 7)
      context.textAlign = 'right'
      context.fillText(options.endLabel || '', left + width, target.height - 7)
      resolve(true)
    })
  })
}

module.exports = { drawLineChart }
