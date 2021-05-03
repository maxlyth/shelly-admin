/* eslint-disable no-debugger */
/* eslint-disable no-unused-vars */
/* eslint-disable lodash/import-scope */
/* eslint-disable lodash/matches-prop-shorthand */
/* eslint-env node */
/* eslint no-unused-vars: ["error", { "args": "none" }]*/
/* eslint-disable lodash/prefer-lodash-method */

const _ = require('lodash');
const shellies = require('shellies')
const { CoIoTServer, } = require('coiot-coap');
const storage = require('node-persist');
const assert = require('assert');
const network = require('net');
const Pollinator = require('pollinator');

const makeDeviceKey = (type, id) => `${type}-${id}`;
let sse;
// Listen to ALL messages in your network
const coIoTserver = new CoIoTServer();
let shellyAdminStatus = {
  coiotDiscovered: 0,
  coapDiscovered: 0,
  readFromDisk: 0,
  connectCalls: 0,
  statusCalls: 0,
  settingsCalls: 0
}

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
TimeAgo.addDefaultLocale(require('javascript-time-ago/locale/en'));
const timeAgo = new TimeAgo('en-GB')
class Shelly {
  #coapDevice
  #coapshelly
  #connectPoll
  #statusPoll
  #settingsPoll
  _coapsettings
  _coapstatus

  constructor(type, id, host) {
    this.deviceKey = makeDeviceKey(type, id);
    this.type = type;
    this.id = id;
    this.ip = host;
    if (!network.isIP(this.ip)) debugger;
    this.lastSeen = new Date();
    this.firmware = { curlong: '', curshort: '', status: 'idle', hasupdate: false, newlong: '', newshort: '' };
    this.persist(storage);
    this.ssesend(sse, 'shellyCreate');
  }

