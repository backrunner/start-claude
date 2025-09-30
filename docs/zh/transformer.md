# 转换器指南

转换器允许 start-claude 与不同的 AI API 提供商一起工作，通过将请求和响应转换为兼容格式。这使您能够在负载均衡设置中混合和匹配不同的 AI 提供商。

## 概述

转换器作为不同 AI API 格式之间的转换层：

- **请求转换**: 将 Anthropic Claude 格式的请求转换为目标 API 格式
- **响应转换**: 将目标 API 的响应转换回 Anthropic 格式
- **无缝集成**: 与 Claude Code 完全兼容
- **负载均衡支持**: 在负载均衡设置中与原生端点一起工作

## 支持的提供商

### OpenAI API

转换 Anthropic 格式到 OpenAI ChatCompletion API 格式。

**支持的端点**：
- OpenAI 官方 API
- Azure OpenAI
- 其他 OpenAI 兼容的 API

**示例配置**：
```json
{
  "name": "openai-gpt4",
  "profileType": "default",
  "baseUrl": "https://api.openai.com/v1",
  "apiKey": "sk-your-openai-key",
  "model": "gpt-4",
  "transformerEnabled": true
}
```

### 自定义提供商

您可以添加对其他提供商的支持，通过实现自定义转换器。

## 配置转换器

### 通过网页界面

1. **打开配置管理器**: `start-claude manager`
2. **添加新配置** 或编辑现有配置
3. **启用转换器**: 勾选"启用转换器"选项
4. **配置 API 详情**:
   - **基础 URL**: 目标 API 的端点
   - **API 密钥**: 目标 API 的身份验证密钥
   - **模型**: 要使用的目标 API 模型

### 通过 CLI

```bash
start-claude add
# 按照提示操作：
# 名称：openai-gpt4
# 配置文件类型：默认（自定义 API 设置）
# 基础 URL：https://api.openai.com/v1
# API 密钥：sk-your-openai-key
# 模型：gpt-4
# 启用转换器：是
```

### JSON 配置

直接在配置文件中设置：

```json
{
  "configs": [
    {
      "name": "openai-gpt4",
      "profileType": "default",
      "baseUrl": "https://api.openai.com/v1",
      "apiKey": "sk-your-openai-key",
      "model": "gpt-4",
      "transformerEnabled": true,
      "order": 10
    }
  ]
}
```

## 转换器要求

要使转换器配置正常工作：

1. **API 凭据**: 必须提供有效的 `baseUrl` 和 `apiKey`
2. **转换器启用**: 必须设置 `transformerEnabled: true`
3. **兼容模型**: 目标 API 必须支持指定的模型

## 负载均衡集成

转换器配置可以与原生 Anthropic 端点一起参与负载均衡：

### 混合提供商设置

```bash
# 创建混合配置
start-claude add  # anthropic-official（原生）
start-claude add  # openai-gpt4（转换器）
start-claude add  # azure-gpt4（转换器）

# 跨不同提供商进行负载均衡
start-claude --balance anthropic-official openai-gpt4 azure-gpt4
```

### 策略注意事项

- **回退策略**: 使用 `order` 字段优先考虑原生 vs 转换器端点
- **轮询策略**: 在所有端点（原生 + 转换器）间均匀分发
- **速度优先**: 根据实际响应时间选择最快的端点（无论类型）

## OpenAI 转换器详情

### 请求转换

**Anthropic 格式**:
```json
{
  "model": "claude-sonnet-4-5-20250929",
  "messages": [
    {"role": "user", "content": "Hello"}
  ],
  "max_tokens": 100
}
```

**OpenAI 格式**:
```json
{
  "model": "gpt-4",
  "messages": [
    {"role": "user", "content": "Hello"}
  ],
  "max_tokens": 100
}
```

### 响应转换

**OpenAI 响应**:
```json
{
  "choices": [
    {
      "message": {
        "content": "Hello! How can I help you?"
      }
    }
  ]
}
```

