'use strict';

var PidController = require('node-pid-controller');
var BaseUpdater = require('./base');

/**
 * A simple stabilize updater.
 * Tries to adjust the angular position from both gyro and accel data.
 */
class StabilizeSimpleUpdater extends BaseUpdater {
	constructor(quad) {
		super(quad);

		var that = this;

		// Initialize PIDs
		this.pids = {};
		this._forEachPid(function (pid, type, axis) {
			// Get k_p, k_i & k_d from config
			var cst = quad.config.controller.pid[type][axis];

			// Create PID
			pid = new PidController(cst[0], cst[1], cst[2], true);
			pid.setTarget(0);

			that.pids[type][axis] = pid;
		});

		// Listen to config changes
		quad.on('config', function () {
			that._forEachPid(function (pid, type, axis) {
				// Get k_p, k_i & k_d from config
				var cst = quad.config.controller.pid[type][axis];

				// Update PID constants
				pid.k_p = cst[0];
				pid.k_i = cst[1];
				pid.k_d = cst[2];

				// Reset PID
				pid.reset();
			});
		});
	}

	/**
	 * Repeat an action on each PID.
	 * @param {Function} step
	 */
	_forEachPid(step) {
		var pids = this.pids;

		['rate', 'stabilize'].forEach(function (type) {
			if (!pids[type]) pids[type] = {};

			['x', 'y', 'z'].forEach(function (axis) {
				step(pids[type][axis], type, axis);
			});
		});
	}

	reset() {
		// Reset each PID
		this._forEachPid(function (pid) {
			pid.setTarget(0);
			pid.reset();
		});
	}

	setTarget(target) {
		// Set stabilize PIDs values
		for (var axis in target) {
			var t = target[axis];

			this.pids.stabilize[axis].setTarget(t);
		}

		// Reset all PIDs
		this._forEachPid(function (pid) {
			pid.reset();
		});
	}
	
	update(data) {
		// Apply stabilize PIDs
		var stabilize = {
			x: this.pids.stabilize.x.update(data.rotation.x),
			y: this.pids.stabilize.y.update(data.rotation.y)
		};

		// TODO: z axis

		// Apply rate PIDs
		// Target on rate PIDs is always set to 0
		// To mimick setTarget() behaviour, we directly
		// substract the target to the measure.
		return {
			x: this.pids.rate.x.update(data.gyro.x - stabilize.x),
			y: this.pids.rate.y.update(data.gyro.y - stabilize.y),
			z: this.pids.rate.z.update(data.gyro.z)
		};
	}
}

module.exports = StabilizeSimpleUpdater;
