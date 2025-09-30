# CLI 参考

start-claude 的完整命令行界面参考，包含所有可用命令、选项和使用示例。

## 基本语法

```bash
start-claude [选项] [命令] [参数]
```

## 全局选项

适用于大多数命令的选项：

- `--verbose` - 启用详细输出和日志记录
- `--debug` - 启用调试模式，显示额外信息
- `--help` - 显示帮助信息
- `--version` - 显示版本信息

## 核心命令

### 配置管理

#### `start-claude`（默认命令）

使用默认或指定配置启动 Claude Code。

```bash
start-claude                    # 使用默认配置启动
start-claude <config>           # 使用特定配置启动
start-claude --list            # 列出所有配置
```

**选项：**

- `--config <name>` - 使用特定配置
- `--api-key <key>` - 为此会话覆盖 API 密钥
- `--base-url <url>` - 为此会话覆盖基础 URL
- `--model <model>` - 为此会话覆盖模型
- `--balance [strategy]` - 启用负载均衡。可选策略：`fallback`、`polling`、`speedfirst`
- `-e, --env <key=value>` - 设置环境变量
- `--proxy <url>` - 为请求设置 HTTPS 代理
- `-p, --print` - 将输出打印到标准输出
- `--resume` - 恢复上一次会话
- `--continue` - 继续上一次会话

#### `start-claude add`

交互式添加新配置。

```bash
start-claude add               # 交互式配置创建
start-claude add -e            # 在编辑器中创建配置
```

**选项：**

- `-e, --use-editor` - 在外部编辑器中创建配置

#### `start-claude edit <name>`

编辑现有配置。

```bash
start-claude edit myconfig     # 交互式编辑配置
start-claude edit myconfig -e  # 在编辑器中编辑配置
```

**选项：**

- `-e, --use-editor` - 在外部编辑器中编辑配置

#### `start-claude remove <name>`

删除配置。

```bash
start-claude remove myconfig   # 删除配置并确认
```

#### `start-claude list`

列出所有可用配置。

```bash
start-claude list             # 显示所有配置及详细信息
```

#### `start-claude default <name>`

将配置设为默认。

```bash
start-claude default myconfig # 将 myconfig 设为默认
```

### 网页界面

#### `start-claude manager`

启动基于网页的配置管理器。

```bash
start-claude manager          # 在默认端口启动（2334）
start-claude manager -p 3000 # 在自定义端口启动
```

**别名：**

- `start-claude manage`

**选项：**

- `-p, --port <number>` - 运行管理器的端口（默认：2334）

### 命令覆盖系统

#### `start-claude override`

启用命令覆盖（创建 `claude` 别名到 `start-claude`）。

```bash
start-claude override         # 使用双重方法启用覆盖：
                             # 1. 创建 ~/.start-claude/bin/claude 脚本
                             # 2. 向 shell RC 文件添加 PATH 导出和别名
```

**作用：**

- 在 `~/.start-claude/bin/claude` 创建可执行脚本
- 向 shell RC 文件添加 `export PATH="$HOME/.start-claude/bin:$PATH"`
- 添加 `alias claude="start-claude"` 作为后备
- 跨 shell 重启工作，在 start-claude 更新后仍有效

#### `start-claude override disable`

禁用命令覆盖。

```bash
start-claude override disable # 删除脚本目录并清理 RC 文件
```

#### `start-claude override status`

检查当前覆盖状态。

```bash
start-claude override status  # 显示：
                             # - 当前覆盖状态（启用/禁用）
                             # - 检测到的 shell 和平台
                             # - 配置文件路径
                             # - 脚本存在状态
```

#### `start-claude override shells`

显示支持覆盖功能的 shell。

```bash
start-claude override shells  # 列出当前平台支持的 shell
```

**支持的 Shell：**

_Unix/Linux/macOS:_

- bash（使用 `~/.bashrc`）
- zsh（使用 `~/.zshrc`）
- fish（使用 `~/.config/fish/config.fish`）

_Windows:_

- PowerShell（使用 `~/Documents/PowerShell/Microsoft.PowerShell_profile.ps1`）
- Command Prompt（创建批处理文件）
- Git Bash（使用 `~/.bashrc`）

### S3 同步

#### `start-claude s3 setup`

配置 S3 同步设置。

```bash
start-claude s3 setup         # 交互式 S3 配置设置
```

#### `start-claude s3 sync`

与 S3 同步配置。

```bash
start-claude s3 sync          # 带冲突检测的智能双向同步
```

#### `start-claude s3 upload`

将本地配置上传到 S3。

```bash
start-claude s3 upload        # 带时间戳比较的上传
start-claude s3 upload -f     # 强制上传，忽略远程时间戳
```

**选项：**

- `-f, --force` - 强制覆盖远程配置

#### `start-claude s3 download`

从 S3 下载配置。

```bash
start-claude s3 download      # 带时间戳比较的下载
start-claude s3 download -f   # 强制下载，忽略本地时间戳
```

**选项：**

- `-f, --force` - 强制覆盖本地配置

#### `start-claude s3 status`

显示 S3 同步状态。

```bash
start-claude s3 status        # 显示：
                             # - S3 配置状态
                             # - 上次同步时间戳
                             # - 远程 vs 本地修改时间
                             # - 冲突检测结果
```

### 负载均衡与代理

#### `start-claude --balance [strategy]`

启用跨多个配置的负载均衡。

```bash
start-claude --balance                    # 使用系统默认策略
start-claude --balance fallback          # 基于优先级的故障转移
start-claude --balance polling           # 跨所有端点轮询
start-claude --balance speedfirst        # 路由到最快端点
start-claude --balance config1 config2   # 使用特定配置
start-claude --balance polling --verbose # 启用详细健康监控
```

