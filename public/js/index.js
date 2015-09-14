var BSON = bson().BSON;
window.BSON = BSON;
var ws;

var colors = require('./colors');
var getColorForPercentage = colors.getForPercentage,
	shadeColor = colors.shade,
	colorToRgb = colors.toRgb;

var Quadcopter = require('./quadcopter');
var keyBindings = require('./key-bindings');

$.fn.serializeObject = function () {
	var arr = this.serializeArray();
	var obj = {};

	for (var i = 0; i < arr.length; i++) {
		var item = arr[i];
		obj[item.name] = item.value;
	}

	return obj;
};

function Joystick(el, oninput) {
	var that = this;

	this.joystick = $(el);
	this.handle = this.joystick.find('.handle');

	var joystickSize = {
		width: this.joystick.width(),
		height: this.joystick.height()
	};
	var handleSize = {
		width: this.handle.width(),
		height: this.handle.height()
	};

	this.pressed = true;

	var offset;
	this.joystick.on('mousedown mousemove mouseup', function (event) {
		if ((event.type == 'mousemove' && event.buttons) || event.type == 'mousedown') {
			if (!that.pressed) {
				that.joystick.addClass('active');
				that.pressed = true;

				offset = that.joystick.offset();
			}

			var x = event.pageX - offset.left - handleSize.width/2,
				y = event.pageY - offset.top - handleSize.height/2;

			that.handle.css({
				left: x,
				top: y
			});

			// In degrees
			oninput({
				alpha: 0,
				beta: (x - joystickSize.width/2) / joystickSize.width * 90, // front-to-back tilt in degrees, where front is positive
				gamma: (y - joystickSize.height/2) / joystickSize.height * 90 // left-to-right tilt in degrees, where right is positive
			});
		} else {
			if (that.pressed) {
				that.joystick.removeClass('active');
				that.handle.css({
					left: joystickSize.width/2 - handleSize.width/2,
					top: joystickSize.height/2 - handleSize.height/2
				});
				that.pressed = false;

				oninput({
					alpha: 0,
					beta: 0,
					gamma: 0
				});
			}
		}
	});
	this.joystick.trigger('mouseup');
}

function DeviceOrientationJoystick(oninput) {
	if (!DeviceOrientationJoystick.isSupported()) {
		throw new Error('DeviceOrientation not supported');
	}

	window.addEventListener('deviceorientation', function (event) {
		oninput({
			alpha: event.alpha,
			beta: event.beta, // front-to-back tilt in degrees, where front is positive
			gamma: event.gamma // left-to-right tilt in degrees, where right is positive
		});
	}, false);
}
DeviceOrientationJoystick.isSupported = function () {
	return (typeof window.DeviceOrientationEvent != 'undefined');
};

function HardwareJoystick(oninput) {
	if (!HardwareJoystick.isSupported()) {
		throw new Error('Gamepad API not supported');
	}

	var that = this;

	window.addEventListener('gamepadconnected', function (e) {
		console.log("Gamepad connected at index %d: %s. %d buttons, %d axes.",
			e.gamepad.index, e.gamepad.id,
			e.gamepad.buttons.length, e.gamepad.axes.length);
		log('Gamepad "'+e.gamepad.id+'" connected.');

		that.gamepad = navigator.getGamepads()[e.gamepad.index];
		that._loop(oninput);
	});

	window.addEventListener('gamepaddisconnected', function (e) {
		log('Gamepad "'+e.gamepad.id+'" disconnected.');
	});
}
HardwareJoystick.isSupported = function () {
	return (!!navigator.getGamepads || !!navigator.webkitGetGamepads);
};

HardwareJoystick.prototype._loop = function (oninput) {
	console.log(this.gamepad);

	var gamepad = this.gamepad;

	setInterval(function () { // TODO
		oninput({
			alpha: gamepad.axes[1],
			beta: gamepad.axes[0], // front-to-back tilt in degrees, where front is positive
			gamma: gamepad.axes[2] // left-to-right tilt in degrees, where right is positive
		});
		// gamepad.axes[3] is POWER
	}, 500);
};

