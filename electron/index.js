const net = require('net');
const electron = require('electron');
const co = require('co');

const app = electron.app;
const BrowserWindow = electron.BrowserWindow;

const windows = new Map();
const appReady = new Promise(resolve => {
	app.on('ready', resolve);
});

let server = net.createServer({ allowHalfOpen: true }, (connection) => {
	let data = '';
	connection.setEncoding('utf-8');

	connection.on('data', text => data += text);
	connection.on('end', co.wrap(function* () {
		yield appReady;

		const message = JSON.parse(data);
		const window = windows.get(message.id);

		switch (message.type) {
			case 'createWindow':
				const _window = new BrowserWindow(Object.assign({
					webPreferences: {
						partition: `nopersist:client-${message.id}`
					},
					show: false
				}, message.payload));

				windows.set(message.id, _window);
				write({
					type: 'success'
				});
				break;

			case 'setCookies':
				window.webContents.session.cookies.set(message.payload, (err, cookie) => {
					if (err) {
						write({
							type: 'error',
							payload: err,
						});
					}

					write({
						type: 'success',
						payload: cookie,
					});
				});
				break;

			case 'loadURL':
				window.loadURL(message.payload);
				window.webContents.once('did-finish-load', () => {
					write({
						type: 'success',
					});
				});
				break;

			case 'evaluate':
				window.webContents.executeJavaScript(message.payload, function (result) {
					write({
						type: 'success',
						payload: result,
					})
				});
				break;

			case 'end':
				window.once('closed', () => {
					windows.delete(message.id);
					write({
						type: 'success',
					})
				});
				window.close();
				break;

			case 'refresh':
				message.payload ? window.webContents.reloadIgnoringCache() : window.reload();
				window.webContents.once('did-finish-load', () => {
					write({
						type: 'success',
					});
				});
		}

		function write(message) {
			connection.write(JSON.stringify(message));
			connection.end();
		}
	}));
});

server.listen(9999);
