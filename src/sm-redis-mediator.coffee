###*
# Module dependencies.
###

uid2 = require 'uid2'
redis = require 'redis'
msgpack = require 'msgpack-js'
EventEmitter = require('events').EventEmitter
log4js = global.log4js or (global.log4js = require 'log4js')
logger = log4js.getLogger 'RedisMediator'

###*
# Module exports.
###

module.exports = class RedisMediator extends EventEmitter
    constructor: (uri, opts) ->
        opts = opts or {}

        # handle options only
        if 'object' == typeof uri
            opts = uri
            uri = null

        # handle uri string
        if uri
            uri = uri.split ':'
            opts.host = uri[0]
            opts.port = uri[1]

        # opts
        socket = opts.socket
        host = opts.host or '127.0.0.1'
        port = if opts.port then parseInt(opts.port, 10) else 6379
        pub = opts.pub
        sub = opts.sub
        prefix = opts.key or 'RedisMediator'
        @name = opts.name

        # init clients if needed
        if not pub
            pub = if socket then redis.createClient(socket) else redis.createClient(port, host)
        if not sub
            sub = if socket then redis.createClient(socket, detect_buffers: true) else redis.createClient(port, host, detect_buffers: true)

        # this mediator's key
        uid = uid2(6)
        @init uid, prefix, pub, sub
    
    init: (@uid, @prefix, @pub, @sub)->
        @_ids = 0
        @acknowledges = {}
        @key = @prefix + '#' + @uid
        
        @sub.psubscribe @prefix + '#*', (err)=>
            return EventEmitter::emit.call @, 'error', err if err
            EventEmitter::emit.call @, 'ready'
            return

        @sub.on 'pmessage', @onMessage
        return

    onMessage: (pattern, channel, msg)=>
        # logger.trace @name, 'pmessage', channel

        info = channel.split '#'
        if @uid is info[1]
            # logger.trace @name, 'ignore same uid'
            return
        evt = info[2]
        [packet, options] = msgpack.decode msg

        args = packet.args

        if evt is 'ack'
            # logger.trace @name, 'ack', options.id
            return if not @acknowledges.hasOwnProperty options.id
            fn = @acknowledges[options.id].fn
            if --@acknowledges[options.id].counter is 0
                @cleanAck options.id
            fn.apply fn.context, args
            return
        
        if packet.ack
            args[args.length] = @acknowledge packet.id

        @_emit args
        return

    emit: ->
        @_emit arguments
        @broadcast.apply @, arguments
        return

    _emit: (args)->
        switch args.length
            when 0
                EventEmitter::emit.call @
            when 1
                EventEmitter::emit.call @, args[0]
            when 2
                EventEmitter::emit.call @, args[0], args[1]
            when 3
                EventEmitter::emit.call @, args[0], args[1], args[2]
            else
                EventEmitter::emit.apply @, args
        return
    
    broadcast: ->
        encodedPacket = @packet Array::slice.call arguments
        # logger.trace @name, 'publish', @key + '#message'
        @pub.publish @key + '#message', encodedPacket
        return

    packet: (args, options)->
        packet = {id: ++@_ids, args: args}

        fn = args[args.length - 1]
        if 'function' is typeof fn
            packet.args = args.slice 0, args.length - 1
            packet.ack = true

            id = packet.id
            # logger.trace @name, 'wait acknowledge', id

            @acknowledges[id] =
                fn: fn
                counter: fn.counter or 1
                context: fn.context or null
            
            # 10 seconds to acknowledge
            @acknowledges[id].timer = setTimeout =>
                # logger.trace @name, 'timeout', packet.id
                @cleanAck id
                if 'function' is typeof fn.timeoutFunc
                    fn.timeoutFunc()
                return
            , fn.timeout or 10000

        msgpack.encode [packet, options]

    cleanAck: (id)->
        return if not @acknowledges.hasOwnProperty id
        clearTimeout @acknowledges[id].timer
        for prop of @acknowledges[id]
            delete @acknowledges[id][prop]
        delete @acknowledges[id]
        return

    acknowledge: (id)=>
        =>
            args = Array::slice.call arguments
            packet = {id: ++@_ids, args: args}
            options = id: id
            encodedPacket = msgpack.encode [packet, options]
            # logger.trace @name, 'publish', @key + '#ack'
            @pub.publish @key + '#ack', encodedPacket
            return
