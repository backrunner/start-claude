# 开发指南

## 前提条件

- Node.js 18+
- npm（用于安装和 Claude Code CLI）

## 设置

```bash
git clone https://github.com/your-username/start-claude.git
cd start-claude
npm install
```

## 可用脚本

- `npm run build` - 构建项目
- `npm run watch` - 构建并监视文件变化
- `npm run lint` - 运行 ESLint
- `npm run lint:fix` - 修复 linting 问题
- `npm test` - 运行测试
- `npm run test:run` - 运行一次测试
- `npm run test:coverage` - 运行测试并生成覆盖率报告

## 测试

项目使用 Vitest 进行测试：

```bash
# 运行测试
npm test

# 运行测试并生成覆盖率报告
npm run test:coverage

# 运行特定测试文件
npm test -- tests/config.test.ts

# 监视模式
npm run test:watch
```

## 项目结构

```
src/
├── cli/
│   ├── balance.ts        # 负载均衡器 CLI 处理
│   ├── claude.ts         # Claude CLI 集成和自动安装
│   ├── common.ts         # 通用 CLI 工具
│   ├── main.ts           # 主 CLI 应用程序
│   └── override.ts       # Claude 命令覆盖功能
├── core/
│   ├── config.ts         # 配置管理逻辑
│   ├── load-balancer.ts  # 负载均衡器实现
│   └── types.ts          # TypeScript 类型定义
├── storage/
│   └── s3-sync.ts        # S3 同步功能
└── utils/
    ├── detection.ts      # Claude 安装检测
    ├── editor.ts         # 编辑器集成
    ├── ui.ts             # 用户界面工具
    └── update-checker.ts # 自动更新功能

tests/                    # 测试文件镜像 src 结构
docs/                     # 文档
├── en/                   # 英文文档
└── zh/                   # 中文文档
```

## 架构概述

### 配置管理

`ConfigManager` 类处理：
- 读取/写入配置文件
- 验证和类型检查
- 默认配置管理
- 配置文件格式版本控制

### 负载均衡器

`LoadBalancer` 类提供：
- 多端点健康监控
- 轮询请求分发
- 自动故障转移和恢复
- 基于优先级的端点排序

### CLI 接口

使用 Commander.js 构建：
- 命令解析和验证
- 使用 Inquirer.js 的交互式提示
- 使用自定义 UI 工具的彩色输出
- 全面的帮助和错误消息

### 存储同步

S3 兼容同步：
- 多提供商支持（AWS S3、Cloudflare R2、Backblaze B2）
- 冲突解决策略
- 安全凭据管理

## 代码风格

项目使用严格配置的 ESLint：

```bash
# 检查代码风格
npm run lint

# 自动修复风格问题
npm run lint:fix
```

主要风格指导原则：
- 启用 TypeScript 严格模式
- 需要明确的函数返回类型
- 不允许未使用的变量
- 一致的导入/导出排序
- 需要尾随逗号

## 测试策略

### 单元测试

每个主要组件都有全面的单元测试：
- 配置管理（`config.test.ts`）
- 负载均衡器功能（`load-balancer.test.ts`）
- CLI 命令（`claude.test.ts`）
- S3 同步操作（`s3-sync.test.ts`）
- 编辑器集成（`editor.test.ts`）

### Mock 策略

测试使用 Vitest mock：
- 文件系统操作
- HTTP 请求
- 子进程执行
- UI 输出函数

### 测试数据

测试配置和夹具内联定义以确保测试隔离。

## 构建和分发

### 构建过程

项目使用 Rollup 进行构建：

```bash
npm run build
```

这会创建：
- `bin/cli.cjs` - CommonJS 包
- `bin/cli.mjs` - ES 模块包

### 包配置

`package.json` 包括：
- 双模块支持（CJS + ESM）
- 可执行二进制配置
- 全面的依赖管理
- npm 发布配置

## 贡献

### 开发工作流

1. Fork 仓库
2. 创建功能分支：`git checkout -b feature/amazing-feature`
3. 进行更改
4. 为您的更改添加测试
5. 运行测试：`npm test`
6. 运行 linting：`npm run lint:fix`
7. 提交更改：`git commit -m 'Add amazing feature'`
8. 推送到分支：`git push origin feature/amazing-feature`
9. 打开 Pull Request

### 提交消息指导原则

使用约定式提交：
- `feat:` - 新功能
- `fix:` - 错误修复
- `docs:` - 文档更改
- `test:` - 测试更改
- `refactor:` - 代码重构
- `chore:` - 构建过程或辅助工具更改

### 代码审查流程

Pull Request 需要：
- 所有测试通过
- Linting 检查通过
- 代码审查批准
- 新功能的文档更新

## 调试

### 本地开发

```bash
# 构建并链接以进行本地测试
npm run build
npm link

# 测试 CLI 命令
start-claude --help
```

### 调试配置

项目包括 VS Code 调试配置：

```json
{
  "type": "node",
  "request": "launch", 
  "name": "Debug CLI",
  "program": "${workspaceFolder}/bin/cli.mjs",
  "args": ["--help"],
  "skipFiles": ["<node_internals>/**"]
}
```

### 常见调试场景

1. **配置问题**：检查 `~/.start-claude/config.json` 格式
2. **S3 同步问题**：验证凭据和存储桶权限
3. **负载均衡器**：监控健康检查请求和响应
4. **编辑器集成**：检查编辑器检测和路径解析

## 性能考虑

### 启动性能

- 重依赖项的延迟加载
- 配置缓存
- 最小化初始文件读取

### 内存使用

- 大文件操作的流处理
- 临时文件的适当清理
- 限制并发操作

### 网络操作

- 请求超时和重试
- 健康检查的连接池
- 网络问题的优雅降级

## 安全

### 凭据管理

- API 密钥存储在用户主目录中
- 文件权限仅限用户
- 不记录或不必要地传输凭据

### 输入验证

- 所有用户输入都经过验证和清理
- 配置格式验证
- 安全的文件路径处理

### 依赖安全

定期安全审计：
```bash
npm audit
npm audit fix
```

## 发布流程

### 版本管理

项目遵循语义版本控制：
- Major：破坏性更改
- Minor：新功能，向后兼容
- Patch：错误修复，向后兼容

### 发布检查清单

1. 更新 `package.json` 中的版本
2. 更新 CHANGELOG.md
3. 运行完整测试套件
4. 构建并测试分发
5. 创建 git 标签
6. 发布到 npm
7. 创建带有说明的 GitHub 发布

## 开发问题故障排除

### 构建问题

```bash
# 清除 node_modules 并重新安装
rm -rf node_modules package-lock.json
npm install

# 清除 TypeScript 缓存
npm run build -- --clean
```

### 测试问题

```bash
# 运行带详细输出的测试
npm test -- --reporter=verbose

# 运行特定测试模式
npm test -- --grep "configuration"
```

### Linting 问题

```bash
# 查看详细的 linting 错误
npm run lint -- --format=codeframe

# 修复可自动修复的问题
npm run lint:fix
```