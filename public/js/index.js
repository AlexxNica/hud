'use strict';

var document = require('global/document');
var hg = require('mercury');
var h = require('mercury').h;
var Quadcopter = require('./quadcopter');
var PowerBtn = require('./widget/power-btn');
var ControllerBtn = require('./widget/controller-btn');
var SystemSummary = require('./widget/system-summary');
var Tabs = require('./widget/tabs');
var Charts = require('./widget/charts');
var MouseDirection = require('./direction/mouse');

function App() {
	var quad = new Quadcopter();

	var state = hg.state({
		console: hg.array([]),
		quad: quad,
		powerBtn: PowerBtn(quad),
		controllerBtn: ControllerBtn(quad),
		systemSummary: SystemSummary(quad),
		directionTypeTabs: Tabs(['custom', 'step', 'sine', 'ramp']),
		direction: hg.struct({
			mouse: MouseDirection()
		}),
		charts: Charts(quad),
		channels: {
			log: log
		}
	});

	log(state, 'Connecting to server...');

	state.quad.init(function (err) {
		if (err) {
			return log(state, { type: 'error', msg: err });
		}
		log(state, 'Connected!');
	});

	state.quad.on('error', function (msg) {
		log(state, { type: 'error', msg: msg });
	});
	state.quad.on('info', function (msg) {
		log(state, { type: 'info', msg: msg });
	});

	return state;
}

function log(state, data) {
	if (typeof data === 'string') {
		data = { msg: data };
	}

	state.console.push({
		type: data.type,
		msg: data.msg
	});
}

App.render = function (state) {
	return h('#app', [
		h('#console.container-fluid', [
			h('pre', state.console.map(function (item) {
				return h('span.' + (item.type || 'log'), item.msg + '\n');
			}))
		]),
		h('hr'),
		h('.container-fluid', h('.row', [
			h('.col-lg-6.col-xs-12', [
				hg.partial(PowerBtn.render, state.powerBtn),
				hg.partial(ControllerBtn.render, state.controllerBtn)
			]),
			h('.col-lg-6.col-xs-12', [
				hg.partial(SystemSummary.render, state.systemSummary)
			])
		])),
		h('hr'),
		h('.container-fluid', h('.row', [
			h('.col-lg-3.col-xs-6.text-center', [ // .hidden-xs.hidden-sm
				h('div', [
					h('strong', 'Direction'),
					hg.partial(Tabs.render, state.directionTypeTabs)
				]),
				Tabs.renderContainer(state.directionTypeTabs, 'custom', [
					hg.partial(MouseDirection.render, state.direction.mouse)
				])
			])
		])),
		hg.partial(Charts.render, state.charts)
	]);
};

hg.app(document.body, App(), App.render);

