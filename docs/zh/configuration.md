# 配置指南

## 配置选项

每个配置都支持所有 Claude Code 环境变量和不同配置文件类型的自定义设置。

## 配置文件类型

### 默认配置文件 (`profileType: "default"`)

传统的自定义 API 配置：

- 需要手动配置 API 密钥和基础 URL
- 完全控制 API 端点和身份验证
- 适用于自定义 Claude API 设置

### 官方配置文件 (`profileType: "official"`)

带有代理支持的官方 Claude 登录：

- 使用官方 Claude 身份验证（无需手动 API 密钥）
- 支持 HTTP/HTTPS 代理配置以应对网络限制
- 适合想要使用带代理支持的官方 Claude 的用户

## 基础设置

- **名称**: 配置的唯一标识符
- **配置文件类型**: 配置类型（`default` 或 `official`）
- **基础 URL**: 自定义 API 端点（`ANTHROPIC_BASE_URL`）- 仅用于 `default` 配置文件类型
- **API 密钥**: 您的 Claude API 密钥（`ANTHROPIC_API_KEY`）- 仅用于 `default` 配置文件类型
- **模型**: 要使用的 Claude 模型（`ANTHROPIC_MODEL`）
- **权限模式**: 配置权限行为（`default`, `acceptEdits`, `plan`, `bypassPermissions`）
- **顺序**: 负载均衡的优先级顺序（数字越小 = 优先级越高）

## 高级配置选项

### 身份验证和 API

- **身份验证令牌**: 自定义授权令牌（`ANTHROPIC_AUTH_TOKEN`）
- **自定义标头**: 自定义 HTTP 标头（`ANTHROPIC_CUSTOM_HEADERS`）

### AWS/Bedrock 配置

- **AWS Bearer 令牌**: Bedrock API 身份验证（`AWS_BEARER_TOKEN_BEDROCK`）
- **使用 Bedrock**: 启用 Bedrock 集成（`CLAUDE_CODE_USE_BEDROCK`）
- **跳过 Bedrock 身份验证**: 跳过 AWS 身份验证（`CLAUDE_CODE_SKIP_BEDROCK_AUTH`）

### Google Vertex AI

- **使用 Vertex**: 启用 Vertex AI 集成（`CLAUDE_CODE_USE_VERTEX`）
- **跳过 Vertex 身份验证**: 跳过 Google 身份验证（`CLAUDE_CODE_SKIP_VERTEX_AUTH`）
- **Vertex 区域**: 不同 Claude 模型的自定义区域

### 性能和限制

- **Bash 超时**: 配置命令执行超时
- **最大输出令牌**: 设置响应的令牌限制
- **最大思考令牌**: 配置推理令牌预算
- **MCP 设置**: 配置模型上下文协议超时

### 行为控制

- **禁用功能**: 关闭自动更新、遥测、错误报告等
- **终端设置**: 配置终端标题更新
- **项目目录**: 为 bash 命令维护工作目录

### 网络配置

- **HTTP/HTTPS 代理**: 配置代理服务器

## 配置示例

### 默认配置文件配置

```bash
start-claude add
# 按照提示操作：
# 配置文件类型：默认（自定义 API 设置）
# 名称：production
# 基础 URL：https://api.anthropic.com
# API 密钥：your-production-key
# 模型：claude-sonnet-4-20250514
# 权限模式：默认
# 设为默认：是
```

### 官方配置文件配置

```bash
start-claude add
# 按照提示操作：
# 配置文件类型：官方（使用带代理支持的官方 Claude 登录）
# 名称：work-proxy
# HTTP 代理：http://proxy.company.com:8080
# HTTPS 代理：https://proxy.company.com:8080
# 模型：claude-3-sonnet
# 权限模式：默认
# 设为默认：否
```

## 编辑器模式配置

在您喜欢的编辑器中创建和编辑配置：

```bash
start-claude add -e
# 在编辑器中打开 JSON 模板
# 填写所有配置选项
# 保存并关闭以创建配置

start-claude edit myconfig -e
# 在编辑器中编辑现有配置

start-claude edit-config
# 直接编辑整个配置文件
```

## 配置存储

配置存储在 `~/.start-claude/config.json` 中：

```json
{
  "configs": [
    {
      "name": "production",
      "profileType": "default",
      "apiKey": "sk-ant-...",
      "baseUrl": "https://api.anthropic.com",
      "model": "claude-sonnet-4-20250514",
      "permissionMode": "default",
      "isDefault": true,
      "order": 0,
      "useBedrock": false,
      "disableTelemetry": true
    },
    {
      "name": "work-proxy",
      "profileType": "official",
      "httpProxy": "http://proxy.company.com:8080",
      "httpsProxy": "https://proxy.company.com:8080",
      "model": "claude-3-sonnet",
      "permissionMode": "default",
      "order": 10,
      "isDefault": false
    }
  ],
  "settings": {
    "overrideClaudeCommand": false,
    "s3Sync": {
      "bucket": "my-claude-configs",
      "region": "us-east-1",
      "key": "start-claude-config.json"
    }
  }
}
```

## 使用顺序字段进行负载均衡

`order` 字段允许您在使用负载均衡器时设置配置的优先级：

- **数字越小 = 优先级越高**（0 = 最高优先级）
- **未定义的顺序**被视为 0（最高优先级）
- 配置在负载均衡开始前按顺序排序

```json
{
  "name": "primary-api",
  "order": 0,  // 最高优先级
  "baseUrl": "https://primary.api.com",
  "apiKey": "sk-primary"
},
{
  "name": "backup-api",
  "order": 10,  // 较低优先级
  "baseUrl": "https://backup.api.com",
  "apiKey": "sk-backup"
}
```

## CLI 覆盖

为单个会话覆盖任何配置设置而不修改保存的配置：

```bash
# 覆盖 API 设置
start-claude myconfig --api-key sk-temp-key --model claude-3-opus

# 设置环境变量
start-claude myconfig -e NODE_ENV=staging -e LOG_LEVEL=debug

# 覆盖多个设置
start-claude myconfig --api-key sk-temp --model claude-3-opus --base-url https://test.api.com
```
