/* eslint-disable no-unused-vars */
/* eslint-disable lodash/import-scope */
/* eslint-disable lodash/matches-prop-shorthand */
/* eslint-env node */
/* eslint no-unused-vars: ["error", { "args": "none" }]*/
/* eslint-disable lodash/prefer-lodash-method */

const _ = require('lodash');
const en = require('javascript-time-ago/locale/en');
const shellies = require('shellies')
const { CoIoTServer, } = require('coiot-coap');
const storage = require('node-persist');
const { result } = require('lodash');
const { Poller } = require('poll-retry');
const assert = require('assert');

const makeDeviceKey = (type, id) => `${type}-${id}`;
let sse;
// Listen to ALL messages in your network
const coIoTserver = new CoIoTServer();


/**
 * Deep diff between two object, using lodash
 * @param  {Object} object Object compared
 * @param  {Object} base   Object to compare with
 * @return {Object}        Return a new object who represent the diff
 */
function difference(object, base) {
  if (_.isEmpty(object)) return base;
  if (_.isEmpty(base)) return object;
  return _.transform(object, (result, value, key) => {
    if (!_.isEqual(value, base[key])) {
      result[key] = _.isObject(value) && _.isObject(base[key]) ? difference(value, base[key]) : value;
    }
  });
}
const TimeAgo = require('javascript-time-ago');
TimeAgo.addDefaultLocale(en);
const timeAgo = new TimeAgo('en-GB')
class Shelly {
  #coapDevice;
  #coapshelly;
  #connectPoll;
  #statusPoll;
  #settingsPoll;
  _coapsettings;
  _coapstatus;

  constructor(type, id, host) {
    this.deviceKey = makeDeviceKey(type, id);
    this.type = type;
    this.id = id;
    this.ip = host;
    if (!require('net').isIP(this.ip)) {
      console.error(`NULL HOST IP ADDRESS`);
    }
    this.lastSeen = new Date();
  }

