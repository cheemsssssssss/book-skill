# 示例书源

三个**模板**，用来演示不同站点类型下规则该怎么写。它们不是可直接使用的线上书源：

- 域名统一用 `example.com`（IANA 保留域名），不会指向任何真实站点；
- 选择器按常见站点结构编写，**未对任何真实站点验证**；
- 结构本身通过 `scripts/validate-booksource.mjs --strict` 校验，可以放心当骨架改。

| 文件 | 对应类型 | 演示重点 |
|---|---|---|
| `01-static-html.json` | A 静态 HTML | 完整四段链路、`exploreUrl` 分类、目录分页、正文分页、`##` 清洗、`\|\|` 兜底 |
| `02-json-api.json` | B 接口型 | JSONPath 相对路径、`init`/`@js` 拼详情地址、接口 header、`isVip` 标记 |
| `03-search-only.json` | E 仅搜索 | `enabledExplore: false`、`sourceRegex` 从脏 HTML 抠正文、`checkKeyWord` 防劫持 |

## 怎么用

1. 复制一份到仓库外，例如 `cp examples/01-static-html.json ~/my-source.json`。
2. 把 `bookSourceUrl` / `searchUrl` / 选择器换成目标站的真实值。
3. 每改一个字段跑一次：

   ```bash
   node scripts/validate-booksource.mjs ~/my-source.json --strict
   ```

4. 结构没问题后，导入 App 用「调试」逐字段验证（结构校验不能替代真机验证）。

## 改造顺序建议

先 `ruleContent`（正文页结构最简单，能最快确认抓得到内容）→ 再 `ruleToc` → 再 `ruleBookInfo` → 最后 `ruleSearch`。

反过来的话，搜索一失败你就不知道是搜索规则错了，还是整站根本抓不到。
