/* eslint-disable no-debugger */
/* eslint-disable no-unused-vars */
/* eslint-disable lodash/import-scope */
/* eslint-disable lodash/matches-prop-shorthand */
/* eslint-env node */
/* eslint no-unused-vars: ["error", { "args": "none" }]*/
/* eslint-disable lodash/prefer-lodash-method */

const _ = require('lodash');
const { CoIoTServer, } = require('coiot-coap');
const localdb = require('node-persist');
const when = require('when');
const assert = require('assert');
const network = require('net');
const Pollinator = require('pollinator');
const got = require("got");
let PQueue; (async () => { PQueue = (await import('p-queue')).default; })();

const makeDeviceKey = (type, id) => `${type}-${id}`;
let sse;
// Listen to ALL messages in your network
const coIoTserver = new CoIoTServer();
let shellyAdminStatus = {
  coiotDiscovered: 0,
  readFromDisk: 0,
  connectCalls: 0,
  statusCalls: 0,
  settingsCalls: 0
}

class QueuedStorage {
  constructor() {
    this.storage = localdb.create({ ttl: true, logging: false })
  }
  async init() {
    await this.storage.init();
  }
  async getItem(key) {
    this.current = when(this.current,
      () => { return this.storage.getItem(key) },
      () => { return this.storage.getItem(key) });
    return this.current;
  }
  async setItem(key, value) {
    this.current = when(this.current,
      () => { return this.storage.setItem(key, value) },
      () => { return this.storage.setItem(key, value) });
    return this.current;
  }
}
const storage = new QueuedStorage();

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
const { isObject } = require('lodash');
TimeAgo.addDefaultLocale(require('javascript-time-ago/locale/en'));
const timeAgo = new TimeAgo('en-GB')
class Shelly {
  #connectPoll
  #statusPoll
  #settingsPoll

  #coapshelly
  _coapsettings
  _coapstatus

  constructor(type, id, host) {
    this.deviceKey = makeDeviceKey(type, id);
    this.type = type;
    this.id = id;
    this.ip = host;
    if (!network.isIP(this.ip)) debugger;
    this.lastSeen = new Date();
    this.firmware = { curlong: '', curshort: '', status: 'idle', hasupgrade: false, newlong: '', newshort: '' };
    this.online = false;
    this.connected = false;
    this.persist(storage);
    this.ssesend(sse, 'shellyCreate');
    this.deviceAPIqueue = new PQueue({ concurrency: 1 });
  }

