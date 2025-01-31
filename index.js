"use strict";

var compress = require("./compress");
var fs       = require("fs");
var interval = require("./interval");
var path     = require("path");
var util     = require("util");
var utils    = require("./utils");
var Writable = require("stream").Writable;

function RotatingFileStream(filename, options) {
	if(! (this instanceof RotatingFileStream))
		return new RotatingFileStream(filename, options);

	if(! options)
		options = {};
	else {
		if(typeof options != "object")
			throw new Error("Don't know how to handle 'options' type: " + typeof options);

		var tmp = {};

		for(var i in options)
			tmp[i] = options[i];

		options = tmp;
	}

	utils.checkOptions(options);

	if(typeof filename == "function")
		this.generator = filename;
	else
		if(typeof filename == "string") {
			if(options.rotate)
				this.generator = utils.createClassical(filename);
			else
				this.generator = utils.createGenerator(filename);
		}
		else
			throw new Error("Don't know how to handle 'filename' type: " + typeof filename);

	if(options.path) {
		var generator = this.generator;

		this.generator = function(time, index) {
			return path.join(options.path, generator(time, index));
		};
	}

	var opt = {};

	if(options.highWaterMark)
		opt.highWaterMark = options.highWaterMark;

	if(options.mode)
		opt.mode = options.mode;

	Writable.call(this, opt);

	this.chunks  = [];
	this.options = options;
	this.size    = 0;

	utils.setEvents(this);

	this.firstOpen();
}

util.inherits(RotatingFileStream, Writable);

RotatingFileStream.prototype._close = function(done) {
	if(this.stream) {
		this.stream.on("finish", done);
		this.stream.end();
		this.stream = null;
	}
	else
		done();
};

RotatingFileStream.prototype._rewrite = function() {
	var self     = this;
	var callback = function() {
		if(self.ending)
			self._close(Writable.prototype.end.bind(self));
	};

	if(this.err) {
		for(var i in this.chunks)
			if(this.chunks[i].cb)
				this.chunks[i].cb();

		this.chunks = [];

		return callback();
	}

	if(this.writing || this.rotation)
		return;

	if(this.options.size && this.size >= this.options.size)
		return this.rotate();

	if(! this.stream)
		return;

	if(! this.chunks.length)
		return callback();

	var chunk = this.chunks[0];

	this.chunks.shift();
	this.size   += chunk.chunk.length;
	this.writing = true;

	this.stream.write(chunk.chunk, function(err) {
		self.writing = false;

		if(err)
			self.emit("error", err);

		if(chunk.cb)
			chunk.cb();

		process.nextTick(self._rewrite.bind(self));
	});
};

RotatingFileStream.prototype._write = function(chunk, encoding, callback) {
	this.chunks.push({ chunk: chunk, cb: callback });
	this._rewrite();
};

RotatingFileStream.prototype._writev = function(chunks, callback) {
	chunks[chunks.length - 1].cb = callback;
	this.chunks = this.chunks.concat(chunks);
	this._rewrite();
};

RotatingFileStream.prototype.firstOpen = function() {
	var self = this;

	try {
		this.name = this.generator(null);
	}
	catch(err) {
		return process.nextTick(function() {
			self.emit("error", err);
			process.nextTick(self._rewrite.bind(self));
		});
	}

	this.once("open", this.interval.bind(this));

	fs.stat(this.name, function(err, stats) {
		if(err) {
			if(err.code == "ENOENT")
				return self.open();

			return self.emit("error", err);
		}

		if(! stats.isFile())
			return self.emit("error", new Error("Can't write on: " + self.name + " (it is not a file)"));

		self.size = stats.size;

		if((! self.options.size) || stats.size < self.options.size)
			return self.open();

		if(self.options.interval)
			self._interval(self.now());

		self.rotate();
	});
};

RotatingFileStream.prototype.move = function(retry) {
	var name;
	var self = this;

	var callback = function(err) {
		if(err)
			return self.emit("error", err);

		self.open();

		if(self.options.compress)
			self.compress(name);
		else {
			self.emit("rotated", name);
			self.interval();
		}
	};

	this.findName({}, self.options.compress, function(err, found) {
		if(err)
			return callback(err);

		name = found;

		fs.rename(self.name, name, function(err) {
			if(err && err.code != "ENOENT" && ! retry)
				return callback(err);

			if(! err)
				return callback();

			utils.makePath(name, function(err) {
				if(err)
					return callback(err);

				self.move(true);
			});
		});
	});
};

RotatingFileStream.prototype.now = function() {
	return new Date().getTime();
};

RotatingFileStream.prototype.open = function(retry) {
	var fd;
	var self     = this;
	var options  = { flags: "a" };
	var callback = function(err) {
		if(err)
			self.emit("error", err);

		process.nextTick(self._rewrite.bind(self));
	};

	if("mode" in this.options)
		options.mode = this.options.mode;

	var stream = fs.createWriteStream(this.name, options);

	stream.once("open", function() {
		self.stream = stream;
		self.emit("open");

		callback();
	});

	stream.once("error", function(err) {
		if(err.code != "ENOENT" && ! retry)
			return callback(err);

		utils.makePath(self.name, function(err) {
			if(err)
				return callback(err);

			self.open(true);
		});
	});
};

RotatingFileStream.prototype.rotate = function() {
	this.size     = 0;
	this.rotation = new Date();

	this._clear();
	this._close(this.options.rotate ? this.classical.bind(this, this.options.rotate) : this.move.bind(this));
	this.emit("rotation");
};

for(var i in compress)
	RotatingFileStream.prototype[i] = compress[i];

for(var i in interval)
	RotatingFileStream.prototype[i] = interval[i];

module.exports = RotatingFileStream;
