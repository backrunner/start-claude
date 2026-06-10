import * as net from 'node:net';
export async function isPortAvailable(port) {
    return new Promise((resolve) => {
        const server = net.createServer();
        server.once('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                resolve(false);
            }
            else {
                resolve(false);
            }
        });
        server.once('listening', () => {
            server.close();
            resolve(true);
        });
        server.listen(port, 'localhost');
    });
}
export async function findAvailablePort(startPort, maxAttempts = 10) {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const port = startPort + attempt;
        if (await isPortAvailable(port)) {
            return port;
        }
    }
    return null;
}
