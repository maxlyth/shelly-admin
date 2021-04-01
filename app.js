/* eslint-disable lodash/import-scope */
/* eslint-disable lodash/matches-prop-shorthand */
/* eslint-env node */
/* eslint no-unused-vars: ["error", { "args": "none" }]*/
/* eslint-disable lodash/prefer-lodash-method */

const _ = require('lodash');
const path = require('path');
const createError = require('http-errors');
const cookieParser = require('cookie-parser');
const compression = require('compression');
const express = require('express');
const SSE = require('express-sse');
const morgan = require('morgan');
const TimeAgo = require('javascript-time-ago');
const en = require('javascript-time-ago/locale/en');
const shellies = require('shellies')

const indexRouter = require('./routes/index');
const apiRouter = require('./routes/api');
const testRouter = require('./routes/test');

const app = express();
const sse = new SSE();
var shellycoaplist = {};
var shellylist = {};

// Setup some Express globals we will need in templates and view handlers
/*
Consider switching to middleware locals rather than app globals. eg:
app.use(function(req, res, next){
  res.locals._ = require('underscore');
  next();
});
*/
app.locals.shellylist = shellylist;
app.locals._ = _;

TimeAgo.addDefaultLocale(en);
const timeAgo = new TimeAgo('en-GB')

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


function pollStatus(device) {
  function processStatus(device, newStatus) {
    const devicekey = deviceKey(device.type, device.id);
    //console.log('Received new polled status for ', devicekey);

    const existingCoAPDevice = shellycoaplist[devicekey];
    if (_.isNil(existingCoAPDevice)) {
      console.error('SHOULD NOT BE HERE! Device ', devicekey, ' did not exist in CoAP list when updating status');
      return;
    }
    const existingDevice = shellylist[devicekey];
    if (_.isNil(existingDevice)) {
      console.error('SHOULD NOT BE HERE! Device ', devicekey, ' did not exist in shellylist when updating status');
      return;
    }
    let newExtraction = shellyExtract(device);
    newExtraction.status = newStatus;
    newExtraction.mqtt_connected = newStatus.mqtt.connected;
    newExtraction.rssi = newStatus.wifi_sta.rssi;
    newExtraction = _.merge(existingDevice, newExtraction);
    const differences = _.difference(shellylist[devicekey], newExtraction);
    if (differences.length === 0) {
      //console.log('Found ZERO differences when updating status. Ignoring SSE event');
      return;
    }
    console.log('Found DIFFERENCES', differences, 'when updating status so sending SSE event');
    shellylist[devicekey] = newExtraction;
    sse.send(newExtraction, 'shellyUpdate');
  }
  try {
    device.getStatus?.().then((newStatus) => {
      try {
        processStatus(device, newStatus);
      } catch (err) { console.error('*********ERROR*********: ', err.message, ' while processStatus'); }
    });
  } catch (err) { console.error('*********ERROR*********: ', err.message, ' uncaught in pollStatus'); }
  return Math.round(Math.random() * (20000)) + 50000;
}
function pollStatusTimer() {
  const nextPollInterval = pollStatus(this.device);
  setTimeout(pollStatusTimer.bind({ device: this.device }), nextPollInterval);
}


function pollSettings(device) {
  function processSettings(device, newSettings) {
    const devicekey = deviceKey(device.type, device.id);
    //console.log('Received new polled settings for ', devicekey);
    const existingCoAPDevice = shellycoaplist[devicekey];
    if (_.isNil(existingCoAPDevice)) {
      console.error('SHOULD NOT BE HERE! Device ', devicekey, ' did not exist in CoAP list when updating settings');
      return;
    }
    //  var existingDevice = _.find(shellylist, function (o) { return o.devicekey === devicekey; });
    const existingDevice = shellylist[devicekey];
    if (_.isNil(existingDevice)) {
      console.error('SHOULD NOT BE HERE! Device ', devicekey, ' did not exist in shellylist when updating settings');
      return;
    }
    let newExtraction = shellyExtract(device);
    newExtraction.settings = newSettings;
    newExtraction.fw = newSettings.fw;
    newExtraction.givenname = newSettings.name;
    newExtraction.ssid = newSettings.wifi_sta.ssid;
    newExtraction.mqtt_enable = newSettings.mqtt.enable;
    newExtraction = _.merge(existingDevice, newExtraction);
    const differences = _.difference(shellylist[devicekey], newExtraction);
    if (differences.length === 0) {
      //console.log('Found ZERO differences when updating settings. Ignoring SSE event');
      return;
    }
    console.log('Found DIFFERENCES', differences, 'when updating settings so sendding SSE event');
    shellylist[devicekey] = newExtraction;
    sse.send(newExtraction, 'shellyUpdate');
  }
  try {
    device.getSettings?.().then((newSettings) => {
      try {
        processSettings(device, newSettings);
      } catch (err) { console.error('*********ERROR*********: ', err.message, ' while processSettings'); }
    });
  } catch (err) { console.error('*********ERROR*********: ', err.message, ' uncaught in pollSettings'); }
  return Math.round(Math.random() * (20000)) + 50000;
}
function pollSettingsTimer() {
  const nextPollInterval = pollSettings(this.device);
  setTimeout(pollSettingsTimer.bind({ device: this.device }), nextPollInterval);
}


shellies.on('discover', device => {
  // a new device has been discovered
  console.log('Discovered device with ID', device.id, 'and type', device.type);
  const devicekey = deviceKey(device.type, device.id);
  shellycoaplist[devicekey] = device;
  shellylist[devicekey] = shellyExtract(device);
  setTimeout(pollSettingsTimer.bind({ device: device }), Math.round(Math.random() * (2500)) + 500);
  setTimeout(pollStatusTimer.bind({ device: device }), Math.round(Math.random() * (2500)) + 500);

  device.on('change', (prop, newValue, oldValue) => {
    // a property on the device has changed
    const devicekey = deviceKey(device.type, device.id);
    var extractedData = shellylist[devicekey];
    try {
      extractedData.prop = prop;
      extractedData.oldValue = oldValue;
      extractedData.newValue = newValue;
      sse.send(extractedData, 'shellyUpdate');
      console.log('Shellies(change) Events:', devicekey, 'property:', prop, 'changed from:', oldValue, 'to:', newValue, 'sent to', sse.listenerCount('data'), 'listeners');
    } catch (err) { console.error('Error: ', err.message, ' while sending update'); }
  })

  device.on('offline', () => {
    const devicekey = deviceKey(device.type, device.id);
    console.log('Device with deviceKey', devicekey, 'went offline')
    const extractedData = shellylist[devicekey];
    try {
      sse.listenerCount('shellyRemove');
      sse.send(extractedData, 'shellyRemove');
    } catch (err) { console.log('Error: ', err.message, ' while sending remove'); }
    delete shellycoaplist[devicekey];
    delete shellylist[devicekey];
  })
})


// start discovering devices and listening for status updates
shellies.start();

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'pug');

app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
// Add handler for client to be able to request no compression. This is required for express-sse
app.use(compression({
  filter: function (req, res) {
    return (req.headers['x-no-compression']) ? false : compression.filter(req, res);
  }
}));
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
