/**
 * Admin page — service_key 认证的自助管理面板
 *
 * /admin            → Landing（创建新配置 + 输入 service_key 搜索）
 * /admin?service_key=xxx → Dashboard（查看配置、改 Key、删除）
 */
export function adminPage(): string {
  return /*html*/ `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>翻译代理 - 管理</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f5f5f5; color: #333; padding: 2rem; max-width: 640px; margin: 0 auto; }
  h1 { margin-bottom: .3rem; font-size: 1.4rem; }
  .nav { margin-bottom: 1.5rem; font-size: .85rem; }
  .nav a { color: #4a90d9; text-decoration: none; }
  .nav a:hover { text-decoration: underline; }
  h2 { margin-bottom: 0.8rem; font-size: 1.1rem; color: #555; }
  .card { background: #fff; border-radius: 8px; padding: 1.2rem; margin-bottom: 1.2rem; box-shadow: 0 1px 3px rgba(0,0,0,.1); }
  label { display: block; font-size: .85rem; color: #666; margin-bottom: .3rem; }
  input { width: 100%; padding: .5rem .6rem; border: 1px solid #ddd; border-radius: 4px; font-size: .9rem; margin-bottom: .8rem; }
  input:focus { outline: none; border-color: #4a90d9; }
  button { padding: .5rem 1rem; border: none; border-radius: 4px; font-size: .9rem; cursor: pointer; color: #fff; }
  .btn-primary { background: #4a90d9; }
  .btn-secondary { background: #6c757d; }
  .btn-warning { background: #e8a317; }
  .btn-danger { background: #dc3545; }
  button:hover { opacity: .85; }
  button:disabled { opacity: .5; cursor: not-allowed; }
  .hint { font-size: .75rem; color: #999; margin-top: -.5rem; margin-bottom: .6rem; }
  .provider-row { display: flex; gap: .6rem; margin-bottom: .8rem; }
  .provider-btn { flex: 1; padding: .5rem; border: 2px solid #ddd; border-radius: 6px; background: #fff; color: #555; font-size: .85rem; text-align: center; cursor: pointer; transition: all .15s; }
  .provider-btn.active { border-color: #4a90d9; color: #4a90d9; background: #f0f6ff; font-weight: 600; }
  .info-table { width: 100%; font-size: .9rem; }
  .info-table td { padding: .35rem 0; }
  .info-table td:first-child { color: #666; width: 100px; white-space: nowrap; }
  .info-table code { background: #f0f0f0; padding: .1rem .4rem; border-radius: 3px; font-size: .85rem; }
  .danger-zone { border-left: 3px solid #dc3545; }
  #result { margin-top: 1rem; padding: 1rem; background: #fafafa; border-radius: 6px; border: 1px solid #eee; white-space: pre-wrap; word-break: break-all; font-family: monospace; font-size: .85rem; display: none; min-height: 2rem; }
  #result.error { border-color: #dc3545; color: #dc3545; }
  #result.success { border-color: #28a745; color: #155724; }
</style>
</head>
<body>
<h1>翻译代理 - 管理</h1>
<div class="nav"><a href="/help">查看使用帮助</a></div>

<!-- ═══════ Landing 态 ═══════ -->
<div id="landing">
  <div class="card">
    <h2>管理已有配置</h2>
    <label for="searchKey">Service Key</label>
    <input id="searchKey" placeholder="输入 Service Key 进入管理面板" onkeydown="if(event.key==='Enter')goManage()">
    <button class="btn-secondary" onclick="goManage()">管理</button>
  </div>

  <div class="card">
    <h2>创建新配置</h2>
    <label for="domain">域名</label>
    <input id="domain" placeholder="example.com">

    <label>API 服务商</label>
    <div class="provider-row" id="createProviderRow">
      <div class="provider-btn active" data-provider="aihubmix" onclick="pickProvider(this)">AIHubMix</div>
      <div class="provider-btn" data-provider="openrouter" onclick="pickProvider(this)">OpenRouter</div>
    </div>

    <label for="upstreamKey">API Key</label>
    <input id="upstreamKey" placeholder="sk-..." oninput="autoDetectProvider()">
    <div class="hint">OpenRouter Key 包含 -or-，会自动识别服务商</div>

    <button class="btn-primary" onclick="doCreate()">创建</button>
  </div>
</div>

<!-- ═══════ Dashboard 态 ═══════ -->
<div id="dashboard" style="display:none">
  <div class="card">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.8rem">
      <h2 style="margin-bottom:0">配置信息</h2>
      <a href="/admin" style="font-size:.85rem;color:#4a90d9;text-decoration:none">&larr; 返回</a>
    </div>
    <div id="configInfo">加载中…</div>
  </div>

  <div id="dashActions" style="display:none">
  <div class="card">
    <h2>修改 API Key / 服务商</h2>
    <label>API 服务商</label>
    <div class="provider-row" id="dashProviderRow">
      <div class="provider-btn active" data-provider="aihubmix" onclick="pickDashProvider(this)">AIHubMix</div>
      <div class="provider-btn" data-provider="openrouter" onclick="pickDashProvider(this)">OpenRouter</div>
    </div>
    <label for="dashKey">新 API Key</label>
    <input id="dashKey" placeholder="sk-..." oninput="autoDetectDashProvider()">
    <div class="hint">OpenRouter Key 包含 -or-，会自动识别</div>
    <button class="btn-warning" onclick="saveKey()">验证并保存</button>
  </div>

  <div class="card danger-zone">
    <h2 style="color:#dc3545">危险操作</h2>
    <p style="font-size:.85rem;color:#666;margin-bottom:.8rem">删除后无法恢复，需重新创建配置。</p>
    <button class="btn-danger" onclick="doDelete()">删除此配置</button>
  </div>
  </div>
</div>

<div id="result"></div>

<script>
const $ = id => document.getElementById(id);
const resultEl = $('result');
const params = new URLSearchParams(location.search);
const serviceKey = params.get('service_key');

let createProvider = 'aihubmix';
let dashProvider = 'aihubmix';

// ── Utils ──
function escHtml(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function copyText(text) {
  navigator.clipboard.writeText(text).then(() => {
    showResult('已复制到剪贴板', true);
  }).catch(() => {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select(); document.execCommand('copy');
    document.body.removeChild(ta);
    showResult('已复制到剪贴板', true);
  });
}

function showResult(text, ok) {
  resultEl.style.display = 'block';
  resultEl.textContent = text;
  resultEl.className = ok ? 'success' : 'error';
}

async function apiPost(path, body) {
  const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { ok: res.ok, data: await res.json() };
}

async function apiGet(path) {
  const res = await fetch(path);
  return { ok: res.ok, data: await res.json() };
}

// ── Init ──
if (serviceKey) {
  $('landing').style.display = 'none';
  $('dashboard').style.display = 'block';
  loadConfig();
}

// ═══════ Landing ═══════

function goManage() {
  const key = $('searchKey').value.trim();
  if (!key) return showResult('请输入 Service Key', false);
  location.href = '/admin?service_key=' + encodeURIComponent(key);
}

function pickProvider(el) {
  el.parentElement.querySelectorAll('.provider-btn').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  createProvider = el.dataset.provider;
}

function autoDetectProvider() {
  const key = $('upstreamKey').value;
  const detected = key.includes('-or-') ? 'openrouter' : 'aihubmix';
  if (detected !== createProvider) {
    $('createProviderRow').querySelectorAll('.provider-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.provider === detected);
    });
    createProvider = detected;
  }
}

async function doCreate() {
  const domain = $('domain').value.trim();
  const upstreamKey = $('upstreamKey').value.trim();
  if (!domain || !upstreamKey) return showResult('请填写域名和 API Key', false);
  showResult('创建中…（正在验证 Key，可能需要几秒）', true);
  const { ok, data } = await apiPost('/admin/keys', { domain, upstreamKey, provider: createProvider });
  if (ok && data.serviceKey) {
    resultEl.style.display = 'block';
    resultEl.className = 'success';
    resultEl.innerHTML =
      '<div style="margin-bottom:.5rem">创建成功! 域名: <strong>' + escHtml(data.domain) + '</strong></div>' +
      '<div style="font-size:.8rem;color:#c0392b;margin-bottom:.3rem">Service Key（仅显示一次，请立即复制保存）:</div>' +
      '<div style="display:flex;align-items:center;gap:.5rem">' +
        '<code style="flex:1;padding:.4rem .6rem;background:#e8f5e9;border-radius:4px;word-break:break-all;font-size:.85rem">' + escHtml(data.serviceKey) + '</code>' +
        '<button class="btn-primary" onclick="copyText(\\'' + escHtml(data.serviceKey) + '\\')" style="white-space:nowrap;font-size:.8rem;padding:.4rem .8rem">复制</button>' +
      '</div>';
  } else {
    showResult(JSON.stringify(data, null, 2), ok);
  }
}

// ═══════ Dashboard ═══════

async function loadConfig() {
  const { ok, data } = await apiGet('/admin/config?service_key=' + encodeURIComponent(serviceKey));
  if (!ok) {
    $('configInfo').innerHTML = '<span style="color:#dc3545">' + escHtml(data.error || 'Service key not found') + '</span>';
    return;
  }
  if (data.upstreamUrl && data.upstreamUrl.includes('openrouter')) {
    dashProvider = 'openrouter';
    $('dashProviderRow').querySelectorAll('.provider-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.provider === 'openrouter');
    });
  }
  $('configInfo').innerHTML =
    '<table class="info-table">' +
    '<tr><td>域名</td><td><strong>' + escHtml(data.domain) + '</strong></td></tr>' +
    '<tr><td>API Key</td><td><code>' + escHtml(data.maskedUpstreamKey) + '</code></td></tr>' +
    '<tr><td>模型</td><td>' + escHtml(data.modelName || '默认') + '</td></tr>' +
    '<tr><td>服务商</td><td style="word-break:break-all;font-size:.8rem">' + escHtml(data.upstreamUrl || '') + '</td></tr>' +
    '<tr><td>创建时间</td><td>' + escHtml(data.createdAt) + '</td></tr>' +
    '</table>';
  $('dashActions').style.display = 'block';
}

function pickDashProvider(el) {
  el.parentElement.querySelectorAll('.provider-btn').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  dashProvider = el.dataset.provider;
}

function autoDetectDashProvider() {
  const key = $('dashKey').value;
  const detected = key.includes('-or-') ? 'openrouter' : 'aihubmix';
  if (detected !== dashProvider) {
    $('dashProviderRow').querySelectorAll('.provider-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.provider === detected);
    });
    dashProvider = detected;
  }
}

async function saveKey() {
  const upstreamKey = $('dashKey').value.trim();
  if (!upstreamKey) return showResult('请输入新 API Key', false);
  showResult('验证中…（可能需要几秒）', true);
  const { ok, data } = await apiPost('/admin/keys/update', { serviceKey, upstreamKey, provider: dashProvider });
  showResult(ok ? 'API Key 已更新' : (data.error || '更新失败'), ok);
  if (ok) { $('dashKey').value = ''; loadConfig(); }
}

async function doDelete() {
  if (!confirm('确定要删除此配置吗？\\n删除后无法恢复，需重新创建。')) return;
  showResult('删除中…', true);
  const { ok, data } = await apiPost('/admin/keys/delete', { serviceKey });
  if (ok) {
    showResult('已删除域名 ' + (data.domain || '') + ' 的配置', true);
    setTimeout(() => location.href = '/admin', 1500);
  } else {
    showResult(data.error || '删除失败', false);
  }
}
</script>
</body>
</html>`;
}
