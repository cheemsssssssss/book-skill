# book-skill

**书源制作 skill** —— 一套写给 AI Agent（也给人看）的方法论 + 工具，用来给阅读类 App 编写、调试、校验「书源」。

书源（`bookSource`）是一份 JSON：它声明「怎么从一个网站取到一本书」——搜索、详情、目录、正文四段链路，每段由若干选择器规则组成。做书源不难，但**失败的原因高度集中**：照着浏览器 DOM 写规则、却没意识到 App 拿到的是空壳 HTML；中文关键词没编码；`##` 正则里反斜杠没转义；目录分页漏了 `nextTocUrl`。

这个仓库把这些坑固化成流程和检查。

## 目录结构

```
book-skill/
├── SKILL.md                      # 主文档：7 步工作流 + 检查清单（Agent 入口）
├── references/
│   ├── 01-json-schema.md         # bookSource 全字段表、类型陷阱、最小骨架
│   ├── 02-rule-syntax.md         # CSS/Jsoup、XPath、JSONPath、正则、JS、##、&&、||
│   ├── 03-site-patterns.md       # 五类站点的识别信号与规则套路
│   ├── 04-debugging.md           # 症状 → 病因 → 处置
│   └── 05-publishing.md          # 分组、版本、分享、合规
├── examples/                     # 3 个可校验的模板书源（example.com，非线上源）
├── scripts/
│   ├── validate-booksource.mjs   # 离线结构校验，零依赖
│   └── fetch-probe.mjs           # 侦察：状态码/编码/预览/存盘
└── .github/workflows/validate.yml
```

## 快速上手

```bash
git clone https://github.com/cheemsssssssss/book-skill.git
cd book-skill

# 1. 侦察目标站：先确认抓得到、是什么类型
node scripts/fetch-probe.mjs "https://目标站/search?q=%E6%B5%8B%E8%AF%95" --save /tmp/s.html

# 2. 以模板为骨架改一份
cp examples/01-static-html.json my-source.json

# 3. 结构校验（零依赖，秒级）
node scripts/validate-booksource.mjs my-source.json --strict
```

环境要求：Node 18+（`fetch-probe` 用内置 `fetch`）。**无第三方依赖**。

## 校验器能查什么

```
✗ error  header 必须是字符串形式的 JSON，不能是对象（导入会失败或 header 不生效）
✗ error  searchUrl 里没有 {{key}}，搜索会永远返回同一页
✗ error  ruleSearch.bookList 结尾带了 @text/@html，会退化成单值（只出一本书）
✗ error  ruleToc 缺少必填字段 chapterUrl
✗ error  bookSourceUrl 与 01-static-html.json 里的书源重复
! warn   searchUrl 直接用 {{key}}；中文关键词多数站需要 {{java.encodeURI(key)}}
! warn   bookSourceComment 里没有验证日期（YYYY-MM-DD），无法判断新鲜度
```

覆盖：必填字段、枚举值、`header`/`exploreUrl` 的字符串化 JSON、URL 占位符合法性、`##` 成对性、括号配平、四段链路完整性、列表规则退化、跨文件重复源、验证日期、限速设置。

**不覆盖**：选择器在真实站点上是否真能选中元素——那只能在 App 的「调试」里逐字段验证。

退出码：`0` 通过 / `1` 有错误（`--strict` 下警告也算失败）/ `2` 用法或读取失败，可直接用于 CI。

## 五类站点与可行性

| 类型 | 识别信号 | 预计工时 | 成功率 |
|---|---|---|---|
| A 静态 HTML | curl 下来直接能看到书名 | 20–40 min | 高 |
| B 接口型 JSON | Network 里有干净的 XHR | 15–30 min | 很高 |
| C JS 渲染 | HTML 只有 `<div id="app">` | 30–60 min（需找到接口） | 中高 |
| D 带签名/反爬 | `sign=`、Cloudflare 挑战页 | 试 10 min | 低，建议放弃 |
| E 仅搜索/需登录 | 无分类页；正文要登录 | 20 min | 只能到目录 |

判定的第一原则：**先看 curl 拿到的东西，不要看浏览器渲染后的 DOM**。

## 适用范围与限制

**适用**：Legado / 阅读 3.0 系 `bookSource` JSON；公开可访问的站点；文本、音频、图片类书源。

**限制**：

- 各分支（Legado、阅读 3.0、阅读 Pro）字段与语法有差异（`loginUi`、`payAction`、`{{}}` 表达式支持等），以目标 App 实际导入结果为准；仓库内标注了「版本差异」。
- 只做公开内容。付费墙、登录墙、验证码**不写绕过逻辑**。
- 书源会随站点改版失效，这是常态而非缺陷；交付时写明验证日期。
- 校验器是静态的，不能保证规则在线上有效。

## 合规

本项目是「阅读方式适配层」的技术实践：只描述如何从公开页面提取已公开的内容，不破解加密、不绕过授权、不改变内容的版权状态。高频抓取会给目标站造成负担，`concurrentRate` 请勿设得过于激进。若站点明确禁止抓取，请勿制作对应书源。

## License

MIT
