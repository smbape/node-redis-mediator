###*
# Module dependencies.
###

uid2 = require 'uid2'
redis = require 'redis'
msgpack = require 'msgpack-js'
EventEmitter = require('events').EventEmitter
# log4js = global.log4js or (global.log4js = require 'log4js')
# logger = log4js.getLogger 'RedisMediator'

###*
# Module exports.
###

module.exports = class RedisMediator extends EventEmitter
    constructor: (uri, opts) ->
        if arguments.length is 1 and uri isnt null and 'object' is typeof uri
            opts = uri
            uri = null

        opts or (opts = {})

        if 'string' is typeof uri
            uri = uri.split ':'
            opts.host = uri[0]
            opts.port = uri[1]

        @pub = opts.pub
        @sub = opts.sub
        @channel = opts.channel or 'mediator'

        socket = opts.socket
        host = opts.host or '127.0.0.1'
        port = if opts.port then parseInt(opts.port, 10) else 6379

        if not @pub
            if socket
                @pub = redis.createClient(socket)
            else
                @pub = redis.createClient(port, host)
            @pub.___RedisMediator___  = 1

        if not @sub
            if socket
                @sub = redis.createClient(socket, return_buffers: true)
            else
                @sub = redis.createClient(port, host, return_buffers: true)
            @sub.___RedisMediator___  = 1

        @uid = uid2 6
        @_ids = 0
        @acknowledges = {}
        @messagep = @channel + '#message#'
        @pubchannel = @messagep + @uid
        @ackchannel = @channel + '#ack#' + @uid

        count = 0
        waiting = 2

        @sub.psubscribe @messagep + '*', (err)=>
            return EventEmitter::emit.call @, 'error', err if err
            EventEmitter::emit.call @, 'ready' if ++count is waiting
            return

        @sub.psubscribe @ackchannel, (err)=>
            return EventEmitter::emit.call @, 'error', err if err
            EventEmitter::emit.call @, 'ready' if ++count is waiting
            return

        @sub.on 'pmessage', @onmessage

    onmessage: (pattern, channel, msg)=>
        info = channel.toString().split '#'
        evt = info[1]
        uid = info[2]
        return if evt is 'message' and @uid is uid

        [packet, options] = msgpack.decode msg
        # logger.debug 'message', @uid, packet, options

        args = packet.args

        if evt is 'ack'
            # Response to a waiting acknowledge
            return if not @acknowledges.hasOwnProperty options.id
            fn = @acknowledges[options.id].fn
            if --@acknowledges[options.id].counter is 0
                # All waiting responses have been received
                @clearAck options.id
            fn.apply fn.context, args
            return
        
        if packet.ack
            # Packet is waiting for an acknowledge
            args[args.length] = @acknowledge packet.id, packet.ack

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
        # logger.debug 'broadcast', @uid
        encodedPacket = @packet Array::slice.call arguments
        @pub.publish @pubchannel, encodedPacket
        return

    packet: (args, options)->
        packet = {id: ++@_ids, args: args}

        fn = args[args.length - 1]
        if 'function' is typeof fn
            packet.args = args.slice 0, args.length - 1
            packet.ack = @ackchannel

            id = packet.id

            @acknowledges[id] =
                fn: fn
                counter: fn.counter or 1
                context: fn.context or null
            
            # wait acknowledges for 2 seconds by default
            @acknowledges[id].timer = setTimeout =>
                @clearAck id
                if 'function' is typeof fn.timeoutFn
                    fn.timeoutFn()
                return
            , fn.timeout or 2000

        msgpack.encode [packet, options]

    clearAck: (id)->
        return if not @acknowledges.hasOwnProperty id

        clearTimeout @acknowledges[id].timer

        # Remove nested references. Don't know if necessary with node 0.8+
        for prop of @acknowledges[id]
            delete @acknowledges[id][prop]
        
        delete @acknowledges[id]
        return

    acknowledge: (id, channel)=>
        =>
            # logger.debug 'acknowledge', @uid
            return if @destroyed
            args = Array::slice.call arguments
            packet = {id: ++@_ids, args: args}
            options = id: id
            encodedPacket = msgpack.encode [packet, options]
            @pub.publish channel, encodedPacket
            return

    destroy: ->
        @sub.punsubscribe @messagep + '*', 0
        @sub.punsubscribe @ackchannel, 0

        if @pub.___RedisMediator___
            @pub.quit()
        if @sub.___RedisMediator___
            @sub.quit()

        return
