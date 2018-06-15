var EventEmitter = require('events').EventEmitter;
var inherits = require('util').inherits;
var debug = require('debug')('o-mi');
var Omi = require('./omi.js').Omi;
var WebSocket = require('ws');

function OmiClient(host, opts) {
    var self = this;
    this.omiReady = false;
    this.subscription = -1;
    this.modelCb = null;
    this.readCb = null;
    this.subscriptionCb = null;
    
    this.ping = null;

    this.ws = new WebSocket(host, opts);
    
    this.ws.on('open', function() {
        self.omiReady = true;
        
        debug('OMI websocket connecion ready.');
        
        self.emit('ready');
        
        // set up a recurring request to stop the link from timing out on the server side.
        if (self.ping) { clearInterval(self.ping); }

        function noop(){};
        self.ping = setInterval(function() {
            self.ws.ping(noop);
        }, 30000);
    });

    this.ws.on('message', function(data, flags) {
        var res = Omi.parse(data);
        
        //console.log('message', require('util').inspect(res, 10, null, true));
            
        if (!res['omiEnvelope']['response'][0]['result'][0]['msg']) {
            //console.log('Expecting responses (omiEnvelope => response => result => msg), but got something else', require('util').inspect(res, 10, null, true));
            return;
        }
        
        try {
            self.subscription = parseInt(res['omiEnvelope']['response'][0]['result'][0]['requestID'][0]);
            if ( self.subscription && self.subscriptionCb && res['omiEnvelope']['response'][0]['result'][0]['msg'] ) {
                self.parseSubscription(res);
            }
            return;
        } catch(e) {
            //debug('Response message (not subscription).');
            //var inspect = require('util').inspect;
            //console.log("omiClient says:", inspect(res, 10, null, true));
        }
        
        if ( self.modelCb ) {
            self.parseModel(res);
            self.modelCb = null;
        } else if ( self.readCb ) {
            // assuming read response
            self.parseRead(res);
            self.readCb = null;
        }
        
        //self.emit('message', res);
    });

    this.ws.on('error', function(err) {
        debug("Error (this.ws.on)", err);
        if(self.omiReady) {
            debug('Lost OMI websocket connection, due to error', err);
            self.omiReady = false;
        }
    });

    this.ws.on('close', function(msg) {
        clearInterval(self.ping);
        if(self.omiReady) {
            debug('OMI websocket connection was closed', msg);
            self.omiReady = false;
            self.emit('close');
        }
    });
}

inherits(OmiClient, EventEmitter);

OmiClient.prototype.send = function(data) {
    if(!this.omiReady) { console.log('Dumped request, omiClient is busy or not connected.'); return; }
    // Write XML to socket: data
    this.ws.send(data);
};

OmiClient.prototype.model = function(path, infoitem, opts, cb) {
    this.model = -1;
    this.modelCb = cb;
    this.ws.send(Omi.read(path, infoitem, opts));
};

OmiClient.prototype.read = function(path, infoitem, opts, cb) {
    if (typeof opts === 'function') { cb = opts; }
    
    this.read = -1;
    this.readCb = cb;
    this.ws.send(Omi.read(path, infoitem, opts));
};

OmiClient.prototype.write = function(path, infoitem, value, opts, cb) {
    this.ws.send(Omi.write(path, infoitem, value, opts));
};

OmiClient.prototype.subscribe = function(path, infoitem, opts, cb) {
    this.subscription = -1;
    this.subscriptionCb = cb;
    this.ws.send(Omi.subscribe(path, infoitem, opts));
};

OmiClient.prototype.parseModel = function(data) {
    //var inspect = require('util').inspect;
    //console.log("parsing model:", inspect(data, 10, null, true));
    try {
        // get next child object
        function next(cur) {
            try {
                return cur[0].Object;
            } catch(e) {
                return false;
            }
        }

        var cur = data['omiEnvelope']['response'][0]['result'][0]['msg'][0].Objects;
        var out = {};
        var l = [];
        while( true ) {
            var item = next(cur);
            if (!item) { 
                break;
            } else {
                cur = item;
            }
            
            for(var i in cur) {
                
                l.push(cur[i].id[0]);
                for(var j in cur[i].InfoItem) {
                    var key = l.join('/');
                    var name = cur[i].InfoItem[j]['@'].name;
                    var type = cur[i].InfoItem[j].value[0]['@'].type;
                    var value = cur[i].InfoItem[j].value[0]._;

                    if(type === 'xs:boolean') {
                        out[name] = { value: (value === 'false') ? false : true, type: type };
                    } else if ( type === 'xs:decimal' || type === 'xs:double') {
                        out[name] = { value: parseFloat(cur[i].InfoItem[j].value[0]._), type: type };
                    } else if ( type === 'xs:integer' ) {
                        out[name] = { value: parseInt(cur[i].InfoItem[j].value[0]._), type: type };
                    } else if ( type === 'xs:string') {
                        out[name] = { value: cur[i].InfoItem[j].value[0]._, type: type };
                    } else {
                        console.log("parseSubscription: unknown type:", type);
                    }
                }
                l.pop();
            }
            //l.pop();
        }

        this.modelCb(key, out, {});
        this.modelCb = function() {};
    } catch(e) { /* console.log("e"); */ }
};