function QuadcopterSchema(svg) {
	this.svg = $(svg);
}
QuadcopterSchema.prototype.setSpeed = function (speed) {
	var propellers = this.svg.find('#propellers > g');

	for (var i = 0; i < speed.length; i++) {
		var s = speed[i];
		var color = shadeColor(getColorForPercentage(1 - s), -0.5);
		$(propellers[i]).css('fill', colorToRgb(color));
	}
};
QuadcopterSchema.prototype.setRotation = function (rot) {
	this.svg.css('transform', 'rotate('+rot+'deg)');
};

(function () {
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

	var createStream = function (ondata) {
		var ws = new WebSocket('ws://'+window.location.host+'/camera/socket');
		ws.binaryType = 'arraybuffer';

		ws.addEventListener('open', function () {
			log('Camera connection opened.');
		});

		ws.addEventListener('error', function (event) {
			console.error(error);
			log('Camera connection error!', 'error');
		});

		ws.addEventListener('close', function () {
			log('Camera connection closed.');
		});

		ws.addEventListener('message', function (event) {
			ondata(event.data);
		});

		return {
			play: function () {
				ws.send('play');
			},
			pause: function () {
				ws.send('pause');
			},
			abort: function () {
				ws.close();
			}
		};
	};

	var stream, nalDecoder;
	var cameraPreview = {
		start: function () {
			if (cameraPreview.isEnabled()) {
				this.stop();
			}

			var player = new Player({
				useWorker: true,
				workerFile: 'assets/broadway/Decoder.js'
			});

			sendCommand('camera-preview', true);

			nalDecoder = new Worker('assets/nal-decoder.js');
			nalDecoder.addEventListener('message', function (event) {
				player.decode(event.data);
			}, false);

			$('#camera-video').html(player.canvas);

			log('Starting h264 decoder');

			// TODO
			setTimeout(function () {
				stream = createStream(function (data, loaded) {
					nalDecoder.postMessage(data);
					//console.log(loaded, data.byteLength);
				});
			}, 1500);
		},
		stop: function () {
			sendCommand('camera-preview', false);

			if (stream) {
				stream.abort();
				stream = null;
			}
			if (nalDecoder) {
				nalDecoder.terminate();
				nalDecoder = null;
			}
		},
		play: function () {
			if (!stream) return this.start();
			stream.play();
		},
		pause: function () {
			if (!stream) return;
			stream.pause();
		},
		restart: function () {
			this.stop();
			this.start();
		},
		isEnabled: function () {
			return (stream) ? true : false;
		}
	};

	window.cameraPreview = cameraPreview;
})();

(function () {
	var graphs = {};

	var graphNames = [
		'gyro_x', 'gyro_y', 'gyro_z',
		'accel_x', 'accel_y', 'accel_z',
		'rotation_x', 'rotation_y', 'rotation_z',
		'motors_speed_0', 'motors_speed_1', 'motors_speed_2', 'motors_speed_3'
	];
	for (var i = 0; i < graphNames.length; i++) {
		var name = graphNames[i];
		graphs[name] = new TimeSeries();
	}

	window.graphs = graphs;
})();

