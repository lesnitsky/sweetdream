'use strict';

const electronPath = require('electron-prebuilt');
const spawn        = require('child_process').spawn;
const net          = require('net');
const co           = require('co');
const path         = require('path');
const fs           = require('fs');

const electronProcess = spawn(electronPath, [`${__dirname}/electron`], {
	stdio: 'inherit'
});

let id = 0;

const api = {};

api.setCookies = co.wrap(function* (config) {
	const res = yield this._write('setCookies', config);

	// console.log('setCookies:', res);
});


api.goto = co.wrap(function* (url) {
	const res = yield this._write('loadURL', url);

	// console.log('goto:', res);
});

api.evaluate = co.wrap(function* (fn) {
	const args = Array.from(arguments).slice(1);

	const result = yield this._write('evaluate', `
	 // evaluate
		(function () {
			try {
				return (${fn}).apply(null, ${args && JSON.stringify(args)})
			} catch (err) {
				return { status: 'error', err: err.message };
			}
		})();
	`);

	// console.log('evaluate:', result);

	return result.payload;
});

api.inject = co.wrap(function* (type, path) {
	if (type === 'css') {
		throw new Error('css injection is not yet supported');
	}

	if (type === 'js') {
		const scriptContent = fs.readFileSync(path, 'utf-8');
		const res = yield this._write('evaluate', `
			// inject
			(function () {
				try {
					${scriptContent}
				} catch (err) {
					return err;
				}
			})()`
		);

		// console.log('inject:', res);
	}
});


api.end = co.wrap(function* () {
	const res = yield this._write('end');

	// console.log('end:', res);
});


api.refresh = co.wrap(function* (ignoreCache) {
	const res = yield this._write('refresh', ignoreCache);

	// console.log('refresh:', res);
});

api.wait = co.wrap(function* (fn) {
	const start = Date.now();
	const args = Array.from(arguments);

	let done = false;
	let result;
	let resultPromise;

	while (!done && Date.now() - start < this.waitTimeout) {
		result = yield this.evaluate.apply(this, args);

		// console.log('wait:', result);

		if (result !== true) {
			yield wait(1000);
			continue;
		}

		return result;
	}

	if (!done) {
		throw new Error(`Timeout: ${fn}`);
	}
});

function wait(ms) {
	return new Promise(resolve => {
		setTimeout(resolve, ms);
	});
}

api._write = co.wrap(function* (type, payload) {
	const id = this.id;

	const connection = net.createConnection({ port: 9999 })

	return yield new Promise((resolve, reject) => {
		let data = '';

		connection.on('data', text => data += text);

		connection.on('end', () => {
			const res = JSON.parse(data);
			resolve(res);
		});

		connection.write(JSON.stringify({
			id: id,
			type,
			payload
		}));

		connection.end();
	});
});


const API = {
	create: function (waitTimeout) {
		waitTimeout = waitTimeout || 5000;

		return {
			__proto__: api,
			id: id++,
			waitTimeout
		}
	}
}

module.exports = API;
