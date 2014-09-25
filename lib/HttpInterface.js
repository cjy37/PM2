//
// PM2 Monit and Server web interface
// Disserve JSON in light way
// by Strzelewicz Alexandre
//

var http = require('http');
var os = require('os');
var Satan = require('./Satan');
var urlT = require('url');
var cst = require('../constants.js');
var njds = require('./disks.js');
var fs = require('fs');
var osutils  = require('os-utils');

// Start daemon
//
// Usually it would be is started in the parent process already,
// but if I run "node HttpInterface" directly, I would probably
// like it to be not daemonized
Satan.start(true);

http.createServer(function (req, res) {
	// Add CORS headers to allow browsers to fetch data directly
	res.setHeader('Access-Control-Allow-Origin', '*');
	res.setHeader('Access-Control-Allow-Headers', 'Cache-Control, Pragma, Origin, Authorization, Content-Type, X-Requested-With');
	res.setHeader('Access-Control-Allow-Methods', 'GET');

	// We always send json
	res.setHeader('Content-Type', 'application/json');

	var path = urlT.parse(req.url).pathname;

	console.log('Access on PM2 monit point %s', path);

	if (path == '/') {
		// Main monit route
		Satan.executeRemote('getMonitorData', {}, function (err, data_proc) {
			var process = data_proc;
			var cpus = os.cpus();
			var cputotal = 0;
			var cpuFree = 0;
			var cpuPer = 0;
			
			osutils.cpuFree(function(v){
			    cpuPer = v;
			});

			/*{"model":"Intel(R) Core(TM) i7-4700MQ CPU @ 2.40GHz","speed":2394,"times":{"user":153800,"nice":2900,"sys":472300,"idle":148184000,"irq":0}}*/
			for (var i = 0; i < cpus.length; i++) {
				var tmpCpu = cpus[i].times;
				cputotal += tmpCpu.user + tmpCpu.nice + tmpCpu.sys + tmpCpu.idle + tmpCpu.irq;
				cpuFree += tmpCpu.idle;
			}
			//cpuPer = 100 * cpuFree / cputotal;

			var mem_info = {};
			var memdata = fs.readFileSync('/proc/meminfo').toString();
			memdata.split(/\n/g).forEach(function (line) {
				line = line.split(':');
				if (line.length < 2) {
					return;
				}
				mem_info[line[0]] = parseInt(line[1].trim(), 10) * 1024;
			});
			var memRealFree = mem_info.MemFree + mem_info.Cached + mem_info.Buffers; //真实空闲

			for (var j = 0; j < process.length; j++) {
				var tmpev = process[j].pm2_env;
				var ev = {
					HOME : tmpev.HOME,
					LANG : tmpev.LANG,
					created_at : tmpev.created_at,
					exec_interpreter : tmpev.exec_interpreter,
					exec_mode : tmpev.exec_mode,
					name : tmpev.name,
					node_args : tmpev.node_args,
					pm_cwd : tmpev.pm_cwd,
					pm_err_log_path : tmpev.pm_err_log_path,
					pm_exec_path : tmpev.pm_exec_path,
					pm_id : tmpev.pm_id,
					pm_out_log_path : tmpev.pm_out_log_path,
					pm_pid_path : tmpev.pm_pid_path,
					pm_uptime : tmpev.pm_uptime,
					restart_time : tmpev.restart_time,
					status : tmpev.status,
					unstable_restarts : tmpev.unstable_restarts
				};
				process[j].pm2_env = ev;
			}

			

			njds.drives(function (err, drives) {
				njds.drivesDetail(drives, function (err, disks) {
					
					var data = {
						system_info : {
							hostname : os.hostname(),
							uptime : os.uptime()
						},
						monit : {
							loadavg : os.loadavg(),
							total_mem : mem_info.MemTotal,
							free_mem : memRealFree,
							cpu : os.cpus(),
							interfaces : os.networkInterfaces(),
							memUse : {
								free : memRealFree,
								total : mem_info.MemTotal,
								freePer : parseInt(100 * memRealFree / mem_info.MemTotal * 100) / 100,
								swpFree : mem_info.SwapFree,
								swpTotal : mem_info.SwapTotal,
								swpFreePer : parseInt(100 * mem_info.SwapFree / mem_info.SwapTotal * 100) / 100
							},
							cpuUse : {
								total : cputotal,
								free : cpuFree,
								freePer : parseInt(cpuPer * 100) / 100
							}
						},
						processes : process
					};
			
					if (!err)
						data.monit.disks = disks;
					res.statusCode = 200;
					res.write(JSON.stringify(data));
					return res.end();
				});
			});
		});
	} else {
		// 404
		res.statusCode = 404;
		res.write(JSON.stringify({
				err : '404'
			}));
		return res.end();
	}
}).listen(cst.WEB_INTERFACE);
