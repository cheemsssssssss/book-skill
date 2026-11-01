# 规则语法

书源里每个规则字段都是一个字符串。这个字符串先被解析成「选择器」，再取出属性，最后做替换。

```
[前缀] 选择器链 @属性 ##正则##替换
```

理解成一条流水线：

```
输入（HTML / JSON / 文本）
  → 选择器定位节点（可能多级）
  → @属性 取值（text / html / href / src ...）
  → ## 正则清洗（可多次）
  → 输出字符串
```

## 1. 默认语法：Jsoup CSS

不写前缀时走 Jsoup 风格选择器，写法是 `@` 分隔的多级链，**最后一段是属性**。

| 写法 | 含义 |
|---|---|
| `class.book-item` | class 为 `book-item` 的元素 |
| `id.content` | id 为 `content` 的元素 |
| `tag.li` | 所有 `<li>` |
| `tag.a.book-link` | `<a class="book-link">` |
| `[href*=catalog]` | href 含 `catalog` 的元素 |
| `class.list@tag.li` | `class=list` 内部的所有 `li` |
| `class.list@tag.li[0]` | 第一个 `li` |
| `class.list@tag.li[-1]` | 最后一个 `li` |
| `class.title@text` | 取文本（含子节点文本） |
| `class.title@ownText` | 只取本节点直接文本，不含子节点 |
| `class.desc@html` | 取内部 HTML（保留 `<br>`、`<p>`） |
| `tag.a@href` | 取 href 原始值（相对路径由 App 自动补全） |
| `tag.img@src` | 取图片地址 |
| `tag.meta@content` | 取 meta 的 content |
| `class.x@abs:href` | 取绝对地址（部分版本支持） |

**多级链的语义**：每一段 `@` 都是一次「在当前结果集里继续找」。所以 `class.list@tag.li@tag.a@href` = 在 `.list` 里找 `li`，在 `li` 里找 `a`，取 `href`。

**列表规则 vs 单值规则**：
- `bookList` / `chapterList` 要返回**多个节点**（每个节点是一本书/一章），所以结尾**不能**带 `@text`。
- `name` / `chapterName` 要返回**字符串**，所以结尾必须带属性。

写错这一条的表现：书源能导入、调试时报"列表为空"或"只出了一本书"。

## 2. XPath

以 `//` 开头，或显式 `@XPath:` 前缀。

```
//div[@class="result-list"]/div[@class="item"]
//h1/text()
//div[@id="content"]//text()
//a[contains(@href,"chapter")]/@href
@XPath://ul[@id="list"]/li
```

XPath 的优势：能表达「父节点有某属性」「文本包含某串」「取第 n 个兄弟」这类 CSS 表达不了的条件。劣势：站点结构稍变就全断，且写法冗长。

选择建议：**能用 CSS 就用 CSS**；只有当 CSS 无法表达（如按文本内容筛选、需要向上取父节点）时才用 XPath。

## 3. JSONPath

接口型站点的首选。以 `$` 开头，或 `@json:` 前缀。

```
$.data.list[*]              数组每一项
$.data.list[0].name         第一项的名字
$..bookName                 任意层级的 bookName
$.result.books[*].title
@json:$.data.items[*]
```

列表规则用 `[*]`，单值规则用具体路径。注意：JSON 里数字/布尔值取出来是字符串，需要 `##` 清洗时按字符串处理。

## 4. 正则

以 `:` 开头（部分版本写作 `@regex:`）。

```
:href="([^"]*chapter[^"]*)"
:第(\d+)章
```

正则规则直接作用在**整个响应体**上，`(...)` 捕获组就是结果；多个捕获组时取第一个非空组。这是最脆弱的写法，只在 HTML 结构完全无法定位时用（比如整页被混淆、只有一个稳定的 `<script>` 变量）。

正文场景更常用的是 `ruleContent.sourceRegex`，语义相同但作用域明确。

## 5. JS 规则

以 `@js:` 开头，或用 `<js>...</js>` 包裹。规则里可用变量：

| 变量 | 含义 |
|---|---|
| `result` | 上一步（选择器）的结果，**JS 规则通常以 `result` 为输入** |
| `baseUrl` | 书源根地址 |
| `book` | 当前书籍对象（`book.name`、`book.author`、`book.bookUrl`） |
| `chapter` | 当前章节对象 |
| `java.*` | 内置工具：`java.ajax(url)`、`java.base64Decode`、`java.md5Encode`、`java.timeFormat`、`java.encodeURI` 等（集合随版本变化） |

典型用途：

```
@js:result.replace(/广告|本章未完/g, "")
```

```
<js>
  var list = JSON.parse(result);
  list.map(function(it){ return it.id + "," + it.title }).join("\n")
</js>
```

**能不用 JS 就不用**：JS 规则不可静态校验，出错时只有一句"规则错误"，排查成本远高于选择器。

## 6. 属性速查

| 属性 | 结果 |
|---|---|
| `@text` | 节点文本（含后代） |
| `@ownText` | 仅直接文本 |
| `@html` | 内部 HTML |
| `@outerHtml` | 含自身标签的 HTML（部分版本） |
| `@href` / `@src` / `@content` / `@title` / `@alt` / `@value` | 对应属性值 |
| `@href` 相对路径 | App 会自动拼成绝对地址；**跨域**或协议相对（`//cdn...`）时可能拼错，必要时用 JS 补 |

## 7. 三种修饰符

### `##` 字段内替换

```
class.intro@text##^简介[:：]\s*##
```

语义：`##正则##替换`。省略替换部分表示删除：

```
class.content@text##本章未完.*?$##
```

多次替换就写多组：

```
class.content@html##<br\s*/?>##\n##<[^>]+>##
```

⚠️ 正则里的 `#` 会被误判为分隔符，需要转义或改写字符类。`\s` 在 JSON 字符串里要写成 `\\s`。

### `||` 兜底

```
class.title@text||tag.h1@text||meta[property=og:title]@content
```

从左到右，第一个**非空**结果生效。站点改版时这是最便宜的容错，建议关键字段（书名、正文）都带兜底。

### `&&` 拼接

```
class.vol@text&&class.chapter@text
```

把多个结果按顺序连起来（换行分隔）。

## 8. 占位符与编码

规则和 URL 里都能用 `{{ }}`：

```
/search?q={{key}}&page={{page}}
```

**中文关键词必须编码**，否则多数站点返回空：

```
/search?q={{java.encodeURI(key)}}&page={{page}}
```

`{{page}}` 从 1 开始；如果站点的页码从 0 开始，写 `{{page - 1}}`（新版支持表达式）或用 JS 规则处理。

## 9. 常见语法错误

| 症状 | 原因 |
|---|---|
| 导入报"规则错误" | JSON 里 `\` 没转义（`\s` 应为 `\\s`，`\d` 应为 `\\d`） |
| 列表只出一项 | 列表规则结尾带了 `@text`，退化成单值 |
| 取到的文本带一堆空白 | 用 `@text` 后没加 `##^\s+|\s+$##` 清洗 |
| `@href` 拿到 `javascript:;` | 站点用 JS 跳转，真实地址在 `data-*` 属性或 `onclick` 里 |
| 正则规则匹配不到 | 正则作用在**原始响应**上，HTML 里可能有换行/多余空格，用 `[\s\S]*?` 而非 `.*?` |
| `##` 替换无效 | 正则里含 `#`，或 JSON 里反斜杠没双写 |
