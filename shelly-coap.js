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

let shellycoaplist = {};
let shellylist = {};
let sse;
// Listen to ALL messages in your network
const coIoTserver = new CoIoTServer();

TimeAgo.addDefaultLocale(en);
const timeAgo = new TimeAgo('en-GB')

/**
 * Deep diff between two object, using lodash
 * @param  {Object} object Object compared
 * @param  {Object} base   Object to compare with
 * @return {Object}        Return a new object who represent the diff
 */
function difference(object, base) {
  return _.transform(object, (result, value, key) => {
    if (!_.isEqual(value, base[key])) {
      result[key] = _.isObject(value) && _.isObject(base[key]) ? difference(value, base[key]) : value;
    }
  });
}

function shellyExtractBasic(device) {
  let shellyObj = new Object;
  shellyObj.devicekey = deviceKey(device.type, device.id);
  shellyObj.id = device.id;
  shellyObj.type = device.type;
  shellyObj.ip = device.host;
  shellyObj.online = device.online ?? false;
  shellyObj.auth = device.shelly?.auth ?? false;
  shellyObj.locked = device.shelly?.locked ?? false;
  return shellyObj;
}
function shellyExtract(device) {
  let shellyObj = shellyExtractBasic(device);
  if (!_.isEmpty(device.settingsCache?.name))
    shellyObj.givenname = device.settingsCache.name;
  else if (!_.isEmpty(device.settings?.name))
    shellyObj.givenname = device.settings.name;

  if (_.isObject(device.statusCache?.update)) {
    shellyObj.fw = new Object;
    shellyObj.fw.current = device.statusCache.update.old_version;
    shellyObj.fw.new = device.statusCache.update.new_version;
    shellyObj.fw.hasupdate = device.statusCache.update.has_update;
  } else if (_.isObject(device.status?.update)) {
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

  if (_.isNumber(device.statusCache?.wifi_sta?.rssi))
    shellyObj.rssi = device.statusCache.wifi_sta.rssi;
  else if (_.isNumber(device.status?.wifi_sta?.rssi))
    shellyObj.rssi = device.status.wifi_sta.rssi;

  if (_.isBoolean(device.statusCache?.mqtt?.connected))
    shellyObj.mqtt_connected = device.statusCache?.mqtt.connected;
  else if (_.isBoolean(device.status?.mqtt?.connected))
    shellyObj.mqtt_connected = device.status?.mqtt.connected;

  if (!_.isEmpty(device.settingsCache?.wifi_sta?.ssid))
    shellyObj.ssid = device.settingsCache.wifi_sta.ssid;
  else if (!_.isEmpty(device.settings?.wifi_sta?.ssid))
    shellyObj.ssid = device.settings.wifi_sta.ssid;

  if (_.isBoolean(device.settingsCache?.mqtt?.enable))
    shellyObj.mqtt_enable = device.settingsCache.mqtt.enable;
  else if (_.isBoolean(device.settings?.mqtt?.enable))
    shellyObj.mqtt_enable = device.settings.mqtt.enable;

  if (_.isDate(device.lastSeen)) shellyObj.lastSeen = device.lastSeen;
  if (_.isDate(shellyObj.lastSeen)) shellyObj.lastSeenHuman = timeAgo.format(shellyObj.lastSeen);
  if (!_.isEmpty(device.modelName)) shellyObj.modelName = device.modelName;
  return shellyObj;
}

function ShellyAddManually(device) {
  const devicekey = deviceKey(device.type, device.id);
  if (_.isObject(shellycoaplist[devicekey])) {
    return;
  }
  console.info(`Manually adding device with ID ${device.id} and type ${device.type}`);
  device.online = true;
  device.lastSeen = new Date();
  device.devicekey = devicekey;
  shellycoaplist[devicekey] = device;
  shellylist[devicekey] = shellyExtractBasic(device);
  shellies.addDevice(device);
  checkShellyAuth(device);
  return device;
}

function ShellyCreateManually(type, id, host) {
  const devicekey = deviceKey(type, id);
  if (_.isObject(shellycoaplist[devicekey])) {
    return;
  }
  console.info(`Manually creating device with ID ${id} and type ${type}`);
  const device = shellies.createDevice(type, id, host);
  return ShellyAddManually(device);
}

function processStatus(device, status) {
  const devicekey = deviceKey(device.type, device.id);
  //console.log('Received new polled status for ', devicekey);
  const existingCoAPDevice = shellycoaplist[devicekey];
  if (_.isNil(existingCoAPDevice)) {
    ShellyAddManually(device);
  }
  shellycoaplist[devicekey].statusCache = status;
  let newExtraction = shellyExtract(device);
  const mergedDevice = _.merge({ ...shellylist[devicekey] }, newExtraction);
  const differences = difference(mergedDevice, shellylist[devicekey]);
  if (_.isEmpty(differences)) {
    //console.log('Found ZERO differences when updating status. Ignoring SSE event');
    return false;
  }
  //console.warn(`Found DIFFERENCES ${_.keys(differences).length} when updating status so sending SSE event`);
  shellylist[devicekey] = mergedDevice;
  sse.send(shellylist[devicekey], 'shellyUpdate');
  return true;
}
async function pollStatus(device) {
  let statusChanged = false;
  try {
    //console.info(`About to request status for ${device.id}`);
    let newStatus = await device.getStatus();
    statusChanged = processStatus(device, newStatus);
  } catch (err) { console.error(`*********ERROR*********: ${err.message} uncaught in pollStatus`); }
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
    ShellyAddManually(device);
  }
  shellycoaplist[devicekey].settingsCache = settings;
  let newExtraction = shellyExtract(device);
  const mergedDevice = _.merge({ ...shellylist[devicekey] }, newExtraction);
  const differences = difference(mergedDevice, shellylist[devicekey]);
  if (_.isEmpty(differences)) {
    //console.log('Found ZERO differences when updating settings. Ignoring SSE event');
    return false;
  }
  //console.warn(`Found DIFFERENCES ${_.keys(differences).length} when updating settings so sendding SSE event`);
  shellylist[devicekey] = mergedDevice;
  sse.send(newExtraction, 'shellyUpdate');
  return true;
}
async function pollSettings(device) {
  let settingsChanged = false;
  try {
    //console.info(`About to request settings for ${device.id}`);
    let newSettings = await device.getSettings();
    settingsChanged = processSettings(device, newSettings);
  } catch (err) { console.error(`*********ERROR*********: ${err.message} uncaught in pollSettings`); }
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
    } catch (err) { console.error(`Error: ${err.message} while forcing status update`); }
    try {
      const settingsResponse = await this.getSettings();
      processSettings(this, settingsResponse);
    } catch (err) { console.error(`Error: ${err.message} while forcing settings update`); }
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


