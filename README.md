# Omi Client

This is a very simplistic WebSocket based client for communicating with a O-MI Node, using O-DF formatted messages.

## Getting started

### Start a O-MI Node

Download the reference server implementation from:

```sh
https://github.com/AaltoAsia/O-MI
```

Edit the `configs/application.conf`. Ensure the localhost is not commented out in the IP whitelist section.

```sh
input-whitelist-ips=[	
        "127.0.0.1"
]
```

Ensure you have java 8 or later.

In a console/command line type `java -version`, response should be something like this:

```sh
greg@desktop ~/o-mi-node-0.8.2-warp10 $ java -version
java version "1.8.0_131"
Java(TM) SE Runtime Environment (build 1.8.0_131-b11)
Java HotSpot(TM) 64-Bit Server VM (build 25.131-b11, mixed mode)
```

Run the server.

```sh
greg@desktop ~/o-mi-node-0.8.2-warp10 $ ./bin/o-mi-node
```

The first startup will take some few minutes to start, be patient.

### Run the example

¡ This does not exist yet !

```sh
git clone https://github.com/ControlThings/omi-odf-nodejs.git
```

```sh
npm install omi-odf
```

Create a `app.js` with the following sample code:

```javascript
var OmiClient = require('omi-odf').OmiClient;
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
```

Run the program:

```sh
node app.js
```


