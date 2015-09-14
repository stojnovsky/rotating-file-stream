# rotating-file-stream

[![Build Status](https://travis-ci.org/iccicci/rotating-file-stream.png)](https://travis-ci.org/iccicci/rotating-file-stream)
[![Code Climate](https://codeclimate.com/github/iccicci/rotating-file-stream/badges/gpa.svg)](https://codeclimate.com/github/iccicci/rotating-file-stream)
[![Test Coverage](https://codeclimate.com/github/iccicci/rotating-file-stream/badges/coverage.svg)](https://codeclimate.com/github/iccicci/rotating-file-stream/coverage)
[![Donate](http://img.shields.io/bitcoin/donate.png?color=red)](https://www.coinbase.com/cicci)

[![dependency status](https://david-dm.org/iccicci/rotating-file-stream.svg)](https://david-dm.org/iccicci/rotating-file-stream#info=dependencies)
[![dev dependency status](https://david-dm.org/iccicci/rotating-file-stream/dev-status.svg)](https://david-dm.org/iccicci/rotating-file-stream#info=devDependencies)

[![NPM](https://nodei.co/npm/rotating-file-stream.png?downloads=true&downloadRank=true&stars=true)](https://nodei.co/npm/rotating-file-stream/)

### Usage

```javascript
var rfs    = require('rotating-file-stream');
var stream = rfs('file.log', {
    size:     '10M', // rotate every 10 MegaBytes written
    interval: '1d',  // rotate daily
    compress: 'gzip' // compress rotated files
});
```

# under development

__This package is currently under development.__

Please check the [TODO list](https://github.com/iccicci/rotating-file-stream#todo) to be aware of what is missing.

### Installation

With [npm](https://www.npmjs.com/package/rotating-file-stream):
```sh
npm install rotating-file-stream
```

# API

## rfs(filename, options)

Returns a new [stream.Writable](https://nodejs.org/api/stream.html#stream_class_stream_writable) to _filename_ as
[fs.createWriteStream](https://nodejs.org/api/fs.html#fs_fs_createwritestream_path_options) does.
The file is rotated following _options_ rules.

### filename {String|Function}

The most complex problem about file name is: "how to call the rotated file name?"

The answer to this question may vary in many forms depending on application requirements and/or specifications.
If there are no requirements, a _String_ can be used and default rotated file name generator will be used;
otherwise a _Function_ which returns the rotated file name can be used.

#### function filename(time, index)

* time: {Date} The start time of rotation period. If __null__, the not rotated file name must be returned.
* index {Number} The progressive index of rotation by size in the same rotation period. Starts from 1.

An example of a complex rotated file name generator function could be:

```javascript
function pad(num) {
    return (num + "").length == 1 ? "0" + num : num;
}

function generator(time, index) {
    if(! time)
        return "file.log";

    var month  = time.getFullYear() + "" + pad(time.getMoth() + 1);
    var hour   = pad(time.getHours());
    var minute = pad(time.getMinutes());

    return "/storage/" + month + "/" + month + day + "-" + hour + minute + "-file.log";
}

var rfs    = require('rotating-file-stream');
var stream = rfs(generator, {
    size:     '10M',
    interval: '1d'
});
```

__Note:__

If part of returned destination path does not exists, the rotation job will try to create it.

### options {Object}

* compress: {String} (default: null) Specifies compression method of rotated files.
* interval: {String} (default: null) Specifies the time interval to rotate the file.
* size: {String} (default: null) Specifies the file size to rotate the file.
* highWaterMark: {Number} (default: 16K) Proxied to [new stream.Writable](https://nodejs.org/api/stream.html#stream_new_stream_writable_options)
* mode: {Integer} (default: 0o666) Proxied to [fs.open](https://nodejs.org/api/fs.html#fs_fs_open_path_flags_mode_callback)

#### size

Accepts a positive integer followed by one of these possible letters:

* __K__: KiloBites
* __M__: MegaBytes
* __G__: GigaBytes

```javascript
  size: '300K', // rotates the file when its size exceeds 300 KiloBytes
```

```javascript
  size: '100M', // rotates the file when its size exceeds 100 MegaBytes
```

```javascript
  size: '1G', // rotates the file when its size exceeds a GigaBytes
```

#### interval

Accepts a positive integer followed by one of these possible letters:

* __m__: minutes. Accepts integer divider of 60.
* __h__: hours. Accepts integer divider of 24.
* __d__: days

```javascript
  interval: '5m', // rotates the file at minutes 0, 5, 10, 15 and so on
```

```javascript
  interval: '2h', // rotates the file at midnight, 02:00, 04:00 and so on
```

```javascript
  interval: '1d', // rotates the file at every midnight
```

#### compress

Due the nature of __Node.js__ compression may be done with an external command (to use other CPUs than the one used
by __Node.js__ to not subtract CPU power to our application) or with internal code (to use the CPU used by __Node.js__
to not subtract more CPU power than expected to the system). This decision is left to you.

Following fixed strings are allowed to compress the files with internal libraries:
* bzip
* gzip
* zip

To enable external compression, a _function_ can be used or simple the _boolean_ __true__ value to use default
external compression. The two following code snippets have exactly the same effect:

```javascript
var rfs    = require('rotating-file-stream');
var stream = rfs('file.log', {
    size:     '10M',
    compress: true
});
```

```javascript
var rfs    = require('rotating-file-stream');
var stream = rfs('file.log', {
    size:     '10M',
    compress: function(src, dst) {
        return "cat " + src + " | gzip -t9 > " + dst;
    }
});
```

### Events

Custom _Events_ are emitted by the stream.

```javascript
var rfs    = require('rotating-file-stream');
var stream = rfs(...);

stream.on('error', function(err) {
    // here are reported errors occurred while rotating as well write errors
});

stream.on('rotation', function() {
    // rotation job started
});

stream.on('rotated', function(filename) {
    // rotation job completed with success and produced given filename
});
```

### Under the hood

Logs should be handled so carefully, so this package tries to never overwrite files.

At stream creation, if the not rotated log file already exists and its size exceeds the rotation size,
an initial rotation attempt is done.

At each rotation attempt a check is done to verify that destination rotated file does not exists yet;
if this is not the case a new destination rotated file name is generated and the same check is
performed before going on. This is repeated until a not existing destination file name is found or the
package is exhausted.

To not waste CPU power checking size for rotation at each _write_, a timer is set up to check size at
every second. This means that rotated file size will be a bit greater than how much specified with
__options.size__ parameter.

### Licence

[MIT Licence](https://github.com/iccicci/rotating-file-stream/blob/master/LICENSE)

### Bugs

Do not hesitate to report any bug or inconsistency @[github](https://github.com/iccicci/rotating-file-stream/issues).

### TODO

* Complete README
* Write tests
* Write code
* Emit events
* External compression
* Internal compression gzip
* Internal compression bzip
* Internal compression zip

### Changelog

* 2015-09-10 - v0.0.0
  * Embryonal stage
