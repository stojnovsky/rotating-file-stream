"use strict";

var cp    = require("child_process");
var fs    = require("fs");
var tmp   = require("tmp");
var utils = require("./utils");
var zlib  = require("zlib");


function classical(count) {
	var prevName;
	var thisName;
	var self = this;

	if(this.options.rotate == count)
		delete this.rotatedName;

	var callback = function(err) {
		if(err)
			return self.emit("error", err);

		self.open();

		if(self.options.compress)
			self.compress(thisName);
		else {
			self.emit("rotated", self.rotatedName);
			self.interval();
		}
	};

	try {
		prevName = count == 1 ? this.name : this.generator(count - 1);
		thisName = this.generator(count);
	}
	catch(e) {
		return callback(e);
	}

	var doIt = function(done) {
		fs.rename(prevName, thisName, function(err) {
			if(err) {
				if(err.code != "ENOENT")
					return callback(err);

				return utils.makePath(thisName, function(err) {
					if(err)
						return callback(err);

					fs.rename(prevName, thisName, function(err) {
						if(err)
							return callback(err);

						process.nextTick(done);
					});
				});
			}

			process.nextTick(done);
		});
	};

	fs.stat(prevName, function(err) {
		if(! err) {
			if(! self.rotatedName)
				self.rotatedName = thisName;

			if(count != 1)
				return doIt(self.classical.bind(self, count - 1));

			if(self.options.compress)
				return self.findName({}, true, function(err, name) {
					if(err)
						return callback(err);

					thisName = name;
					doIt(callback);
				});

			return doIt(callback);
		}

		if(err.code != "ENOENT")
			return callback(err);

		self.classical(count - 1);
	});
}

function compress(tmp) {
	var self = this;

	this.findName({}, false, function(err, name) {
		if(err)
			return self.emit("error", err);

		self.touch(name, function(err) {
			if(err)
				return self.emit("error", err);

			var done = function(err) {
				if(err)
					return self.emit("error", err);

				fs.unlink(tmp, function(err) {
					if(err)
						self.emit("warning", err);

					if(self.options.rotate)
						self.emit("rotated", self.rotatedName);
					else
						self.emit("rotated", name);

					self.interval();
				});
			};

			if(typeof self.options.compress == "function")
				self.external(tmp, name, done);
			else
				self.gzip(tmp, name, done);
				/*
				if(self.options.compress == "gzip")
					self.gzip(tmp, name, done);
				else
					throw new Error("Not implemented yet");
				*/
		});
	});
}

function external(src, dst, callback) {
	var self = this;

	tmp.file({ mode: parseInt("777", 8) }, function(err, path, fd, done) {
		if(err)
			return callback(err);

		var cb = function(err) {
			done();
			callback(err);
		};

		fs.write(fd, self.options.compress(src, dst), function(err) {
			if(err)
				return cb(err);

			fs.close(fd, function(err) {
				if(err)
					return cb(err);

				cp.exec(path, cb);
			});
		});
	});
}

function findName(attempts, tmp, callback) {
	var count = 0;

	for(var i in attempts)
		count += attempts[i];

	if(count >= 1000) {
		var err = new Error("Too many destination file attempts");

		err.attempts = attempts;
		err.code     = "RFS-TOO-MANY";

		return callback(err);
	}

	var name = this.name + "." + count + ".rfs.tmp";
	var self = this;

	if(! tmp)
		try {
			var pars = [count + 1];

			if(! this.options.rotate) {
				if(this.options.interval && ! this.options.rotationTime)
					pars.unshift(new Date(this.prev));
				else
					pars.unshift(this.rotation);
			}

			name = this.generator.apply(this, pars);
		}
		catch(err) {
			return process.nextTick(callback.bind(null, err));
		}

	fs.stat(name, function(err) {
		if((! err) || err.code != "ENOENT") {
			if(name in attempts)
				attempts[name]++;
			else
				attempts[name] = 1;

			return self.findName(attempts, tmp, callback);
		}

		callback(null, name);
	});
}

function gzip(src, dst, callback) {
	var inp   = fs.createReadStream(src);
	var out   = fs.createWriteStream(dst);
	var zip   = zlib.createGzip();
	var files = [inp, out, zip];

	for(var i in files)
		files[i].once("error", callback);

	out.once("finish", process.nextTick.bind(process, callback));

	inp.pipe(zip).pipe(out);
}

function touch(name, callback, retry) {
	var self = this;

	fs.open(name, "a", function(err, fd) {
		if(err && err.code != "ENOENT" && ! retry)
			return callback(err);

		if(! err)
			return callback();

		utils.makePath(name, function(err) {
			if(err)
				return callback(err);

			self.touch(name, callback, true);
		});
	});
}

module.exports = {
	classical: classical,
	compress:  compress,
	external:  external,
	findName:  findName,
	gzip:      gzip,
	touch:     touch
};