  async connectPollfn() {
    shellyAdminStatus.connectCalls++;
    if ((this.deviceKey === 'SHSW-PM-A4CF12F3F2D3') || (this.deviceKey === 'SHSW-PM-F30AA2') || (this.deviceKey === 'SHSW-1-E098068D0745'))
      console.log(`connectPoll ${this.deviceKey}`);
    try {
      const newShellyRec = await this.callShelly('shelly');
      const differences = difference(this.coapshelly, newShellyRec);
      if (!_.isEmpty(differences)) {
        this.coapshelly = newShellyRec;
      } else {
        console.info(`No point to update coapshelly`);
      }
    } catch (err) {
      if (err.message === 'Aborted') {
        console.warn(`connectPollfn error: Timeout trying to connect to device ${this.deviceKey}`);
        return;
      }
      console.error(`*********ERROR*********: ${err.message} failed to retreive coapshelly REST call for ${this.id}`);
    }
  }
  async statusPollfn() {
    shellyAdminStatus.statusCalls++;
    if (this.deviceKey === 'SHSW-PM-A4CF12F3F2D3')
      console.log(`statusPoll ${this.deviceKey}`);
    try {
      const newStatus = await this.callShelly('status');
      this.connected = true;
      const differences = difference(this.coapstatus, newStatus);
      if (!_.isEmpty(differences)) {
        this.coapstatus = newStatus;
      } else {
        console.info(`Got coapstatus for ${this.deviceKey} but ignored as they are the same`);
      }
    } catch (err) {
      if (err.message === 'Unauthorized') {
        console.warn(`statusPollfn error: Got Unauthorized trying to connect to ${this.id} so stopping further Status requests`);
        this.#statusPoll.stop();
        this.connected = false;
        this.locked = true;
        this.auth = true;
        this.persist(storage);
        this.ssesend(sse, 'shellyUpdate');
        return;
      }
      if (err.message === 'Aborted') {
        console.warn(`statusPollfn error: Timeout trying to connect to device ${this.deviceKey}`);
        return;
      }
      console.error(`*********ERROR*********: ${err.message} failed to retreive coapstatus for ${this.id}`);
    }
    return this.coapstatus;
  }
  async settingsPollfn() {
    shellyAdminStatus.settingsCalls++;
    if (this.deviceKey === 'SHSW-PM-A4CF12F3F2D3')
      console.log(`settingsPoll ${this.deviceKey}`);
    try {
      const newSettings = await this.callShelly('settings');
      this.connected = true;
      // We are not interested in the time data in settings so soft update them so we do not see as a difference
      if (_.isObject(this._coapsettings)) {
        this._coapsettings.time = newSettings.time;
        this._coapsettings.unixtime = newSettings.unixtime;
      }
      const differences = difference(this.coapsettings, newSettings);
      if (!_.isEmpty(differences)) {
        this.coapsettings = newSettings;
      }
    } catch (err) {
      if (err.message === 'Unauthorized') {
        console.error(`settingsPollfn error: Got Unauthorized trying to connect to ${this.id} so stopping further Status requests`);
        this.#settingsPoll.stop();
        this.connected = false;
        this.locked = true;
        this.auth = true;
        this.persist(storage);
        this.ssesend(sse, 'shellyUpdate');
        return;
      }
      if (err.message === 'Aborted') {
        console.warn(`settingsPollfn error: Timeout trying to connect to device ${this.deviceKey}`);
        return;
      }
      console.error(`*********ERROR*********: ${err.message} failed to retreive coapsettings for ${this.id}`);
    }
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
    if (!_.isEmpty(coapshelly.type)) this.modelName = coapshelly.type;
    this.firmware.curlong = coapshelly.fw;
    this.firmware.curshort = (/([^/]*\/)([^-]*)(-.*)/g.exec(coapshelly.fw + "/-"))[2];
    this.online = coapshelly.online;
    this.auth = coapshelly.auth;
    if (this.connected === false) {
      if (this.auth === true) {
        if (_.isEmpty(this.shellyuser)) {
          console.warn(`set coapshelly: There is no device (${this.deviceKey}) specific username found so using global user '${process.env.SHELLYUSER}/${process.env.SHELLYPW.slice(0, 2)}***'`);
          this.shellyuser = process.env.SHELLYUSER;
          this.shellypassword = process.env.SHELLYPW;
        } else {
          console.warn(`set coapshelly: Found device specific username '${this.shellyuser}/${this.shellypassword.slice(0, 2)}***' so using that for device '${this.deviceKey}'`);
        }
      }
      this.callShelly('status')
        .then(function () {
          this.connected = true;
          this.locked = false;
          this.#statusPoll.start();
          this.#settingsPoll.start();
          this.persist(storage);
          this.ssesend(sse, 'shellyUpdate');
        }.bind(this))
        .catch(function () {
          console.warn(`set coapshelly: Auth error while trying to connect to ${this.deviceKey}`);
        }.bind(this))
    }
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
      this.firmware.hasupgrade = coapstatus?.update.has_update;
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
    if (!_.isEmpty(coapsettings.device?.type)) this.modelName = coapsettings.device.type;
    this.persist(storage);
    this.ssesend(sse, 'shellyUpdate');
  }