OmiClient.prototype.parseRead = function(data) {
    //var inspect = require('util').inspect;
    //console.log("parsing read:", inspect(data, 10, null, true));
    
    try {
        // get next child object
        function next() {
            try {
                return cur[0].Object;
            } catch(e) {
                return false;
            }
        }

        var cur = data['omiEnvelope']['response'][0]['result'][0]['msg'][0].Objects;
        var out = {};
        var l = [];
        while( true ) {
            var item = next(cur);
            if (!item) { 
                break;
            } else {
                cur = item;
            }

            l.push(cur[0].id[0]._ || cur[0].id[0]);

            for(var j in cur[0].InfoItem) {
                var key = l.join('/')+ '/' +cur[0].InfoItem[j]['@'].name;
                var type = cur[0].InfoItem[j].value[0]['@'].type;
                var value = cur[0].InfoItem[j].value[0]._;
                var timestamp = parseInt(cur[0].InfoItem[j].value[0]['@'].unixTime);
                
                out[key] = {
                    opts: {
                        timestamp: timestamp,
                        type: type
                    }
                };

                if(type === 'xs:boolean') {
                    out[key].value = (value === 'false') ? false : true;
                } else if ( type === 'xs:decimal' || type === 'xs:double') {
                    out[key].value = parseFloat(cur[0].InfoItem[j].value[0]._);
                } else if ( type === 'xs:integer' ) {
                    out[key].value = parseInt(cur[0].InfoItem[j].value[0]._);
                } else if ( type === 'xs:string') {
                    out[key].value = cur[0].InfoItem[j].value[0]._;
                } else {
                    console.log("parseSubscription: unknown type:", type);
                }
            }
        }

        for(var i in out) {
            this.readCb(i, out[i].value, out[i].opts);
        }
    } catch(e) { /* console.log("e"); */ }
};

OmiClient.prototype.parseSubscription = function(data) {
    try {
        // get next child object
        function next() {
            try {
                return cur[0].Object;
            } catch(e) {
                return false;
            }
        }

        var cur = data['omiEnvelope']['response'][0]['result'][0]['msg'][0].Objects;
        var out = {};
        var l = [];
        while( true ) {
            var item = next(cur);
            if (!item) { 
                break;
            } else {
                cur = item;
            }

            l.push(cur[0].id[0]._ || cur[0].id[0]);

            if(cur[0].InfoItem) {
                var key = l.join('/')+ '/' +cur[0].InfoItem[0]['@'].name;
                var type = cur[0].InfoItem[0].value[0]['@'].type;
                var value = cur[0].InfoItem[0].value[0]._;
                var timestamp = parseInt(cur[0].InfoItem[0].value[0]['@'].unixTime);
                
                out[key] = {
                    opts: {
                        id: this.subscription,
                        timestamp: timestamp,
                        type: type
                    }
                };

                if(type === 'xs:boolean') {
                    out[key].value = (value === 'false') ? false : true;
                } else if ( type === 'xs:decimal' || type === 'xs:double') {
                    out[key].value = parseFloat(cur[0].InfoItem[0].value[0]._);
                } else if ( type === 'xs:integer') {
                    out[key].value = parseInt(cur[0].InfoItem[0].value[0]._);
                } else if ( type === 'xs:string') {
                    out[key].value = cur[0].InfoItem[0].value[0]._;
                } else {
                    console.log("parseSubscription: unknown type:", type);
                }
            }
        }

        for(var i in out) {
            this.subscriptionCb(i, out[i].value, out[i].opts);
        }
    } catch(e) { /* console.log("e"); */ }
};

module.exports = {
    OmiClient: OmiClient };
