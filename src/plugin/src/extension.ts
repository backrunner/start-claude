import * as vscode from 'vscode'
import { ManagerServer } from './manager-server'

let managerServer: ManagerServer | undefined

export function activate(context: vscode.ExtensionContext): void {
  // Initialize the manager server singleton
  managerServer = new ManagerServer()

  // Register the webview provider for the sidebar
  const provider = new ManagerWebviewProvider(context.extensionUri, managerServer)
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(ManagerWebviewProvider.viewType, provider)
  )

  // Register the show manager command (for compatibility)
  const showManagerCommand = vscode.commands.registerCommand('startClaude.showManager', () => {
    vscode.commands.executeCommand('workbench.view.explorer')
    vscode.commands.executeCommand('startClaudeManager.focus')
  })

  context.subscriptions.push(showManagerCommand)
}

export function deactivate(): void {
  if (managerServer) {
    managerServer.dispose()
    managerServer = undefined
  }
}

class ManagerWebviewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'startClaudeManager'

  private _view?: vscode.WebviewView

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _managerServer: ManagerServer
  ) {}

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    this._view = webviewView

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this._extensionUri, 'media'),
        vscode.Uri.joinPath(this._extensionUri, '..'),
      ],
    }

    void this._update()

    webviewView.webview.onDidReceiveMessage(
      (message: { type: string, configName?: string, command?: string }) => {
        console.log('Message from webview:', message)

        if (message.type === 'start-claude-terminal') {
          this.startClaudeInTerminal(message.configName!, message.command!)
        } else if (message.type === 'install-packages') {
          this.handleInstallPackages()
        } else if (message.type === 'restart-server') {
          this.handleRestartServer()
        } else if (message.type === 'retry-check') {
          void this._update()
        }
      },
    )
  }

  private startClaudeInTerminal(configName: string, command: string): void {
    try {
      const timestamp = new Date().toLocaleTimeString()
      const terminal = vscode.window.createTerminal({
        name: `Claude: ${configName} (${timestamp})`,
        iconPath: new vscode.ThemeIcon('sparkle'),
        cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
      })

      terminal.show()

      // Use the actual command from the server which should be: claude --config configName
      const actualCommand = `claude --config "${configName}"`
      
      setTimeout(() => {
        terminal.sendText(actualCommand)
      }, 100)

      vscode.window.showInformationMessage(
        `Starting Claude Code with configuration "${configName}"`,
        'Show Terminal',
      ).then((selection) => {
        if (selection === 'Show Terminal') {
          terminal.show()
        }
      })
    }
    catch (error) {
      console.error('Error starting Claude in terminal:', error)
      vscode.window.showErrorMessage(`Failed to start Claude: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  private handleInstallPackages(): void {
    try {
      // Force a fresh check and install of packages
      this._managerServer.dispose()
      this._managerServer = new ManagerServer()
      
      // This will trigger the package installation flow
      void this._update()
      
      vscode.window.showInformationMessage('Checking and installing required packages...')
    } catch (error) {
      console.error('Error handling package installation:', error)
      vscode.window.showErrorMessage(`Failed to start package installation: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  private handleRestartServer(): void {
    try {
      // Dispose the current server and create a new one
      this._managerServer.dispose()
      this._managerServer = new ManagerServer()
      
      // Retry the server startup
      void this._update()
      
      vscode.window.showInformationMessage('Restarting manager server...')
    } catch (error) {
      console.error('Error restarting server:', error)
      vscode.window.showErrorMessage(`Failed to restart server: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  private async _update(): Promise<void> {
    if (!this._view) {
      return
    }

    try {
      await this._managerServer.start()
      const serverPort = this._managerServer.getPort()
      this._view.webview.html = this._getHtmlForWebview(serverPort)
    } catch (error) {
      console.error('Failed to start manager server:', error)
      
      let errorType: 'server-failed' | 'package-missing' = 'server-failed'
      let errorDetails = error instanceof Error ? error.message : 'Unknown error'
      
      if (errorDetails.includes('Package installation cancelled') || 
          errorDetails.includes('not globally installed') ||
          errorDetails.includes('Installation verification failed')) {
        errorType = 'package-missing'
      }
      
      this._view.webview.html = this._getErrorHtmlForWebview(errorType, errorDetails)
    }
  }

  private _getHtmlForWebview(serverPort: number): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Start Claude Manager</title>
    <style>
        :root {
          --background: 0 0% 100%;
          --foreground: 240 10% 3.9%;
          --card: 0 0% 100%;
          --card-foreground: 240 10% 3.9%;
          --primary: 240 5.9% 10%;
          --primary-foreground: 0 0% 98%;
          --muted: 240 4.8% 95.9%;
          --muted-foreground: 240 3.8% 46.1%;
          --border: 240 5.9% 90%;
          --radius: 0.5rem;
        }

        @media (prefers-color-scheme: dark) {
          :root {
            --background: 240 10% 3.9%;
            --foreground: 0 0% 98%;
            --card: 240 10% 3.9%;
            --card-foreground: 0 0% 98%;
            --primary: 0 0% 98%;
            --primary-foreground: 240 5.9% 10%;
            --muted: 240 3.7% 15.9%;
            --muted-foreground: 240 5% 64.9%;
            --border: 240 3.7% 15.9%;
          }
        }

        body, html {
            margin: 0;
            padding: 0;
            height: 100vh;
            overflow: hidden;
            background: hsl(var(--background));
            color: hsl(var(--foreground));
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            transition: background-color 0.3s ease, color 0.3s ease;
        }
        
        iframe {
            width: 100%;
            height: 100vh;
            border: none;
        }
        
        .loading-container {
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            background: hsl(var(--background));
        }
        
        .loading-card {
            background: hsl(var(--card));
            border: 1px solid hsl(var(--border));
            border-radius: calc(var(--radius) + 2px);
            padding: 1.5rem;
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
            max-width: 300px;
            width: 90%;
            text-align: center;
        }
        
        .loading-content {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 0.75rem;
        }
        
        .loading-icon {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 2.5rem;
            height: 2.5rem;
            border-radius: calc(var(--radius) + 6px);
            background: hsl(var(--primary) / 0.1);
            margin-bottom: 0.25rem;
        }
        
        .sparkles-icon {
            width: 1.25rem;
            height: 1.25rem;
            color: hsl(var(--primary));
        }
        
        .spinner {
            width: 1.5rem;
            height: 1.5rem;
            border: 2px solid hsl(var(--muted));
            border-top: 2px solid hsl(var(--primary));
            border-radius: 50%;
            animation: spin 1s linear infinite;
        }
        
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        
        .loading-title {
            font-size: 1rem;
            font-weight: 600;
            color: hsl(var(--foreground));
            margin: 0;
        }
        
        .loading-description {
            font-size: 0.8rem;
            color: hsl(var(--muted-foreground));
            margin: 0;
        }
        
        .loading-dots {
            animation: dots 1.5s ease-in-out infinite;
        }
        
        @keyframes dots {
            0%, 20% { content: ''; }
            40% { content: '.'; }
            60% { content: '..'; }
            80%, 100% { content: '...'; }
        }
    </style>
</head>
<body>
    <div class="loading-container" id="loading">
        <div class="loading-card">
            <div class="loading-content">
                <div class="loading-icon">
                    <svg class="sparkles-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.582a.5.5 0 0 1 0 .963L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/>
                        <path d="M20 3v4"/>
                        <path d="M22 5h-4"/>
                        <path d="M4 17v2"/>
                        <path d="M5 18H3"/>
                    </svg>
                </div>
                <div class="spinner"></div>
                <div>
                    <h2 class="loading-title">Start Claude</h2>
                    <p class="loading-description">Loading manager<span class="loading-dots"></span></p>
                </div>
            </div>
        </div>
    </div>
    <iframe 
        id="manager-frame" 
        src="http://localhost:${serverPort}" 
        style="display: none;"
        onload="document.getElementById('loading').style.display='none'; this.style.display='block';">
    </iframe>
    
    <script>
        // Message relay between iframe and VSCode extension
        const vscode = acquireVsCodeApi();
        
        window.addEventListener('message', function(event) {
            // Relay messages from the iframe to the VSCode extension
            if (event.source === document.getElementById('manager-frame').contentWindow) {
                console.log('Relaying message from iframe to extension:', event.data);
                vscode.postMessage(event.data);
            }
        });
        
        // Also handle direct window messages for compatibility
        window.installPackages = function() {
            vscode.postMessage({ type: 'install-packages' });
        }
        
        window.restartServer = function() {
            vscode.postMessage({ type: 'restart-server' });
        }
        
        window.retryCheck = function() {
            vscode.postMessage({ type: 'retry-check' });
        }
    </script>
</body>
</html>`
  }

  private _getErrorHtmlForWebview(errorType: 'server-failed' | 'package-missing', errorDetails: string): string {
    const isPackageMissing = errorType === 'package-missing'
    const title = isPackageMissing ? 'Package Missing' : 'Server Failed'
    const description = isPackageMissing 
      ? 'Required packages are not installed'
      : 'Unable to start the manager server'
    
    const actionButtons = isPackageMissing
      ? `<div class="button-group">
           <button class="retry-button primary" onclick="window.installPackages()">Install Packages</button>
           <button class="retry-button secondary" onclick="window.retryCheck()">Retry Check</button>
         </div>`
      : `<div class="button-group">
           <button class="retry-button primary" onclick="window.restartServer()">Restart Server</button>
           <button class="retry-button secondary" onclick="window.retryCheck()">Retry Connection</button>
         </div>`

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Start Claude Manager - Error</title>
    <style>
        :root {
          --background: 0 0% 100%;
          --foreground: 240 10% 3.9%;
          --card: 0 0% 100%;
          --card-foreground: 240 10% 3.9%;
          --primary: 240 5.9% 10%;
          --primary-foreground: 0 0% 98%;
          --secondary: 240 4.8% 95.9%;
          --secondary-foreground: 240 5.9% 10%;
          --muted: 240 4.8% 95.9%;
          --muted-foreground: 240 3.8% 46.1%;
          --border: 240 5.9% 90%;
          --destructive: 0 84.2% 60.2%;
          --destructive-foreground: 0 0% 98%;
          --radius: 0.5rem;
        }

        @media (prefers-color-scheme: dark) {
          :root {
            --background: 240 10% 3.9%;
            --foreground: 0 0% 98%;
            --card: 240 10% 3.9%;
            --card-foreground: 0 0% 98%;
            --primary: 0 0% 98%;
            --primary-foreground: 240 5.9% 10%;
            --secondary: 240 3.7% 15.9%;
            --secondary-foreground: 0 0% 98%;
            --muted: 240 3.7% 15.9%;
            --muted-foreground: 240 5% 64.9%;
            --border: 240 3.7% 15.9%;
            --destructive: 0 62.8% 30.6%;
            --destructive-foreground: 0 0% 98%;
          }
        }

        body, html {
            margin: 0;
            padding: 1rem;
            min-height: calc(100vh - 2rem);
            background: hsl(var(--background));
            color: hsl(var(--foreground));
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        
        .error-container {
            background: hsl(var(--card));
            border: 1px solid hsl(var(--border));
            border-radius: calc(var(--radius) + 2px);
            padding: 2rem;
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
            max-width: 400px;
            width: 90%;
            text-align: center;
        }
        
        .error-icon {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 3rem;
            height: 3rem;
            border-radius: calc(var(--radius) + 6px);
            background: hsl(var(--destructive) / 0.1);
            margin: 0 auto 1rem;
        }
        
        .error-svg {
            width: 1.5rem;
            height: 1.5rem;
            color: hsl(var(--destructive));
        }
        
        .error-title {
            font-size: 1.25rem;
            font-weight: 600;
            color: hsl(var(--foreground));
            margin: 0 0 0.5rem;
        }
        
        .error-description {
            font-size: 0.9rem;
            color: hsl(var(--muted-foreground));
            margin: 0 0 1.5rem;
            line-height: 1.5;
        }
        
        .error-details {
            background: hsl(var(--muted));
            border-radius: var(--radius);
            padding: 1rem;
            margin: 1rem 0;
            font-size: 0.8rem;
            color: hsl(var(--muted-foreground));
            text-align: left;
            word-break: break-word;
            border: 1px solid hsl(var(--border));
        }
        
        .button-group {
            display: flex;
            gap: 0.75rem;
            justify-content: center;
            flex-wrap: wrap;
        }
        
        .retry-button {
            border: none;
            border-radius: var(--radius);
            padding: 0.75rem 1.5rem;
            font-size: 0.9rem;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s ease;
            min-width: 120px;
        }
        
        .retry-button.primary {
            background: hsl(var(--primary));
            color: hsl(var(--primary-foreground));
        }
        
        .retry-button.primary:hover {
            background: hsl(var(--primary) / 0.9);
        }
        
        .retry-button.secondary {
            background: hsl(var(--secondary));
            color: hsl(var(--secondary-foreground));
            border: 1px solid hsl(var(--border));
        }
        
        .retry-button.secondary:hover {
            background: hsl(var(--secondary) / 0.8);
        }
        
        .retry-button:active {
            transform: translateY(1px);
        }
        
        .retry-button:disabled {
            opacity: 0.6;
            cursor: not-allowed;
        }

        .help-text {
            font-size: 0.75rem;
            color: hsl(var(--muted-foreground));
            margin-top: 1rem;
            line-height: 1.4;
        }
    </style>
</head>
<body>
    <div class="error-container">
        <div class="error-icon">
            <svg class="error-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <line x1="15" y1="9" x2="9" y2="15"/>
                <line x1="9" y1="9" x2="15" y2="15"/>
            </svg>
        </div>
        <h2 class="error-title">${title}</h2>
        <p class="error-description">${description}</p>
        <div class="error-details">${errorDetails}</div>
        ${actionButtons}
        <p class="help-text">
            ${isPackageMissing 
              ? 'The plugin requires <code>@anthropic-ai/claude-code</code> and <code>start-claude</code> to be installed globally.' 
              : 'Try restarting the server or check the output panel for more details.'}
        </p>
    </div>

    <script>
        function disableButtons() {
            const buttons = document.querySelectorAll('.retry-button');
            buttons.forEach(btn => btn.disabled = true);
        }
        
        function enableButtons() {
            const buttons = document.querySelectorAll('.retry-button');
            buttons.forEach(btn => btn.disabled = false);
        }

        window.installPackages = function() {
            disableButtons();
            if (window.acquireVsCodeApi) {
                const vscode = window.acquireVsCodeApi();
                vscode.postMessage({ type: 'install-packages' });
            }
        }
        
        window.restartServer = function() {
            disableButtons();
            if (window.acquireVsCodeApi) {
                const vscode = window.acquireVsCodeApi();
                vscode.postMessage({ type: 'restart-server' });
            }
        }
        
        window.retryCheck = function() {
            disableButtons();
            if (window.acquireVsCodeApi) {
                const vscode = window.acquireVsCodeApi();
                vscode.postMessage({ type: 'retry-check' });
            }
        }
    </script>
</body>
</html>`
  }
}

