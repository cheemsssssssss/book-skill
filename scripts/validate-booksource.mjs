#!/usr/bin/env node
/**
 * validate-booksource.mjs —— 书源 JSON 离线结构校验（零依赖）
 *
 * 用法：
 *   node scripts/validate-booksource.mjs <file.json|dir> [...]
 *   node scripts/validate-booksource.mjs examples/ --strict
 *
 * 退出码：0 无错误；1 有错误（--strict 下 warning 也算错误）；2 用法/读取失败
 *
 * 只做结构校验，不联网、不判断选择器是否真能选中元素。
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, basename } from "node:path";

const C = process.stdout.isTTY
  ? { r: "\x1b[31m", y: "\x1b[33m", g: "\x1b[32m", d: "\x1b[2m", b: "\x1b[1m", x: "\x1b[0m" }
  : { r: "", y: "", g: "", d: "", b: "", x: "" };

const TOP_KEYS = new Set([
  "bookSourceUrl", "bookSourceName", "bookSourceGroup", "bookSourceType",
  "bookSourceComment", "customOrder", "enabled", "enabledExplore",
  "enabledCookieJar", "header", "loginUrl", "loginUi", "loginCheckJs",
  "coverDecodeJs", "bookUrlPattern", "searchUrl", "exploreUrl", "ruleSearch",
  "ruleExplore", "ruleBookInfo", "ruleToc", "ruleContent", "concurrentRate",
  "weight", "lastUpdateTime", "respondTime", "eventListener", "jsLib",
]);

const RULE_KEYS = {
  ruleSearch: new Set(["checkKeyWord", "bookList", "name", "author", "intro", "kind",
    "lastChapter", "updateTime", "bookUrl", "coverUrl", "wordCount"]),
  ruleExplore: new Set(["checkKeyWord", "bookList", "name", "author", "intro", "kind",
    "lastChapter", "updateTime", "bookUrl", "coverUrl", "wordCount"]),
  ruleBookInfo: new Set(["init", "name", "author", "intro", "kind", "lastChapter",
    "updateTime", "coverUrl", "tocUrl", "wordCount", "canReName", "downloadUrls"]),
  ruleToc: new Set(["preUpdateJs", "chapterList", "chapterName", "chapterUrl", "formatJs",
    "isVolume", "isVip", "updateTime", "nextTocUrl"]),
  ruleContent: new Set(["content", "title", "nextContentUrl", "webJs", "sourceRegex",
    "replaceRegex", "imageStyle", "payAction"]),
};

const REQUIRED_RULE_FIELDS = {
  ruleSearch: ["bookList", "name", "bookUrl"],
  ruleToc: ["chapterList", "chapterName", "chapterUrl"],
};

const PLACEHOLDERS = new Set([
  "key", "page", "baseUrl", "bookUrl", "chapterUrl", "book", "chapter",
  "book.name", "book.author", "book.kind", "chapter.name", "chapter.url",
]);

const MAX_BYTES = 5 * 1024 * 1024;

/* ---------------- 参数 ---------------- */

const argv = process.argv.slice(2);
const strict = argv.includes("--strict");
const targets = argv.filter((a) => !a.startsWith("--"));

if (targets.length === 0) {
  console.error("用法: node scripts/validate-booksource.mjs <file.json|dir> [...] [--strict]");
  process.exit(2);
}

/* ---------------- 收集文件 ---------------- */

const files = [];
for (const t of targets) {
  let st;
  try {
    st = statSync(t);
  } catch {
    console.error(`${C.r}无法访问:${C.x} ${t}`);
    process.exit(2);
  }
  if (st.isDirectory()) {
    for (const name of readdirSync(t).sort()) {
      if (name.toLowerCase().endsWith(".json")) files.push(join(t, name));
    }
  } else {
    files.push(t);
  }
}

if (files.length === 0) {
  console.error("没有找到 .json 文件");
  process.exit(2);
}

/* ---------------- 校验工具 ---------------- */

const issues = []; // {level, file, source, msg}
function err(file, source, msg) { issues.push({ level: "error", file, source, msg }); }
function warn(file, source, msg) { issues.push({ level: "warn", file, source, msg }); }

