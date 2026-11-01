---
name: book-source-builder
description: 编写、调试、校验「书源」（阅读类 App 的抓取规则，Legado / 阅读 3.0 系 bookSource JSON）。当用户提出「做个书源 / 写书源 / 书源规则 / bookSource / 这个源失效了帮我修 / 抓一个小说站」时使用。产出可直接导入的 JSON、可复用的调试方法与结构校验脚本。
---

# 书源制作

书源 = 一份描述「怎么从一个网站取到书」的 JSON。它不是爬虫代码，而是一组**声明式规则**：每个字段告诉 App「在这个页面里，用这个选择器，取这段文本」。

做书源的本质是四件事，按顺序做，不要跳步：

```
1. 定性   这个站属于哪一类（静态 HTML / 接口 JSON / JS 渲染 / 带签名）
2. 取数   用 curl 把真实响应抓下来，看清结构（不是看浏览器渲染结果）
3. 映射   把页面结构翻译成规则字段（search → bookInfo → toc → content 四段链路）
4. 校验   结构校验（离线） + 逐字段调试（在 App 里）
```

绝大多数失败源于跳过第 2 步：照着浏览器 DevTools 里看到的 DOM 写规则，但 App 拿到的是另一份 HTML（JS 渲染前的空壳），或者编码是 GBK，或者被 403 挡了。

## 何时用这个 skill

- 用户要「给某个站做个书源」，或「这个书源搜不到书了 / 章节是空的」。
- 需要判断一个站能不能做、做起来成本多高（先评估，再动手）。
- 已有书源需要批量体检（结构、字段缺失、重复、占位符错误）。

不适用：需要登录/付费才能看正文的站（做出来也只能取到试读，且涉及绕过付费墙，不做）；纯 App 内加密协议（不在书源能力范围内）。

## 第 0 步：先确认目标与边界

动手前问清三件事，缺一件就会白做：

1. **目标 App 与版本**：Legado 各分支（阅读 3.0、legado、阅读 Pro）字段与语法有差异，`bookSourceType`、`ruleContent.payAction` 这类字段在新版才有。以用户实际用的版本为准。
2. **要做到什么程度**：只做搜索+阅读？还是要发现（explore）、目录分页、正文分页、封面？
3. **合规边界**：只做公开可访问的内容；遇到付费墙、验证码、登录墙，直接告知不可行，不要写绕过逻辑。

## 第 1 步：定性（判断站点类型）

先取一次真实响应，再决定规则策略。

```bash
node scripts/fetch-probe.mjs "https://example.com/search?q=测试" --save /tmp/probe.html
```

看三样东西：**状态码**、**Content-Type**、**body 前 200 字符**。

| 信号 | 判定 | 规则策略 |
|---|---|---|
| `Content-Type: text/html`，body 里能直接搜到书名 | 静态 HTML | CSS / XPath，最省事 |
| `Content-Type: application/json`，或 body 以 `{`/`[` 开头 | 接口型 | JSONPath，最稳 |
| HTML 但 body 里没有书名，只有 `<div id="app">` | JS 渲染 | 找它调用的 XHR 接口；找不到就放弃 |
| 403 / 521 / 503 + Cloudflare 页面 | 反爬 | 补 header / cookie；过不去就放弃 |
| body 是乱码（`锟斤拷`、`ä¸­æ–‡`） | 编码问题 | 见 `references/04-debugging.md` 的编码一节 |

**判断"是不是接口型"的最快办法**：在浏览器 Network 面板过滤 XHR，刷新页面，看有没有返回书名列表的 JSON 请求。有 → 直接抄这个接口，比解析 HTML 稳一个数量级。

## 第 2 步：取数（把响应落到本地）

调试期间不要反复请求线上站，抓一次存本地，反复对着本地文件写规则。

```bash
# 搜索页
node scripts/fetch-probe.mjs "https://example.com/search?q=%E6%B5%8B%E8%AF%95" --save /tmp/search.html
# 详情页 / 目录页 / 正文页同理
node scripts/fetch-probe.mjs "https://example.com/book/123" --save /tmp/info.html
node scripts/fetch-probe.mjs "https://example.com/book/123/catalog" --save /tmp/toc.html
node scripts/fetch-probe.mjs "https://example.com/book/123/1.html" --save /tmp/content.html
```

带 header 时：

```bash
node scripts/fetch-probe.mjs "https://example.com/" --header "User-Agent: Mozilla/5.0 ..." --header "Referer: https://example.com/"
```

## 第 3 步：映射（四段链路）

书源的取书链路是固定的四段，缺一段链路就断：

```
searchUrl/exploreUrl  →  ruleSearch/ruleExplore   →  拿到 bookUrl
bookUrl               →  ruleBookInfo             →  拿到 tocUrl（目录地址）、书名作者封面
tocUrl                →  ruleToc                  →  拿到章节列表（chapterUrl 数组）
chapterUrl            →  ruleContent              →  拿到正文
```