**负载均衡器策略：**

- `fallback` - **基于优先级的故障转移**（默认）
  - 遵循端点 `order` 字段的优先级
  - 在相同优先级内轮询
  - 失败时回退到低优先级

- `polling` - **轮询分发**
  - 忽略优先级排序
  - 在所有健康端点间均匀分发请求
  - 简单且可预测的负载分发

- `speedfirst` - **基于性能的路由**
  - 路由到响应最快的端点
  - 测量从请求到首个令牌的响应时间
  - 自动适应端点性能
  - 需要多个样本以实现可靠路由

**功能：**

- 可配置间隔的健康监控
- 失败时自动端点封禁
- 基于选定策略的智能请求分发
- 基于优先级的故障转移（回退策略）
- 性能监控和适应（速度优先策略）
- 不同 API 提供商的转换器支持

### 配置文件管理

#### `start-claude edit-config`

直接编辑配置文件并支持实时重载。

```bash
start-claude edit-config      # 在默认编辑器中打开配置文件
                             # 支持编辑期间的实时重载
```

**支持的编辑器：**

- VS Code（`code`）
- Cursor（`cursor`）
- Windsurf（`windsurf`）
- 记事本（`notepad`）
- 系统默认编辑器

## 环境变量

使用环境变量覆盖配置：

### CLI 覆盖选项

```bash
# API 配置
export ANTHROPIC_API_KEY="sk-your-key"
export ANTHROPIC_BASE_URL="https://api.anthropic.com"
export ANTHROPIC_MODEL="claude-sonnet-4-5-20250929"

# 代理配置
export HTTPS_PROXY="https://proxy.company.com:8080"
export HTTP_PROXY="http://proxy.company.com:8080"

# 权限设置
export CLAUDE_CODE_PERMISSION_MODE="acceptEdits"
export CLAUDE_CODE_DANGEROUS_DISABLE_PERMISSIONS="true"

# 调试和日志
export DEBUG="1"
export CLAUDE_CODE_VERBOSE="1"
```

### 高级环境变量

支持所有 Claude Code 环境变量：

```bash
# AWS/Bedrock 配置
export CLAUDE_CODE_USE_BEDROCK="1"
export AWS_BEARER_TOKEN_BEDROCK="token"

# Google Vertex 配置
export CLAUDE_CODE_USE_VERTEX="1"
export VERTEX_REGION_CLAUDE_3_5_SONNET="us-central1"

# Bash 配置
export BASH_DEFAULT_TIMEOUT_MS="120000"
export BASH_MAX_TIMEOUT_MS="600000"

# 终端设置
export CLAUDE_CODE_DISABLE_TERMINAL_TITLE="1"
export CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC="1"
```

## 使用示例

### 基本使用

```bash
# 无需配置的 CLI 覆盖快速开始
start-claude --api-key sk-your-key --model claude-sonnet-4-5-20250929

# 创建和使用配置
start-claude add                          # 交互式创建配置
start-claude myconfig                     # 使用特定配置
start-claude list                         # 查看所有配置
start-claude default myconfig             # 设为默认
start-claude                             # 使用默认配置
```

### 负载均衡设置

```bash
# 为负载均衡创建多个配置
start-claude add  # primary-api（order: 0）
start-claude add  # backup-api（order: 10）
start-claude add  # fallback-api（order: 20）

# 启用负载均衡
start-claude --balance                    # 使用所有配置
start-claude --balance primary backup     # 使用特定配置
start-claude --balance --verbose          # 带详细日志
```

### S3 同步工作流

```bash
# 初始设置
start-claude s3 setup                     # 配置 S3 凭据

# 跨设备同步配置
start-claude s3 sync                      # 智能双向同步
start-claude s3 upload --force            # 强制上传本地更改
start-claude s3 download                  # 下载远程更改
start-claude s3 status                    # 检查同步状态
```

## 退出码

start-claude 使用标准退出码：

- `0` - 成功
- `1` - 一般错误（找不到配置、无效选项等）
- `2` - Shell 命令误用（无效参数）
- `126` - 命令无法执行（权限被拒绝）
- `127` - 找不到命令（Claude Code CLI 未安装）
- `130` - 脚本被 Control-C 终止

## 配置文件

### 主配置

- **位置**: `~/.start-claude/config.json`
- **格式**: 带配置数组的 JSON
- **备份**: 更改前自动备份

### 系统设置

- **位置**: `~/.start-claude/system-settings.json`
- **格式**: 带全局系统首选项的 JSON
- **范围**: 均衡模式、S3 同步、命令覆盖设置

### 更新缓存

- **位置**: `~/.start-claude/update-check-cache.json`
- **目的**: 更新检查的速率限制
- **TTL**: 24小时

## 提示和最佳实践

1. **使用 `--balance` 实现冗余** 跨多个 API 提供商
2. **设置 S3 同步** 用于配置备份和设备同步
3. **在 Windows 上启用命令覆盖** 以获得更好的兼容性
4. **使用网页管理器** 进行复杂的配置管理
5. **在添加到负载均衡器前测试配置**
6. **使用 `order` 字段设置适当的优先级** 用于故障转移
7. **使用 `--verbose` 标志监控健康检查**
8. **使用环境变量** 进行临时覆盖
9. **在重大更改前备份配置**
10. **保护 API 密钥安全** 并为不同端点使用单独的密钥

此 CLI 参考涵盖了 start-claude 中所有可用的命令和选项。如需详细的功能指南，请参阅各组件的特定文档。