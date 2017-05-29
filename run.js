var OmiClient = require('./src/omi-client.js').OmiClient;
//var OmiClient = require('omi-client').OmiClient;
var inspect = require('util').inspect;

var host = 'ws://localhost:8080';
var omiClient = new OmiClient(host);

omiClient.once('ready', function() {
    console.log("OmiClient connected to "+ host +'.');

    var name = 'MyDevice';
    var path = 'Your/Path/Things/'+name;
    var ep = 'relay';

    // ensure the instance in the O-MI node by issuing a write command
    omiClient.write(path, ep, false);

    // subscribe to changes from "MyDevice"
    omiClient.subscribe(path, null, {}, function(ep, data, opts) {
        console.log("Subscribe:", ep, data, opts);
    });

    // write ep to true, which should trigger subscription callback
    setTimeout(() => { omiClient.write(path, ep, true); }, 500);

    setTimeout(() => {
        omiClient.read(path, ep, function(ep, value, opts) {
            console.log('Read:', ep, value, opts);
        });
    }, 600);
});

omiClient.once('close', function() {
    console.log("OmiClient websocket connection was lost.");
    process.exit(1);
});