/** 提取 {{...}} 并检查合法性 */
function checkPlaceholders(file, label, value, where) {
  const re = /\{\{([^}]*)\}\}/g;
  let m;
  while ((m = re.exec(value)) !== null) {
    const inner = m[1].trim();
    if (inner === "") {
      err(file, label, `${where} 里有空的占位符 {{}}`);
      continue;
    }
    if (inner.startsWith("java.")) continue;              // 内置函数调用
    if (/^[A-Za-z_$][\w$.]*\s*[-+*/]\s*\d+$/.test(inner)) continue; // {{page - 1}} 这类简单表达式
    if (PLACEHOLDERS.has(inner)) continue;
    warn(file, label, `${where} 里出现未知占位符 {{${inner}}}（拼写错误会导致取到空值）`);
  }
}

/** 规则字符串的语法体检 */
function checkRuleString(file, label, field, value, where) {
  if (typeof value !== "string") {
    err(file, label, `${where}.${field} 必须是字符串，实际是 ${Array.isArray(value) ? "array" : typeof value}`);
    return;
  }
  if (value.trim() === "") {
    warn(file, label, `${where}.${field} 是空字符串`);
    return;
  }
  if (/^[ \t]+|[ \t]+$/.test(value)) {
    warn(file, label, `${where}.${field} 首尾有空格/制表符（从 DevTools 复制时常见）`);
  }

  // ## 必须成对（##正则## 或 ##正则##替换）
  const hashes = (value.match(/(?<!\\)##/g) || []).length;
  // replaceRegex 允许 "##正则" 这种仅删除的形式，不要求成对
  if (field === "replaceRegex") {
    if (hashes === 0) warn(file, label, `${where}.replaceRegex 没有 ## 分隔符，不会生效`);
  } else if (hashes > 0 && hashes % 2 !== 0) {
    err(file, label, `${where}.${field} 的 ## 数量为奇数（${hashes}），替换语法不完整（应为 ##正则##替换）`);
  }

  // 括号配平（粗略，忽略字符类内部）
  const round = (value.match(/\(/g) || []).length - (value.match(/\)/g) || []).length;
  if (round !== 0) {
    warn(file, label, `${where}.${field} 圆括号不配平（差 ${round} 个），若是正则请检查转义`);
  }

  checkPlaceholders(file, label, value, `${where}.${field}`);

  // 常见误写
  if (/^@?(css|CSS):/.test(value)) {
    warn(file, label, `${where}.${field} 用了 @css: 前缀，部分版本不支持，建议直接写选择器`);
  }
  if (/\s@(text|html|href|src)\b/.test(value)) {
    warn(file, label, `${where}.${field} 的 @ 属性前有空格，会导致解析失败`);
  }
}

/* ---------------- 单个书源 ---------------- */

function validateSource(file, src, idx) {
  const label = (src && typeof src === "object" && src.bookSourceName) || `#${idx}`;

  if (src === null || typeof src !== "object" || Array.isArray(src)) {
    err(file, label, `第 ${idx} 项不是对象`);
    return null;
  }

  /* --- 顶层必填 --- */
  for (const k of ["bookSourceUrl", "bookSourceName"]) {
    if (!src[k]) err(file, label, `缺少必填字段 ${k}`);
  }

  /* --- bookSourceUrl --- */
  if (typeof src.bookSourceUrl === "string") {
    const u = src.bookSourceUrl;
    if (!/^https?:\/\//i.test(u)) err(file, label, `bookSourceUrl 必须以 http(s):// 开头：${u}`);
    if (u.endsWith("/")) warn(file, label, `bookSourceUrl 结尾多了斜杠：${u}`);
    if (/\s/.test(u)) err(file, label, `bookSourceUrl 含空白字符`);
    try {
      const p = new URL(u);
      if (p.pathname !== "/" && p.pathname !== "") {
        warn(file, label, `bookSourceUrl 含路径 "${p.pathname}"，建议只保留根域（它是书源唯一标识）`);
      }
      if (p.search) warn(file, label, `bookSourceUrl 含查询串，建议去掉`);
    } catch {
      err(file, label, `bookSourceUrl 不是合法 URL：${u}`);
    }
  }

  /* --- 枚举与布尔 --- */
  if (src.bookSourceType !== undefined && ![0, 1, 2, 3].includes(src.bookSourceType)) {
    err(file, label, `bookSourceType 必须是 0/1/2/3，实际是 ${JSON.stringify(src.bookSourceType)}`);
  }
  for (const k of ["enabled", "enabledExplore", "enabledCookieJar", "eventListener"]) {
    if (src[k] !== undefined && typeof src[k] !== "boolean") {
      warn(file, label, `${k} 建议用布尔值，实际是 ${typeof src[k]}`);
    }
  }

  /* --- header 必须是字符串化 JSON --- */
  if (src.header !== undefined) {
    if (typeof src.header === "object") {
      err(file, label, `header 必须是字符串形式的 JSON，不能是对象（导入会失败或 header 不生效）`);
    } else if (typeof src.header === "string" && src.header.trim() !== "") {
      try {
        const h = JSON.parse(src.header);
        if (typeof h !== "object" || Array.isArray(h)) {
          err(file, label, `header 解析后不是对象`);
        } else if (!Object.keys(h).some((k) => k.toLowerCase() === "user-agent")) {
          warn(file, label, `header 里没有 User-Agent，很多站会直接 403`);
        }
      } catch (e) {
        err(file, label, `header 不是合法 JSON：${e.message}`);
      }
    }
  }

  /* --- searchUrl / exploreUrl --- */
  const hasSearch = typeof src.searchUrl === "string" && src.searchUrl.trim() !== "";
  const hasExplore = typeof src.exploreUrl === "string" && src.exploreUrl.trim() !== "";
  if (!hasSearch && !hasExplore) {
    err(file, label, `searchUrl 与 exploreUrl 至少要有一个`);
  }
  if (hasSearch) {
    if (!src.searchUrl.includes("{{key}}") && !/key/.test(src.searchUrl)) {
      err(file, label, `searchUrl 里没有 {{key}}，搜索会永远返回同一页`);
    }
    if (/\{\{\s*key\s*\}\}/.test(src.searchUrl) && /[\u4e00-\u9fa5]/.test(src.searchUrl) === false) {
      // 仅提示：中文关键词未编码是高频故障
      warn(file, label, `searchUrl 直接用 {{key}}；中文关键词多数站需要 {{java.encodeURI(key)}}`);
    }
    checkPlaceholders(file, label, src.searchUrl, "searchUrl");
  }
  if (hasExplore) {
    if (typeof src.exploreUrl !== "string") {
      err(file, label, `exploreUrl 必须是字符串形式的 JSON 数组`);
    } else {
      try {
        const arr = JSON.parse(src.exploreUrl);
        if (!Array.isArray(arr)) {
          err(file, label, `exploreUrl 解析后不是数组`);
        } else {
          arr.forEach((it, i) => {
            if (!it || typeof it !== "object") err(file, label, `exploreUrl[${i}] 不是对象`);
            else {
              if (!it.title) warn(file, label, `exploreUrl[${i}] 缺 title`);
              if (!it.url) err(file, label, `exploreUrl[${i}] 缺 url`);
              else checkPlaceholders(file, label, String(it.url), `exploreUrl[${i}].url`);
            }
          });
        }
      } catch (e) {
        err(file, label, `exploreUrl 不是合法 JSON：${e.message}`);
      }
    }
  }

  /* --- bookUrlPattern --- */
  if (src.bookUrlPattern) {
    try {
      new RegExp(src.bookUrlPattern);
    } catch (e) {
      err(file, label, `bookUrlPattern 不是合法正则：${e.message}`);
    }
  }

  /* --- 规则对象 --- */
  for (const [key, allowed] of Object.entries(RULE_KEYS)) {
    const rule = src[key];
    const required = REQUIRED_RULE_FIELDS[key];

    if (rule === undefined || rule === null) {
      if (key === "ruleSearch" || key === "ruleToc" || key === "ruleContent" || key === "ruleBookInfo") {
        // 下面单独判断，避免重复报错
      }
      continue;
    }
    if (typeof rule !== "object" || Array.isArray(rule)) {
      err(file, label, `${key} 必须是对象`);
      continue;
    }

    for (const [f, v] of Object.entries(rule)) {
      if (!allowed.has(f)) {
        warn(file, label, `${key}.${f} 不是该段的标准字段（拼写错误会导致规则不生效）`);
      }
      checkRuleString(file, label, f, v, key);
    }

    if (required) {
      for (const f of required) {
        if (!rule[f]) err(file, label, `${key} 缺少必填字段 ${f}`);
      }
    }
    if (key === "ruleToc" && rule.chapterList && /@(text|html)\s*$/.test(rule.chapterList)) {
      err(file, label, `ruleToc.chapterList 结尾带了 @text/@html，会退化成单值（目录只出一章）`);
    }
    if (key === "ruleSearch" && rule.bookList && /@(text|html)\s*$/.test(rule.bookList)) {
      err(file, label, `ruleSearch.bookList 结尾带了 @text/@html，会退化成单值（只出一本书）`);
    }
  }

  /* --- 四段链路完整性 --- */
  if (!src.ruleSearch) err(file, label, `缺少 ruleSearch（搜索结果无法解析）`);
  if (!src.ruleBookInfo) err(file, label, `缺少 ruleBookInfo（详情页无法解析）`);
  if (!src.ruleToc) err(file, label, `缺少 ruleToc（目录无法解析）`);
  if (!src.ruleContent) err(file, label, `缺少 ruleContent（正文无法解析）`);
  if (src.ruleContent && typeof src.ruleContent === "object") {
    const rc = src.ruleContent;
    if (!rc.content && !rc.sourceRegex && !rc.webJs) {
      err(file, label, `ruleContent 里 content / sourceRegex / webJs 至少要有一个`);
    }
  }

  /* --- 未知顶层字段 --- */
  for (const k of Object.keys(src)) {
    if (!TOP_KEYS.has(k)) warn(file, label, `未知顶层字段 ${k}（可能是拼写错误，或该版本不支持）`);
  }

  /* --- 运维建议 --- */
  if (!src.bookSourceComment) {
    warn(file, label, `缺 bookSourceComment：建议写「域名 + 验证日期 + 限制」`);
  } else if (!/\d{4}-\d{2}-\d{2}/.test(src.bookSourceComment)) {
    warn(file, label, `bookSourceComment 里没有验证日期（YYYY-MM-DD），无法判断新鲜度`);
  }
  if (!src.concurrentRate) {
    warn(file, label, `没设 concurrentRate，抓取过快容易被封 IP`);
  }

  return typeof src.bookSourceUrl === "string" ? src.bookSourceUrl : null;
}

/* ---------------- 主流程 ---------------- */

const seen = new Map();
let totalSources = 0;

for (const file of files) {
  let raw;
  try {
    const st = statSync(file);
    if (st.size > MAX_BYTES) {
      err(file, "-", `文件过大（${(st.size / 1048576).toFixed(1)} MB）`);
      continue;
    }
    raw = readFileSync(file, "utf8");
  } catch (e) {
    err(file, "-", `读取失败：${e.message}`);
    continue;
  }

  // BOM
  if (raw.charCodeAt(0) === 0xfeff) {
    warn(file, "-", `文件带 BOM，部分 App 导入会失败，建议去掉`);
    raw = raw.slice(1);
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    err(file, "-", `JSON 解析失败：${e.message}`);
    continue;
  }

  const list = Array.isArray(data) ? data : [data];
  if (list.length === 0) warn(file, "-", `空数组`);

  list.forEach((src, i) => {
    totalSources++;
    const url = validateSource(file, src, i);
    if (url) {
      if (seen.has(url)) {
        err(file, src.bookSourceName || `#${i}`,
          `bookSourceUrl 与 ${basename(seen.get(url))} 里的书源重复：${url}`);
      } else {
        seen.set(url, file);
      }
    }
  });
}

/* ---------------- 输出 ---------------- */

const errors = issues.filter((i) => i.level === "error");
const warns = issues.filter((i) => i.level === "warn");

console.log(`${C.b}书源结构校验${C.x}  ${files.length} 个文件 / ${totalSources} 个书源\n`);

for (const i of issues) {
  const tag = i.level === "error" ? `${C.r}✗ error${C.x}` : `${C.y}! warn ${C.x}`;
  console.log(`  ${tag}  ${C.d}${basename(i.file)}${C.x}  [${i.source}]  ${i.msg}`);
}

if (issues.length === 0) {
  console.log(`  ${C.g}✓ 未发现问题${C.x}`);
}

console.log(
  `\n${C.b}合计${C.x}  ${errors.length ? C.r : C.g}${errors.length} 个错误${C.x}  ` +
  `${warns.length ? C.y : C.g}${warns.length} 个警告${C.x}`
);

if (errors.length > 0) process.exit(1);
if (strict && warns.length > 0) {
  console.log(`${C.y}--strict：警告视为失败${C.x}`);
  process.exit(1);
}
process.exit(0);
