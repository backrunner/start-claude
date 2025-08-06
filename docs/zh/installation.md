# 安装指南

## 从 npm 安装（推荐）

```bash
npm install -g start-claude
```

## 从源码安装

```bash
git clone https://github.com/your-username/start-claude.git
cd start-claude
npm install
npm run build
npm link
```

## 前提条件

- Node.js 18+
- npm（用于安装和 Claude Code CLI）

## 自动安装功能

如果未安装 Claude Code CLI，`start-claude` 将：

1. 检测到 Claude Code 缺失
2. 询问："未安装 Claude Code CLI。您想要自动安装吗？"
3. 通过 `npm install -g @anthropic-ai/claude-code` 安装
4. 自动使用您的配置启动 Claude

**无需手动安装步骤！**

## 验证安装

安装后，验证 start-claude 是否正常工作：

```bash
start-claude --help
# 或使用短别名
sc --help
```

## 故障排除

### Linux/macOS 上的权限问题

如果在全局安装期间遇到权限错误：

```bash
# 使用 sudo 运行 npm（不推荐）
sudo npm install -g start-claude

# 更好的方法：配置 npm 使用不同目录
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.bashrc
source ~/.bashrc
npm install -g start-claude
```

### Windows 路径问题

如果安装后无法识别命令：

1. 重启您的终端/命令提示符
2. 验证 npm 全局目录在您的 PATH 中
3. 运行 `npm config get prefix` 查看全局目录
4. 必要时将该目录添加到您的 Windows PATH

### 更新到最新版本

```bash
npm update -g start-claude
```

### 卸载

```bash
npm uninstall -g start-claude
```