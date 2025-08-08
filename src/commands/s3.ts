import inquirer from 'inquirer'
import { S3SyncManager } from '../storage/s3-sync'
import { ConfigManager } from '../core/config'
import { displayError, displayInfo, displayWelcome } from '../utils/ui'

export async function handleS3SetupCommand(): Promise<void> {
  displayWelcome()

  const s3SyncManager = new S3SyncManager()

  interface S3SetupAnswers {
    serviceType: 's3' | 'r2' | 'b2' | 'custom'
    bucket: string
    region: string
    accessKeyId: string
    secretAccessKey: string
    endpointUrl?: string
    key: string
  }

  const answers: S3SetupAnswers = await inquirer.prompt([
    {
      type: 'list',
      name: 'serviceType',
      message: 'Select storage service:',
      choices: [
        { name: 'Amazon S3', value: 's3' },
        { name: 'Cloudflare R2', value: 'r2' },
        { name: 'Backblaze B2', value: 'b2' },
        { name: 'Other S3-compatible service', value: 'custom' },
      ],
      default: 's3',
    },
    {
      type: 'input',
      name: 'bucket',
      message: 'Bucket name:',
      validate: (input: string) => input.trim() ? true : 'Bucket name is required',
    },
    {
      type: 'input',
      name: 'region',
      message: (answers: Partial<S3SetupAnswers>) => {
        if (answers.serviceType === 'r2')
          return 'AWS Region (e.g., us-east-1):'
        if (answers.serviceType === 'b2')
          return 'Region (e.g., us-west-004):'
        return 'AWS Region:'
      },
      default: 'us-east-1',
      validate: (input: string) => input.trim() ? true : 'Region is required',
    },
    {
      type: 'input',
      name: 'accessKeyId',
      message: (answers: Partial<S3SetupAnswers>) => {
        if (answers.serviceType === 'r2')
          return 'R2 Token (Access Key ID):'
        if (answers.serviceType === 'b2')
          return 'Application Key ID:'
        return 'AWS Access Key ID:'
      },
      validate: (input: string) => input.trim() ? true : 'Access Key ID is required',
    },
    {
      type: 'password',
      name: 'secretAccessKey',
      message: (answers: Partial<S3SetupAnswers>) => {
        if (answers.serviceType === 'r2')
          return 'R2 Secret:'
        if (answers.serviceType === 'b2')
          return 'Application Key:'
        return 'AWS Secret Access Key:'
      },
      mask: '*',
      validate: (input: string) => input.trim() ? true : 'Secret Access Key is required',
    },
    {
      type: 'input',
      name: 'endpointUrl',
      message: (answers: Partial<S3SetupAnswers>) => {
        if (answers.serviceType === 'r2')
          return 'R2 Endpoint URL (e.g., https://abc123.r2.cloudflarestorage.com):'
        if (answers.serviceType === 'b2')
          return 'B2 Endpoint URL (optional):'
        return 'Custom endpoint URL (optional):'
      },
      when: (answers: Partial<S3SetupAnswers>) => answers.serviceType !== 's3',
      default: (answers: Partial<S3SetupAnswers>) => {
        if (answers.serviceType === 'b2') {
          return `https://s3.${answers.region}.backblazeb2.com`
        }
        return ''
      },
      validate: (input: string, answers?: Partial<S3SetupAnswers>) => {
        if ((answers?.serviceType === 'custom' || answers?.serviceType === 'r2') && !input.trim()) {
          return 'Endpoint URL is required'
        }
        return true
      },
    },
    {
      type: 'input',
      name: 'key',
      message: 'File path in bucket:',
      default: 'start-claude-config.json',
      validate: (input: string) => input.trim() ? true : 'File path is required',
    },
  ])

  const s3Config = {
    bucket: answers.bucket.trim(),
    region: answers.region.trim(),
    accessKeyId: answers.accessKeyId.trim(),
    secretAccessKey: answers.secretAccessKey.trim(),
    key: answers.key.trim(),
    endpointUrl: answers.endpointUrl?.trim() || undefined,
  }

  await s3SyncManager.setupS3Sync(s3Config)
}

export async function handleS3SyncCommand(): Promise<void> {
  displayWelcome()

  const s3SyncManager = new S3SyncManager()
  if (!s3SyncManager.isS3Configured()) {
    displayError('S3 sync is not configured. Run "start-claude s3-setup" first.')
    return
  }

  await s3SyncManager.syncConfigs()
}

export async function handleS3UploadCommand(): Promise<void> {
  displayWelcome()

  const s3SyncManager = new S3SyncManager()
  if (!s3SyncManager.isS3Configured()) {
    displayError('S3 sync is not configured. Run "start-claude s3-setup" first.')
    return
  }

  await s3SyncManager.uploadConfigs()
}

export async function handleS3DownloadCommand(options: { force?: boolean }): Promise<void> {
  displayWelcome()

  const s3SyncManager = new S3SyncManager()
  const configManager = new ConfigManager()

  if (!s3SyncManager.isS3Configured()) {
    displayError('S3 sync is not configured. Run "start-claude s3-setup" first.')
    return
  }

  if (!options.force) {
    const localConfigs = configManager.listConfigs()
    if (localConfigs.length > 0) {
      const overwriteAnswer = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'overwrite',
          message: 'Local configurations exist. Overwrite them with remote configurations?',
          default: false,
        },
      ])

      if (!overwriteAnswer.overwrite) {
        displayInfo('Download cancelled.')
        return
      }
    }
  }

  await s3SyncManager.downloadConfigs(true)
}

export async function handleS3StatusCommand(): Promise<void> {
  displayWelcome()
  const s3SyncManager = new S3SyncManager()
  displayInfo(`S3 Sync Status: ${s3SyncManager.getS3Status()}`)
}