/*var SVGInjector = require('svg-injector');
var smoothie = require('smoothie');
var colors = require('./colors');
var keyBindings = require('./key-bindings');
var graphsExport = require('./graphs-export');
var CameraPreview = require('./camera-preview');
var QuadcopterSchema = require('./quad-schema');
var Quadcopter = require('./quadcopter');

require('./jquery/serialize-object')($);
require('./jquery/tabs')($);

var input = {
	Mouse: require('./input/mouse'),
	DeviceOrientation: require('./input/device-orientation'),
	Gamepad: require('./input/gamepad'),
	Step: require('./input/step'),
	Sine: require('./input/sine'),
	Ramp: require('./input/ramp')
};

function init(quad) {
	keyBindings(quad);

	var mouseInput = new input.Mouse(quad.cmd, '#direction-input');

	if (input.Gamepad.isSupported()) {
		var devOrientation = new input.Gamepad(quad.cmd);

		$('#orientation-switch').change(function () {
			if ($(this).prop('checked')) {
				devOrientation.start();
			} else {
				devOrientation.stop();
			}
		});
	}
	if (input.Gamepad.isSupported()) {
		var gamepadInput = new input.Gamepad(quad.cmd);
	}

	var lastPower;
	$('#power-input').on('input', function () {
		var val = parseFloat($(this).val());
		if (lastPower === val) {
			return;
		}

		lastPower = val;
		sendCommand('power', val / 100);
	});
	quad.cmd.on('power', function (val) {
		if (lastPower / 100 === val) return;
		$('#power-input').val(Math.round(val * 100));
	});

	$('#power-switch').change(function () {
		sendCommand('enable', $(this).prop('checked'));
	});

	$('#controller-btn').change(function () {
		quad.config.controller.updater = $(this).val();
		sendCommand('config', quad.config);
	});

	$('#direction-type-tabs').tabs();

	var stepInput = new input.Step(quad.cmd);
	$('#direction-step').submit(function (event) {
		event.preventDefault();

		var data = $(this).serializeObject();

		stepInput.start({
			x: parseFloat(data.x),
			y: parseFloat(data.y),
			z: parseFloat(data.z),
			duration: parseFloat(data.duration) * 1000
		});
	});

	var sineInput = new input.Sine(quad.cmd);
	$('#direction-sine').submit(function (event) {
		event.preventDefault();

		var data = $(this).serializeObject();

		sineInput.start({
			amplitude: parseFloat(data.amplitude),
			frequency: parseFloat(data.frequency),
			offset: parseFloat(data.offset),
			axis: data.axis
		});
	});
	$('#direction-sine-stop').click(function () {
		sineInput.stop();
	});

	var rampInput = new input.Ramp(quad.cmd);
	$('#direction-ramp').submit(function (event) {
		event.preventDefault();

		var data = $(this).serializeObject();
		data.slope = parseFloat(data.slope);

		rampInput.start(data);
	});
	$('#direction-ramp-stop').click(function () {
		rampInput.stop();
	});

	$('#calibrate-sensor-btn').click(function () {
		var calibration = $.extend(true, {}, quad.config.mpu6050.calibration);
		var types = ['gyro', 'accel', 'rotation'];
		for (var i = 0; i < types.length; i++) {
			var type = types[i];
			if (!calibration[type]) {
				calibration[type] = { x: 0, y: 0, z: 0 };
			}
			for (var axis in quad.orientation[type]) {
				calibration[type][axis] -= quad.orientation[type][axis];
			}
		}

		// z accel is 1, because of gravitation :-P
		calibration.accel.z += 1;

		quad.config.mpu6050.calibration = calibration;
		sendCommand('config', quad.config);
	});

	var cameraPreview = new CameraPreview(quad.cmd);
	cameraPreview.on('start', function () {
		$('#camera-video').html(cameraPreview.player.canvas);
	});
	cameraPreview.on('error', function (err) {
		log(err, 'error');
	});
	$('#camera-play-btn').click(function () {
		cameraPreview.play();
	});
	$('#camera-pause-btn').click(function () {
		cameraPreview.pause();
	});
	$('#camera-stop-btn').click(function () {
		cameraPreview.stop();
	});
	$('#camera-config-preview').submit(function () {
		if (cameraPreview.isStarted()) {
			setTimeout(function () {
				cameraPreview.restart();
			}, 500);
		}
	});

	$('#camera-record-btn').click(function () {
		$(this).toggleClass('active');
		var enabled = $(this).is('.active');
		sendCommand('camera-record', enabled);
		$('#camera-status-recording').toggle(enabled);
	});

	$('#sensor-record-btn').click(function () {
		if (graphsExport.isRecording()) {
			graphsExport.stop();
		} else {
			graphsExport.start();
		}
		$('#sensor-status-recording').toggle(graphsExport.isRecording());
	});
	$('#sensor-export-btn').click(function () {
		var csv = graphsExport.toCsv();
		if (!csv) return;
		var blob = new Blob([csv], { type: 'text/csv' });
		var url = URL.createObjectURL(blob);
		window.open(url);
	});

	$('#graph-axes-btn').change(function () {
		var val = $(this).val();

		var axes;
		if (val == '*') {
			axes = null;
		} else {
			axes = [val];
		}

		graphs.axes = axes;
	}).change();
}

$(function () {
	var schemas = {};

	var quad = new Quadcopter();

	// Console
	var $console = $('#console pre');
	function log(msg, type) {
		if (type) {
			msg = '<span class="'+type+'">'+msg+'</span>';
		}
		$console.append(msg, '\n');
	}
	window.log = log;

	var $alerts = $('#alert-ctn');
	function addAlert(msg, type) {
		var $alert = $('<div></div>', { 'class': 'alert alert-'+type }).html(msg);
		$alerts.append($alert);
		return $alert;
	}
	function removeAlert($alert) {
		$alert.remove();
	}

	// TODO: this is deprecated, use Quadcopter methods instead
	window.sendCommand = function (cmd, opts) {
		quad.cmd.send(cmd, opts);
	};

	quad.on('error', function (msg) {
		log(msg, 'error');
	});

	quad.on('info', function (msg) {
		log(msg, 'info');
	});

	quad.on('enabled', function (enabled) {
		$('#power-switch').prop('checked', enabled);
	});

	quad.on('power', function (power) {
		$('#power-input').val(Math.round(power * 100));
	});

	// Add target to graphs export
	(function () {
		var target;
		quad.cmd.on('orientation', function (t) {
			target = t;
		});
		quad.on('motors-speed', function () {
			var timestamp = new Date().getTime();
			if (graphs.axes) {
				for (var axis in target) {
					if (graphs.axes.indexOf(axis) == -1) {
						delete target[axis];
					}
				}
			}
			graphsExport.append('target', timestamp, target)
		});
	})();

	quad.on('motors-speed', function (speeds) {
		if (quad.config) {
			var range = quad.config.servos.range;
			for (var i = 0; i < speeds.length; i++) {
				var speed = speeds[i];
				if (speed >= range[1]) {
					// Max. motor power reached
					log('Motor '+quad.config.servos.pins[i]+' is at full power!', 'error');
				}
			}
		}

		var speedsRatio = [0, 0, 0, 0];
		if (quad.config) {
			var range = quad.config.servos.range;
			speedsRatio = speeds.map(function (speed) {
				return (speed - range[0]) / (range[1] - range[0]);
			});
		}

		schemas.top.setSpeed(speedsRatio);
		schemas.sideX.setSpeed(speedsRatio.slice(0, 2));
		schemas.sideY.setSpeed(speedsRatio.slice(2, 4));

		var speedsList = speeds;
		if (quad.config) {
			speedsList = speeds.map(function (speed, i) {
				return quad.config.servos.pins[i] + ': ' + speed;
			});
		}
		$('#motors-stats .motors-speed').html(speedsList.join('<br>'));

		var timestamp = new Date().getTime();
		if (!graphs.axes || graphs.axes.indexOf('x') >= 0) {
			graphs.motors_speed_0.append(timestamp, speeds[0]);
			graphs.motors_speed_2.append(timestamp, speeds[2]);
		}
		if (!graphs.axes || graphs.axes.indexOf('y') >= 0) {
			graphs.motors_speed_1.append(timestamp, speeds[1]);
			graphs.motors_speed_3.append(timestamp, speeds[3]);
		}

		var exportedSpeeds = speeds.slice();
		if (graphs.axes) {
			if (graphs.axes.indexOf('x') == -1) {
				exportedSpeeds[0] = undefined;
				exportedSpeeds[2] = undefined;
			}
			if (graphs.axes.indexOf('y') == -1) {
				exportedSpeeds[1] = undefined;
				exportedSpeeds[3] = undefined;
			}
		}
		graphsExport.append('motors-speed', timestamp, exportedSpeeds);
	});

	quad.on('motors-forces', function (forces) {
		var forcesList = forces;
		if (quad.config) {
			var forcesList = forces.map(function (f, i) {
				return quad.config.servos.pins[i] + ': ' + f;
			});
		}
		$('#motors-stats .motors-forces').html(forcesList.join('<br>'));
	});

	quad.on('orientation', function (orientation) {
		schemas.sideX.setRotation(orientation.rotation.x);
		schemas.sideY.setRotation(orientation.rotation.y);

		var objectValues = function (obj) {
			var list = [];
			for (var key in obj) {
				var val = obj[key];
				if (typeof val == 'number') { // Only keep two digits after the comma
					val = Math.round(val * 100) / 100;
				}
				list.push(val);
			}
			return list;
		};

		var $stats = $('#sensor-stats');
		$stats.find('.sensor-gyro').text(objectValues(orientation.gyro));
		$stats.find('.sensor-accel').text(objectValues(orientation.accel));
		$stats.find('.sensor-rotation').text(objectValues(orientation.rotation));
		$stats.find('.sensor-temp').text(Math.round(orientation.temp));

		// Graphs
		var timestamp = new Date().getTime();

		function appendAxes(name, data) {
			var axes = graphs.axes || ['x', 'y', 'z'];

			var exportedData = {};
			for (var i = 0; i < axes.length; i++) {
				var axis = axes[i];
				if (typeof data[axis] == 'undefined') continue;

				var value = data[axis];
				graphs[name+'_'+axis].append(timestamp, value);
				exportedData[axis] = value;
			}

			graphsExport.append(name, timestamp, exportedData);
		}

		appendAxes('gyro', orientation.gyro);
		appendAxes('accel', orientation.accel);
		appendAxes('rotation', orientation.rotation);
	});

	quad.on('os-stats', function (stats) {
		var $stats = $('#os-stats');

		var loadavg = [];
		for (var i = 0; i < stats.loadavg.length; i++) {
			var avg = stats.loadavg[i];
			var pct = Math.round(avg * 100);
			loadavg.push('<span style="color: '+colors.toRgb(colors.shade(colors.getForPercentage(1 - avg), -0.5))+';">'+pct+'%</span>');
		}
		$stats.find('.os-loadavg').html(loadavg.join(', '));

		var memPct = stats.mem.free / stats.mem.total;
		$stats.find('.os-mem')
			.text(stats.mem.free + '/' + stats.mem.total + ' ('+Math.round(memPct * 100)+'%)')
			.css('color', colors.toRgb(colors.shade(colors.getForPercentage(1 - memPct), -0.5)));
	});

	// TODO: handle multiple config changes
	quad.once('config', function (cfg) {
		var accessor = function (prop, value) {
			var path = prop.split('.');

			var obj = cfg;
			for (var i = 0; i < path.length; i++) {
				var node = path[i];
				if (obj instanceof Array) {
					node = parseInt(node);
				}

				if (typeof obj[node] == 'undefined') {
					return;
				}

				if (i == path.length - 1) { // Last one
					if (typeof value == 'undefined') {
						return obj[node];
					} else {
						obj[node] = value;
					}
				} else {
					obj = obj[node];
					if (!obj) return;
				}
			}

			return obj;
		};

		var handleInput = function (input, domain) {
			var name = $(input).attr('name');
			if (!name) {
				return;
			}
			if (domain) {
				name = domain+'.'+name;
			}

			var val = accessor(name);
			if (typeof val != 'undefined') {
				if ($(input).is('input')) {
					$(input).attr('value', val);
				} else if ($(input).is('select')) {
					$(input).find('option').each(function () {
						var name = $(this).attr('value');
						if (typeof name == 'undefined') {
							name = $(this).html();
						}
						if (name == val) {
							$(this).attr('selected', '');
						}
					});
				}
				$(input).val(val);
			}

			$(input).change(function () {
				var val = $(input).val();
				if ($(input).is('input')) {
					var type = $(input).attr('type');
					switch (type) {
						case 'number':
						case 'range':
							val = parseFloat(val);
							break;
						case 'checkbox':
							val = $(input).prop('checked');
							break;
					}
				}
				accessor(name, val);
			});
		};

		var $form = $('#config-form');
		$form.find('input,select').each(function (i, input) {
			handleInput(input);
		});
		$form.submit(function (event) {
			event.preventDefault();

			sendCommand('config', cfg);
		});
		$form.find('#export-config-btn').click(function () {
			var json = JSON.stringify(cfg, null, '\t');
			var blob = new Blob([json], { type: 'application/json' });
			var url = URL.createObjectURL(blob);
			window.open(url);
		});

		// Camera config
		function initCameraConfigForm(form, type) {
			var $form = $(form);

			$form.find('input,select').each(function (i, input) {
				handleInput(input, 'camera.'+type);
			});
			$form.submit(function (event) {
				event.preventDefault();

				sendCommand('config', cfg);
			});

			$form.find('#ISO-switch').change(function () {
				if ($(this).prop('checked')) {
					var val = parseInt($form.find('[name="ISO"]').val());
					accessor('camera.preview.ISO', val);
				} else {
					accessor('camera.preview.ISO', null);
				}
			});
			$form.find('[name="ISO"]').change(function () {
				$form.find('#ISO-switch').prop('checked', true);
			});
		}
		initCameraConfigForm('#camera-config-preview', 'preview');
		initCameraConfigForm('#camera-config-record', 'record');

		// PID controller config
		$('#controller-btn').val(cfg.controller.updater);
	});

	quad.on('features', function (features) {
		var allGreen = true;

		if (features.hardware.indexOf('motors') === -1) {
			log('Motors not available', 'error');
			allGreen = false;
		}
		if (features.hardware.indexOf('imu') === -1) {
			log('Inertial Measurement Unit not available', 'error');
			allGreen = false;
		}
		if (features.hardware.indexOf('camera') === -1) {
			$('#camera').hide();
		}

		var featuresStr = features.hardware.join(', ');
		if (!featuresStr) featuresStr = '(none)';
		log('Available features: '+featuresStr);

		if (allGreen) {
			log('ALL GREEN!', 'success');
		}

		// Update updaters list
		$('#controller-btn').html(features.updaters.map(function (name) {
			return '<option>'+name+'</option>';
		}));
	});

	quad.client.on('disconnect', function () {
		log('Connection closed.');
		addAlert('Connection to server lost.', 'danger');
	});

	var cameraConfigHtml = $('#camera-config-inputs').html();
	$('#camera-config-preview, #camera-config-record').html(cameraConfigHtml);
	$('#camera-config-tabs').tabs();

	var connectingAlert = addAlert('Connecting to server...', 'info');

	// Inject SVGs into HTML to be able to style and animate them
	var svgs = $('img[src$=".svg"]');
	SVGInjector(svgs, null, function () {
		schemas.top = new QuadcopterSchema('#quadcopter-top');
		schemas.sideX = new QuadcopterSchema('#quadcopter-side-x');
		schemas.sideY = new QuadcopterSchema('#quadcopter-side-y');

		// Init
		log('Connecting to server...');
		quad.init(function (err) {
			if (err) return log(err, 'error');

			init(quad);

			log('Connected!');
			removeAlert(connectingAlert);
		});
	});
});
*/
