var util = require('util');
var EventEmitter = require('events').EventEmitter;

/*var createStream = function (ondata) {
	var xhr = new XMLHttpRequest();
	xhr.open('GET', '/camera', true);
	xhr.responseType = 'moz-chunked-arraybuffer'; // TODO: works only in Firefox
	xhr.onprogress = function (event) {
		ondata(xhr.response, event.loaded, event.total);
	};
	//xhr.onload = function () {
	//	ondata(xhr.response);
	//};
	xhr.send(null);

	return {
		abort: function () {
			xhr.abort();
		}
	};
};*/

function CameraPreview(cmd) {
	EventEmitter.call(this);

	this._cmd = cmd;
}
util.inherits(CameraPreview, EventEmitter);

CameraPreview.prototype._initPlayer = function () {
	var player = new Player({
		useWorker: true,
		workerFile: 'assets/broadway/Decoder.js'
	});

	this.player = player;
};

CameraPreview.prototype._startWebsocket = function (done) {
	var that = this;

	var ws = new WebSocket('ws://'+window.location.host+'/camera/socket');
	ws.binaryType = 'arraybuffer';

	ws.addEventListener('open', function () {
		done();
	});
	ws.addEventListener('error', function (event) {
		that.emit('error', 'Websocket error');
	});
	ws.addEventListener('close', function () {
		that.stop();
	});
	ws.addEventListener('message', function (event) {
		that.player.decode(event.data);
	});

	this._ws = ws;
};

CameraPreview.prototype.isStarted = function () {
	return (this._ws && this._ws.readyState == WebSocket.OPEN);
};

CameraPreview.prototype.start = function () {
	var that = this;

	if (this.isStarted()) return;

	this._cmd.send('camera-preview', true);

	this._initPlayer();

	this._startWebsocket(function () {
		that.emit('start');
	});
};

CameraPreview.prototype.stop = function () {
	if (!this.isStarted()) return;

	this._ws.close();
	this._decoder.terminate();
	// TODO: this.player
};

CameraPreview.prototype.restart = function () {
	this.stop();
	this.start();
};

CameraPreview.prototype.play = function () {
	if (!this.isStarted()) return this.start();
	this._ws.send('play');
};

CameraPreview.prototype.pause = function () {
	if (!this.isStarted()) return;
	this._ws.send('pause');
};

module.exports = CameraPreview;
