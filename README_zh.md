# start-claude

一个强大的 CLI 工具，用于管理和启动具有不同配置的 Claude Code。轻松管理多个 Claude 配置、通过 S3 同步到各个设备，并通过美观的交互式界面在它们之间切换。

## 特性

- 🚀 **轻松配置管理**：添加、编辑、删除和列出 Claude 配置
- 🔧 **环境变量支持**：完全支持所有 35+ 个 Claude Code 环境变量
- ⚡ **CLI 覆盖**：直接从命令行覆盖 API 密钥、模型、基础 URL 和设置自定义环境变量
- 📦 **自动安装**：自动检测并安装缺失的 Claude Code CLI
- ☁️ **S3 同步**：智能跨设备同步，支持冲突检测和修改时间跟踪
- 🎨 **现代 Web 界面**：美观、响应式的配置管理器，支持实时搜索和拖放
- ⚖️ **高级负载均衡器**：智能负载均衡，支持健康监控、自动故障转移和可配置设置
- 🔄 **转换器支持**：在不同 AI API 格式之间转换（OpenAI、自定义提供商）
- 💻 **命令覆盖**：Windows 兼容的 shell 别名，采用双脚本+别名方法
- 🌐 **多提供商支持**：在负载均衡中混合匹配不同的 AI 提供商

## 快速开始

**🚀 无需设置！** 立即开始使用：

```bash
# 全局安装
npm install -g start-claude
# 或
pnpm add -g start-claude

# 直接使用 CLI 覆盖启动 Claude Code（无需配置）
start-claude --api-key sk-your-key --model claude-3-sonnet

# 使用短命令别名（在 Windows 上可能无效）
sc --api-key sk-your-key --model claude-3-sonnet

# Windows 用户：启用覆盖以获得更好的兼容性
start-claude override

# 对于持久配置，交互式添加一个
start-claude add

# 打开现代 Web 界面
start-claude manager
```

## 基本用法

```bash
# 基本命令
start-claude                    # 使用默认配置启动
start-claude <config>           # 使用特定配置启动
start-claude list              # 列出所有配置
start-claude add               # 添加新配置
start-claude edit <name>       # 编辑配置

# 现代 Web 界面
start-claude manager          # 打开基于 Web 的配置管理器

# 带健康监控的高级负载均衡器
start-claude --balance         # 使用系统默认平衡设置启动
start-claude --balance --verbose  # 启用详细健康检查日志

# CLI 覆盖（无需配置）
start-claude --api-key sk-key --model claude-3-sonnet
start-claude -e DEBUG=1 -e NODE_ENV=prod --verbose

# 带智能冲突检测的 S3 同步
start-claude s3 setup          # 配置带时间戳跟踪的 S3 同步
start-claude s3 sync           # 带冲突解决的智能同步
start-claude s3 upload --force # 强制上传（忽略时间戳警告）
start-claude s3 download       # 带时间戳比较的下载

# 覆盖原始 claude-code 命令
start-claude override         # 启用 claude 命令覆盖
start-claude override disable # 禁用覆盖
start-claude override status  # 检查覆盖状态
start-claude override shells  # 显示支持的 shell
```

## 现代 Web 界面

Start Claude 现在包含一个美观、现代的配置管理 Web 界面：

- **🎨 现代设计**：简洁、基于渐变的 UI，支持暗模式
- **🔍 实时搜索**：即时过滤配置
- **📱 拖放**：带视觉反馈的配置重新排序
- **⚙️ 系统设置**：集中式平衡模式和 S3 同步偏好
- **✅ 智能验证**：带详细错误消息的实时验证
- **🌓 暗模式**：自动系统主题检测

```bash
# 启动 Web 界面
start-claude manager
# 在 http://localhost:3000 打开你的配置
```

## 高级负载均衡器

带智能健康监控的增强负载均衡：

- **🏥 健康监控**：可配置的健康检查间隔
- **🚫 智能故障转移**：自动端点禁用和恢复
- **⚙️ 系统集成**：通过 Web 界面或系统设置配置
- **📊 详细日志**：全面的健康检查和故障转移日志

### 平衡模式设置

通过 Web 界面（`start-claude manager`）或系统设置进行配置：

- **默认启用**：自动以平衡模式启动
- **健康检查间隔**：自定义监控频率（10秒 - 5分钟）
- **失败端点处理**：自动禁用持续时间（1分钟 - 1小时）
- **禁用健康检查**：使用带端点禁用的简单轮询
  start-claude -e DEBUG=1 -e NODE_ENV=prod --verbose

# 短别名

sc --api-key sk-key --model claude-3-haiku

````

## 编辑器模式

在你喜欢的编辑器中编辑配置：

```bash
# 支持的编辑器：VS Code、Cursor、Windsurf、记事本等
start-claude add -e             # 在编辑器中创建配置
start-claude edit myconfig -e   # 在编辑器中编辑配置
start-claude edit-config        # 直接编辑配置文件，支持实时重载
````

## Claude Code 文档

有关 Claude Code CLI 的完整信息：

**📖 [Claude Code 文档](https://docs.anthropic.com/en/docs/claude-code)**

## 贡献

我们欢迎贡献！查看我们的[开发指南](docs/zh/development.md)了解详情：

- 设置开发环境
- 运行测试
- 代码风格指导
- 提交流程

## 许可证

MIT 许可证

---

## ⚠️ Windows 用户重要通知

**`sc` 命令在 Windows 上可能无效**，因为存在系统命令冲突。Windows 保留 `sc` 用于服务控制操作。如果遇到问题，请使用以下替代方案之一：

```bash
# 选项 1：使用完整命令名
start-claude --api-key sk-your-key

# 选项 2：设置命令覆盖（推荐）
start-claude override

# 选项 3：创建自定义别名
doskey sc=start-claude $*
```

我们推荐使用**覆盖功能**以获得最佳 Windows 体验。

---

💡 **专业提示**：Windows 用户应该使用 `start-claude override` 以获得最佳体验，因为 `sc` 别名可能与系统命令冲突。
