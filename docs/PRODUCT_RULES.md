# 产品规则配置

1.7.2 起，把运营中最常调整的规则集中到 `cloudfunctions/api/config/product-rules.js`，并允许通过 **api 云函数环境变量**覆盖默认值。

目标是：常规运营改规则时不需要搜索业务代码，也尽量不需要重新发小程序前端版本。

## 推荐修改方式

生产环境优先改云开发控制台中 `api` 云函数的环境变量；`product-rules.js` 只保留代码默认值和合法范围。

| 环境变量 | 默认值 | 作用 | 备注 |
| --- | ---: | --- | --- |
| `BETA_ENROLLMENT_ENABLED` | `true` | 是否给尚未领取体验资格的用户自动发 Beta Pro | 改为 `false` 不影响已领取用户 |
| `BETA_PRO_DAYS` | `90` | 新用户 Beta Pro 体验天数 | 1~365，只影响之后首次领取的人 |
| `MAKEUP_FREE_CARD_CAP` | `3` | Free 补签卡持有上限 | 0~99 |
| `MAKEUP_FREE_MONTHLY_GRANT` | `1` | Free 每月恢复数量 | 不高于对应上限 |
| `MAKEUP_PRO_CARD_CAP` | `6` | Pro 补签卡持有上限 | 不低于 Free 上限 |
| `MAKEUP_PRO_MONTHLY_GRANT` | `2` | Pro 每月恢复数量 | 不高于对应上限 |
| `PRO_LIFETIME_PRICE` | `39.9` | 永久 Pro 展示/商品价格 | 正式收费仍须由可信订单确认 |
| `PRO_PURCHASE_ENABLED` | `false` | 是否允许购买入口进入正式支付逻辑 | 还要求配置 `PRO_VIRTUAL_PRODUCT_ID` |

## 典型阶段配置

### 第一批公测

```text
BETA_ENROLLMENT_ENABLED=true
BETA_PRO_DAYS=90
PRO_PURCHASE_ENABLED=false
MAKEUP_FREE_CARD_CAP=3
MAKEUP_FREE_MONTHLY_GRANT=1
MAKEUP_PRO_CARD_CAP=6
MAKEUP_PRO_MONTHLY_GRANT=2
```

### 正式上线后，30 天新用户体验

```text
BETA_ENROLLMENT_ENABLED=true
BETA_PRO_DAYS=30
PRO_PURCHASE_ENABLED=true
```

已经拿到 90 天体验的早期用户仍按原来的 `betaStartedAt / betaExpiresAt` 到期，不会被缩短成 30 天。

### 停止自动试用

```text
BETA_ENROLLMENT_ENABLED=false
```

Free 用户仍可长期使用基础版；已领取 Beta Pro 的用户继续使用到各自到期日；Lifetime Pro 不受影响。

## 前后端一致性

以下接口会把安全的公开规则返回给客户端：

- `getMembershipOverview`
- `getProfile`
- `getSystemInfo`

Pro 页面会根据服务端规则动态生成 Recovery+ 文案；Beta Pro 页面根据用户实际领取天数展示，不再把“90 天”写死。

## 哪些规则暂时不要做成环境变量

以下属于产品结构或数据迁移规则，修改影响范围比运营参数大，仍建议通过代码 + 测试 + 正式发版调整：

- 周报 / 月报 / 90 天复盘的周期定义；
- 奖章阈值与奖章语义；
- 新用户初始补签卡的历史迁移版本；
- Free / Pro 的核心功能归属；
- Schema、法律文本版本和数据删除策略。

这类规则如果也全部环境变量化，很容易出现“代码 UI 仍按旧语义，但后台已改成新语义”的不可控状态。
