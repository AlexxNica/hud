/**
 * A dummy updater.
 * Does not try to stabilize the device at all.
 */

module.exports = function (quad, ctrl) {
	return function () {
		var physics = quad.config.physics;
		var g = physics.gravity;
		var fMax = 400 * g / 1000; // TODO
		var delta = {};
		return {
			x: ctrl.rate.x.target / 45 * fMax / 5,
			y: ctrl.rate.y.target / 45 * fMax / 5,
			z: ctrl.rate.z.target / 45 * fMax / 5,
		};
	};
};