**Anthropic 格式**:
```json
{
  "content": [
    {
      "type": "text",
      "text": "Hello! How can I help you?"
    }
  ]
}
```

### 流式响应

转换器支持流式响应（SSE）：

- **OpenAI 流**: `data: {"choices": [{"delta": {"content": "text"}}]}`
- **Anthropic 流**: `data: {"type": "content_block_delta", "delta": {"text": "text"}}`

## 错误处理

### 转换错误

如果转换失败：
- 错误消息将指示转换问题
- 原始 API 错误包含在响应中
- 负载均衡器将尝试其他端点

### API 错误

目标 API 的错误被转换并转发：
- HTTP 状态码被保留
- 错误消息被翻译为 Anthropic 格式
- 速率限制和其他错误得到正确处理

## 使用示例

### 基本转换器使用

```bash
# 单独使用转换器配置
start-claude openai-gpt4

# 在负载均衡中使用转换器
start-claude --balance openai-gpt4 anthropic-official
```

### 混合 API 设置

```bash
# 创建多个转换器配置
start-claude add  # openai-gpt4
start-claude add  # azure-gpt35
start-claude add  # anthropic-claude

# 使用所有提供商进行负载均衡
start-claude --balance speedfirst  # 自动选择最快的
```

### 故障转移配置

```bash
# 主要：Anthropic（order: 0）
# 备份：OpenAI（order: 10）
# 故障转移：Azure（order: 20）
start-claude --balance fallback
```

## 最佳实践

### API 密钥管理

1. **分离密钥**: 为每个提供商使用单独的 API 密钥
2. **速率限制**: 了解每个提供商的限制
3. **成本监控**: 跟踪不同提供商的使用情况

### 性能优化

1. **延迟测试**: 使用速度优先策略找到最快的提供商
2. **地理位置**: 选择靠近您位置的端点
3. **模型选择**: 为不同任务使用适当的模型

### 可靠性

1. **多提供商**: 混合不同提供商以提高可靠性
2. **健康检查**: 启用监控以快速检测问题
3. **故障转移**: 使用回退策略进行自动故障转移

## 故障排除

### 转换器无法工作

1. **检查 API 凭据**: 验证 API 密钥和端点
2. **验证模型**: 确保目标 API 支持指定的模型
3. **检查转换器设置**: 确认 `transformerEnabled: true`

### 负载均衡问题

1. **健康检查失败**: 检查目标 API 的连通性
2. **格式错误**: 验证 API 响应格式兼容性
3. **速率限制**: 监控不同提供商的限制

### 性能问题

1. **响应时间慢**: 比较不同提供商的延迟
2. **转换开销**: 转换器增加轻微的处理延迟
3. **网络问题**: 检查到不同 API 端点的连接

## 开发自定义转换器

如果您需要支持新的 API 提供商：

### 转换器接口

```typescript
interface Transformer {
  transformRequest(request: AnthropicRequest): ProviderRequest
  transformResponse(response: ProviderResponse): AnthropicResponse
  transformStream(stream: ProviderStream): AnthropicStream
}
```

### 实现步骤

1. **创建转换器类**: 实现转换接口
2. **注册转换器**: 在转换器服务中添加
3. **测试转换**: 验证请求/响应转换
4. **集成测试**: 确保与负载均衡器兼容

## 限制

### 当前限制

1. **提供商支持**: 目前仅支持 OpenAI 兼容的 API
2. **功能对等**: 并非所有 Anthropic 功能在所有提供商中都可用
3. **转换开销**: 轻微的性能影响进行格式转换

### 计划改进

1. **更多提供商**: 对其他 AI 提供商的支持
2. **高级功能**: 更好的功能映射和兼容性
3. **性能**: 优化转换性能

转换器使 start-claude 成为一个通用的 AI API 客户端，支持多个提供商和强大的负载均衡功能。