  connectPollfn() {
    //console.log(`connectPoll ${this.deviceKey}`);
    this.#coapDevice.request.get(`http://${this.ip}/shelly`).then(res => {
      this.online = true;
      const coapshelly = res.body;
      const differences = difference(this.coapshelly, coapshelly);
      if (!_.isEmpty(differences)) {
        this.coapshelly = coapshelly;
      } else {
        //console.info(`No point to update coapshelly`);
      }
    }, err => {
      console.error(`*********ERROR*********: ${err.message} failed to retreive coapshelly REST call`);
    })
  }
  statusPollfn() {
    //console.log(`statusPoll ${this.deviceKey}`);
    this.coapDevice.getStatus().then(res => {
      this.locked = false;
      const coapstatus = res;
      const differences = difference(this.coapstatus, coapstatus);
      if (!_.isEmpty(differences)) {
        this.coapstatus = coapstatus;
      } else {
        console.error(`Got coapstatus for ${this.deviceKey} but ignored as they are the same`);
      }
    }, err => {
      if (err.message === 'Unauthorized') {
        console.error(`Got Unauthorized error trying to connect to ${this.id} in statusPollfn`);
        this.#statusPoll?.stop();
        this.#settingsPoll?.stop();
        this.locked = this.auth = true;
        return;
      }
      console.error(`*********ERROR*********: ${err.message} failed to retreive coapstatus REST call`);
    });
  }
  settingsPollfn() {
    //console.log(`settingsPoll ${this.deviceKey}`);
    this.coapDevice.getSettings().then(res => {
      const coapsettings = res;
      this.locked = false;
      const differences = difference(this.coapsettings, coapsettings);
      if (_.isEmpty(this.coapsettings) || !_.isEmpty(differences)) {
        this.coapsettings = coapsettings;
      } else {
        //console.error(`Got coapsettings for ${this.deviceKey} but ignored as they are the same`);
      }
    }, err => {
      if (err.message === 'Unauthorized') {
        console.error(`Got Unauthorized error trying to connect to ${this.id} in settingsPoll`);
        this.#statusPoll?.stop();
        this.#settingsPoll?.stop();
        this.locked = this.auth = true;
        return;
      }
      console.error(`*********ERROR*********: ${err.message} failed to retreive coapsettings REST call`);
    });
  }

  get coapDevice() {
    return this.#coapDevice;
  }
  set coapDevice(coapDevice) {
    if (this.#coapDevice === coapDevice) {
      console.error(`Tried to assgn coapDevice for ${this.deviceKey} that already exists`);
      return;
    }
    this.ip = coapDevice.host;
    if (!require('net').isIP(this.ip)) {
      console.error(`NULL HOST IP ADDRESS`);
    }
    this.online = false;
    this.auth = false;
    this.locked = true;
    if (_.isDate(coapDevice.lastSeen)) this.lastSeen = coapDevice.lastSeen;
    if (_.isDate(this.lastSeen)) this.lastSeenHuman = timeAgo.format(this.lastSeen);
    if (!_.isEmpty(coapDevice.modelName)) this.modelName = coapDevice.modelName;
    this.#connectPoll = new Poller({ pollFn: this.connectPollfn.bind(this), options: { initialDelay: Math.random() * 500 + 250, delay: 120000 } });
    this.#statusPoll = new Poller({ pollFn: this.statusPollfn.bind(this), options: { initialDelay: 500, delay: 30000 } });
    this.#settingsPoll = new Poller({ pollFn: this.settingsPollfn.bind(this), options: { initialDelay: 1000, delay: 30000 } });
    this.#coapDevice = coapDevice;
    this.#connectPoll.start();
    this.persist(storage);
    this.ssesend(sse, 'shellyUpdate');
  }
  get coapshelly() {
    return this.#coapshelly;
  }
  set coapshelly(coapshelly) {
    assert(_.isObject(coapshelly));
    if (this.#coapshelly === coapshelly) {
      console.error(`Tried to assign coapshelly for ${this.deviceKey} that already exists`);
      return;
    }
    this.#coapshelly = coapshelly;
    this.online = coapshelly.online;
    this.auth = coapshelly.auth;
    if ((this.auth === true) && (this.locked === true)) {
      if (_.isEmpty(this.shellyuser)) {
        console.warn(`There is no device (${this.deviceKey}) specific username found so using global user '${process.env.SHELLYUSER}'`);
        this.shellyuser = process.env.SHELLYUSER;
        this.shellypassword = process.env.SHELLYPW;
      } else {
        console.warn(`Found device specific username '${this.shellyuser}' so using that for device '${this.deviceKey}'`);
      }
      this.coapDevice.setAuthCredentials(this.shellyuser, this.shellypassword);
    }
    this.#statusPoll.start();
    this.#settingsPoll.start();
    this.persist(storage);
    this.ssesend(sse, 'shellyUpdate');
  }
  get coapstatus() {
    return this._coapstatus;
  }
  set coapstatus(coapstatus) {
    //console.info(`Setting coapstatus for ${this.deviceKey}`);
    this._coapstatus = coapstatus;
    if (_.isNumber(coapstatus?.wifi_sta?.rssi))
      this.rssi = coapstatus?.wifi_sta.rssi;
    if (_.isBoolean(coapstatus?.mqtt?.connected))
      this.mqtt_connected = coapstatus.mqtt.connected;
    this.persist(storage);
    this.ssesend(sse, 'shellyUpdate');
  }
  get coapsettings() {
    return this._coapsettings;
  }
  set coapsettings(coapsettings) {
    //console.info(`Setting coapsettings for ${this.deviceKey}`);
    this._coapsettings = coapsettings;
    if (!_.isEmpty(coapsettings.name))
      this.givenname = coapsettings.name;
    if (!_.isEmpty(coapsettings?.wifi_sta?.ssid))
      this.ssid = coapsettings.wifi_sta.ssid;
    if (_.isBoolean(coapsettings?.mqtt?.enable))
      this.mqtt_enable = coapsettings.mqtt.enable;
    this.persist(storage);
    this.ssesend(sse, 'shellyUpdate');
  }

  getSSEobj() {
    return _.omitBy(this, (value, key) => {
      if (_.startsWith(key, '_coap')) return true;
      return false;
    });
  }

  ssesend(sse, eventName) {
    sse.send(eventName, this.getSSEobj());
  }

  persist(storage) {
    storage.setItem(this.deviceKey, this);
  }

  revive(shelly) {
    for (const [key, value] of Object.entries(shelly)) {
      try {
        if (!_.isUndefined(value)) this[key] = value;
      } catch (err) { console.error(`Oject revival error: ${err.message} in for key ${key} and value ${value}`); }
    }
  }
}
['coapshelly', 'coapstatus', 'coapsettings'].forEach(prop => Object.defineProperty(Shelly.prototype, prop, { enumerable: true }));



const findShellyPropIndex = function (target, prop) {
  // eslint-disable-next-line no-prototype-builtins
  if (Reflect.getPrototypeOf(target).hasOwnProperty(prop)) return -1;
  if (!isNaN(prop)) {
    return Number(prop);
  } else if (_.isString(prop)) {
    return target.findIndex(shelly => shelly.deviceKey == prop);
  }
  return -1;
};
const ShellyListProxyHandler = {
  get: function (target, prop) {
    let foundIndex = findShellyPropIndex(target, prop);
    if (foundIndex >= 0) return target[foundIndex]
    return Reflect.get(...arguments)
  },
  set: function (target, prop, value) {
    let foundIndex = findShellyPropIndex(target, prop);
    if (foundIndex >= 0) {
      target[foundIndex] = value;
    } else {
      target.push(value);
    }
    return true;
  },
  deleteProperty(target, prop) {
    let foundIndex = findShellyPropIndex(target, prop);
    if (foundIndex >= 0) {
      target.splice(foundIndex, 1);
      return true;
    }
    return false;
  }
};
const ShellyListSSEProxyHandler = {
  get: function (target, prop) {
    let foundIndex = findShellyPropIndex(target, prop);
    if (foundIndex >= 0) return target[foundIndex].getSSEobj();
    return Reflect.get(...arguments);
  }
};

