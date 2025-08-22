# Start Claude VSCode Extension

## Development

1. Install dependencies:
```bash
npm install
```

2. Compile the extension:
```bash
npm run compile
```

3. Open VSCode and press F5 to launch the extension in a new Extension Development Host window.

4. In the Extension Development Host window, you can test the extension by:
   - Opening the Command Palette (Ctrl+Shift+P / Cmd+Shift+P)
   - Running the command "Start Claude: Show Manager"
   - Or clicking on the Start Claude icon in the Activity Bar

## Features

- Displays the Start Claude Manager in a VSCode webview panel
- Automatically starts and manages the manager server
- Singleton pattern ensures only one server instance runs
- Responsive UI optimized for VSCode sidebar width
- Integrates with VSCode Activity Bar and sidebar

## Extension Structure

- `src/extension.ts` - Main extension entry point
- `src/manager-server.ts` - Manager server lifecycle management
- `package.json` - Extension manifest and dependencies
- `.vscode/` - VSCode development configuration