  connectPollfn() {
    //console.log(`connectPoll ${this.deviceKey}`);
    shellyAdminStatus.connectCalls++;
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
      console.error(`*********ERROR*********: ${err.message} failed to retreive coapshelly REST call for ${this.id}`);
    })
  }
  statusPollfn() {
    shellyAdminStatus.statusCalls++;
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
        console.error(`Got Unauthorized error trying to connect to ${this.id} so stopping further Status requests`);
        this.#statusPoll.stop();
        //delete this.shellyuser;
        //delete this.shellypassword;
        this.locked = true;
        this.auth = true;
        this.persist(storage);
        this.ssesend(sse, 'shellyUpdate');
        return;
      }
      console.error(`*********ERROR*********: ${err.message} failed to retreive coapstatus for ${this.id}`);
    });
  }
  settingsPollfn() {
    shellyAdminStatus.settingsCalls++;
    //console.log(`settingsPoll ${this.deviceKey}`);
    this.coapDevice.getSettings().then(res => {
      this.locked = false;
      const coapsettings = res;
      const differences = difference(this.coapsettings, coapsettings);
      if (_.isEmpty(this.coapsettings) || !_.isEmpty(differences)) {
        this.coapsettings = coapsettings;
      } else {
        //console.error(`Got coapsettings for ${this.deviceKey} but ignored as they are the same`);
      }
    }, err => {
      if (err.message === 'Unauthorized') {
        console.error(`Got Unauthorized error trying to connect to ${this.id} so stopping further Settings requests`);
        this.#settingsPoll.stop();
        //delete this.shellyuser;
        //delete this.shellypassword;
        this.locked = true;
        this.auth = true;
        this.persist(storage);
        this.ssesend(sse, 'shellyUpdate');
        return;
      }
      console.error(`*********ERROR*********: ${err.message} failed to retreive coapsettings for ${this.id}`);
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
    if (!network.isIP(this.ip)) debugger;
    this.online = false;
    this.auth = false;
    this.locked = true;
    if (_.isDate(coapDevice.lastSeen)) this.lastSeen = coapDevice.lastSeen;
    if (_.isDate(this.lastSeen)) this.lastSeenHuman = timeAgo.format(this.lastSeen);
    if (!_.isEmpty(coapDevice.modelName)) this.modelName = coapDevice.modelName;
    this.#connectPoll = new Pollinator(this.connectPollfn.bind(this), { delay: 120000 });
    this.#statusPoll = new Pollinator(this.statusPollfn.bind(this), { delay: 30000 });
    this.#settingsPoll = new Pollinator(this.settingsPollfn.bind(this), { delay: 30000 });
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
    assert(_.isObject(this.#coapDevice));
    if (this.#coapshelly === coapshelly) {
      console.error(`Tried to assign coapshelly for ${this.deviceKey} that already exists`);
      return;
    }
    this.#coapshelly = coapshelly;
    this.firmware.curlong = coapshelly.fw;
    this.firmware.curshort = (/([^/]*\/)([^-]*)(-.*)/g.exec(coapshelly.fw + "/-"))[2];
    this.online = coapshelly.online;
    this.auth = coapshelly.auth;
    if ((this.auth === true) && (this.locked === true)) {
      if (_.isEmpty(this.shellyuser)) {
        console.warn(`There is no device (${this.deviceKey}) specific username found so using global user '${process.env.SHELLYUSER}/${process.env.SHELLYPW.slice(0, 2)}***'`);
        this.shellyuser = process.env.SHELLYUSER;
        this.shellypassword = process.env.SHELLYPW;
      } else {
        console.warn(`Found device specific username '${this.shellyuser}/${this.shellypassword.slice(0, 2)}***' so using that for device '${this.deviceKey}'`);
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
    if (_.isBoolean(coapstatus?.update?.has_update))
      this.firmware.hasupdate = coapstatus?.update.has_update;
    if (!_.isEmpty(coapstatus.update?.new_version)) {
      this.firmware.newlong = coapstatus.update.new_version;
      this.firmware.newshort = (/([^/]*\/)([^-]*)(-.*)/g.exec(this.firmware.newlong + "/-"))[2];
    }
    if (!_.isEmpty(coapstatus.update?.status))
      this.firmware.status = coapstatus.update.status;

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
    if (!_.isEmpty(coapsettings?.fw)) {
      this.firmware.curlong = coapsettings.fw;
      this.firmware.curshort = (/([^/]*\/)([^-]*)(-.*)/g.exec(this.firmware.curlong + "/-"))[2];
    }
    this.persist(storage);
    this.ssesend(sse, 'shellyUpdate');
  }

  setAuthCredentials(user, password) {
    console.info(`Set the credentials of device ${this.deviceKey} to ${user}/${password}`);
    if ((this.shellyuser !== user) || (this.shellypassword !== password)) {
      this.shellyuser = user;
      this.shellypassword = password;
      this.auth = !_.isEmpty(password);
      //this.coapDevice.setAuthCredentials(this.shellyuser, this.shellypassword);
      this.connectPollfn();
      //this.persist(storage);
      //this.#statusPoll.start();
      //this.#settingsPoll.start();
      //this.ssesend(sse, 'shellyUpdate');
    }
  }


  getSSEobj() {
    let result = _.omitBy(this, (value, key) => {
      if (_.startsWith(key, '_coap')) return true;
      return false;
    });
    if (result.auth && result.locked) {
      result.givenname = 'Unavailable (locked)';
      result.ssid = 'n/a';
    }
    delete result.lastSeen;
    return result;
  }

  ssesend(sseSender = sse, eventName = 'shellyUpdate') {
    sseSender.send(eventName, this.getSSEobj());
  }

  persist(useStore = storage) {
    try {
      useStore.setItem(this.deviceKey, this);
    } catch (err) { console.error(`Object persistance error: ${err.message} in for device ${this.deviceKey}`); }
  }

  revive(shelly) {
    for (const [key, value] of Object.entries(shelly)) {
      try {
        if (!_.isUndefined(value)) this[key] = value;
      } catch (err) { console.error(`Object revival error: ${err.message} in for key ${key} and value ${value}`); }
    }
  }
}
['coapshelly', 'coapstatus', 'coapsettings'].forEach(prop => Object.defineProperty(Shelly.prototype, prop, { enumerable: true }));



const findShellyPropIndex = function (target, prop) {
  // eslint-disable-next-line no-prototype-builtins
  if (Reflect.getPrototypeOf(target).hasOwnProperty(prop)) return -2;
  if (!isNaN(prop)) {
    return Number(prop);
  } else if (_.isString(prop)) {
    return target.findIndex(shelly => shelly.deviceKey === prop);
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
      return true;
    }
    if (foundIndex === -1) {
      target.push(value);
      return true;
    }
    return Reflect.set(...arguments);
  },
  deleteProperty(target, prop) {
    let foundIndex = findShellyPropIndex(target, prop);
    if (foundIndex >= 0) {
      target.splice(foundIndex, 1);
      return true;
    }
    return Reflect.deleteProperty(...arguments);
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
    if (!network.isIP(status.host)) status.host = status.location?.host;
    if (!network.isIP(status.host)) debugger;
    shelly = new Shelly(status.deviceType, status.deviceId, status.host);
    shelly.online = true;
    shelly.locked = true;
    shelly.coapDevice = shellies.createDevice(status.deviceType, status.deviceId, status.host);
    shellylist[deviceKey] = shelly;
    shellyAdminStatus.coiotDiscovered++;
    shelly.persist(storage);
    shelly.ssesend(sse, 'shellyCreate');
  } catch (err) { console.error(`Error: ${err.message} in coIoTserver.on`); }
});


shellies.on('stale', device => {
  console.info(`Got global stale event with ID ${device.id} and type ${device.type}`);
})
shellies.on('offline', device => {
  console.info(`Got global offline event with ID ${device.id} and type ${device.type}`);
})
shellies.on('online', device => {
  console.info(`Got global online event with ID ${device.id} and type ${device.type}`);
})
//shellies.on('add', device => {
// This event is emitted after a call to addDevice()
//  console.info(`Got global add event with ID ${device.id} and type ${device.type}`);
//})
shellies.on('remove', device => {
  console.info(`Got global remove event with ID ${device.id} and type ${device.type}`);
  try {
    const deviceKey = makeDeviceKey(device.type, device.id);
    let shelly = shellylist[deviceKey];
    console.log(`Device with deviceKey ${deviceKey} went offline`)
    storage.removeItem(deviceKey);
    shelly.ssesend(sse, 'shellyRemove');
    delete shellylist[deviceKey];
  } catch (err) { console.error(`Error: ${err.message} while handling offline event`); }
})

shellies.on('discover', device => {
  // a new device has been discovered
  const deviceKey = makeDeviceKey(device.type, device.id);
  let shelly = shellylist[deviceKey];
  try {
    if (_.isObject(shelly)) {
      //console.info(`Discovered existing device via CoaP with ID ${device.id} and type ${device.type}`);
    } else {
      console.log(`Discovered new device via CoaP with ID ${device.id} and type ${device.type}`);
      if (!network.isIP(device.host)) debugger;
      shelly = new Shelly(device.type, device.id, device.host);
      shelly.coapDevice = device;
      shellylist[deviceKey] = shelly;
      shellyAdminStatus.coapDiscovered++;
      shelly.persist(storage);
      shelly.ssesend(sse, 'shellyCreate');
    }
  } catch (err) { console.error(`Error: ${err.message} while processing discovered Shelly`); }
  device.on('online', () => {
    console.info(`Got device online event`);
  })
  device.on('offline', () => {
    console.info(`Got device offline event`);
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
        if (!network.isIP(importShelly.ip)) debugger;
        let newShelly = new Shelly(importShelly.type, importShelly.id, importShelly.ip);
        newShelly.online = false;
        newShelly.locked = true;
        newShelly.coapDevice = shellies.createDevice(importShelly.type, importShelly.id, importShelly.ip);
        newShelly.revive(importShelly);
        newShelly.online = false;
        newShelly.locked = true;
        shellylist[newShelly.deviceKey] = newShelly;
        shellyAdminStatus.readFromDisk++;
        newShelly.ssesend(sse, 'shellyCreate');
      } catch (err) { console.error(`Error: ${err.message} while handling load persisted shelly`); }
    });
    console.info(`Loaded ${shellylist.length} Shellies from disk storage`);

    console.info(`Start coIoT Discovery`);
    coIoTserver.listen();
    console.info(`Start CoAP Discovery`);
    shellies.start();
    let debugPoller = new Pollinator(function () { console.info(`shellyAdminStatus: ${JSON.stringify(shellyAdminStatus)}`) }, { delay: 20000 });
    sse.updateInit(shellyListSSE);
    debugPoller.start()

  } catch (err) { console.error(`Error: ${err.message} shelly-coap start`); }
  app.locals.shellylist = await shellylist;
  return;
}

module.exports = start;
