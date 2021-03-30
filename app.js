/* eslint-disable lodash/import-scope */
/* eslint-disable lodash/matches-prop-shorthand */
/* eslint-env node */
/* eslint no-unused-vars: ["error", { "args": "none" }]*/
/* eslint-disable lodash/prefer-lodash-method */

var createError = require('http-errors');
var compression = require('compression');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
var shellies = require('shellies')
var _ = require('lodash');
const TimeAgo = require('javascript-time-ago');
const en = require('javascript-time-ago/locale/en');
TimeAgo.addDefaultLocale(en);
const timeAgo = new TimeAgo('en-GB')

var app = express();
app.use(compression({ filter: shouldCompress }))
function shouldCompress(req, res) {
  if (req.headers['x-no-compression']) {
    // don't compress responses with this request header
    return false
  }
  // fallback to standard filter function
  return compression.filter(req, res)
}

var SSE = require('express-sse');
var sse = new SSE();

var indexRouter = require('./routes/index');
var apiRouter = require('./routes/api');
var testRouter = require('./routes/test');

var shellycoaplist = {};
var shellylist = {};
app.locals.shellylist = shellylist;

const deviceKey = (type, id) => `${type}#${id}`;

function shellyExtract(device) {
  return {
    devicekey: deviceKey(device.type, device.id),
    id: device.id,
    type: device.type,
    devicename: device.name,
    ip: device.host,
    online: device.online,
    lastSeen: device.lastSeen,
    lastSeenHuman: timeAgo.format(Date.parse(device.lastSeen)),
    modelName: device.modelName
  }
}

function processStatus(device, newStatus) {
  var devicekey = deviceKey(device.type, device.id);
  //console.log('Received new polled status for ', devicekey);
  var existingCoAPDevice = shellycoaplist[devicekey];

  if (_.isNil(existingCoAPDevice)) {
    console.log('SHOULD NOT BE HERE! Device ', devicekey, ' did not exist in CoAP list when updating status');
    shellycoaplist[devicekey] = device;
  }
  //var existingDevice = _.find(shellylist, function (o) { return o.devicekey === devicekey; });
  var existingDevice = shellylist[devicekey];
  if (existingDevice) {
    existingDevice = _.merge(existingDevice, shellyExtract(device));
    existingDevice.status = newStatus;
    existingDevice.mqtt_connected = newStatus.mqtt.connected;
    existingDevice.rssi = newStatus.wifi_sta.rssi;
  } else {
    console.log('SHOULD NOT BE HERE! Device ', devicekey, ' did not exist in shellylist when updating status');
    existingDevice = shellyExtract(device);
  }
  shellylist[devicekey] = existingDevice;
  sse.send(existingDevice, 'shellyUpdate');
}
function pollStatus(device) {
  try {
    if (_.isFunction(device.getStatus)) {
      device.getStatus().then((newStatus) => {
        try {
          processStatus(device, newStatus);
        } catch (err) { console.log('*********ERROR*********: ', err.message, ' while processStatus'); }
      });
    } else {
      console.log('getStatus failed because the object does not have that function');
    }
  } catch (err) { console.log('*********ERROR*********: ', err.message, ' uncaught in pollStatus'); }
}

function processSettings(device, newSettings) {
  var devicekey = deviceKey(device.type, device.id);
  //console.log('Received new polled settings for ', devicekey);
  var existingCoAPDevice = shellycoaplist[devicekey];
  if (_.isNil(existingCoAPDevice)) {
    console.log('SHOULD NOT BE HERE! Device ', devicekey, ' did not exist in CoAP list when updating settings');
    shellycoaplist[devicekey] = device;
  }
  //  var existingDevice = _.find(shellylist, function (o) { return o.devicekey === devicekey; });
  var existingDevice = shellylist[devicekey];
  if (existingDevice) {
    existingDevice = _.merge(existingDevice, shellyExtract(device));
    existingDevice.settings = newSettings;
    existingDevice.fw = newSettings.fw;
    existingDevice.givenname = newSettings.name;
    existingDevice.ssid = newSettings.wifi_sta.ssid;
    existingDevice.mqtt_enable = newSettings.mqtt.enable;
  } else {
    console.log('SHOULD NOT BE HERE! Device ', devicekey, ' did not exist in shellylist when updating settings');
    existingDevice = shellyExtract(device);
  }
  shellylist[devicekey] = existingDevice;
  sse.send(existingDevice, 'shellyUpdate');
}
function pollSettings(device) {
  try {
    if (_.isFunction(device.getSettings)) {
      device.getSettings().then((newSettings) => {
        try {
          processSettings(device, newSettings);
        } catch (err) { console.log('*********ERROR*********: ', err.message, ' while processSettings'); }
      });
    } else {
      console.log('getSettings failed because the object does not have that function');
    }
  } catch (err) { console.log('*********ERROR*********: ', err.message, ' uncaught in pollStatus'); }
}

shellies.on('discover', device => {
  // a new device has been discovered
  console.log('Discovered device with ID', device.id, 'and type', device.type);
  var devicekey = deviceKey(device.type, device.id);
  shellycoaplist[devicekey] = device;
  shellylist[devicekey] = shellyExtract(device);
  pollSettings(device);
  pollStatus(device);
  setInterval(pollSettings, 30000, device);
  setInterval(pollStatus, 30000, device);

  device.on('change', (prop, newValue, oldValue) => {
    // a property on the device has changed
    console.log(prop, 'changed from', oldValue, 'to', newValue);
    var devicekey = deviceKey(device.type, device.id);
    var extractedData = shellylist[devicekey];
    try {
      extractedData.prop = prop;
      extractedData.oldValue = oldValue;
      extractedData.newValue = newValue;
      sse.send(extractedData, 'shellyUpdate');
    } catch (err) { console.log('Error: ', err.message, ' while sending update'); }
  })

  device.on('offline', () => {
    console.log('Device with ID', device.id, 'went offline')
    var devicekey = deviceKey(device.type, device.id);
    var extractedData = shellylist[devicekey];
    try {
      sse.send(extractedData, 'shellyRemove');
    } catch (err) { console.log('Error: ', err.message, ' while sending remove'); }
    shellycoaplist[devicekey] = undefined;
    shellylist[devicekey] = undefined;
    // the device went offline
  })
})

// start discovering devices and listening for status updates
shellies.start();

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'pug');

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', indexRouter);
app.use('/api', apiRouter);
app.use('/test', testRouter);
app.get('/events', sse.init);

// catch 404 and forward to error handler
app.use(function (req, res, next) {
  next(createError(404));
});

// error handler
app.use(function (err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});

module.exports = app;
