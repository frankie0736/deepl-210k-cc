/**
 * 环境变量类型定义
 */
export interface Env {
  TRANSLATION_CACHE: KVNamespace;
  UPSTREAM_API_URL: string;
  MODEL_NAME: string;
  CACHE_TTL_SECONDS: string;
}

import type { DomainConfig } from './services/key-manager';

/**
 * Hono context variables（中间件 → handler 传值）
 */
export interface Variables {
  domainConfig: DomainConfig;
}

/**
 * DeepL 翻译请求参数
 */
export interface DeepLTranslateRequest {
  text: string | string[];
  target_lang: string;
  source_lang?: string;
  formality?: 'default' | 'more' | 'less' | 'prefer_more' | 'prefer_less';
  split_sentences?: '0' | '1' | 'nonewlines';
  preserve_formatting?: boolean;
  tag_handling?: 'html' | 'xml';
  auth_key?: string;
}

/**
 * DeepL 翻译响应
 */
export interface DeepLTranslateResponse {
  translations: DeepLTranslation[];
}

export interface DeepLTranslation {
  detected_source_language: string;
  text: string;
  billed_characters?: number;
  model_type_used?: string;
}

/**
 * DeepL 配额查询响应
 */
export interface DeepLUsageResponse {
  character_count: number;
  character_limit: number;
}

/**
 * OpenAI 聊天补全请求
 */
export interface OpenAIChatRequest {
  model: string;
  messages: OpenAIChatMessage[];
  temperature?: number;
  max_tokens?: number;
}

export interface OpenAIChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * OpenAI 聊天补全响应
 */
export interface OpenAIChatResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: OpenAIChatChoice[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface OpenAIChatChoice {
  index: number;
  message: OpenAIChatMessage;
  finish_reason: string;
}

/**
 * 缓存键生成参数
 */
export interface CacheKeyParams {
  text: string;
  sourceLang: string;
  targetLang: string;
  formality?: string;
}
