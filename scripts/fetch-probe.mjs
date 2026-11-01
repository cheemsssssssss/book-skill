#!/usr/bin/env node
/**
 * fetch-probe.mjs —— 书源侦察工具（零依赖，Node 18+）
 *
 * 抓一次真实响应，报告：状态码 / Content-Type / 字节数 / 检测到的编码 / 前 N 字符预览，
 * 可选存盘供后续用 grep 反复分析（调试期不要反复打线上站）。
 *
 * 用法：
 *   node scripts/fetch-probe.mjs <url>
 *   node scripts/fetch-probe.mjs <url> --save /tmp/p.html
 *   node scripts/fetch-probe.mjs <url> --header "Referer: https://x.com/" --header "Cookie: a=1"
 *   node scripts/fetch-probe.mjs <url> --preview 800 --timeout 15000
 *   node scripts/fetch-probe.mjs <url> --head          # 只发 HEAD
 *   node scripts/fetch-probe.mjs <url> --json          # 若响应是 JSON，格式化输出前 2KB
 */

const UA =
  "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/120.0.0.0 Mobile Safari/537.36";

const argv = process.argv.slice(2);
if (argv.length === 0 || argv[0].startsWith("--")) {
  console.error("用法: node scripts/fetch-probe.mjs <url> [--save path] [--header 'K: V'] [--preview N] [--timeout ms] [--head] [--json]");
  process.exit(2);
}

const url = argv[0];
const opts = { save: null, headers: {}, preview: 400, timeout: 20000, head: false, json: false };

for (let i = 1; i < argv.length; i++) {
  const a = argv[i];
  if (a === "--save") opts.save = argv[++i];
  else if (a === "--header") {
    const h = argv[++i] || "";
    const idx = h.indexOf(":");
    if (idx > 0) opts.headers[h.slice(0, idx).trim()] = h.slice(idx + 1).trim();
  } else if (a === "--preview") opts.preview = Number(argv[++i]) || 400;
  else if (a === "--timeout") opts.timeout = Number(argv[++i]) || 20000;
  else if (a === "--head") opts.head = true;
  else if (a === "--json") opts.json = true;
  else console.error(`忽略未知参数: ${a}`);
}

const ac = new AbortController();
const timer = setTimeout(() => ac.abort(), opts.timeout);

function line(k, v) {
  console.log(`  ${k.padEnd(14)} ${v}`);
}

function detectCharset(buf, contentType) {
  const fromHeader = /charset=([\w-]+)/i.exec(contentType || "");
  if (fromHeader) return fromHeader[1].toLowerCase();
  const head = buf.subarray(0, 4096).toString("latin1");
  const fromMeta =
    /<meta[^>]+charset=["']?([\w-]+)/i.exec(head) ||
    /content=["'][^"']*charset=([\w-]+)/i.exec(head);
  return fromMeta ? fromMeta[1].toLowerCase() : "utf-8";
}

function decode(buf, charset) {
  try {
    return new TextDecoder(charset, { fatal: false }).decode(buf);
  } catch {
    return new TextDecoder("utf-8", { fatal: false }).decode(buf);
  }
}

function looksBinary(buf) {
  const n = Math.min(buf.length, 512);
  for (let i = 0; i < n; i++) if (buf[i] === 0) return true;
  return false;
}

try {
  const started = Date.now();
  const res = await fetch(url, {
    method: opts.head ? "HEAD" : "GET",
    headers: {
      "User-Agent": UA,
      Accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
      "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
      ...opts.headers,
    },
    redirect: "follow",
    signal: ac.signal,
  });
  const buf = Buffer.from(await res.arrayBuffer());
  const ms = Date.now() - started;

  const contentType = res.headers.get("content-type") || "";
  const charset = detectCharset(buf, contentType);
  const binary = looksBinary(buf);

  console.log("");
  line("URL", url);
  line("状态", `${res.status} ${res.statusText}${res.redirected ? `  (重定向到 ${res.url})` : ""}`);
  line("耗时", `${ms} ms`);
  line("Content-Type", contentType || "(无)");
  line("编码(检测)", charset);
  line("字节数", `${buf.length}  (${(buf.length / 1024).toFixed(1)} KB)`);
  line("二进制", binary ? "是（图片/文件，不是 HTML）" : "否");
  line("Set-Cookie", res.headers.get("set-cookie") ? "有（可能需要 enabledCookieJar）" : "无");

  // 反爬特征
  const hint = [];
  if ([403, 429, 503, 520, 521, 522, 524].includes(res.status)) {
    hint.push("状态码异常，疑似反爬/限速 → 先补 UA/Referer/Cookie，仍失败再降速");
  }
  if (buf.length < 3000 && /text\/html/.test(contentType)) {
    hint.push("HTML 很短（<3KB）：可能是 JS 渲染的空壳，也可能是拦截页 —— 看下面预览里有没有目标内容");
  }
  if (hint.length) {
    console.log("");
    for (const h of hint) console.log(`  ⚠ ${h}`);
  }

  if (opts.head || binary) {
    if (opts.save) console.log(`\n  未保存（HEAD 或二进制响应）`);
    process.exit(res.ok ? 0 : 1);
  }

  let text = decode(buf, charset);

  // Cloudflare 拦截页的真实特征（仅有 cf-ray 头不算，很多正常站也在 CF 后面）
  if (/Just a moment\.\.\.|cf-browser-verification|Attention Required|Enable JavaScript and cookies to continue/i.test(text)) {
    console.log(`  ⚠ 响应是 Cloudflare 挑战页（不是真实内容）→ 补 header/Cookie 后仍失败建议放弃\n`);
  }

  if (opts.json) {
    try {
      text = JSON.stringify(JSON.parse(text), null, 2);
      line("JSON", "解析成功，已格式化");
    } catch {
      line("JSON", "解析失败（不是合法 JSON）");
    }
  }

  // 静态/动态判定辅助：统计 script 与可见文本量
  const scriptBytes = (text.match(/<script[\s\S]*?<\/script>/gi) || []).join("").length;
  const textOnly = text.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  line("可见文本量", `${textOnly.length} 字符`);
  line("script 占比", `${text.length ? ((scriptBytes / text.length) * 100).toFixed(0) : 0}%`);
  if (textOnly.length < 200 && scriptBytes > 1000) {
    console.log(`  ⚠ 可见文本极少而 script 很多 → 疑似 JS 渲染（C 类），去 Network 找接口`);
  }

  console.log(`\n  ── 预览（前 ${opts.preview} 字符）${"─".repeat(20)}`);
  console.log(text.slice(0, opts.preview).replace(/\n{3,}/g, "\n\n"));
  console.log(`  ${"─".repeat(44)}`);

  if (opts.save) {
    const { writeFileSync } = await import("node:fs");
    writeFileSync(opts.save, text, "utf8");
    console.log(`\n  已保存（UTF-8 转码）: ${opts.save}`);
    console.log(`  提示: grep -o 'class="[^"]*"' ${opts.save} | sort | uniq -c | sort -rn | head`);
  }

  process.exit(res.ok ? 0 : 1);
} catch (e) {
  clearTimeout(timer);
  if (e.name === "AbortError") {
    console.error(`\n  ✗ 超时（${opts.timeout} ms）：${url}`);
  } else {
    console.error(`\n  ✗ 请求失败：${e.message}`);
    console.error(`    常见原因：DNS 解析失败 / TLS 证书问题 / 需要代理 / 站点拒绝该 UA`);
  }
  process.exit(1);
} finally {
  clearTimeout(timer);
}