$(function () {
	var chartStyle = {
		grid: {
			fillStyle: 'transparent',
			borderVisible: false
		}
	};
	var redLine = { strokeStyle: 'rgb(255, 0, 0)' };
	var greenLine = { strokeStyle: 'rgb(0, 255, 0)' };
	var blueLine = { strokeStyle: 'rgb(0, 0, 255)' };
	var yellowLine = { strokeStyle: 'yellow' };

	var gyro = new SmoothieChart(chartStyle);
	gyro.streamTo(document.getElementById('sensor-gyro-graph'));
	gyro.addTimeSeries(graphs.gyro_x, redLine);
	gyro.addTimeSeries(graphs.gyro_y, greenLine);
	gyro.addTimeSeries(graphs.gyro_z, blueLine);

	var accel = new SmoothieChart(chartStyle);
	accel.streamTo(document.getElementById('sensor-accel-graph'));
	accel.addTimeSeries(graphs.accel_x, redLine);
	accel.addTimeSeries(graphs.accel_y, greenLine);
	accel.addTimeSeries(graphs.accel_z, blueLine);

	var rotation = new SmoothieChart(chartStyle);
	rotation.streamTo(document.getElementById('sensor-rotation-graph'));
	rotation.addTimeSeries(graphs.rotation_x, redLine);
	rotation.addTimeSeries(graphs.rotation_y, greenLine);
	rotation.addTimeSeries(graphs.rotation_z, blueLine);

	var motorsSpeed = new SmoothieChart(chartStyle);
	motorsSpeed.streamTo(document.getElementById('motors-speed-graph'));
	motorsSpeed.addTimeSeries(graphs.motors_speed_0, redLine);
	motorsSpeed.addTimeSeries(graphs.motors_speed_1, greenLine);
	motorsSpeed.addTimeSeries(graphs.motors_speed_2, blueLine);
	motorsSpeed.addTimeSeries(graphs.motors_speed_3, yellowLine);
});

(function () {
	var header, data;
	var isRecording = false;
	var graphsExport = {
		start: function () {
			isRecording = true;
			this.reset();
		},
		stop: function () {
			isRecording = false;
		},
		reset: function () {
			header = ['timestamp'];
			data = [];
		},
		isRecording: function () {
			return isRecording;
		},
		append: function (name, timestamp, dataset) {
			if (!isRecording) return;

			var lastline = data[data.length - 1];

			var line = new Array(header.length);
			line[0] = timestamp;

			var hasPushedNewData = false;
			for (var key in dataset) {
				var value = dataset[key];
				var headerKey = name+'.'+key;
				var i = header.indexOf(headerKey);
				if (i >= 0) {
					if (lastline && !hasPushedNewData && typeof lastline[i] != 'number') {
						lastline[i] = value;
					} else {
						line[i] = value;
						hasPushedNewData = true;
					}
				} else {
					header.push(headerKey);
					if (lastline) {
						lastline.push(value);
					} else {
						line.push(value);
						hasPushedNewData = true;
					}
				}
			}

			if (hasPushedNewData) {
				data.push(line);
			}
		},
		toCsv: function () {
			if (!data || !header) return;

			var csv = '';
			csv += header.join(',');

			for (var i = 0; i < data.length; i++) {
				var line = data[i].join(',');
				csv += '\n'+line;
			}

			return csv;
		}
	};

	window.graphsExport = graphsExport;
})();

