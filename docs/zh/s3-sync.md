# S3 同步指南

使用 Amazon S3 或任何 S3 兼容的存储服务在多个设备之间同步您的配置。

## 支持的存储服务

- **Amazon S3** - AWS 的原生对象存储
- **Cloudflare R2** - 具有 S3 兼容性的零出口存储
- **Backblaze B2** - 通过 S3 兼容 API 提供的经济高效云存储
- **任何 S3 兼容服务** - 支持自定义端点

## 快速设置

```bash
# 设置 S3/S3 兼容同步（交互式）
start-claude s3-setup

# 上传本地配置到存储
start-claude s3-upload

# 从存储下载配置
start-claude s3-download

# 检查同步状态
start-claude s3-status
```

## 设置流程

1. **服务选择**：从 Amazon S3、Cloudflare R2、Backblaze B2 或自定义 S3 兼容服务中选择
2. **凭据设置**：提示输入服务特定的凭据和配置
3. **连接测试**：自动测试连接并检查现有的远程配置
4. **冲突解决**：智能处理冲突（本地 vs 远程配置）
5. **自动下载**：如果不存在本地配置，自动下载远程配置

## 服务特定设置示例

### Amazon S3

```bash
start-claude s3-setup
# 选择：Amazon S3
# 存储桶名称：my-claude-configs
# AWS 区域：us-east-1
# AWS 访问密钥 ID：your-access-key
# AWS 秘密访问密钥：your-secret-key
# 存储桶中的文件路径：start-claude-config.json
```

### Cloudflare R2

```bash
start-claude s3-setup
# 选择：Cloudflare R2
# 存储桶名称：my-claude-configs
# AWS 区域：us-east-1
# R2 令牌（访问密钥 ID）：your-r2-token
# R2 秘钥：your-r2-secret
# R2 端点 URL：https://abc123.r2.cloudflarestorage.com
# 存储桶中的文件路径：start-claude-config.json
```

### Backblaze B2

```bash
start-claude s3-setup
# 选择：Backblaze B2
# 存储桶名称：my-claude-configs
# 区域：us-west-004
# 应用程序密钥 ID：your-key-id
# 应用程序密钥：your-application-key
# B2 端点 URL：https://s3.us-west-004.backblazeb2.com
# 存储桶中的文件路径：start-claude-config.json
```

### 自定义 S3 兼容服务

```bash
start-claude s3-setup
# 选择：其他 S3 兼容服务
# 存储桶名称：my-claude-configs
# 区域：your-region
# 访问密钥 ID：your-access-key
# 秘密访问密钥：your-secret
# 自定义端点 URL：https://your-s3-compatible-endpoint.com
# 存储桶中的文件路径：start-claude-config.json
```

## 命令

### 设置和配置

- `start-claude s3-setup` - S3 同步的交互式设置
- `start-claude s3-status` - 显示当前 S3 同步状态和配置

### 同步命令

- `start-claude s3-sync` - 双向同步（根据需要上传和下载）
- `start-claude s3-upload` - 将本地配置上传到远程存储
- `start-claude s3-download` - 从远程存储下载配置
- `start-claude s3-download -f` - 强制下载（覆盖本地配置）

## 工作原理

### 上传过程

1. 从 `~/.start-claude/config.json` 读取本地配置
2. 将整个配置文件上传到您指定的 S3 存储桶
3. 保留所有设置，包括配置和同步设置

### 下载过程

1. 使用存储的凭据连接到您的 S3 存储桶
2. 下载远程配置文件
3. 根据您的选择合并或替换本地配置
4. 保留本地 S3 同步设置

### 同步过程

同步命令智能处理冲突：

- **没有本地配置**：自动下载远程配置
- **没有远程配置**：上传本地配置
- **两者都存在**：提示冲突解决（上传、下载或取消）

## 安全考虑

- **凭据**：S3 凭据存储在本地的 `~/.start-claude/config.json` 中
- **加密**：配置以明文存储 - 确保您的 S3 存储桶有适当的访问控制
- **API 密钥**：您的 Claude API 密钥包含在同步的配置中 - 相应地保护您的 S3 存储桶

## 最佳实践

1. **私有存储桶**：始终使用私有 S3 存储桶来存储配置
2. **最小权限**：使用具有最小所需权限的 S3 凭据
3. **定期备份**：您的 S3 存储桶作为备份 - 考虑版本控制
4. **团队共享**：为不同的团队或环境使用单独的存储桶/路径

## 故障排除

### 连接问题

```bash
# 检查 S3 状态和连接
start-claude s3-status

# 重新运行设置以修复凭据
start-claude s3-setup
```

### 权限错误

确保您的 S3 凭据具有以下权限：
- `s3:GetObject`
- `s3:PutObject` 
- `s3:ListBucket`（可选，用于更好的错误消息）

### 同步冲突

如果遇到同步冲突：

1. 使用 `start-claude s3-download -f` 强制下载远程配置
2. 或使用 `start-claude s3-upload` 强制上传本地配置
3. 或通过编辑配置手动解决冲突

## S3 中的配置存储

上传的配置文件保持与您本地 `config.json` 相同的格式：

```json
{
  "configs": [
    {
      "name": "production",
      "profileType": "default",
      "apiKey": "sk-ant-...",
      "baseUrl": "https://api.anthropic.com",
      "model": "claude-sonnet-4-20250514",
      "isDefault": true
    }
  ],
  "settings": {
    "overrideClaudeCommand": false
  }
}
```

注意：S3 同步设置不会上传以防止递归配置问题。