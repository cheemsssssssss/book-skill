# bookSource JSON 字段全表

> 目标格式：Legado / 阅读 3.0 系 `bookSource`。不同分支有增删，**以目标 App 实际导入结果为准**；本文标注了「常见」与「可选/新版」。

## 1. 顶层字段

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `bookSourceUrl` | string | ✅ | 站点根地址，书源唯一标识。如 `https://www.example.com`。**不要带路径、不要带尾斜杠差异**，改了就是另一个源 |
| `bookSourceName` | string | ✅ | 显示名，建议「站点名」或「站点名·特征」 |
| `bookSourceGroup` | string | 可选 | 分组，多个用 `,` 或 `;` 分隔，如 `小说,完结` |
| `bookSourceType` | int | 可选 | `0` 文本（默认）、`1` 音频、`2` 图片、`3` 文件 |
| `bookSourceComment` | string | 可选 | 备注。**建议写：适配站点 + 最后验证日期 + 已知限制** |
| `customOrder` | int | 可选 | 排序权重，越大越靠前 |
| `enabled` | bool | 可选 | 默认 `true` |
| `enabledExplore` | bool | 可选 | 是否启用「发现」，默认 `true` |
| `enabledCookieJar` | bool | 可选 | 是否共享 Cookie，默认 `true`。需要登录态的源打开它 |
| `header` | string | 可选 | **字符串形式的 JSON**：`"{\"User-Agent\":\"Mozilla/5.0\"}"`。写成嵌套对象是最常见的导入失败原因 |
| `loginUrl` | string | 可选 | 登录页地址，配合 WebView 登录 |
| `loginUi` | string | 可选 | 登录 UI 配置（JSON 字符串），新版 |
| `loginCheckJs` | string | 可选 | 判断是否已登录的 JS，返回 `true` 表示已登录 |
| `coverDecodeJs` | string | 可选 | 封面地址二次处理 JS（如拼接 CDN 前缀） |
| `bookUrlPattern` | string | 可选 | 详情页 URL 正则；用于「从任意链接识别是不是本书」以及书签恢复 |
| `searchUrl` | string | 二选一 | 搜索地址模板，**必须含 `{{key}}`** |
| `exploreUrl` | string | 二选一 | 发现页配置，**JSON 数组字符串**：`[{"title":"玄幻","url":"/sort/1?page={{page}}"}]` |
| `ruleSearch` | object | ✅ | 搜索结果规则，见 §2 |
| `ruleExplore` | object | 可选 | 发现页规则，结构同 `ruleSearch` |
| `ruleBookInfo` | object | ✅ | 详情页规则，见 §3 |
| `ruleToc` | object | ✅ | 目录规则，见 §4 |
| `ruleContent` | object | ✅ | 正文规则，见 §5 |
| `concurrentRate` | string | 可选 | 并发限速，如 `"500"`（毫秒）或 `"1/1000"`。**抓得快的站务必设**，否则容易被封 |
| `weight` | int | 可选 | 搜索排序权重 |
| `lastUpdateTime` | long | 自动 | 由 App 维护，手写无意义 |
| `respondTime` | long | 自动 | 响应耗时，App 维护 |
| `eventListener` | bool | 可选 | 是否启用 WebView 事件监听，新版 |

### 最小可用骨架

```json
{
  "bookSourceUrl": "https://www.example.com",
  "bookSourceName": "示例站",
  "bookSourceGroup": "示例",
  "bookSourceType": 0,
  "bookSourceComment": "示例骨架，2026-11 验证",
  "enabled": true,
  "header": "{\"User-Agent\":\"Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36\"}",
  "searchUrl": "/search?q={{key}}&page={{page}}",
  "ruleSearch": {
    "bookList": "class.result-item",
    "name": "tag.h3@text",
    "author": "class.author@text",
    "bookUrl": "tag.a@href",
    "coverUrl": "tag.img@src",
    "intro": "class.desc@text",
    "lastChapter": "class.latest@text"
  },
  "ruleBookInfo": {
    "name": "class.book-name@text",
    "author": "class.book-author@text",
    "intro": "class.book-intro@html",
    "coverUrl": "class.book-cover@tag.img@src",
    "tocUrl": "class.btn-catalog@href"
  },
  "ruleToc": {
    "chapterList": "class.chapter-list@tag.li",
    "chapterName": "tag.a@text",
    "chapterUrl": "tag.a@href"
  },
  "ruleContent": {
    "content": "id.content@html##<br\\s*/?>##\n"
  }
}
```

## 2. `ruleSearch` / `ruleExplore`

| 字段 | 说明 |
|---|---|
| `bookList` | **列表项选择器**，选中「每本书一个节点」。后续字段都在这个节点内取 |
| `name` | 书名 |
| `author` | 作者 |
| `intro` | 简介 |
| `kind` | 分类/标签 |
| `lastChapter` | 最新章节名 |
| `updateTime` | 更新时间 |
| `bookUrl` | **详情页地址**（相对路径会自动补全，但跨域时必须给绝对地址） |
| `coverUrl` | 封面地址 |
| `wordCount` | 字数 |
| `checkKeyWord` | 校验关键词：搜索结果里必须出现该词，否则判定为「搜索被劫持/返回了推荐页」。**搜索页在无结果时会返回首页推荐的站点必填** |

