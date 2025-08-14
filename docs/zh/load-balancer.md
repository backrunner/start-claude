# 负载均衡器和代理指南

增强的代理服务器提供跨多个 Claude API 端点的负载均衡，具有智能健康监控、自动故障转移、转换器支持和可配置的系统设置。

## 🆕 增强功能

- **🏥 智能健康监控**: 可配置的健康检查间隔（10秒 - 5分钟）
- **🚫 端点封禁**: 失败端点的自动封禁，可配置封禁时长（1分钟 - 1小时）
- **🔧 转换器支持**: 通过转换器处理请求以支持不同的 API 提供商
- **⚙️ 系统集成**: 通过现代网页界面进行配置
- **🔄 自动启用**: 将均衡模式设为默认行为
- **📊 增强日志**: 详细的健康检查和故障转移信息

## 概述

代理服务器：

- **分发请求** - 使用可配置策略在多个健康端点之间分发请求
- **健康监控** - 自动检测和处理不健康的端点
- **故障转移支持** - 主端点失败时切换到备用端点
- **性能优化** - 根据端点响应时间调整路由
- **转换器处理** - 支持不同 API 格式之间的转换
- **优先级排序** - 遵循配置顺序进行端点优先级排序（回退策略）
- **代理服务器** - 默认运行在 2333 端口

## 负载均衡器策略

Start Claude 支持三种不同的负载均衡策略来优化请求分发：

### 回退策略（默认）

**基于优先级的故障转移**

- **尊重端点优先级**: 使用 `order` 字段确定主/备端点
- **优先级内轮询**: 在相同优先级的端点间均匀分发负载
- **自动故障转移**: 高优先级端点失败时回退到低优先级端点
- **最适用于**: 具有主/备端点层次结构的生产环境

```bash
start-claude --balance fallback
```

### 轮询策略

**轮询分发**

- **忽略优先级排序**: 平等对待所有端点
- **均匀分发**: 在所有健康端点间简单轮询
- **可预测路由**: 每个请求按顺序发送到下一个端点
- **最适用于**: 在等效端点间均匀分发负载

```bash
start-claude --balance polling
```

### 速度优先策略

**基于性能的路由**

- **性能监控**: 测量从请求到首个令牌的响应时间
- **自适应路由**: 自动路由到响应最快的端点
- **持续优化**: 基于实时性能更新路由决策
- **预热期**: 启动期间收集多个样本以实现可靠路由
- **最适用于**: 优化不同性能端点间的响应时间

```bash
start-claude --balance speedfirst
```

**速度优先配置：**

- **响应时间窗口**: 平均响应时间的时间段（默认：5分钟）
- **最小样本数**: 速度路由前需要的时序样本数量（默认：2）
- **健康检查时序**: 健康检查对性能指标有贡献

## 快速开始

```bash
# 使用所有可用配置启动代理服务器（默认策略）
start-claude --balance

# 使用特定策略
start-claude --balance speedfirst         # 性能优化路由
start-claude --balance polling           # 均匀分发
start-claude --balance fallback          # 基于优先级的故障转移

# 使用特定配置和策略启动代理服务器
start-claude --balance polling config1 config2 config3

# 启动代理服务器但不显示详细输出（简化模式）
start-claude config1
```

## 新的行为变化

### 负载均衡控制

- **只有在通过 `--balance` 标志或配置设置明确请求时才启用负载均衡**
- `--balance` 标志**启用负载均衡**并显示详细的端点信息和可用转换器
- 没有 `--balance` 时，代理模式仅运行转换器支持（多个端点之间无负载均衡）
- 如需要，可使用系统设置默认启用负载均衡

### 转换器要求

- **启用转换器的配置现在需要 API 凭据**（`baseUrl` 和 `apiKey`）
- 这确保转换器具有将请求转发到外部 API 的必要凭据
- 启用 `--balance` 时，转换器配置参与负载均衡

## 工作原理

### 1. 配置优先级

配置按其 `order` 字段排序：

- **数字越小 = 优先级越高**（0 = 最高优先级）
- **未定义的顺序** 被视为 0（最高优先级）
- 负载均衡器优先尝试高优先级端点

```json
{
  "configs": [
    {
      "name": "primary-api",
      "order": 0, // 最高优先级
      "baseUrl": "https://primary.api.com",
      "apiKey": "sk-primary"
    },
    {
      "name": "backup-api",
      "order": 10, // 较低优先级
      "baseUrl": "https://backup.api.com",
      "apiKey": "sk-backup"
    }
  ]
}
```

### 2. 健康监控

负载均衡器持续监控端点健康状态：

- **初始健康检查** 启动时进行
- **定期健康检查** 每 30 秒检查不健康端点
- **实时监控** 在请求处理期间进行
- **自动恢复** 端点恢复健康时自动重新启用

### 3. 请求分发

- 在相同优先级的健康端点之间使用 **轮询**
- 高优先级端点失败时 **自动故障转移** 到低优先级端点
- 失败时使用不同端点 **重试请求**
- 使用适当的 HTTP 状态码进行 **错误处理**

## 使用示例

### 基础负载均衡

```bash
# 使用所有配置的端点启动
start-claude --balance

# 指定要使用的具体配置
start-claude --balance prod1 prod2 backup
```

### 负载均衡器配置

为负载均衡创建多个配置：

