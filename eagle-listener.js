const express = require('express')
const xmlparser = require('express-xml-bodyparser')
const EventEmitter = require('events')
const logger = require('./logger.js')

regex = new RegExp('^\\d{2,6}$')
const port = regex.test(process.env.LISTEN_PORT) ? process.env.LISTEN_PORT : 3000

regex = new RegExp('^true$', 'i')
const hires = regex.test(process.env.SUMMATION_WATTS) ? true : false

module.exports = new EventEmitter()

var http = express()

http.use(xmlparser({ ignoreAttrs: true }));

http.post('/', function (req, res) {
    res.send('OK')
    if ('rainforest' in req.body) {
        processMessage(req.body.rainforest)
    } else {
        logger.debug('Received invalid data in POST')
    }
})

http.get('/', function (req, res) {
    res.send('<h2>Rainforest Eagle to MQTT Bridge.</h2><p><a href="https://github.com/thevoltagesource/eagle-mqtt-bridge#readme">Documentation</a></p>')
})

http.listen(port, () => logger.info(`Listening for Eagle messages on port ${port}`))

const processInstantaneousDemand = function (node) {
    logger.debug(node)

    var mult = parseInt(node.multiplier[0], 16)
    var multiplier = mult ? mult : 1  //If zero use 1
    var div = parseInt(node.divisor[0], 16)
    var divisor = div ? div : 1 //If zero use 1

    // Note that demand is in kW (if UoM is 0x00)
    var demand = parseInt(node.demand[0], 16)

    if (demand > 2147483648) {
        // Solar feed in turns the demand into a negative value but we see that as an unsigned int (so 0xfff....)
        logger.debug("Converting demand to negative value ... solar feed-in presumably")
        demand = demand - 4294967295;
    }

    var value = parseInt(((demand * multiplier) / divisor) * 1000)

    var message = { 'meter/demand': value }
    return message
}

const processCurrentSummation = function (node) {
    logger.debug(node)

    var mult = parseInt(node.multiplier[0], 16)
    var multiplier = mult ? mult : 1  //If zero use 1
    var div = parseInt(node.divisor[0], 16)
    var divisor = div ? div : 1 //If zero use 1

    var delivered = parseInt(node.summationdelivered[0], 16)
    var dvalue = hires ? parseInt(((delivered * multiplier) / divisor) * 1000) : parseInt((delivered * multiplier) / divisor)

    var received = parseInt(node.summationreceived[0], 16)
    var rvalue = hires ? parseInt(((received * multiplier) / divisor) * 1000) : parseInt((received * multiplier) / divisor)

    var message = { 'meter/delivered': dvalue, 'meter/received': rvalue }
    return message
}

const processConnectionStatusAndNetworkInfo = function (node) {
    logger.debug(node)

    // There's a bug in firmware which doesn't provide the ConnectionStatus fragment.  It appears to
    // send two NetworkInfo fragments with different contents.

    if ("status" in node) {
        var status = node.status[0]
        var signal = parseInt(node.linkstrength[0], 16)
        var channel = parseInt(node.channel[0], 10)

        var message = { 'zigbee/status': status, 'zigbee/signal': signal, 'zigbee/channel': channel }
    }
    else {
        // This is a partial ConnectionStatus fragment...only do the available fields
        var channel = parseInt(node.channel[0], 10)

        var message = { 'zigbee/channel': channel }
    }

    return message
}

const processPriceCluster = function (node) {
    logger.info(node)

    var price = parseInt(node.price[0], 16)
    var tier = parseInt(node.tier[0], 16)
    var message = { 'pricing/price': price, 'pricing/tier': tier }

    return message
}

const processMessage = function (msg) {
    switch (Object.keys(msg)[0]) {
        case 'instantaneousdemand':
            // Current demand in W
            var message = processInstantaneousDemand(msg.instantaneousdemand[0])
            break
        case 'currentsummation':
            // EAGLE-200 uploader specification changes this tag (see section 2.7)
            var message = processCurrentSummation(msg.currentsummation[0])
            break
        case 'currentsummationdelivered':
            // Current meter reading in kWh (W if hires)
            var message = processCurrentSummation(msg.currentsummationdelivered[0])
            break
        case 'connectionstatus':
            // EAGLE-200 uploader specification renames this tag (see section 2.2)
            var message = processConnectionStatusAndNetworkInfo(msg.connectionstatus[0])
            break
        case 'networkinfo':
            var message = processConnectionStatusAndNetworkInfo(msg.networkinfo[0])
            break
        case 'messagecluster':
            //{ devicemacid: [ '0xd8d5b90000003e58' ],
            //  metermacid: [ '0x00078100001d2c64' ],
            //  timestamp: [ '' ],
            //  id: [ '' ],
            //  text: [ '' ],
            //  priority: [ '' ],
            //  starttime: [ '' ],
            //  duration: [ '' ],
            //  confirmationrequired: [ 'N' ],
            //  confirmed: [ 'N' ],
            //  queue: [ 'Active' ],
            //  protocol: [ '' ],
            //  port: [ '/dev/ttySP0' ] }
            break
        case 'deviceinfo':
            //{ devicemacid: [ '0xd8d5b90000003e58' ],
            //  installcode: [ '0x631055eb6e7d6204' ],
            //  linkkey: [ '0x356588c8f3db5220bb60206862aa249b' ],
            //  fwversion: [ '1.4.48 (6952)' ],
            //  hwversion: [ '1.2.5' ],
            //  imagetype: [ '0x1301' ],
            //  manufacturer: [ 'Rainforest Automation, Inc.' ],
            //  modelid: [ 'Z109-EAGLE' ],
            //  datecode: [ '2014081323520712' ],
            //  protocol: [ '' ],
            //  port: [ '/dev/ttySP0', '/dev/ttySP0' ] }
            break
        case 'pricecluster':
            var message = processPriceCluster(msg.pricecluster[0])
            break
        case 'timecluster':
            //{ devicemacid: [ '0xd8d5b90000003e58' ],
            //  metermacid: [ '0x00078100001d2c64' ],
            //  utctime: [ '0x246cf261' ],
            //  localtime: [ '0x246cac11' ],
            //  protocol: [ '' ],
            //  port: [ '/dev/ttySP0' ] }
            break
        case 'blockpricedetail':
            //{ devicemacid: [ '0xd8d5b90000003e58' ],
            //  metermacid: [ '0x00078100001d2c64' ],
            //  timestamp: [ '0x246e3750' ],
            //  currentstart: [ '0x00000000' ],
            //  currentduration: [ '0x0000' ],
            //  blockperiodconsumption: [ '0x0000000000000000' ],
            //  blockperiodconsumptionmultiplier: [ '0x00000001' ],
            //  blockperiodconsumptiondivisor: [ '0x000003e8' ],
            //  numberofblocks: [ '0x00' ],
            //  multiplier: [ '0x00000001' ],
            //  divisor: [ '0x00000001' ],
            //  currency: [ '0x0348' ],
            //  trailingdigits: [ '0x00' ],
            //  port: [ '/dev/ttySP0' ] }
            break
        case 'scheduleinfo':
            break
        default:
            logger.debug('Unknown message type: ' + Object.keys(msg))
    }
    if (message) {
        logger.debug(message)
        module.exports.emit('message', message)
    }
}
