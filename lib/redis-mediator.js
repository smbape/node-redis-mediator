
/**
 * Module dependencies.
 */
var EventEmitter, RedisMediator, msgpack, redis, uid2,
  bind = function(fn, me){ return function(){ return fn.apply(me, arguments); }; },
  extend = function(child, parent) { for (var key in parent) { if (hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; },
  hasProp = {}.hasOwnProperty;

uid2 = require('uid2');

redis = require('redis');

msgpack = require('msgpack-js');

EventEmitter = require('events').EventEmitter;


/**
 * Module exports.
 */

module.exports = RedisMediator = (function(superClass) {
  extend(RedisMediator, superClass);

  function RedisMediator(uri, opts) {
    this.acknowledge = bind(this.acknowledge, this);
    this.onmessage = bind(this.onmessage, this);
    var count, host, port, socket, waiting;
    if (arguments.length === 1 && uri !== null && 'object' === typeof uri) {
      opts = uri;
      uri = null;
    }
    opts || (opts = {});
    if ('string' === typeof uri) {
      uri = uri.split(':');
      opts.host = uri[0];
      opts.port = uri[1];
    }
    this.pub = opts.pub;
    this.sub = opts.sub;
    this.channel = opts.channel || 'mediator';
    socket = opts.socket;
    host = opts.host || '127.0.0.1';
    port = opts.port ? parseInt(opts.port, 10) : 6379;
    if (!this.pub) {
      if (socket) {
        this.pub = redis.createClient(socket);
      } else {
        this.pub = redis.createClient(port, host);
      }
      this.pub.___RedisMediator___ = 1;
    }
    if (!this.sub) {
      if (socket) {
        this.sub = redis.createClient(socket, {
          return_buffers: true
        });
      } else {
        this.sub = redis.createClient(port, host, {
          return_buffers: true
        });
      }
      this.sub.___RedisMediator___ = 1;
    }
    this.uid = uid2(6);
    this._ids = 0;
    this.acknowledges = {};
    this.messagep = this.channel + '#message#';
    this.pubchannel = this.messagep + this.uid;
    this.ackchannel = this.channel + '#ack#' + this.uid;
    count = 0;
    waiting = 2;
    this.sub.psubscribe(this.messagep + '*', (function(_this) {
      return function(err) {
        if (err) {
          return EventEmitter.prototype.emit.call(_this, 'error', err);
        }
        if (++count === waiting) {
          EventEmitter.prototype.emit.call(_this, 'ready');
        }
      };
    })(this));
    this.sub.psubscribe(this.ackchannel, (function(_this) {
      return function(err) {
        if (err) {
          return EventEmitter.prototype.emit.call(_this, 'error', err);
        }
        if (++count === waiting) {
          EventEmitter.prototype.emit.call(_this, 'ready');
        }
      };
    })(this));
    this.sub.on('pmessage', this.onmessage);
  }

  RedisMediator.prototype.onmessage = function(pattern, channel, msg) {
    var args, evt, fn, info, options, packet, ref, uid;
    info = channel.toString().split('#');
    evt = info[1];
    uid = info[2];
    if (evt === 'message' && this.uid === uid) {
      return;
    }
    ref = msgpack.decode(msg), packet = ref[0], options = ref[1];
    args = packet.args;
    if (evt === 'ack') {
      if (!this.acknowledges.hasOwnProperty(options.id)) {
        return;
      }
      fn = this.acknowledges[options.id].fn;
      if (--this.acknowledges[options.id].counter === 0) {
        this.clearAck(options.id);
      }
      fn.apply(fn.context, args);
      return;
    }
    if (packet.ack) {
      args[args.length] = this.acknowledge(packet.id, packet.ack);
    }
    this._emit(args);
  };

  RedisMediator.prototype.emit = function() {
    this._emit(arguments);
    this.broadcast.apply(this, arguments);
  };

  RedisMediator.prototype._emit = function(args) {
    switch (args.length) {
      case 0:
        EventEmitter.prototype.emit.call(this);
        break;
      case 1:
        EventEmitter.prototype.emit.call(this, args[0]);
        break;
      case 2:
        EventEmitter.prototype.emit.call(this, args[0], args[1]);
        break;
      case 3:
        EventEmitter.prototype.emit.call(this, args[0], args[1], args[2]);
        break;
      default:
        EventEmitter.prototype.emit.apply(this, args);
    }
  };

  RedisMediator.prototype.broadcast = function() {
    var encodedPacket;
    encodedPacket = this.packet(Array.prototype.slice.call(arguments));
    this.pub.publish(this.pubchannel, encodedPacket);
  };

  RedisMediator.prototype.packet = function(args, options) {
    var fn, id, packet;
    packet = {
      id: ++this._ids,
      args: args
    };
    fn = args[args.length - 1];
    if ('function' === typeof fn) {
      packet.args = args.slice(0, args.length - 1);
      packet.ack = this.ackchannel;
      id = packet.id;
      this.acknowledges[id] = {
        fn: fn,
        counter: fn.counter || 1,
        context: fn.context || null
      };
      this.acknowledges[id].timer = setTimeout((function(_this) {
        return function() {
          _this.clearAck(id);
          if ('function' === typeof fn.timeoutFn) {
            fn.timeoutFn();
          }
        };
      })(this), fn.timeout || 2000);
    }
    return msgpack.encode([packet, options]);
  };

  RedisMediator.prototype.clearAck = function(id) {
    var prop;
    if (!this.acknowledges.hasOwnProperty(id)) {
      return;
    }
    clearTimeout(this.acknowledges[id].timer);
    for (prop in this.acknowledges[id]) {
      delete this.acknowledges[id][prop];
    }
    delete this.acknowledges[id];
  };

  RedisMediator.prototype.acknowledge = function(id, channel) {
    return (function(_this) {
      return function() {
        var args, encodedPacket, options, packet;
        if (_this.destroyed) {
          return;
        }
        args = Array.prototype.slice.call(arguments);
        packet = {
          id: ++_this._ids,
          args: args
        };
        options = {
          id: id
        };
        encodedPacket = msgpack.encode([packet, options]);
        _this.pub.publish(channel, encodedPacket);
      };
    })(this);
  };

  RedisMediator.prototype.destroy = function() {
    this.sub.punsubscribe(this.messagep + '*', 0);
    this.sub.punsubscribe(this.ackchannel, 0);
    if (this.pub.___RedisMediator___) {
      this.pub.quit();
    }
    if (this.sub.___RedisMediator___) {
      this.sub.quit();
    }
  };

  return RedisMediator;

})(EventEmitter);
