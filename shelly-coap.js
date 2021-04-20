/* eslint-disable lodash/import-scope */
/* eslint-disable lodash/matches-prop-shorthand */
/* eslint-env node */
/* eslint no-unused-vars: ["error", { "args": "none" }]*/
/* eslint-disable lodash/prefer-lodash-method */

const _ = require('lodash');
const TimeAgo = require('javascript-time-ago');
const en = require('javascript-time-ago/locale/en');
const shellies = require('shellies')
const { CoIoTServer, } = require('coiot-coap');
const deviceKey = (type, id) => `${type}-${id}`;

var shellycoaplist = {};
var shellylist = {};
let sse;
// Listen to ALL messages in your network
const coIoTserver = new CoIoTServer();

TimeAgo.addDefaultLocale(en);
const timeAgo = new TimeAgo('en-GB')

function shellyExtractBasic(device) {
  let shellyObj = new Object;
  shellyObj.devicekey = deviceKey(device.type, device.id);
  shellyObj.id = device.id;
  shellyObj.type = device.type;
  shellyObj.ip = device.host;
  shellyObj.auth = device.shelly?.auth ?? false;
  shellyObj.locked = device.shelly?.locked ?? false;
  return shellyObj;
}
function shellyExtract(device) {
  let shellyObj = shellyExtractBasic(device);
  if (device.settings?.name) shellyObj.givenname = device.settings?.name
  if (_.isObject(device.status?.update)) {
    shellyObj.fw = new Object;
    shellyObj.fw.current = device.status.update.old_version;
    shellyObj.fw.new = device.status.update.new_version;
    shellyObj.fw.hasupdate = device.status.update.has_update;
  } else if (_.isObject(device.fw)) {
    shellyObj.fw = device.fw;
  } else if (_.isObject(device.shelly)) {
    shellyObj.fw = new Object;
    shellyObj.fw.current = device.shelly.fw;
  }
  if (_.isDate(device.lastSeen)) shellyObj.lastSeen = device.lastSeen;
  if (_.isDate(shellyObj.lastSeen)) shellyObj.lastSeenHuman = timeAgo.format(shellyObj.lastSeen);
  if (device.modelName) shellyObj.modelName = device.modelName;
  return shellyObj;
}

function processStatus(device, status) {
  const devicekey = deviceKey(device.type, device.id);
  //console.log('Received new polled status for ', devicekey);
  const existingCoAPDevice = shellycoaplist[devicekey];
  if (_.isNil(existingCoAPDevice)) {
    console.error('SHOULD NOT BE HERE! Device ', devicekey, ' did not exist in CoAP list when updating status');
    return false;
  }
  const existingDevice = shellylist[devicekey];
  if (_.isNil(existingDevice)) {
    console.error('SHOULD NOT BE HERE! Device ', devicekey, ' did not exist in shellylist when updating status');
    return false;
  }
  shellycoaplist[devicekey].statusCache = status;
  let newExtraction = shellyExtract(device);
  let newStatus = status;
  newExtraction.mqtt_connected = newStatus.mqtt.connected;
  newExtraction.rssi = newStatus.wifi_sta.rssi;
  newExtraction.fw['hasupdate'] = newStatus.update.has_update;
  newExtraction.fw['new'] = newStatus.update.new_version;
  shellylist[devicekey] = _.merge(shellylist[devicekey], newExtraction);
  const differences = _.difference(shellylist[devicekey], newExtraction);
  if (differences.length === 0) {
    //console.log('Found ZERO differences when updating status. Ignoring SSE event');
    return false;
  }
  console.warn('Found DIFFERENCES', differences, 'when updating status so sending SSE event');
  sse.send(shellylist[devicekey], 'shellyUpdate');
  return true;
}
async function pollStatus(device) {
  let statusChanged = false;
  try {
    //console.info(`About to request status for ${device.id}`);
    let newStatus = await device.getStatus();
    statusChanged = processStatus(device, newStatus);
  } catch (err) { console.error('*********ERROR*********: ', err.message, ' uncaught in pollStatus'); }
  let interval = Math.round(Math.random() * (10000)) + 25000;
  if (!statusChanged) interval = interval * 2;
  return interval;
}
async function pollStatusTimer() {
  const nextPollInterval = await pollStatus(this.device);
  setTimeout(pollStatusTimer.bind({ device: this.device }), nextPollInterval);
}

function processSettings(device, settings) {
  const devicekey = deviceKey(device.type, device.id);
  //console.log('Received new polled settings for ', devicekey);
  const existingCoAPDevice = shellycoaplist[devicekey];
  if (_.isNil(existingCoAPDevice)) {
    console.error('SHOULD NOT BE HERE! Device ', devicekey, ' did not exist in CoAP list when updating settings');
    return false;
  }
  const existingDevice = shellylist[devicekey];
  if (_.isNil(existingDevice)) {
    console.error('SHOULD NOT BE HERE! Device ', devicekey, ' did not exist in shellylist when updating settings');
    return false;
  }
  shellycoaplist[devicekey].settingsCache = settings;
  let newExtraction = shellyExtract(device);
  let newSettings = settings;
  newExtraction.fw['current'] = newSettings.fw;
  newExtraction.givenname = newSettings.name;
  newExtraction.ssid = newSettings.wifi_sta.ssid;
  newExtraction.mqtt_enable = newSettings.mqtt.enable;
  newExtraction = _.merge(existingDevice, newExtraction);
  const differences = _.difference(shellylist[devicekey], newExtraction);
  if (differences.length === 0) {
    //console.log('Found ZERO differences when updating settings. Ignoring SSE event');
    return false;
  }
  console.warn('Found DIFFERENCES', differences, 'when updating settings so sendding SSE event');
  shellylist[devicekey] = newExtraction;
  sse.send(newExtraction, 'shellyUpdate');
  return true;
}
async function pollSettings(device) {
  let settingsChanged = false;
  try {
    //console.info(`About to request settings for ${device.id}`);
    let newSettings = await device.getSettings();
    settingsChanged = processSettings(device, newSettings);
  } catch (err) { console.error('*********ERROR*********: ', err.message, ' uncaught in pollSettings'); }
  let interval = Math.round(Math.random() * (10000)) + 25000;
  if (!settingsChanged) interval = interval * 2;
  return interval;
}
async function pollSettingsTimer() {
  const nextPollInterval = await pollSettings(this.device);
  setTimeout(pollSettingsTimer.bind({ device: this.device }), nextPollInterval);
}


