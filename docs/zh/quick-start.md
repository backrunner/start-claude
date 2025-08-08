# 快速开始指南

**🚀 无需设置！** 您可以立即开始使用 start-claude：

## 即时使用（无需配置）

```bash
# 使用 CLI 覆盖直接启动 Claude Code（无需配置）
start-claude --api-key sk-your-key --model claude-3-sonnet

# 使用短命令别名
sc --api-key sk-your-key --model claude-3-sonnet

# 动态设置环境变量
start-claude -e DEBUG=1 -e NODE_ENV=production --verbose

# 为自定义端点覆盖基础 URL
start-claude --base-url https://custom.api.com --model claude-3-opus
```

## 设置持久化配置

**📚 对于持久化配置：**

### 1. 首次设置

运行 `start-claude` 并按照交互式设置创建您的第一个配置。

### 2. 添加配置

```bash
start-claude add
# 或使用编辑器模式
start-claude add -e
```

### 3. 使用特定配置

```bash
start-claude myconfig
# 或
start-claude --config myconfig
```

### 4. 列出所有配置

```bash
start-claude list
```

## 基础命令

- `start-claude` 或 `sc` - 使用默认配置启动或直接启动（无配置）
- `start-claude <config>` 或 `sc <config>` - 使用特定配置启动
- `start-claude --config <name>` - 使用特定配置启动
- `start-claude --list` - 列出所有配置
- `start-claude add` - 添加新配置
- `start-claude edit <name>` - 编辑现有配置
- `start-claude remove <name>` - 删除配置
- `start-claude default <name>` - 设置配置为默认

**💡 专业提示**: Windows 用户应该使用 `start-claude override --enable` 以获得最佳体验，因为 `sc` 别名可能与系统命令冲突！

## 现代化 Web 界面

访问美观的现代化配置管理器：

```bash
# 启动 Web 界面
start-claude manager
# 在 http://localhost:3000 打开您的配置
```

功能特性：

- 🎨 支持暗色模式的现代渐变 UI
- 🔍 实时搜索和过滤
- 📱 拖拽配置重新排序
- ⚙️ 集中化系统设置
- ✅ 带详细错误信息的实时验证

## CLI 覆盖示例

**⚡ 无需修改配置即可覆盖设置：**

```bash
# 为单个会话覆盖 API 设置
start-claude --api-key sk-new-key --model claude-3-opus --base-url https://custom.api.com

# 动态设置环境变量
start-claude -e DEBUG=1 -e CUSTOM_VAR=value myconfig

# 将配置与覆盖结合
start-claude production --model claude-3-haiku --verbose

# 无配置使用覆盖
start-claude --api-key sk-key --model claude-3-sonnet --max-turns 5
```

## 优先级顺序（从高到低）

1. CLI 覆盖（`--api-key`, `--model`, `--base-url`, `-e`）
2. 配置文件设置
3. 系统环境变量

**需要帮助？** 运行 `start-claude --help` 查看所有可用选项。
