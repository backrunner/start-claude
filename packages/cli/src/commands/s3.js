import inquirer from 'inquirer';
import { S3SyncManager } from '../storage/s3-sync';
import { UILogger } from '../utils/cli/ui';
export async function handleS3SetupCommand(options = {}) {
    const ui = new UILogger(options.verbose);
    ui.displayWelcome();
    const s3SyncManager = S3SyncManager.getInstance();
    const answers = await inquirer.prompt([
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
            validate: (input) => input.trim() ? true : 'Bucket name is required',
        },
        {
            type: 'input',
            name: 'region',
            message: (answers) => {
                if (answers.serviceType === 'r2')
                    return 'AWS Region (e.g., us-east-1):';
                if (answers.serviceType === 'b2')
                    return 'Region (e.g., us-west-004):';
                return 'AWS Region:';
            },
            default: 'us-east-1',
            validate: (input) => (input.trim() ? true : 'Region is required'),
        },
        {
            type: 'input',
            name: 'accessKeyId',
            message: (answers) => {
                if (answers.serviceType === 'r2')
                    return 'R2 Token (Access Key ID):';
                if (answers.serviceType === 'b2')
                    return 'Application Key ID:';
                return 'AWS Access Key ID:';
            },
            validate: (input) => input.trim() ? true : 'Access Key ID is required',
        },
        {
            type: 'password',
            name: 'secretAccessKey',
            message: (answers) => {
                if (answers.serviceType === 'r2')
                    return 'R2 Secret:';
                if (answers.serviceType === 'b2')
                    return 'Application Key:';
                return 'AWS Secret Access Key:';
            },
            mask: '*',
            validate: (input) => input.trim() ? true : 'Secret Access Key is required',
        },
        {
            type: 'input',
            name: 'endpointUrl',
            message: (answers) => {
                if (answers.serviceType === 'r2')
                    return 'R2 Endpoint URL (e.g., https://abc123.r2.cloudflarestorage.com):';
                if (answers.serviceType === 'b2')
                    return 'B2 Endpoint URL (optional):';
                return 'Custom endpoint URL (optional):';
            },
            when: (answers) => answers.serviceType !== 's3',
            default: (answers) => {
                if (answers.serviceType === 'b2') {
                    return `https://s3.${answers.region}.backblazeb2.com`;
                }
                return '';
            },
            validate: (input, answers) => {
                if ((answers?.serviceType === 'custom'
                    || answers?.serviceType === 'r2')
                    && !input.trim()) {
                    return 'Endpoint URL is required';
                }
                return true;
            },
        },
        {
            type: 'input',
            name: 'key',
            message: 'File path in bucket:',
            default: 'start-claude-config.json',
            validate: (input) => input.trim() ? true : 'File path is required',
        },
    ]);
    const s3Config = {
        bucket: answers.bucket.trim(),
        region: answers.region.trim(),
        accessKeyId: answers.accessKeyId.trim(),
        secretAccessKey: answers.secretAccessKey.trim(),
        key: answers.key.trim(),
        endpointUrl: answers.endpointUrl?.trim() || undefined,
    };
    await s3SyncManager.setupS3Sync(s3Config, { verbose: options.verbose });
}
export async function handleS3SyncCommand(options = {}) {
    const ui = new UILogger(options.verbose);
    ui.displayWelcome();
    const s3SyncManager = S3SyncManager.getInstance();
    if (!(await s3SyncManager.isS3Configured())) {
        ui.displayError('S3 sync is not configured. Run "start-claude s3 setup" first.');
        return;
    }
    await s3SyncManager.syncConfigs({ verbose: options.verbose });
}
export async function handleS3UploadCommand(options = {}) {
    const ui = new UILogger(options.verbose);
    ui.displayWelcome();
    const s3SyncManager = S3SyncManager.getInstance();
    if (!(await s3SyncManager.isS3Configured())) {
        ui.displayError('S3 sync is not configured. Run "start-claude s3 setup" first.');
        return;
    }
    await s3SyncManager.uploadConfigs(options.force || false, {
        verbose: options.verbose,
    });
}
export async function handleS3DownloadCommand(options = {}) {
    const ui = new UILogger(options.verbose);
    ui.displayWelcome();
    const s3SyncManager = S3SyncManager.getInstance();
    if (!(await s3SyncManager.isS3Configured())) {
        ui.displayError('S3 sync is not configured. Run "start-claude s3 setup" first.');
        return;
    }
    await s3SyncManager.downloadConfigs(options.force || false, {
        silent: false,
        verbose: options.verbose,
    });
}
export async function handleS3StatusCommand(options = {}) {
    const ui = new UILogger(options.verbose);
    ui.displayWelcome();
    const s3SyncManager = S3SyncManager.getInstance();
    ui.displayInfo(`S3 Sync Status: ${await s3SyncManager.getS3Status()}`);
    if (options.verbose) {
        const settings = await s3SyncManager.getSystemSettings();
        if (settings.s3Sync) {
            ui.displayVerbose(`S3 Configuration Details:`);
            ui.displayVerbose(`  Bucket: ${settings.s3Sync.bucket}`);
            ui.displayVerbose(`  Region: ${settings.s3Sync.region}`);
            if (settings.s3Sync.endpointUrl) {
                ui.displayVerbose(`  Endpoint: ${settings.s3Sync.endpointUrl}`);
            }
        }
    }
}
