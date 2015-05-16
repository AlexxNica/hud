var child = require('child_process');
var fs = require('fs');
var extend = require('extend');

var raspivid = function (options) {
	options = options || {};

	var args = [
		'--nopreview'
	];

	Object.keys(options).forEach(function (key) {
		var val = options[key];
		if (!val && val !== 0 && val !== '') return;

		args.push('--' + key);
		if ((val || val === 0) && val !== true && val !== '') {
			args.push(val);
		}
	});

	if (!options.output) {
		args.push('-o');
		args.push('-');
	}

	console.log('raspivid', args.join(' '));

	return child.spawn('raspivid', args, {
		stdio: ['ignore', 'pipe', 'inherit']
	});
};

// Doesnt support non-seekable streams with mp4
var avconv = function () {
	var args = [
		'-i',
		'pipe:0',
		'-f',
		'mp4',
		'-loglevel',
		'error', // See http://blog.jungkyungsuk.com/tag/loglevel/
		'pipe:1'
	];

	return child.spawn('avconv', args, {
		stdio: ['pipe', 'pipe', 'inherit']
	});
};

// Doesn't support mp4 streaming
var cvlc = function () {
	var args = [
		'-I',
		'dummy',
		'-v',
		'v4l2:///dev/video0',
		'--v4l2-chroma',
		'h264',
		'--v4l2-width',
		'800',
		'--v4l2-height',
		'600',
		'--sout',
		//'#standard{access=file,mux=mp4,dst=-}',
		'#standard{access=http,mux=ts,dst=0.0.0.0:3001}', // TODO
		':demux=h264'
	];

	// cvlc v4l2:///dev/video0 --v4l2-width 800 --v4l2-height 600 --v4l2-chroma h264 --sout '#standard{access=http,mux=ts,dst=0.0.0.0:12345}' -vvv

	return child.spawn('cvlc', args, {
		stdio: ['pipe', 'pipe', 'inherit']
	});
};

function Camera(quad) {
	var that = this;
	this.quad = quad;

	this._recorder = null;

	Object.defineProperties(this, {
		enabled: {
			enumerable: true,
			get: function () {
				return (that._recorder) ? true : false;
			}
		},
		previewEnabled: {
			set: function (val) {
				if (val) {
					that.startPreview();
				} else {
					that.stop();
				}
			}
		},
		recording: {
			set: function (val) {
				if (val) {
					that.startRecording();
				} else {
					that.stop();
				}
			}
		},
		stream: {
			enumerable: true,
			get: function () {
				if (!that._recorder) return;
				return that._recorder.stdout;
			}
		}
	});
}

Camera.prototype._start = function (opts) {
	if (this._recorder) this.stop();

	opts = extend({
		timeout: 0
	}, opts);

	return raspivid(opts);
};

Camera.prototype.startPreview = function () {
	this._recorder = this._start(this.quad.config.camera.preview);
	console.log('Camera preview');
};

Camera.prototype.startRecording = function () {
	// TODO: proxy output through stream
	this._recorder = this._start(this.quad.config.camera.record);
	console.log('Camera recording');
};

Camera.prototype.stop = function () {
	if (!this._recorder) return;

	this._recorder.kill();
	this._recorder = null;

	console.log('Camera stopped');
};

module.exports = Camera;