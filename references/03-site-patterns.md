# 站点类型与规则套路

做源之前先定性。定性错了，后面所有规则都是白写。下面五类覆盖了绝大多数情况。

## A 类：静态 HTML

**识别信号**

- `Content-Type: text/html`
- 用 curl 抓下来的 HTML 里**直接能搜到书名/章节名**
- 没有 `<div id="app"></div>` 这种空壳

```bash
node scripts/fetch-probe.mjs "https://example.com/search?q=x" --save /tmp/s.html
grep -c "书名" /tmp/s.html   # >0 就是静态
```

**规则策略**：CSS 选择器，标准四段链路。这类站做起来最快，成功率最高。

**注意点**

- 分页：列表页底部有「下一页」，`searchUrl` 里用 `{{page}}`。
- 目录分页：目录常被切成 `?page=2` 多页，需要 `nextTocUrl`。
- 正文分页：老站常把一章切成 `1.html` `2.html`，需要 `nextContentUrl`。

## B 类：接口型（JSON API）

**识别信号**

- 浏览器 Network 里能看到返回 JSON 的 XHR（`/api/search?kw=`、`/book/list`）
- 或 curl 直接拿到 `{"code":0,"data":[...]}`

**规则策略**：JSONPath，**这是最稳的一类**。

```
"searchUrl": "/api/search?kw={{java.encodeURI(key)}}&page={{page}}",
"ruleSearch": {
  "bookList": "$.data.list[*]",
  "name": "$.title",
  "author": "$.author",
  "bookUrl": "$.url",
  "coverUrl": "$.cover"
}
```

**注意点**

- `bookList` 用 `[*]`，字段用相对路径（`$.title` 而不是完整路径）——JSONPath 在列表项内是相对求值。
- 接口常要求 `Referer` 或固定 `UA`，缺了返回 403。抄浏览器里那条请求的 header。
- 接口返回的 `url` 可能是 id，需要拼成详情页：用 JS 规则 `@js:baseUrl + "/book/" + result`。
- 接口可能返回 `code: 401` 表示需要登录 —— 直接判定不可做。

## C 类：JS 渲染（SPA）

**识别信号**

- curl 拿到的 HTML 只有 `<div id="app"></div>` 加一堆 `<script>`
- 页面里搜不到书名，但浏览器里能看到

**规则策略**：**不要试图解析 HTML**。两条路：

1. **找到它的数据接口**（首选）。DevTools → Network → Fetch/XHR → 刷新 → 看哪个请求返回了书名。然后按 B 类做。
2. 接口有签名/加密，且无法复现 → 用 `ruleContent.webJs` 让 App 用 WebView 渲染后取 DOM。代价大、慢、易碎，**只在正文页偶尔用**。

**判断值不值得做**：如果搜索接口就带签名（参数里有 `sign`、`timestamp`、`nonce`，且 JS 混淆），基本可以放弃——书源没有执行任意 JS 逆向的能力，硬做只能靠 `webJs`，体验极差。

## D 类：带反爬 / 签名

**识别信号**

- 403 / 521 / 503，body 是 Cloudflare 的 `Just a moment...`
- 响应里有 `cf_clearance` cookie 要求
- 接口参数含 `sign=` / `_signature=` / `token=`，且每次不同

**处置顺序**

1. 补 `User-Agent` + `Referer` → 重试。这一步能解决一半的 403。
2. 补 `Cookie`（从浏览器复制一份）→ 重试。适合一次性验证，不适合长期交付（会过期）。
3. 仍然不行 → **判定不可做**，如实告诉用户原因。

不要写"自动过验证码"的逻辑，也不要把个人 cookie 硬编码进要分享的源里。

## E 类：只有搜索 / 只有目录

**识别信号**：站点没有分类页，或正文需要登录。

**规则策略**

- 只有搜索：`exploreUrl` 留空，`enabledExplore: false`。功能上完全可用。
- 正文要登录：只能做到目录层。交付时在 `bookSourceComment` 写明"仅目录可用，正文需登录"，并考虑是否值得交付。

## 快速判定表

| 观察 | 类型 | 预计工时 | 成功率 |
|---|---|---|---|
| curl 直接看到书名 | A 静态 | 20–40 分钟 | 高 |
| Network 里有干净 JSON | B 接口 | 15–30 分钟 | 很高 |
| 空壳 HTML + 干净接口 | C 找接口 | 30–60 分钟 | 中高 |
| 空壳 + 签名接口 | C 签名 | — | 低，建议放弃 |
| 403 + Cloudflare | D 反爬 | 10 分钟试一次 | 低 |
| 需登录看正文 | E 受限 | 20 分钟 | 只能到目录 |

## 通用设计原则

1. **优先选最稳的数据源**：接口 > 静态 HTML > 正则 > webJs。稳定性递减，维护成本递增。
2. **每个关键字段都给兜底**：`A||B`。站点改版时，兜底能让你少改一次。
3. **不要在规则里硬编码域名**：用 `{{baseUrl}}`，换域名时只改一个字段。
4. **限速**：`concurrentRate` 设 `"500"` 以上。抓太猛会被封 IP，也会给别人添麻烦。
5. **可验证性**：写完后记录"验证日期 + 验证到第几章"，方便判断是否过期。
