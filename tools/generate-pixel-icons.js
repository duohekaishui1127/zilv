const fs = require('fs')
const path = require('path')
const zlib = require('zlib')

const root = path.resolve(__dirname, '..')
const sourceDir = path.join(root, 'design-assets/icons/svg')
const assetDir = path.join(root, 'miniprogram/assets')
const SIZE = 16

function matrix() { return Array.from({ length: SIZE }, () => Array(SIZE).fill(0)) }
function dot(m, x, y, value = 1) { if (x >= 0 && x < SIZE && y >= 0 && y < SIZE) m[y][x] = value }
function line(m, x1, y1, x2, y2, value = 1) {
  const dx = Math.abs(x2 - x1), sx = x1 < x2 ? 1 : -1
  const dy = -Math.abs(y2 - y1), sy = y1 < y2 ? 1 : -1
  let error = dx + dy
  while (true) {
    dot(m, x1, y1, value)
    if (x1 === x2 && y1 === y2) break
    const twice = 2 * error
    if (twice >= dy) { error += dy; x1 += sx }
    if (twice <= dx) { error += dx; y1 += sy }
  }
}
function rect(m, x1, y1, x2, y2, value = 1, fill = false) {
  if (fill) for (let y = y1; y <= y2; y++) for (let x = x1; x <= x2; x++) dot(m, x, y, value)
  else { line(m, x1, y1, x2, y1, value); line(m, x1, y2, x2, y2, value); line(m, x1, y1, x1, y2, value); line(m, x2, y1, x2, y2, value) }
}

function face(expression) {
  const m = matrix()
  const spans = { 1:[5,10], 2:[3,12], 3:[2,13], 4:[1,14], 5:[1,14], 6:[1,14], 7:[1,14], 8:[1,14], 9:[1,14], 10:[1,14], 11:[1,14], 12:[2,13], 13:[3,12], 14:[5,10] }
  for (const [row, span] of Object.entries(spans)) for (let x = span[0]; x <= span[1]; x++) dot(m, x, Number(row), 2)
  for (const [row, span] of Object.entries(spans)) {
    const y = Number(row)
    for (let x = span[0]; x <= span[1]; x++) {
      if (!spans[y - 1] || x < spans[y - 1][0] || x > spans[y - 1][1] || !spans[y + 1] || x < spans[y + 1][0] || x > spans[y + 1][1] || x === span[0] || x === span[1]) dot(m, x, y)
    }
  }
  if (expression === 'TIRED') { line(m, 4, 6, 6, 6); line(m, 9, 6, 11, 6); rect(m, 6, 10, 9, 11) }
  else { rect(m, 5, 5, 5, 6, 1, true); rect(m, 10, 5, 10, 6, 1, true) }
  if (expression === 'GREAT') { dot(m, 4, 9); dot(m, 11, 9); dot(m, 5, 10); dot(m, 10, 10); line(m, 6, 11, 9, 11) }
  if (expression === 'GOOD') { dot(m, 5, 9); dot(m, 10, 9); line(m, 6, 10, 9, 10) }
  if (expression === 'OKAY') line(m, 5, 10, 10, 10)
  if (expression === 'BAD') { line(m, 6, 9, 9, 9); dot(m, 5, 10); dot(m, 10, 10); dot(m, 4, 11); dot(m, 11, 11) }
  return m
}

function calendar() { const m=matrix(); rect(m,2,3,13,14); line(m,2,6,13,6); rect(m,4,1,5,4,1,true); rect(m,10,1,11,4,1,true); dot(m,5,9);dot(m,8,9);dot(m,11,9);dot(m,5,12);dot(m,8,12);return m }
function today() { const m=matrix(); rect(m,2,2,13,13); line(m,2,5,13,5); line(m,5,10,7,12); line(m,7,12,11,7); return m }
function record() { const m=matrix(); line(m,2,3,7,2);line(m,8,2,13,3);line(m,2,3,2,13);line(m,13,3,13,13);line(m,7,3,7,14);line(m,8,3,8,14);line(m,2,13,7,14);line(m,8,14,13,13);line(m,4,6,6,6);line(m,9,6,11,6);line(m,4,9,6,9);return m }
function plan() { const m=matrix(); rect(m,3,2,13,14);rect(m,6,1,10,3);line(m,5,7,6,8);line(m,6,8,8,5);line(m,10,7,12,7);line(m,5,11,6,12);line(m,6,12,8,9);line(m,10,11,12,11);return m }
function profile() { const m=matrix(); rect(m,6,2,9,5);dot(m,5,3);dot(m,10,3);dot(m,5,4);dot(m,10,4);line(m,4,9,11,9);line(m,3,10,12,10);line(m,2,11,13,11);line(m,2,12,2,14);line(m,13,12,13,14);line(m,2,14,13,14);return m }
function notes() { const m=matrix(); rect(m,3,2,12,14);line(m,5,6,10,6);line(m,5,9,10,9);line(m,5,12,8,12);return m }
function body() { const m=matrix(); rect(m,2,4,13,14);line(m,5,4,6,2);line(m,6,2,9,2);line(m,9,2,10,4);line(m,5,8,10,8);dot(m,7,6);dot(m,8,6);return m }
function food() { const m=matrix(); line(m,2,8,13,8);line(m,3,9,4,12);line(m,4,12,11,12);line(m,11,12,12,9);line(m,3,14,12,14);line(m,5,5,6,7);line(m,8,4,8,7);line(m,11,5,10,7);return m }
function workout() { const m=matrix();rect(m,1,5,3,10,1,true);rect(m,12,5,14,10,1,true);rect(m,4,6,5,9,1,true);rect(m,10,6,11,9,1,true);line(m,5,7,10,7);line(m,5,8,10,8);return m }
function study() { return record() }
function friends() { const m=matrix();rect(m,3,3,6,6);rect(m,10,4,12,6);line(m,2,10,7,10);line(m,1,11,8,11);line(m,1,12,1,14);line(m,8,12,8,14);line(m,10,10,13,10);line(m,9,11,14,11);line(m,14,12,14,14);return m }
function groups() { const m=friends();rect(m,7,1,9,3);line(m,6,6,10,6);line(m,5,7,11,7);return m }
function start() { const m=matrix();line(m,5,3,5,12);line(m,6,4,6,11);line(m,7,5,7,10);line(m,8,6,8,9);line(m,9,7,11,8);return m }
function pause() { const m=matrix();rect(m,4,3,6,12,1,true);rect(m,9,3,11,12,1,true);return m }
function stop() { const m=matrix();rect(m,4,4,11,11,1,true);return m }
function check() { const m=matrix();line(m,3,8,6,11);line(m,6,11,12,4);return m }

