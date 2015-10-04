redis-mediator
=======

Message layer using redis

```javascript
var RedisMediator = require('redis-mediator');

var assert = require("assert");

var EventEmitter = require('events').EventEmitter;
var emitter = new EventEmitter();
var isReady = false,
    mediatorCount = 0,
    mediatorWaiting = 2;

// Wait for mediators to be ready before starting test
emitter.once('ready', function() {
    isReady = true;
});

var mediator1 = new RedisMediator();
mediator1.once('ready', function() {
    if (++mediatorCount === mediatorWaiting) {
        emitter.emit('ready');
    }
});

var mediator2 = new RedisMediator();
mediator2.once('ready', function() {
    if (++mediatorCount === mediatorWaiting) {
        emitter.emit('ready');
    }
});

describe('Emit', function() {
    it('should emit and recieve 1', function(done) {
        var count = 0,
            waiting = 2;

        this.timeout = 3000;

        mediator1.once('event', function(arg) {
            assert.strictEqual(arg, 'arg');
            if (++count === waiting) {
                done();
            }
        });

        mediator2.once('event', function(arg) {
            assert.strictEqual(arg, 'arg');
            if (++count === waiting) {
                done();
            }
        });

        // Wait for mediators to be ready before starting test
        if (isReady) {
            mediator1.emit('event', 'arg');
        } else {
            emitter.once('ready', function() {
                mediator1.emit('event', 'arg');
            });
        }
    });

    it('should emit and recieve 2', function(done) {
        var count = 0,
            waiting = 2;
        mediator1.once('event', function(arg) {
            assert.strictEqual(arg, 'arg');
            if (++count === waiting) {
                done();
            }
        });
        mediator2.once('event', function(arg) {
            assert.strictEqual(arg, 'arg');
            if (++count === waiting) {
                done();
            }
        });
        mediator2.emit('event', 'arg');
    });
});

describe('Broadcast', function() {
    it('should broadcast 1', function(done) {
        var count = 0,
            waiting = 2;
        mediator1.once('event', listener);
        mediator2.once('event', function(arg) {
            assert.strictEqual(arg, 'arg');
            setTimeout(function() {
                mediator1.removeListener('event', listener);
                done();
            }, 30);
        });
        mediator1.broadcast('event', 'arg');

        function listener(arg) {
            done(new Error('should not recieve'));
        }
    });

    it('should broadcast 2', function(done) {
        var count = 0,
            waiting = 2;
        mediator1.once('event', function(arg) {
            assert.strictEqual(arg, 'arg');
            setTimeout(function() {
                mediator2.removeListener('event', listener);
                done();
            }, 30);
        });
        mediator2.once('event', listener);
        mediator2.broadcast('event', 'arg');

        function listener(arg) {
            done(new Error('should not recieve'));
        }
    });
});

describe('Acknowledge', function() {
    it('should acknowledge emit', function(done) {
        mediator1.once('event with ack', function(arg, fn) {
            if (arg === 'arg') {
                fn('acknowledge');
            }
        });
        mediator2.emit('event with ack', 'arg', function(arg) {
            assert.strictEqual(arg, 'acknowledge');
            done();
        });
    });

    it('should acknowledge broadcast', function(done) {
        mediator1.once('event with ack', function(arg, fn) {
            if (arg === 'arg') {
                fn('acknowledge');
            }
        });
        mediator2.broadcast('event with ack', 'arg', function(arg) {
            assert.strictEqual(arg, 'acknowledge');
            done();
        });
    });
});
```

License
-------
The MIT License (MIT)

Copyright (c) 2014-2015 Stéphane MBAPE (http://smbape.com)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