function init(quad) {
	keyBindings(quad);

	var joystick = new Joystick('#direction-input', function (data) {
		sendCommand('orientation', {
			x: data.beta,
			y: data.gamma,
			z: data.alpha
		});
	});

	if (DeviceOrientationJoystick.isSupported()) {
		var $switch = $('#orientation-switch');
		var devOrientation = new DeviceOrientationJoystick(function (data) {
			if ($switch.prop('checked')) {
				sendCommand('orientation', data);
			}
		});
	}
	if (HardwareJoystick.isSupported()) {
		var hwOrientation = new HardwareJoystick(function (data) {
			sendCommand('orientation', data);
		});
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

	$('#power-switch').change(function () {
		sendCommand('enable', $(this).prop('checked'));
	});

	$('#controller-btn').change(function () {
		quad.config.pid.controller = $(this).val();
		sendCommand('config', quad.config);
	});

	$('#direction-type-btn').change(function () {
		var selected = $(this).val();
		
		$(this).children('option').each(function (option) {
			var inputType = $(this).text();

			$('#direction-'+inputType).toggle(inputType == selected);
		});
	}).change();

	$('#direction-step').submit(function (event) {
		event.preventDefault();

		var data = $(this).serializeObject();

		sendCommand('orientation', {
			x: data.x,
			y: data.y,
			z: data.z
		});
	});

	var sineInterval, sineStartedAt;
	$('#direction-sine').submit(function (event) {
		event.preventDefault();

		var data = $(this).serializeObject();
		var A = data.amplitude,
			f = data.frequency,
			phi = data.offset;

		clearInterval(sineInterval);

		sineStartedAt = (new Date()).getTime();
		sineInterval = setInterval(function () {
			var t = ((new Date()).getTime() - sineStartedAt) / 1000;
			var cmd = { x: 0, y: 0, z: 0 };
			cmd[data.axis] = A * Math.sin(2 * Math.PI * f * t + phi);
			console.log(cmd);
			sendCommand('orientation', cmd);
		}, 200);
	});
	$('#direction-sine-stop').click(function () {
		clearInterval(sineInterval);
	});

	$('#calibrate-sensor-btn').click(function () {
		var calibration = $.extend(true, {}, quad.config.mpu6050.calibration);
		var types = ['gyro', 'accel'];
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

	$('#camera-play-btn').click(function () {
		cameraPreview.play();
	});
	$('#camera-pause-btn').click(function () {
		cameraPreview.pause();
	});
	$('#camera-stop-btn').click(function () {
		cameraPreview.stop();
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
		graphs.motors_speed_0.append(timestamp, speeds[0]);
		graphs.motors_speed_1.append(timestamp, speeds[1]);
		graphs.motors_speed_2.append(timestamp, speeds[2]);
		graphs.motors_speed_3.append(timestamp, speeds[3]);

		graphsExport.append('motors-speed', timestamp, speeds);
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

		function appendAxes(graphName, data) {
			var axes = graphs.axes || ['x', 'y', 'z'];

			for (var i = 0; i < axes.length; i++) {
				var axis = axes[i];
				if (typeof data[axis] == 'undefined') continue;
				graphs[graphName+'_'+axis].append(timestamp, data[axis]);
			}
		}

		appendAxes('gyro', orientation.gyro);
		appendAxes('accel', orientation.accel);
		appendAxes('rotation', orientation.rotation);

		for (var name in orientation) {
			graphsExport.append(name, timestamp, orientation[name]);
		}
	});

	quad.on('os-stats', function (stats) {
		var $stats = $('#os-stats');

		var loadavg = [];
		for (var i = 0; i < stats.loadavg.length; i++) {
			var avg = stats.loadavg[i];
			var pct = Math.round(avg * 100);
			loadavg.push('<span style="color: '+colorToRgb(shadeColor(getColorForPercentage(1 - avg), -0.5))+';">'+pct+'%</span>');
		}
		$stats.find('.os-loadavg').html(loadavg.join(', '));

		var memPct = stats.mem.free / stats.mem.total;
		$stats.find('.os-mem')
			.text(stats.mem.free + '/' + stats.mem.total + ' ('+Math.round(memPct * 100)+'%)')
			.css('color', colorToRgb(shadeColor(getColorForPercentage(1 - memPct), -0.5)));
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
		var $camForm = $('#camera-config-form');
		$camForm.find('input,select').each(function (i, input) {
			handleInput(input, 'camera.preview');
		});
		$camForm.submit(function (event) {
			event.preventDefault();

			sendCommand('config', cfg);

			if (cameraPreview.isEnabled()) {
				cameraPreview.restart();
			}
		});

		$('#ISO-switch').change(function () {
			if ($(this).prop('checked')) {
				var val = parseInt($camForm.find('[name="ISO"]').val());
				accessor('camera.preview.ISO', val);
			} else {
				accessor('camera.preview.ISO', null);
			}
		});
		$camForm.find('[name="ISO"]').change(function () {
			$('#ISO-switch').prop('checked', true);
		});

		// PID controller config
		$('#controller-btn').val(cfg.pid.controller);
	});

	quad.on('features', function (features) {
		var allGreen = true;

		if (features.indexOf('motors') === -1) {
			log('Motors not available', 'error');
			allGreen = false;
		}
		if (features.indexOf('imu') === -1) {
			log('Inertial Measurement Unit not available', 'error');
			allGreen = false;
		}
		if (features.indexOf('camera') === -1) {
			$('#camera').hide();
		}

		var featuresStr = features.join(', ');
		if (!featuresStr) featuresStr = '(none)';
		log('Available features: '+featuresStr);

		if (allGreen) {
			log('ALL GREEN!', 'success');
		}
	});

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
		});
	});
});