const shapes = {
  'mood-great': face('GREAT'), 'mood-good': face('GOOD'), 'mood-okay': face('OKAY'),
  'mood-tired': face('TIRED'), 'mood-bad': face('BAD'), 'mood-checked': check(),
  calendar: calendar(), today: today(), record: record(), plan: plan(), profile: profile(),
  notes: notes(), body: body(), food: food(), workout: workout(), study: study(), friends: friends(), groups: groups(),
  start: start(), pause: pause(), resume: start(), stop: stop()
}

const outputs = [
  ...['great','good','okay','tired','bad','checked'].map(name => ({ shape:`mood-${name}`, path:`moods/${name}.png`, scale:4 })),
  ...['calendar','today','record','plan','profile'].flatMap(name => [
    { shape:name, path:`tabbar/${name}.png`, scale:5, color:'#8a8f98' },
    { shape:name, path:`tabbar/${name}-active.png`, scale:5, color:'#111827' }
  ]),
  ...['notes','body','food','workout','study','friends','groups'].map(name => ({ shape:name, path:`categories/${name}.png`, scale:4 })),
  ...['start','pause','resume','stop'].map(name => ({ shape:name, path:`actions/${name}.png`, scale:4 }))
]

function rgb(hex) { const value=parseInt(hex.slice(1),16); return [(value>>16)&255,(value>>8)&255,value&255] }
let crcTable
function crc32(buffer) {
  if (!crcTable) crcTable=Array.from({length:256},(_,n)=>{let c=n;for(let k=0;k<8;k++)c=(c&1)?0xedb88320^(c>>>1):c>>>1;return c>>>0})
  let c=0xffffffff
  for (const byte of buffer) c=crcTable[(c^byte)&255]^(c>>>8)
  return (c^0xffffffff)>>>0
}
function chunk(type, data) {
  const name=Buffer.from(type), length=Buffer.alloc(4), checksum=Buffer.alloc(4)
  length.writeUInt32BE(data.length); checksum.writeUInt32BE(crc32(Buffer.concat([name,data])))
  return Buffer.concat([length,name,data,checksum])
}
function pngOf(m, scale, color) {
  const width=SIZE*scale, height=SIZE*scale, row=width*4+1, raw=Buffer.alloc(row*height)
  const fg=rgb(color), white=[255,255,255]
  for(let y=0;y<height;y++) for(let x=0;x<width;x++) {
    const value=m[Math.floor(y/scale)][Math.floor(x/scale)], offset=y*row+1+x*4
    if (!value) continue
    const valueRgb=value===2?white:fg
    raw[offset]=valueRgb[0];raw[offset+1]=valueRgb[1];raw[offset+2]=valueRgb[2];raw[offset+3]=255
  }
  const header=Buffer.alloc(13);header.writeUInt32BE(width,0);header.writeUInt32BE(height,4);header[8]=8;header[9]=6
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',zlib.deflateSync(raw)),chunk('IEND',Buffer.alloc(0))])
}
function svgOf(m) {
  const pixels=[]
  for(let y=0;y<SIZE;y++) for(let x=0;x<SIZE;x++) if(m[y][x]) pixels.push(`<rect x="${x}" y="${y}" width="1" height="1" fill="${m[y][x]===2?'#fff':'#111827'}"/>`)
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}" shape-rendering="crispEdges">${pixels.join('')}</svg>\n`
}

fs.mkdirSync(sourceDir,{recursive:true})
for (const [name, shape] of Object.entries(shapes)) fs.writeFileSync(path.join(sourceDir,`${name}.svg`),svgOf(shape))
for (const output of outputs) {
  const target=path.join(assetDir,output.path)
  fs.mkdirSync(path.dirname(target),{recursive:true})
  fs.writeFileSync(target,pngOf(shapes[output.shape],output.scale,output.color||'#111827'))
}
console.log(`generated ${Object.keys(shapes).length} SVG sources and ${outputs.length} PNG assets`)