```bash
# 添加主端点
start-claude add
# 名称：primary
# 基础 URL：https://api1.anthropic.com
# API 密钥：sk-primary-key
# 顺序：0

# 添加备用端点
start-claude add
# 名称：backup
# 基础 URL：https://api2.anthropic.com
# API 密钥：sk-backup-key
# 顺序：10

# 启动负载均衡器
start-claude --balance
```

### 与 Claude Code 集成使用

负载均衡器运行后，配置 Claude Code 使用它：

```bash
# 设置 Claude Code 使用负载均衡器端点
export ANTHROPIC_BASE_URL="http://localhost:2333"
export ANTHROPIC_API_KEY="sk-claude-load-balancer-proxy-key"

# 或使用 CLI 覆盖
claude --base-url http://localhost:2333 --api-key sk-claude-load-balancer-proxy-key
```

## 健康检查详情

### 健康检查过程

1. **POST 请求** 到 `/v1/messages` 端点
2. **简单 ping 消息** 最小化令牌使用
3. **超时**：初始检查 15 秒，持续检查 10 秒
4. **成功标准**：HTTP 状态码 < 500
5. **故障处理**：标记端点为不健康并尝试替代方案

### 健康检查请求

```json
{
  "model": "claude-3-haiku-20241022",
  "max_tokens": 10,
  "messages": [
    {
      "role": "user",
      "content": "ping"
    }
  ]
}
```

### 状态监控

检查负载均衡器状态：

```bash
# 查看端点健康状态
start-claude --balance
# 启动期间查看状态消息
```

示例状态输出：

```
🔍 测试端点...
✅ primary - HTTP 200: OK
❌ backup - HTTP 401: Unauthorized - Invalid API key
⚠️ 第一个端点失败，尝试替代方案...
🚀 负载均衡代理服务器已在端口 2333 启动
```

## 错误处理

### HTTP 状态码

负载均衡器返回适当的 HTTP 状态码：

- **200-499**：从上游端点转发
- **500**：负载均衡器内部错误
- **502**：上游服务器错误（连接失败）
- **503**：所有端点不可用

### 错误响应格式

```json
{
  "error": {
    "message": "所有端点当前不可用",
    "type": "service_unavailable"
  }
}
```

### 常见错误消息

- **401 Unauthorized**：配置中的 API 密钥无效
- **403 Forbidden**：API 密钥没有所需权限
- **404 Not Found**：基础 URL 或端点路径不正确
- **429 Rate Limited**：超过 API 速率限制
- **502 Bad Gateway**：网络连接问题
- **503 Service Unavailable**：所有端点不健康

## 高级配置

### 自定义端口

```bash
# 在自定义端口启动负载均衡器
start-claude --balance --port 3000
```

### 端点优先级配置

使用 `order` 字段配置端点优先级：

```json
{
  "name": "tier1-endpoint",
  "order": 0,     // 最高优先级
  "baseUrl": "https://tier1.api.com",
  "apiKey": "sk-tier1"
},
{
  "name": "tier2-endpoint",
  "order": 5,     // 中等优先级
  "baseUrl": "https://tier2.api.com",
  "apiKey": "sk-tier2"
},
{
  "name": "fallback-endpoint",
  "order": 10,    // 最低优先级
  "baseUrl": "https://fallback.api.com",
  "apiKey": "sk-fallback"
}
```

### 监控和调试

启用详细日志记录以监控负载均衡器行为：

```bash
start-claude --balance --verbose
```

## 最佳实践

1. **API 密钥管理**：为不同端点使用单独的 API 密钥以隔离速率限制
2. **地理分布**：考虑使用不同区域的端点以获得更好的延迟
3. **容量规划**：确保备用端点能处理完整负载
4. **监控**：为负载均衡代理服务器设置监控
5. **健康检查**：确保所有端点使用兼容的 Claude API 版本
6. **优先级排序**：根据端点可靠性和成本设置适当的优先级

## 故障排除

### 没有健康端点

如果所有端点都不健康：

1. **检查 API 密钥**：验证所有 API 密钥有效且有适当权限
2. **验证基础 URL**：确保所有基础 URL 正确且可访问
3. **网络连接**：检查端点是否可从您的网络访问
4. **速率限制**：检查是否超过了 API 速率限制

### 负载均衡器无法启动

常见问题：

- **端口冲突**：另一个服务正在使用端口 2333
- **没有有效配置**：没有配置同时具有 `baseUrl` 和 `apiKey`
- **配置无效**：检查配置语法和必需字段

### 性能问题

提高性能：

- **减少健康检查频率**（需要修改代码）
- **使用更快的端点** 进行健康检查
- **根据响应时间优化端点优先级** 顺序
- **监控端点延迟** 并相应调整配置

## 集成示例

### 与 Docker 集成

```dockerfile
# Dockerfile
FROM node:18-alpine
RUN pnpm add -g start-claude
COPY config.json /root/.start-claude/config.json
EXPOSE 2333
CMD ["start-claude", "--balance"]
```

### 与进程管理器集成

```bash
# PM2 配置
pm2 start "start-claude --balance" --name claude-loadbalancer

# systemd 服务
[Unit]
Description=Claude Load Balancer
After=network.target

[Service]
Type=simple
ExecStart=/usr/local/bin/start-claude --balance
Restart=always
User=claude
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```
