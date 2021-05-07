const _ = require('lodash');
const { CoIoTServer, } = require('coiot-coap');
const Shelly = require('./coapShellyDevice.js');
const NodePersist = require('node-persist');


const findShellyPropIndex = function (target, prop) {
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


class ShellyFinder {
  coIoTserver
  _shellylist
  shellylist
  shellyListSSE
  appStorage
  storage
  sse

  constructor(sse) {
    this.sse = sse;
    this.coIoTserver = new CoIoTServer();
    this._shellylist = new Array;
    // Create a proxy for array of Shellys that has key lookup convenience
    this.shellylist = new Proxy(this._shellylist, ShellyListProxyHandler);
    // Set the initial data sse connections as abbreviated version of _shellylist
    this.shellyListSSE = new Proxy(this._shellylist, ShellyListSSEProxyHandler);
    this.appStorage = NodePersist.create({ dir: process.cwd() + '/.node-persist/shellyList' });
    this.storage = NodePersist.create({ dir: process.cwd() + '/.node-persist/shellyDevices' })
  }

  get prefs() {
    return (async () => {
      try {
        const appPrefs = (await this.appStorage.getItem('prefs')) ?? {};
        if (_.isEmpty(appPrefs.shellyUser)) appPrefs.shellyUser = 'shelly';
        if (!_.isString(appPrefs.shellyPassword)) appPrefs.shellyPassword = '';
        if (!_.isBoolean(appPrefs.enableMQTT)) appPrefs.enableMQTT = false;
        if (!_.isString(appPrefs.MQTTURL)) appPrefs.MQTTURL = 'mqtt.homeassistant.local:1833';
        if (!_.isBoolean(appPrefs.MQTTauth)) appPrefs.MQTTauth = false;
        if (!_.isString(appPrefs.MQTTuser)) appPrefs.MQTTuser = '';
        if (!_.isString(appPrefs.MQTTpassword)) appPrefs.MQTTpassword = '';
        this.appStorage.setItem('prefs', appPrefs);
        return appPrefs;
      } catch (e) {
        return {};  // fallback value
      }
    })();
  }

  async start(app) {
    await this.appStorage.init();
    const prefs = await this.prefs;
    const deviceAuth = await this.appStorage.getItem('deviceAuth');

    await this.storage.init({ forgiveParseErrors: true });
    try {
      let importlist = [];
      try {
        importlist = await this.storage.values();
      } catch (err) {
        console.error(`Error: ${err.message} while trying reading storage values`);
      }
      await Promise.all(importlist.map(async (importShelly) => {
        try {
          let newShelly = await new Shelly(importShelly.type, importShelly.id, importShelly.ip, this.sse, this.storage).initialized;
          newShelly.revive(importShelly);
          newShelly.online = false;
          newShelly.connected = false;
          newShelly.locked = true;
          this.shellylist[newShelly.deviceKey] = newShelly;
          newShelly.start();
        } catch (err) { console.error(`Error: ${err.message} while trying read persisted device`); }
      }));
      console.info(`Loaded ${this.shellylist.length} Shellies from disk storage`);
      this.sse.updateInit(this.shellyListSSE);
      this.sse.send('shellysLoad', this.shellyListSSE);

      console.info(`Start coIoT Discovery`);
      this.coIoTserver.on('status', async (status) => {
        try {
          const deviceKey = `${status.deviceType}-${status.deviceId}`;
          if (_.isObject(this.shellylist[deviceKey])) {
            //console.error(`coIoTserver.on: Ignore device. It already exists!`)
            return;
          }
          console.info(`CoIoT Discovered new device with ID ${status.deviceId} and type  ${status.deviceType}`);
          const shelly = await new Shelly(status.deviceType, status.deviceId, status.location.host, this.sse, this.storage).initialized;
          shelly.start();
          this.shellylist[deviceKey] = shelly;
          shelly.persist();
          shelly.ssesend('shellyCreate');
        } catch (err) { console.error(`Error: ${err.message} in coIoTserver.on`); }
      });
      this.coIoTserver.listen();
    } catch (err) { console.error(`Error: ${err.message} shelly-coap start`); }
    app.locals.shellylist = this.shellylist;
    app.locals.shellyFinder = this;
    return this;
  }
}

module.exports = ShellyFinder;
