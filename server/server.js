#!/usr/bin/node
var networkInterfaces = require("./network_interfaces");
var base64Decode = require("./b64.js");
const fs = require("fs");
var express = require("express");
var bodyParser = require("body-parser");
var path = require("path");
var jsonfile = require("jsonfile");
var remote = require("electron").remote;

var SnowplowEvent = require("./model/snowplow_event.js");
var ValidationSchema = require("./model/validation_schema.js");

var appLogger = require("./logger/app_logger.js");

var app = express();
app.use(bodyParser.json()); // for parsing application/json
app.use(bodyParser.urlencoded({ extended: true })); // for parsing application/x-www-form-urlencoded

var schemas = {};
var schemaDir = remote.getGlobal("options").schemaDir;
if (!!schemaDir && schemaDir !== "") {
    readSchema(schemaDir);
}

function readSchema(file) {
    var stats = fs.lstatSync(file);
    if (stats.isFile()) {
        try {
            let schemaName = file
                .substring(schemaDir.length)
                .replace(/\\/g, "/"); // force forard slashes irrespective of platform
            schemas[schemaName] = new ValidationSchema(
                schemaName,
                jsonfile.readFileSync(file)
            );
        } catch (err) {
            console.log(err);
        }
    } else if (stats.isDirectory(file)) {
        var files = fs.readdirSync(file);
        files.forEach(function(f) {
            readSchema(path.join(file, f));
        });
    }
}

// Capturing every post events to this server
app.post("*", function(req, res) {
    var body = req.body;

    var bundle = body.data.reverse();
    bundle.forEach(function(data) {
        var context = JSON.parse(base64Decode(data.cx));
        var payload = JSON.parse(base64Decode(data.ue_px));
        // context.data = context.data.slice(0, context.data.length - 2); // The last two context are generated by snowplow

        var event = new SnowplowEvent(data.uid, payload, context);
        event.validate(schemas);

        appLogger.logEvent(event);
    });
    res.sendStatus(204);
});

// Start server
var port = remote.getGlobal("options").listeningPort;
app.listen(port, function() {
    var ifaces = networkInterfaces.getNetworkInterfacesIps();
    console.log("Listening for SnowPlow analytics on");
    ifaces.forEach(function(iface) {
        console.log(" - %s:%s", iface, port);
    });
    console.log(
        "Please check you both of your devices are on the same network"
    );
    console.log(
        "________________________________________________________________________________"
    );
    console.log("");
});