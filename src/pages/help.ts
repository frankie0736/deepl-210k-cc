/**
 * Help page — 面向 WordPress 站长的使用文档
 */
export function helpPage(host: string): string {
  return /*html*/ `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Translation Proxy - 使用帮助</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f8f9fa; color: #333; line-height: 1.7; }
  .container { max-width: 720px; margin: 0 auto; padding: 2rem 1.5rem; }
  h1 { font-size: 1.6rem; margin-bottom: .5rem; }
  .subtitle { color: #666; font-size: .95rem; margin-bottom: 2rem; }
  h2 { font-size: 1.2rem; margin: 2rem 0 .8rem; padding-bottom: .4rem; border-bottom: 2px solid #e9ecef; }
  h3 { font-size: 1rem; margin: 1.2rem 0 .5rem; }
  p { margin-bottom: .8rem; }
  a { color: #4a90d9; text-decoration: none; }
  a:hover { text-decoration: underline; }
  ol, ul { padding-left: 1.5rem; margin-bottom: 1rem; }
  li { margin-bottom: .4rem; }
  code { background: #f1f3f5; padding: .15rem .4rem; border-radius: 3px; font-size: .88rem; font-family: "SF Mono", Monaco, Consolas, monospace; }
  pre { background: #282c34; color: #abb2bf; padding: 1rem; border-radius: 6px; overflow-x: auto; margin-bottom: 1rem; font-size: .85rem; line-height: 1.5; }
  pre code { background: none; padding: 0; color: inherit; }
  .step { background: #fff; border-radius: 8px; padding: 1.2rem 1.4rem; margin-bottom: 1rem; box-shadow: 0 1px 3px rgba(0,0,0,.08); }
  .step-num { display: inline-block; background: #4a90d9; color: #fff; width: 1.6rem; height: 1.6rem; border-radius: 50%; text-align: center; line-height: 1.6rem; font-size: .85rem; font-weight: 600; margin-right: .5rem; }
  .warn { background: #fff3cd; border-left: 4px solid #ffc107; padding: .8rem 1rem; border-radius: 0 6px 6px 0; margin-bottom: 1rem; font-size: .9rem; }
  .info { background: #d1ecf1; border-left: 4px solid #17a2b8; padding: .8rem 1rem; border-radius: 0 6px 6px 0; margin-bottom: 1rem; font-size: .9rem; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 1rem; font-size: .9rem; }
  th { background: #f1f3f5; text-align: left; padding: .5rem .8rem; border-bottom: 2px solid #dee2e6; }
  td { padding: .5rem .8rem; border-bottom: 1px solid #eee; }
  .lang-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: .3rem .8rem; font-size: .88rem; margin-bottom: 1rem; }
  footer { text-align: center; color: #999; font-size: .82rem; margin-top: 3rem; padding-top: 1.5rem; border-top: 1px solid #eee; }
</style>
</head>
<body>
<div class="container">

<h1>Translation Proxy 使用帮助</h1>
<p class="subtitle">基于 AI 大模型的 DeepL 兼容翻译代理 — 让 WordPress 多语言翻译更便宜、支持更多语言</p>

<h2>它是什么？</h2>
<p>这是一个 <strong>DeepL API 兼容</strong>的翻译代理服务。它接收 TranslatePress（或其他 DeepL 客户端）发来的翻译请求，转发给 AI 大模型（DeepSeek）完成翻译，并返回 DeepL 格式的响应。</p>
<p>和直接使用 DeepL 相比：</p>
<ul>
  <li><strong>更便宜</strong> — 使用你自己的 API Key（AIHubMix / OpenRouter），按 token 计费</li>
  <li><strong>更多语言</strong> — 支持 60+ 种语言，包括 DeepL 不支持的阿拉伯语、印地语、泰语、越南语等</li>
  <li><strong>翻译缓存</strong> — 相同内容只翻译一次，后续请求直接返回缓存</li>
</ul>

<h2>快速上手（3 步）</h2>

<div class="step">
  <h3><span class="step-num">1</span>获取 Service Key</h3>
  <p>打开 <a href="/admin" target="_blank">管理页面 (/admin)</a>，在"创建新配置"中填写：</p>
  <ul>
    <li><strong>域名</strong> — 你的网站域名，如 <code>example.com</code></li>
    <li><strong>API 服务商</strong> — 选择 AIHubMix 或 OpenRouter</li>
    <li><strong>API Key</strong> — 对应服务商的 API Key</li>
  </ul>
  <p>点击 <strong>创建</strong>，系统会验证你的 Key 是否有效，成功后返回一个 <code>Service Key</code>。</p>
  <div class="warn">Service Key 仅显示一次，请立即复制保存！它是你管理配置和调用翻译 API 的唯一凭证。</div>
</div>

<div class="step">
  <h3><span class="step-num">2</span>配置 WordPress</h3>
  <p>在 WordPress 的 <code>functions.php</code> 或自定义插件中，添加以下代码将 DeepL 请求重定向到本服务：</p>
  <pre><code>add_filter('pre_http_request', function($preempt, $args, $url) {
    if (strpos($url, 'api-free.deepl.com') !== false
        || strpos($url, 'api.deepl.com') !== false) {
        $new_url = str_replace(
            ['api-free.deepl.com', 'api.deepl.com'],
            '${host}',
            $url
        );
        return wp_remote_request($new_url, $args);
    }
    return $preempt;
}, 10, 3);</code></pre>
  <p>直接复制粘贴即可，域名已自动填入当前服务地址。</p>
</div>

<div class="step">
  <h3><span class="step-num">3</span>配置 TranslatePress</h3>
  <p>进入 WordPress 后台 → <strong>设置 → TranslatePress → 自动翻译</strong>：</p>
  <ol>
    <li>翻译引擎选择 <strong>DeepL</strong></li>
    <li>API 类型选 <strong>Free</strong> 或 <strong>Pro</strong>（都行，因为请求会被重定向）</li>
    <li>在 API Key 栏填入第 1 步获得的 <code>Service Key</code></li>
    <li>保存后，如果显示 "API key is valid"，说明配置成功</li>
  </ol>
  <div class="info">配置完成后，TranslatePress 翻译页面时会自动调用本服务。首次翻译会稍慢（需调用 AI），后续同内容直接走缓存。</div>
</div>

<h2>管理你的 Key</h2>

<p>所有管理操作都在 <a href="/admin" target="_blank">管理页面 (/admin)</a> 进行，<strong>Service Key 是唯一凭证</strong>：</p>

<table>
  <tr><th>操作</th><th>需要什么</th><th>说明</th></tr>
  <tr><td><strong>创建</strong></td><td>域名 + API Key + 服务商</td><td>每个域名只能创建一个，Service Key 仅显示一次</td></tr>
  <tr><td><strong>管理</strong></td><td>Service Key</td><td>查看配置、更换 API Key / 服务商、删除配置</td></tr>
  <tr><td><strong>更换 Key</strong></td><td>Service Key + 新 API Key</td><td>支持切换服务商（AIHubMix / OpenRouter）</td></tr>
  <tr><td><strong>删除</strong></td><td>Service Key</td><td>删除后无法恢复，需重新创建</td></tr>
</table>

<h2>支持的语言</h2>
<p>因为后端使用 AI 大模型，支持的语言远超 DeepL 原生。以下是已声明支持的语言：</p>
<div class="lang-grid">
  <span>🇬🇧 English</span>
  <span>🇨🇳 中文 (简/繁)</span>
  <span>🇪🇸 Espa\u00f1ol</span>
  <span>🇫🇷 Fran\u00e7ais</span>
  <span>🇩🇪 Deutsch</span>
  <span>🇮🇹 Italiano</span>
  <span>🇵🇹 Portugu\u00eas</span>
  <span>🇷🇺 Русский</span>
  <span>🇯🇵 日本語</span>
  <span>🇰🇷 한국어</span>
  <span>🇸🇦 العربية</span>
  <span>🇮🇳 हिन्दी</span>
  <span>🇹🇭 ไทย</span>
  <span>🇻🇳 Tiếng Việt</span>
  <span>🇮🇩 Indonesia</span>
  <span>🇹🇷 T\u00fcrk\u00e7e</span>
  <span>🇵🇱 Polski</span>
  <span>🇳🇱 Nederlands</span>
  <span>🇸🇪 Svenska</span>
  <span>🇺🇦 Українська</span>
  <span>🇷🇴 Rom\u00e2n\u0103</span>
  <span>🇨🇿 \u010ce\u0161tina</span>
  <span>🇭🇺 Magyar</span>
  <span>🇬🇷 Ελληνικά</span>
  <span>🇧🇬 Български</span>
  <span>🇷🇸 Srpski</span>
  <span>🇭🇷 Hrvatski</span>
  <span>🇮🇷 فارسی</span>
  <span>🇵🇰 اردو</span>
  <span>🇵🇭 Tagalog</span>
  <span>…还有更多</span>
</div>

<h2>常见问题</h2>

<h3>TranslatePress 显示 "Invalid API Key"？</h3>
<p>检查两点：</p>
<ol>
  <li><code>pre_http_request</code> filter 是否生效 — 请求必须发到本服务，而不是 DeepL 官方</li>
  <li>填的是 <strong>Service Key</strong>（UUID 格式，<code>:fx</code> 结尾），不是 AIHubMix Key</li>
</ol>

<h3>翻译很慢？</h3>
<p>首次翻译需要调用 AI 模型，每段文本约 1-3 秒。TranslatePress 每次会批量翻译多段，所以首次加载可能较慢。<strong>后续相同内容直接走缓存，速度很快。</strong></p>

<h3>更换 API Key 或切换服务商怎么办？</h3>
<p>在 <a href="/admin" target="_blank">管理页面</a> 输入 Service Key 进入管理面板，在"修改 API Key / 服务商"区域输入新 Key 即可。支持 AIHubMix 和 OpenRouter 互切。</p>

<h3>忘记了 Service Key？</h3>
<p>Service Key 仅在创建时显示一次，无法找回。如果遗失，需要删除旧配置后重新创建（需联系管理员）。</p>

<footer>Translation Proxy &mdash; DeepL-compatible API powered by LLM</footer>

</div>
</body>
</html>`;
}
