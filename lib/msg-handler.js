function MsgHandler(quad) {
	this.quad = quad;
}

MsgHandler.prototype = {
	handle: function (msg) {
		var msgBuilder = this.quad.server.msgBuilder;

		if (!this[msg.cmd] || msg.cmd == 'handle') {
			return msgBuilder.error('Invalid command: "'+msg.cmd+'"');
		}

		return this[msg.cmd](msg.opts);
	},
	power: function (val) {
		this.quad.power = val;
		console.log('SET power:', val);
	},
	orientation: function (data) {
		this.quad.orientation = data;
		console.log('SET orientation:', data);
	},
	'rotation-speed': function (data) { // TODO: remove this (just for testing)
		// Update rotation speed (deg/s)
		this.quad.rotationSpeed = data;
	},
	enable: function (val) {
		this.quad.enabled = val;
		console.log('SET enabled', val);
	},
	'pid-enable': function (val) {
		this.quad.pidEnabled = val;
		console.log('SET PID enabled', val);
	},
	config: function (data) {
		this.quad.config = data;
		// TODO: propagate config changes
		console.info('Config updated.', data);
	},
	'camera-preview': function (val) {
		if (this.quad.camera.enabled && this.quad.config.camera.previewWhenRecording) return;
		this.quad.camera.previewing = val;
	},
	'camera-record': function (val) {
		this.quad.camera.recording = val;
	}
};

module.exports = MsgHandler;