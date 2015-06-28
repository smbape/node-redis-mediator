var RedisMediator = require('../');

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

var mediator1 = new RedisMediator({
    name: 'mediator1'
});
mediator1.once('ready', function() {
    if (++mediatorCount === mediatorWaiting) {
        emitter.emit('ready');
    }
});

var mediator2 = new RedisMediator({
    name: 'mediator2'
});
mediator2.once('ready', function() {
    if (++mediatorCount === mediatorWaiting) {
        emitter.emit('ready');
    }
});

describe('Emit', function() {
    it('should emit and recieve 1', function(done) {
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
    it('should acknowledge', function(done) {
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