`bookList` 为空是最高频错误：常见原因是选择器写成了「选中所有书名的集合」而不是「选中每本书的容器」。规则要能**单独选中一个条目节点**，后面的 `name` 才能在这个节点里找。

## 3. `ruleBookInfo`

| 字段 | 说明 |
|---|---|
| `init` | 详情页预处理规则（如先取一段 JSON 或跳转真实地址） |
| `name` / `author` / `intro` / `kind` / `lastChapter` / `updateTime` / `wordCount` | 同 §2 |
| `coverUrl` | 封面 |
| `tocUrl` | **目录页地址**。若详情页就是目录页，可不填（默认用 bookUrl） |
| `canReName` | 是否允许改名（布尔字符串 `"true"`），一般不用 |
| `downloadUrls` | 下载地址（文件类源） |

`intro` 建议用 `@html` 保留段落，再用 `##` 把 `<br>` 换成换行；用 `@text` 会把段落粘成一行。

## 4. `ruleToc`

| 字段 | 说明 |
|---|---|
| `chapterList` | 章节列表项选择器 |
| `chapterName` | 章节名 |
| `chapterUrl` | 章节地址 |
| `isVolume` | 该节点是否为「卷」分隔（用于分卷目录） |
| `isVip` | 是否为付费章节（`"true"` 标记，App 会显示锁标） |
| `updateTime` | 章节更新时间 |
| `nextTocUrl` | **目录分页**的下一页地址。可返回多个（逗号分隔） |
| `formatJs` | 章节名格式化 JS，如去掉「第123章」前缀 |
| `preUpdateJs` | 更新前的预处理 JS |

目录分页是最容易被忽略的一段：目录只有 20 章、后面章节"消失"，几乎都是缺 `nextTocUrl`。

## 5. `ruleContent`

| 字段 | 说明 |
|---|---|
| `content` | **正文选择器**，通常用 `@html` 保留段落结构 |
| `title` | 正文页标题（一般不需要） |
| `nextContentUrl` | 正文下一页地址（正文被切成多页时） |
| `webJs` | 需要 WebView 执行 JS 才能拿到内容时使用 |
| `sourceRegex` | 从整页源码里用正则抠正文（结构太乱时的兜底） |
| `replaceRegex` | 正文二次替换，`##正则##替换` 或 `##正则`（删除） |
| `imageStyle` | 图片样式，图文类源用 |
| `payAction` | 付费/登录动作，新版；一般留空 |

正文规则的三件套，按优先级：

1. `content: "id.content@html##<br\\s*/?>##\n"` —— 结构清晰时
2. `content: "class.content@text##^\\s+|\\s+$##"` —— 结构脏但文本连续时
3. `sourceRegex: "<div id=\"content\">([\\s\\S]*?)</div>"` —— 结构完全乱、但有个稳定容器时

## 6. 值里的占位符

| 占位符 | 可用位置 | 含义 |
|---|---|---|
| `{{key}}` | `searchUrl` | 搜索关键词（**需自行 URL 编码**，见下） |
| `{{page}}` | `searchUrl` / `exploreUrl` | 页码，从 1 开始 |
| `{{baseUrl}}` | 规则 | 当前书源根地址 |
| `{{bookUrl}}` | 规则 | 当前书籍详情页 |
| `{{book.name}}` `{{book.author}}` | 规则 | 书籍元信息 |
| `{{chapterUrl}}` | 规则 | 当前章节地址 |
| `{{java.encodeURI(key)}}` | `searchUrl` | 对关键词做 URL 编码（中文站几乎必用） |
| `{{java.base64Encode(...)}}` 等 | 规则 | 少量内置函数，版本差异大 |

中文关键词不编码，很多站会返回空结果或 400——这是"英文能搜、中文搜不到"的典型原因。

## 7. 类型陷阱清单

| 写法 | 结果 |
|---|---|
| `"header": {"User-Agent": "..."}` | ❌ 导入失败或 header 不生效（应为字符串化 JSON） |
| `"exploreUrl": [{"title":"x","url":"/y"}]` | ❌ 应为字符串：`"[{\"title\":\"x\",\"url\":\"/y\"}]"` |
| `"enabled": "true"` | ⚠️ 多数版本容忍，但建议用布尔 |
| `"bookSourceType": "0"` | ⚠️ 同上，建议用数字 |
| 规则对象里写 `"bookList": ["class.a"]` | ❌ 规则值必须是字符串 |
| 顶层是对象但文件里放了多个源 | ❌ 多源必须是数组 |

## 8. 版本差异提示

以下字段/行为在 Legado 各分支间不一致，交付时在 `bookSourceComment` 里注明目标版本：

- `loginUi` / `eventListener` / `payAction`：新版才有。
- 规则前缀的完整集合（`@css:` / `@XPath:` / `@json:` / `@js:` / `:` 正则）：老版本可能只支持部分。
- `{{ }}` 内是否允许表达式：新版支持，老版只支持简单变量。
- `nextTocUrl` 返回多值时的分隔符。

写源时**优先用最保守的写法**（CSS + `@text`/`@html`/`@href`），兼容面最大。