每一段都是「列表规则」或「单条规则」，写法见 `references/02-rule-syntax.md`。字段全表见 `references/01-json-schema.md`。

写规则的顺序建议：**先 content（最容易验证）→ 再 toc → 再 bookInfo → 最后 search**。因为正文页结构最简单，能最快确认「这个站的 HTML 我到底拿得到拿不到」。

### 规则的三条通用技巧

1. **兜底串联**：`class.a@text||class.b@text` —— 前者取不到就用后者。站点改版时这是最便宜的容错。
2. **字段内二次清洗**：`class.intro@text##^简介[:：]##` —— `##正则##替换` 在取到值之后再做一次替换，用来去掉"简介："这种固定前缀、或把 `<br>` 换成换行。
3. **拼接**：`class.a@text&&class.b@text` —— 把两段文本连起来（比如书名 + 卷名）。

## 第 4 步：校验（离线，秒级）

```bash
node scripts/validate-booksource.mjs examples/*.json
node scripts/validate-booksource.mjs my-source.json --strict
```

校验器做的是**结构层**检查：必填字段、枚举值、`header` 是否是合法 JSON 字符串、`exploreUrl` 是否是 `[{title,url}]` 数组、URL 占位符是否合法、规则里的引号/括号是否配平、`##` 是否成对、四段链路是否齐全、同一文件内 `bookSourceUrl` 是否重复。

它**不**校验「选择器在这个站上是否真的能选中东西」——那只能靠第 5 步。

## 第 5 步：在 App 里逐字段调试

这是唯一能确认规则正确的方式。流程：

1. 导入书源 → 打开书源编辑 → 点「调试」。
2. 输入一个**真实存在的书名关键词**，看搜索结果列表是否出书。
3. 出书但字段空 → 单独调 `ruleSearch.name` / `bookUrl`，用调试面板的「单字段测试」。
4. 点进书 → 看目录是否出来 → 看正文是否出来。
5. 每次只改一个字段，改完立刻重测。**不要一次改五个字段然后猜是哪个生效了。**

常见症状对照表见 `references/04-debugging.md`。

## 第 6 步：交付

- 单文件多书源：顶层是数组 `[ {...}, {...} ]`；单书源可以是对象。
- `bookSourceUrl` 用站点根域，**不要带具体路径**——它是书源的唯一标识，改了等于换了一个源。
- 填 `bookSourceGroup`（如「小说」「出版」）方便用户分类。
- `bookSourceComment` 写清：适配站点、最后验证日期、已知限制（比如"搜索需登录，仅目录可用"）。
- 交付前跑一遍 `--strict` 校验，把 warning 逐条解释清楚。

## 交付前检查清单

- [ ] `bookSourceUrl` 是根域，且与同批其他源不重复
- [ ] `searchUrl` 含 `{{key}}`，`{{page}}` 只在需要翻页时出现
- [ ] 四段链路齐全：search → bookInfo → toc → content 都能取到非空值
- [ ] `header` 是**字符串**形式的 JSON（`"{\"User-Agent\":\"...\"}"`），不是嵌套对象
- [ ] 正文规则带 `##` 清洗，去掉了广告行、"本章未完"、站点水印
- [ ] 目录分页有 `nextTocUrl`（如果站点的目录是分页的）
- [ ] 正文分页有 `nextContentUrl`（如果正文被切成多页）
- [ ] `bookSourceComment` 写了验证日期与限制
- [ ] 在 App 里端到端跑通一本完整的书（搜索→详情→目录→正文→下一章）

## 参考文档

| 文件 | 内容 |
|---|---|
| `references/01-json-schema.md` | bookSource 全字段表、类型、必填性、四段规则对象的结构 |
| `references/02-rule-syntax.md` | 规则语言：CSS/Jsoup、XPath、JSONPath、正则、JS、`@attr`、`{{}}`、`##`、`&&`/`\|\|` |
| `references/03-site-patterns.md` | 五类站点的识别信号与规则套路（静态/接口/JS 渲染/签名/仅搜索） |
| `references/04-debugging.md` | 症状 → 病因 → 处置；编码、反爬、分页、懒加载 |
| `references/05-publishing.md` | 分组、版本、导出、分享格式、合规说明 |

## 脚本

| 文件 | 用途 |
|---|---|
| `scripts/validate-booksource.mjs` | 离线结构校验，零依赖，退出码可用于 CI |
| `scripts/fetch-probe.mjs` | 侦察：抓一次响应，报状态码/类型/编码/前若干字符，可存盘 |

## 边界与免责

- 只处理公开可访问内容；付费墙、登录墙、验证码一律不写绕过。
- 书源是"规则"，站点改版即失效，属于常态；交付时给出验证日期，便于用户判断新鲜度。
- 不要把书源用于绕过版权保护或批量抓取；本 skill 面向个人阅读工具的技术实践。
