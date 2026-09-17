# 黑白像素图标素材

`svg/` 保存可编辑的矢量源文件，`miniprogram/assets/` 保存小程序实际使用的透明 PNG。

- 所有图标使用 16×16 像素网格和整数坐标，SVG 使用 `shape-rendering="crispEdges"`。
- 心情、分类与操作图标运行尺寸为 64×64 px；底部导航为 80×80 px。
- 可以直接用自己的 PNG 覆盖 `miniprogram/assets` 下的同名文件，页面代码无需修改。
- 若修改生成规则，执行 `node tools/generate-pixel-icons.js` 会重新生成全部 SVG 和 PNG；它会覆盖同名手工素材。
- 图标为项目原创黑白像素风，不依赖第三方素材授权。