async function checkShellyAuth(device) {
  const devicekey = deviceKey(device.type, device.id);
  if (device.coiot) {
    console.info(`This is a coIoT generated record`);
  }
  if (device.shelly === undefined) {
    //console.info(`We must request general data to see if auth is required before proceeding`);
    const res = await device.request.get(`${device.host}/shelly`)
    let shellyObj = res.body;
    device.shelly = shellyObj;
  }
  if (device.shelly?.auth == true) {
    console.warn(`Device ${device.id} is password protected`);
    device.setAuthCredentials(process.env.SHELLYUSER, process.env.SHELLYPW);
    try {
      await device.request.get(`${device.host}/status`)
      console.info(`Password for user '${process.env.SHELLYUSER}' on device ${device.id} was correct`);
      device.shelly.locked = false;
    } catch (err) {
      console.error(`*********ERROR*********: ${err.message} Provided password for user '${process.env.SHELLYUSER}' on device ${device.id} was incorrect`);
      device.shelly.locked = true;
      device.name = "Incorrect password provided";
      const extractedData = shellyExtractBasic(device);
      shellylist[devicekey] = extractedData;
      sse.send(extractedData, 'shellyCreate');
      return false;
    }
  }
  device.forceUpdate = async function () {
    try {
      const statusResponse = await this.getStatus();
      processStatus(this, statusResponse);
    } catch (err) { console.error('Error: ', err.message, ' while forcing status update'); }
    try {
      const settingsResponse = await this.getSettings();
      processSettings(this, settingsResponse);
    } catch (err) { console.error('Error: ', err.message, ' while forcing settings update'); }
    return this;
  }
  const extractedData = shellyExtractBasic(device);
  shellylist[devicekey] = extractedData;
  sse.send(extractedData, 'shellyCreate');
  setTimeout(pollSettingsTimer.bind({ device: device }), Math.round(Math.random() * (2500)) + 500);
  setTimeout(pollStatusTimer.bind({ device: device }), Math.round(Math.random() * (2500)) + 500);
  return true;
}

async function pollSetupTimer() {
  if (await checkShellyAuth(this.device) == false) {
    console.warn(`Could not connect to Shelly ${this.device.id} so set a timer to try again soon.`);
    setTimeout(pollSetupTimer.bind({ device: this.device }), 60000);
  }
}


shellies.on('discover', device => {
  // a new device has been discovered
  try {
    console.log('Discovered device with ID', device.id, 'and type', device.type);
    const devicekey = deviceKey(device.type, device.id);
    device.devicekey = devicekey;
    shellycoaplist[devicekey] = device;
    const extractedData = shellyExtract(device);
    shellylist[devicekey] = extractedData;
    sse.send(extractedData, 'shellyCreate');
    setTimeout(pollSetupTimer.bind({ device: device }), Math.round(Math.random() * (100)) + 25);
  } catch (err) { console.error('Error: ', err.message, ' while processing discovered Shelly'); }

  device.on('change', (prop, newValue, oldValue) => {
    try {
      // a property on the device has changed
      const devicekey = deviceKey(device.type, device.id);
      try {
        let newExtraction = shellyExtract(device);
        shellylist[devicekey] = _.merge(shellylist[devicekey], newExtraction);
        sse.send(shellylist[devicekey], 'shellyUpdate');
      } catch (err) { console.error('Error: ', err.message, ' while sending update'); }
    } catch (err) { console.error('Error: ', err.message, ' while handling change event'); }
  })

  device.on('offline', () => {
    try {
      const devicekey = deviceKey(device.type, device.id);
      console.log(`Device with deviceKey ${devicekey} went offline`)
      try {
        sse.send(shellylist[devicekey], 'shellyRemove');
        sse.listenerCount('shellyRemove');
      } catch (err) { console.error('Error: ', err.message, ' while sending remove'); }
      delete shellycoaplist[devicekey];
      delete shellylist[devicekey];
    } catch (err) { console.error('Error: ', err.message, ' while handling offline event'); }
  })
})

coIoTserver.on('status', (status) => {
  const devicekey = deviceKey(status.deviceType, status.deviceId);
  if (_.isObject(shellycoaplist[devicekey])) {
    //console.info('CoIoT already exists device with ID', status.deviceId, 'and type', status.deviceType);
    return;
  }
  console.info('CoIoT Discovered device with ID', status.deviceId, 'and type', status.deviceType);
  const device = shellies.createDevice(status.deviceType, status.deviceId, status.location.host);
  device.coiotDiscovered = true;
  device.online = true;
  device.lastSeen = new Date();
  device.devicekey = devicekey;
  shellycoaplist[devicekey] = device;
  shellies.addDevice(device);
  checkShellyAuth(device);
  console.log(status);
});

function start(SSE) {
  sse = SSE;

  // Set the initial data for sse to ShellyList
  sse.updateInit(shellylist);
  // start coIoT Discovery
  coIoTserver.listen();
  // start CoAP Discovery
  shellies.start();
  return [shellylist, shellycoaplist];
}


module.exports = start;