let _shellylist = new Array;
// Create a proxy for array of Shellys that has key lookup convenience
const shellylist = new Proxy(_shellylist, ShellyListProxyHandler);
// Set the initial data sse connections as abbreviated version of _shellylist
const shellyListSSE = new Proxy(_shellylist, ShellyListSSEProxyHandler);


coIoTserver.on('status', (status) => {
  try {
    const deviceKey = makeDeviceKey(status.deviceType, status.deviceId);
    let shelly = shellylist[deviceKey];
    if (_.isObject(shelly)) {
      // TODO: should check whether there is a coiot object in shelly
      return;
    }
    console.info(`CoIoT Discovered new device with ID ${status.deviceId} and type  ${status.deviceType}`);
    shelly = new Shelly(status.deviceType, status.deviceId, status.host);
    shellylist[deviceKey] = shelly;
    shelly.coapDevice = shellies.createDevice(status.deviceType, status.deviceId, status.host);
    shelly.persist(storage);
    shelly.ssesend(sse, 'shellyRemove');
  } catch (err) { console.error(`Error: ${err.message} in coIoTserver.on`); }
});


shellies.on('discover', device => {
  // a new device has been discovered
  try {
    const deviceKey = makeDeviceKey(device.type, device.id);
    let shelly = shellylist[deviceKey];
    if (_.isObject(shelly)) {
      //console.info(`Discovered existing device via CoaP with ID ${device.id} and type ${device.type}`);
      shelly.coapDevice = device;
    } else {
      console.log(`Discovered new device via CoaP with ID ${device.id} and type ${device.type}`);
      let shelly = new Shelly(device.type, device.id, device.host);
      shellylist[deviceKey] = shelly;
      shelly.coapDevice = device;
      shelly.persist(storage);
      shelly.ssesend(sse, 'shellyCreate');
    }
  } catch (err) { console.error(`Error: ${err.message} while processing discovered Shelly`); }

  device.on('change', (prop, newValue, oldValue) => {
    try {
      // a property on the device has changed
      const deviceKey = makeDeviceKey(device.type, device.id);
      if (_.isObject(shellylist[deviceKey])) {
        let shelly = shellylist[deviceKey];
        shellylist[deviceKey] = shelly;
        shelly.persist(storage);
        shelly.ssesend(sse, 'shellyUpdate');
      } else {
        console.log(`Discovered new device via CoaP with ID ${device.id} and type ${device.type}`);
        let shelly = new Shelly(device.type, device.id, device.host);
        shelly.coapDevice = device;
        shelly.persist(storage);
        shelly.ssesend(sse, 'shellyCreate');
      }
    } catch (err) { console.error(`Error: ${err.message} while handling change event`); }
  })

  device.on('offline', () => {
    try {
      const deviceKey = makeDeviceKey(device.type, device.id);
      console.log(`Device with deviceKey ${deviceKey} went offline`)
      try {
        let shelly = shellylist.get(deviceKey);
        shelly.online = false;
        shelly.persist(storage);
        shelly.ssesend(sse, 'shellyRemove');
      } catch (err) { console.error(`Error: ${err.message} while sending remove`); }
      if (_.isObject(shellylist[deviceKey])) {
        //delete shellylist[deviceKey]
      }
    } catch (err) { console.error(`Error: ${err.message} while handling offline event`); }
  })
})

async function start(app, SSE) {
  sse = SSE;
  try {
    await storage.init();
    let importlist = [];
    try {
      importlist = await storage.values();
    } catch (err) { console.error(`Error: ${err.message} while trying read persisted devices`); }
    importlist.forEach(importShelly => {
      try {
        let newShelly = new Shelly(importShelly.type, importShelly.id, importShelly.ip);
        newShelly.revive(importShelly);
        newShelly.online = false;
        newShelly.locked = true;
        newShelly.coapDevice = shellies.createDevice(importShelly.type, importShelly.id, importShelly.ip);
        shellylist[makeDeviceKey(importShelly.type, importShelly.id)] = newShelly;
      } catch (err) { console.error(`Error: ${err.message} while handling load persisted shelly`); }
    });

    sse.updateInit(shellyListSSE);
    // start coIoT Discovery
    coIoTserver.listen();
    // start CoAP Discovery
    shellies.start();
  } catch (err) { console.error(`Error: ${err.message} shelly-coap start`); }
  app.locals.shellylist = await shellylist;
  return;
}

module.exports = start;
