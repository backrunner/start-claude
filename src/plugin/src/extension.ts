import * as vscode from 'vscode'
import { ManagerServer } from './manager-server'

let managerServer: ManagerServer | undefined

export function activate(context: vscode.ExtensionContext): void {
  // Initialize the manager server singleton
  managerServer = new ManagerServer()

  // Register the show manager command
  const showManagerCommand = vscode.commands.registerCommand('startClaude.showManager', () => {
    ManagerPanel.createOrShow(context.extensionUri, managerServer!)
  })

  context.subscriptions.push(showManagerCommand)

  // Register tree data provider for the sidebar
  const treeDataProvider = new ManagerTreeProvider()
  vscode.window.registerTreeDataProvider('startClaudeManager', treeDataProvider)
}

export function deactivate(): void {
  if (managerServer) {
    managerServer.dispose()
    managerServer = undefined
  }
}

class ManagerTreeProvider implements vscode.TreeDataProvider<ManagerItem> {
  getTreeItem(element: ManagerItem): vscode.TreeItem {
    return element
  }

  getChildren(element?: ManagerItem): Thenable<ManagerItem[]> {
    if (!element) {
      return Promise.resolve([
        new ManagerItem('Open Manager', vscode.TreeItemCollapsibleState.None, 'startClaude.showManager'),
      ])
    }
    return Promise.resolve([])
  }
}

class ManagerItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    commandId?: string,
  ) {
    super(label, collapsibleState)
    this.tooltip = this.label
    if (commandId) {
      this.command = {
        command: commandId,
        title: label,
      }
    }
  }
}

class ManagerPanel {
  public static currentPanel: ManagerPanel | undefined

  public static readonly viewType = 'startClaudeManager'

  private readonly _panel: vscode.WebviewPanel
  private _disposables: vscode.Disposable[] = []
  private readonly _managerServer: ManagerServer

  public static createOrShow(extensionUri: vscode.Uri, managerServer: ManagerServer): void {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined

    if (ManagerPanel.currentPanel) {
      ManagerPanel.currentPanel._panel.reveal(column)
      return
    }

    const panel = vscode.window.createWebviewPanel(
      ManagerPanel.viewType,
      'Start Claude Manager',
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(extensionUri, 'media'),
          vscode.Uri.joinPath(extensionUri, '..'),
        ],
      },
    )

    ManagerPanel.currentPanel = new ManagerPanel(panel, extensionUri, managerServer)
  }

  private constructor(panel: vscode.WebviewPanel, _extensionUri: vscode.Uri, managerServer: ManagerServer) {
    this._panel = panel
    this._managerServer = managerServer

    void this._update()

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables)

    this._panel.webview.onDidReceiveMessage(
      (message: { type: string, configName: string, command: string }) => {
        // Handle messages from webview
        console.log('Message from webview:', message)

        if (message.type === 'start-claude-terminal') {
          // Start Claude in terminal
          this.startClaudeInTerminal(message.configName, message.command)
        }
      },
      null,
      this._disposables,
    )
  }

  private startClaudeInTerminal(configName: string, command: string): void {
    try {
      // Create a new terminal
      const terminal = vscode.window.createTerminal({
        name: `Claude: ${configName}`,
        iconPath: new vscode.ThemeIcon('sparkle'),
      })

      // Show the terminal and execute the command
      terminal.show()
      terminal.sendText(command)

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

  public dispose(): void {
    ManagerPanel.currentPanel = undefined

    this._panel.dispose()

    while (this._disposables.length) {
      const x = this._disposables.pop()
      if (x) {
        x.dispose()
      }
    }
  }

  private async _update(): Promise<void> {
    // Start the manager server if not already running
    await this._managerServer.start()
    const serverPort = this._managerServer.getPort()

    this._panel.webview.html = this._getHtmlForWebview(serverPort)
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
            /* cspell:disable-next-line */
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            transition: background-color 0.3s ease, color 0.3s ease;
        }
        
        iframe {
            width: 100%;
            height: 100vh;
            border: none;
        }
        
        /* Custom styles for narrow VSCode sidebar */
        @media (max-width: 400px) {
            iframe {
                transform: scale(0.8);
                transform-origin: top left;
                width: 125%;
                height: 125vh;
            }
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
            padding: 2rem;
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
            max-width: 400px;
            width: 90%;
            text-align: center;
        }
        
        .loading-content {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 1rem;
        }
        
        .loading-icon {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 3rem;
            height: 3rem;
            border-radius: calc(var(--radius) + 6px);
            background: hsl(var(--primary) / 0.1);
            margin-bottom: 0.5rem;
        }
        
        .sparkles-icon {
            width: 1.5rem;
            height: 1.5rem;
            color: hsl(var(--primary));
        }
        
        .spinner {
            width: 2rem;
            height: 2rem;
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
            font-size: 1.125rem;
            font-weight: 600;
            color: hsl(var(--foreground));
            margin: 0;
        }
        
        .loading-description {
            font-size: 0.875rem;
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
                    <h2 class="loading-title">Start Claude Manager</h2>
                    <p class="loading-description">Loading configuration manager<span class="loading-dots"></span></p>
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
</body>
</html>`
  }
}