  start() {
    if (!network.isIP(this.ip)) debugger;
    this.online = false;
    this.auth = false;
    this.locked = true;
    if (!_.isObject(this.#connectPoll)) {
      this.#connectPoll = new Pollinator(this.connectPollfn.bind(this), { delay: 20000 + ~~(Math.random * 759) });
    } else {
      this.#connectPoll.stop();
    }
    if (!_.isObject(this.#statusPoll)) {
      this.#statusPoll = new Pollinator(this.statusPollfn.bind(this), { delay: 30020 + ~~(Math.random * 1079) });
    } else {
      this.#statusPoll.stop();
    }
    if (!_.isObject(this.#settingsPoll)) {
      this.#settingsPoll = new Pollinator(this.settingsPollfn.bind(this), { delay: 50080 + ~~(Math.random * 2019) });
    } else {
      this.#settingsPoll.stop();
    }
    this.#connectPoll.start();
    this.persist(storage);
    this.ssesend(sse, 'shellyUpdate');
    return this;
  }
  stop() {
    this.online = false;
    this.#connectPoll.stop();
    this.#statusPoll.stop();
    this.#settingsPoll.stop();
    return this;
  }

  async callShelly(urlPath) {
    let requestOptions = { responseType: 'json', options: { responseType: 'json' } };
    if (this.auth) {
      requestOptions.options.username = this.shellyuser;
      requestOptions.options.password = this.shellypassword;
      requestOptions.options.auth = this.shellyuser + ':' + this.shellypassword;
      requestOptions.username = this.shellyuser;
      requestOptions.password = this.shellypassword;
      requestOptions.auth = this.shellyuser + ':' + this.shellypassword;
    }
    const { body } = await this.deviceAPIqueue.add(() => got(`http://${this.ip}/${urlPath}`, requestOptions));
    const result = JSON.parse(body);
    if (this.auth === true)
      console.info(`Got result of auth device ${this.deviceKey} to path '${urlPath}'`)
    return result;
  }

  setAuthCredentials(user, password) {
    console.info(`Set the credentials of device ${this.deviceKey} to ${user}/${password}`);
    if ((this.shellyuser !== user) || (this.shellypassword !== password)) {
      this.shellyuser = user;
      this.shellypassword = password;
      this.auth = !_.isEmpty(password);
      this.stop().start();
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

  async persist(useStore = storage) {
    try {
      await useStore.setItem(this.deviceKey, this)
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
    shelly.start();
    shellylist[deviceKey] = shelly;
    shellyAdminStatus.coiotDiscovered++;
    shelly.persist(storage);
    shelly.ssesend(sse, 'shellyCreate');
  } catch (err) { console.error(`Error: ${err.message} in coIoTserver.on`); }
});

async function start(app, SSE) {
  sse = SSE;
  try {
    let importlist = [];
    try {
      importlist = await storage.values();
    } catch (err) { console.error(`Error: ${err.message} while trying read persisted devices`); }
    importlist.forEach(importShelly => {
      try {
        if (!network.isIP(importShelly.ip)) debugger;
        let newShelly = new Shelly(importShelly.type, importShelly.id, importShelly.ip);
        newShelly.revive(importShelly);
        newShelly.online = false;
        shellylist[newShelly.deviceKey] = newShelly;
        newShelly.start();
        shellyAdminStatus.readFromDisk++;
        newShelly.ssesend(sse, 'shellyCreate');
      } catch (err) { console.error(`Error: ${err.message} while handling load persisted shelly`); }
    });
    console.info(`Loaded ${shellylist.length} Shellies from disk storage`);

    console.info(`Start coIoT Discovery`);
    coIoTserver.listen();
    let debugPoller = new Pollinator(function () { console.info(`shellyAdminStatus: ${JSON.stringify(shellyAdminStatus)}`) }, { delay: 20000 });
    sse.updateInit(shellyListSSE);
    debugPoller.start()

  } catch (err) { console.error(`Error: ${err.message} shelly-coap start`); }
  app.locals.shellylist = await shellylist;
  return;
}

module.exports = start;
