# DeepL Translation Proxy

基于 Cloudflare Workers + Hono 的 **DeepL API 兼容**翻译代理，使用 LLM（DeepSeek 等）作为翻译后端。

替代 DeepL 官方 API，让 TranslatePress 等 DeepL 客户端用上更便宜、支持更多语言的 AI 翻译。

## 特性

- **DeepL API 兼容** — 完全兼容 `/v2/translate`、`/v2/usage`、`/v2/languages` 接口
- **自助管理** — Web 面板创建/管理域名配置，无需改代码
- **翻译缓存** — KV 缓存翻译结果（30 天 TTL），相同内容只翻译一次
- **批量翻译** — Numbered JSON 方案，多段文本 1 次 API 调用完成
- **60+ 语言** — 支持阿拉伯语、印地语、泰语等 DeepL 不支持的语言
- **多服务商** — 支持 AIHubMix、OpenRouter，可扩展

## 快速开始

### 1. 安装依赖

```bash
bun install
```

### 2. 配置 Cloudflare Workers

复制配置模板并填入你的 Cloudflare 信息：

```bash
cp wrangler.example.jsonc wrangler.jsonc
```

编辑 `wrangler.jsonc`，填入：
- `account_id` — Cloudflare Dashboard → 右侧边栏 → Account ID
- KV namespace ID — 运行以下命令创建：

```bash
# 创建 KV 命名空间
wrangler kv namespace create TRANSLATION_CACHE
wrangler kv namespace create TRANSLATION_CACHE --preview
```

将返回的 ID 填入 `wrangler.jsonc` 的 `id` 和 `preview_id`。

### 3. 本地开发

创建 `.dev.vars` 文件（已在 `.gitignore` 中）：

```bash
# .dev.vars 不需要额外配置
# 域名和 API Key 通过 /admin 面板管理
```

```bash
bun run dev
```

服务在 `http://localhost:8787` 启动。

### 4. 部署

```bash
bun run deploy
```

### 5. 配置域名和 API Key

访问 `https://your-worker.workers.dev/admin`，创建新配置：

1. 填写你的网站域名
2. 选择 API 服务商（AIHubMix / OpenRouter）
3. 输入对应的 API Key
4. 保存返回的 **Service Key**（仅显示一次）

### 6. 在 TranslatePress 中使用

在 WordPress 的 `functions.php` 中添加请求重定向：

```php
add_filter('pre_http_request', function($preempt, $args, $url) {
    if (strpos($url, 'api-free.deepl.com') !== false
        || strpos($url, 'api.deepl.com') !== false) {
        $new_url = str_replace(
            ['api-free.deepl.com', 'api.deepl.com'],
            'your-worker.workers.dev',  // 替换为你的域名
            $url
        );
        return wp_remote_request($new_url, $args);
    }
    return $preempt;
}, 10, 3);
```

然后在 TranslatePress 设置中：翻译引擎选 **DeepL**，API Key 填入 Service Key。

## 项目结构

```
src/
  index.ts              — Hono 路由入口
  types.ts              — 类型定义
  middleware/auth.ts     — serviceKey 认证中间件
  services/
    key-manager.ts      — 域名配置 KV CRUD
    translator.ts       — 批量翻译 + 单条降级
  utils/
    cache.ts            — SHA-256 翻译缓存
    parser.ts           — DeepL 请求解析
  pages/
    admin.ts            — 自助管理面板
    help.ts             — 使用帮助文档
```

## 架构

```
客户端 (TranslatePress) → DeepL API 格式请求
  → auth 中间件 (serviceKey 查 KV)
  → 并行检查翻译缓存 (KV)
  → 未命中的文本批量翻译 (numbered JSON, 1 次 API 调用)
  → 缓存结果 → 返回 DeepL 格式响应
```

### 翻译策略

- 多段文本 → numbered JSON 批量翻译 (`{"0":"text","1":"text"}` → `{"0":"译文","1":"译文"}`)
- 自动分块：每块 ≤20 段或 ≤5000 字符
- JSON 解析失败 → 自动降级逐条翻译

### KV 存储

三种前缀共用 `TRANSLATION_CACHE` namespace：

| 前缀 | 用途 | 示例 |
|------|------|------|
| `config:{serviceKey}` | 域名配置 | auth 查询主键 |
| `domain:{domain}` | 反向索引 | serviceKey 查找 |
| `cache:{sha256}` | 翻译缓存 | 30 天 TTL |

## API 路由

| 路由 | 方法 | 说明 |
|------|------|------|
| `/` | GET | 健康检查 |
| `/help` | GET | 使用帮助（面向站长） |
| `/admin` | GET | 自助管理面板 |
| `/admin/config` | GET | 获取配置 |
| `/admin/keys` | POST | 创建新配置 |
| `/admin/keys/update` | POST | 更换 API Key / 服务商 |
| `/admin/keys/delete` | POST | 删除配置 |
| `/v2/languages` | GET/POST | 支持语言列表 |
| `/v2/translate` | POST | 翻译（需 auth） |
| `/v2/usage` | GET | 配额查询（需 auth） |

## 环境变量

在 `wrangler.jsonc` 的 `vars` 中配置：

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `UPSTREAM_API_URL` | `https://api.aihubmix.com/v1/chat/completions` | 上游 API 地址 |
| `MODEL_NAME` | `deepseek-v3.2` | 翻译模型 |
| `CACHE_TTL_SECONDS` | `2592000` | 缓存 TTL（30 天） |

> API Key 不通过环境变量管理，而是通过 `/admin` 面板按域名配置，存储在 KV 中。

## License

MIT
