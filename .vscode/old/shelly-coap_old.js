/* eslint-disable lodash/import-scope */
/* eslint-disable lodash/matches-prop-shorthand */
/* eslint-env node */
/* eslint no-unused-vars: ["error", { "args": "none" }]*/
/* eslint-disable lodash/prefer-lodash-method */

const _ = require('lodash');
const TimeAgo = require('javascript-time-ago');
const en = require('javascript-time-ago/locale/en');
const shellies = require('shellies')
const deviceKey = (type, id) => `${type}#${id}`;

class shelly_coap {
  constructor() {
    this.shellycoaplist = {};
    this.shellylist = {};
    TimeAgo.addDefaultLocale(en);
    this.timeAgo = new TimeAgo('en-GB')
    this.shellies = shellies;
  }

  start(SSE) {
    this.sse = SSE;
    // start discovering devices and listening for status updates
    shellies.start();
  }

  shellyExtract(device) {
    return {
      devicekey: deviceKey(device.type, device.id),
      id: device.id,
      type: device.type,
      devicename: device.name,
      ip: device.host,
      online: device.online,
      lastSeen: device.lastSeen,
      lastSeenHuman: this.timeAgo.format(Date.parse(device.lastSeen)),
      modelName: device.modelName
    }
  }


  processStatus(device, newStatus) {
    const devicekey = deviceKey(device.type, device.id);
    //console.log('Received new polled status for ', devicekey);
    const existingCoAPDevice = this.shellycoaplist[devicekey];
    if (_.isNil(existingCoAPDevice)) {
      console.error('SHOULD NOT BE HERE! Device ', devicekey, ' did not exist in CoAP list when updating status');
      return;
    }
    const existingDevice = this.shellylist[devicekey];
    if (_.isNil(existingDevice)) {
      console.error('SHOULD NOT BE HERE! Device ', devicekey, ' did not exist in shellylist when updating status');
      return;
    }
    let newExtraction = this.shellyExtract(device);
    newExtraction.status = newStatus;
    newExtraction.mqtt_connected = newStatus.mqtt.connected;
    newExtraction.rssi = newStatus.wifi_sta.rssi;
    newExtraction = _.merge(existingDevice, newExtraction);
    const differences = _.difference(this.shellylist[devicekey], newExtraction);
    if (differences.length === 0) {
      //console.log('Found ZERO differences when updating status. Ignoring SSE event');
      return;
    }
    console.log('Found DIFFERENCES', differences, 'when updating status so sending SSE event');
    this.shellylist[devicekey] = newExtraction;
    this.sse.send(newExtraction, 'shellyUpdate');
  }

  pollStatusTimer(device) {
    const pollStatus = (device) => {
      try {
        device.getStatus?.().then((newStatus) => {
          try {
            this.processStatus(device, newStatus);
          } catch (err) { console.error('*********ERROR*********: ', err.message, ' while processStatus'); }
        });
      } catch (err) { console.error('*********ERROR*********: ', err.message, ' uncaught in pollStatus'); }
      return Math.round(Math.random() * (20000)) + 50000;
    }
    const nextPollInterval = pollStatus(device);
    setTimeout(this.pollStatusTimer(device), nextPollInterval);
  }


  processSettings(device, newSettings) {
    const devicekey = deviceKey(device.type, device.id);
    //console.log('Received new polled settings for ', devicekey);
    const existingCoAPDevice = this.shellycoaplist[devicekey];
    if (_.isNil(existingCoAPDevice)) {
      console.error('SHOULD NOT BE HERE! Device ', devicekey, ' did not exist in CoAP list when updating settings');
      return;
    }
    //  var existingDevice = _.find(shellylist, function (o) { return o.devicekey === devicekey; });
    const existingDevice = this.shellylist[devicekey];
    if (_.isNil(existingDevice)) {
      console.error('SHOULD NOT BE HERE! Device ', devicekey, ' did not exist in shellylist when updating settings');
      return;
    }
    let newExtraction = this.shellyExtract(device);
    newExtraction.settings = newSettings;
    newExtraction.fw = newSettings.fw;
    newExtraction.givenname = newSettings.name;
    newExtraction.ssid = newSettings.wifi_sta.ssid;
    newExtraction.mqtt_enable = newSettings.mqtt.enable;
    newExtraction = _.merge(existingDevice, newExtraction);
    const differences = _.difference(this.shellylist[devicekey], newExtraction);
    if (differences.length === 0) {
      //console.log('Found ZERO differences when updating settings. Ignoring SSE event');
      return;
    }
    console.log('Found DIFFERENCES', differences, 'when updating settings so sendding SSE event');
    this.shellylist[devicekey] = newExtraction;
    this.sse.send(newExtraction, 'shellyUpdate');
  }
  pollSettingsTimer(device) {
    const pollSettings = (device) => {
      try {
        device.getSettings?.().then((newSettings) => {
          try {
            this.processSettings(device, newSettings);
          } catch (err) { console.error('*********ERROR*********: ', err.message, ' while processSettings'); }
        });
      } catch (err) { console.error('*********ERROR*********: ', err.message, ' uncaught in pollSettings'); }
      return Math.round(Math.random() * (20000)) + 50000;
    }
    const nextPollInterval = pollSettings(device);
    setTimeout(this.pollSettingsTimer(device), nextPollInterval);
  }
}

const shellycoap = new shelly_coap();

shellies.on('discover', device => {
  // a new device has been discovered
  console.log('Discovered device with ID', device.id, 'and type', device.type);
  const devicekey = deviceKey(device.type, device.id);
  shellycoap.shellycoaplist[devicekey] = device;
  shellycoap.shellylist[devicekey] = shellycoap.shellyExtract(device);
  shellycoap.pollSettingsTimer(device);
  //setTimeout(shellycoap.pollSettingsTimer(device), Math.round(Math.random() * (2500)) + 500);
  //setTimeout(shellycoap.pollStatusTimer(device), Math.round(Math.random() * (2500)) + 500);

  device.on('change', (prop, newValue, oldValue) => {
    // a property on the device has changed
    const devicekey = deviceKey(device.type, device.id);
    var extractedData = shellycoap.shellylist[devicekey];
    try {
      extractedData.prop = prop;
      extractedData.oldValue = oldValue;
      extractedData.newValue = newValue;
      shellycoap.sse.send(extractedData, 'shellyUpdate');
      console.log('Shellies(change) Events:', devicekey, 'property:', prop, 'changed from:', oldValue, 'to:', newValue, 'sent to', shellycoap.sse.listenerCount('data'), 'listeners');
    } catch (err) { console.error('Error: ', err.message, ' while sending update'); }
  })

  device.on('offline', () => {
    const devicekey = deviceKey(device.type, device.id);
    console.log('Device with deviceKey', devicekey, 'went offline')
    const extractedData = shellycoap.shellylist[devicekey];
    try {
      shellycoap.sse.send(extractedData, 'shellyRemove');
    } catch (err) { console.log('Error: ', err.message, ' while sending remove'); }
    delete shellycoap.shellycoaplist[devicekey];
    delete shellycoap.shellylist[devicekey];
  })
})

module.exports = shellycoap;