coIoTserver.on('status', (status) => {
  if (_.isObject(shellycoaplist[deviceKey(status.deviceType, status.deviceId)])) {
    return;
  }
  console.info(`CoIoT Discovered new device with ID ${status.deviceId} and type  ${status.deviceType}`);
  ShellyCreateManually(status.deviceType, status.deviceId, status.location.host);
});


shellies.on('discover', device => {
  // a new device has been discovered
  try {
    console.log(`Discovered device with ID ${device.id} and type ${device.type}`);
    const devicekey = deviceKey(device.type, device.id);
    device.devicekey = devicekey;
    shellycoaplist[devicekey] = device;
    const extractedData = shellyExtract(device);
    shellylist[devicekey] = extractedData;
    sse.send(extractedData, 'shellyCreate');
    setTimeout(pollSetupTimer.bind({ device: device }), Math.round(Math.random() * (100)) + 25);
  } catch (err) { console.error(`Error: ${err.message} while processing discovered Shelly`); }

  device.on('change', (prop, newValue, oldValue) => {
    try {
      // a property on the device has changed
      const devicekey = deviceKey(device.type, device.id);
      try {
        let newExtraction = shellyExtract(device);
        shellylist[devicekey] = _.merge(shellylist[devicekey], newExtraction);
        sse.send(shellylist[devicekey], 'shellyUpdate');
      } catch (err) { console.error(`Error: ${err.message} while sending update`); }
    } catch (err) { console.error(`Error: ${err.message} while handling change event`); }
  })

  device.on('offline', () => {
    try {
      const devicekey = deviceKey(device.type, device.id);
      console.log(`Device with deviceKey ${devicekey} went offline`)
      try {
        sse.send(shellylist[devicekey], 'shellyRemove');
        sse.listenerCount('shellyRemove');
      } catch (err) { console.error(`Error: ${err.message} while sending remove`); }
      delete shellycoaplist[devicekey];
      delete shellylist[devicekey];
    } catch (err) { console.error(`Error: ${err.message} while handling offline event`); }
  })
})

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
