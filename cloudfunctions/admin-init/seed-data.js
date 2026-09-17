const foods = [
  ['鸡胸肉（熟）',165,31,0,3.6],['鸡蛋',143,12.6,0.7,9.5],['米饭（熟）',116,2.6,25.9,0.3],
  ['燕麦片',389,16.9,66.3,6.9],['全麦面包',247,13,41,4.2],['牛奶',61,3.2,4.8,3.3],
  ['无糖酸奶',63,5.3,7,1.6],['香蕉',89,1.1,22.8,0.3],['苹果',52,0.3,13.8,0.2],
  ['西兰花',35,2.4,7.2,0.4],['土豆',77,2,17.5,0.1],['红薯',86,1.6,20.1,0.1],
  ['牛肉（瘦，熟）',217,26,0,11],['三文鱼',208,20,0,13],['豆腐',76,8.1,1.9,4.8],
  ['豆浆（无糖）',31,3,1.2,1.6],['花生',567,25.8,16.1,49.2],['杏仁',579,21.2,21.6,49.9],
  ['橙子',47,0.9,11.8,0.1],['黄瓜',15,0.7,3.6,0.1],['糙米饭（熟）',123,2.7,25.6,1.0],
  ['玉米（熟）',96,3.4,21,1.5],['意大利面（熟）',158,5.8,30.9,0.9],['荞麦面（熟）',99,5.1,21.4,0.1],
  ['鸡腿肉（去皮熟）',179,24,0,8],['鸡翅（熟）',203,30.5,0,8.1],['猪里脊（熟）',195,29,0,7.5],
  ['虾仁（熟）',99,24,0.2,0.3],['鳕鱼（熟）',105,23,0,0.9],['金枪鱼（水浸）',116,25.5,0,0.8],
  ['北豆腐',98,10.6,2.4,5.8],['毛豆（熟）',121,11.9,8.9,5.2],['鹰嘴豆（熟）',164,8.9,27.4,2.6],
  ['黑豆（熟）',132,8.9,23.7,0.5],['蛋白',52,10.9,0.7,0.2],['奶酪（切达）',403,24.9,1.3,33.1],
  ['低脂牛奶',42,3.4,5,1],['希腊酸奶（无糖）',59,10.3,3.6,0.4],['乳清蛋白粉（参考）',400,80,8,6],
  ['牛油果',160,2,8.5,14.7],['蓝莓',57,0.7,14.5,0.3],['草莓',32,0.7,7.7,0.3],
  ['葡萄',69,0.7,18.1,0.2],['猕猴桃',61,1.1,14.7,0.5],['菠菜',23,2.9,3.6,0.4],
  ['生菜',15,1.4,2.9,0.2],['番茄',18,0.9,3.9,0.2],['胡萝卜',41,0.9,9.6,0.2],
  ['南瓜',26,1,6.5,0.1],['蘑菇',22,3.1,3.3,0.3],['橄榄油',884,0,0,100],
  ['芝麻油',884,0,0,100],['核桃',654,15.2,13.7,65.2],['腰果',553,18.2,30.2,43.9],
  ['黑巧克力70%',598,7.8,45.9,42.6],['蜂蜜',304,0.3,82.4,0],['白砂糖',387,0,100,0],
  ['可乐',42,0,10.6,0],['无糖可乐',0,0,0,0],['咖啡（黑咖啡）',2,0.1,0,0],
  ['米粥',46,1.1,9.9,0.1],['馒头',223,7,47,1.1],['面条（熟）',138,4.5,25,2.1]
].map(([name, energyKcalPer100, proteinPer100, carbPer100, fatPer100]) => ({
  ownerType: 'SYSTEM', ownerUserId: null, name, brand: '', defaultUnit: 'g',
  energyKcalPer100, proteinPer100, carbPer100, fatPer100,
  enabled: true, referenceOnly: true, dataVersion: 1
}))

const exercises = [
  ['WALK','步行','CARDIO',3.5],['BRISK_WALK','快走','CARDIO',4.8],['JOG','慢跑','CARDIO',7.0],
  ['RUN','跑步','CARDIO',9.8],['CYCLING','骑行','CARDIO',7.5],['SWIM','游泳','CARDIO',8.0],
  ['HIIT','HIIT','CARDIO',8.0],['ROPE','跳绳','CARDIO',10.0],['STRENGTH_LIGHT','轻强度力量训练','STRENGTH',3.5],
  ['STRENGTH','力量训练','STRENGTH',5.0],['STRENGTH_HIGH','高强度力量训练','STRENGTH',6.0],['YOGA','瑜伽','OTHER',2.5],
  ['ELLIPTICAL','椭圆机','CARDIO',5.0],['STAIR','爬楼/登阶','CARDIO',8.8],['ROWING','划船机','CARDIO',7.0]
].map(([key, name, category, metValue], index) => ({ key, name, category, metValue, sort: index + 1, enabled: true, dataVersion: 1 }))

const bodyMetrics = [
  ['weight','体重','kg',true],['bodyFat','体脂率','%',true],['waist','腰围','cm',false],['chest','胸围','cm',false],
  ['hip','臀围','cm',false],['shoulder','肩围','cm',false],['leftArm','左臂围','cm',false],['rightArm','右臂围','cm',false],
  ['leftThigh','左大腿围','cm',false],['rightThigh','右大腿围','cm',false],['leftCalf','左小腿围','cm',false],['rightCalf','右小腿围','cm',false]
].map(([code, name, unit, defaultEnabled], index) => ({ code, name, unit, defaultEnabled, sort: index + 1, enabled: true }))

const appConfig = [
  { key: 'weightUpdateDays', value: 7, description: '超过此天数提醒更新体重' },
  { key: 'defaultGoalType', value: 'FAT_LOSS', description: '新用户默认目标' },
  { key: 'defaultProteinRatio', value: 1.6, description: '默认蛋白质 g/kg，仅作为用户可调整初始值' },
  { key: 'defaultFatRatio', value: 0.8, description: '默认脂肪 g/kg，仅作为用户可调整初始值' },
  { key: 'foodDataNotice', value: '系统食物营养值为通用参考值，品牌、烹饪方式会造成差异。', description: '饮食页面提示' },
  { key: 'noteMaxImages', value: 9, description: '单条日志最多图片数' },
  { key: 'noteMaxContentLength', value: 5000, description: '单条日志正文最大字符数' }
]

module.exports = { foods, exercises, bodyMetrics, appConfig }
