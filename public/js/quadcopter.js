var util = require('util');
var EventEmitter = require('events').EventEmitter;

var MsgHandler = require('./msg-handler');
var Client = require('./client');
var CmdStream = require('./cmd-stream');

function Quadcopter() {
	EventEmitter.call(this);

	var props = {
		enabled: false,
		pidEnabled: true,
		power: 0,
		motorsSpeed: null,
		features: null
	};
	this._props = props;

	this._config = null;

	var that = this;

	Object.defineProperties(this, {
		enabled: {
			enumerable: true,
			get: function () {
				return props.enabled;
			},
			set: function (val) {
				that.cmd.send('enable', val);
				props.enabled = val;
			}
		},
		pidEnabled: {
			enumerable: true,
			get: function () {
				return props.pidEnabled;
			},
			set: function (val) {
				that.cmd.send('pid-enable', val);
			}
		},
		config: {
			enumerable: true,
			get: function () {
				return that._config;
			},
			set: function (val) {
				that.cmd.send('config', val);
			}
		},
		power: {
			enumerable: true,
			get: function () {
				return props.power;
			},
			set: function (val) {
				if (val < 0) val = 0;
				if (val > 1) val = 1;

				that.cmd.send('power', val);
				props.power = val;
			}
		},
		orientation: {
			enumerable: true,
			get: function () {
				return props.orientation;
			},
			set: function (val) {
				that.cmd.send('orientation', val);
			}
		},
		rotationSpeed: {
			enumerable: true,
			get: function () {
				return props.rotationSpeed;
			},
			set: function (val) {
				that.cmd.send('rotation-speed', val);
			}
		},
		motorsSpeed: {
			enumerable: true,
			get: function () {
				return props.motorsSpeed;
			}
		},
		features: {
			enumerable: true,
			get: function () {
				return props.features;
			}
		}
	});

	this.msgHandler = new MsgHandler(this);
	this.client = new Client(this);
	this.cmd = new CmdStream(this.client);

	this.client.on('message', function (msg) {
		that.msgHandler.handle(msg);
	});
}
util.inherits(Quadcopter, EventEmitter);

Quadcopter.prototype.init = function (cb) {
	if (!cb) cb = function () {};

	this.client.connect(function (err) {
		if (err) return cb(err);

		cb(null);
	});
};

module.exports = Quadcopter;