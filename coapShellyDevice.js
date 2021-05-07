const _ = require('lodash');
const assert = require('assert');
const network = require('net');
const Pollinator = require('pollinator');
const got = require("got");

const makeDeviceKey = (type, id) => `${type}-${id}`;


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
  #coapshelly = {};
  _coapsettings = {};
  _coapstatus = {};
  #sse
  #lastSentSSE = {};
  #lastSSEEventType = '';
  #deviceAPIqueuePromise;
  #deviceAPIqueue = null;
  #storage
  #storageQueuePromise
  #storageQueue = null;
  #connectPoll
  #statusPoll
  #settingsPoll

  constructor(type, id, host, sse, storage) {
    this.deviceKey = makeDeviceKey(type, id);
    this.type = type;
    this.id = id;
    this.ip = host;
    this.firmware = { curlong: '', curshort: '', status: 'idle', hasupgrade: false, newlong: '', newshort: '' };
    this.online = false;
    this.connected = false;
    this.locked = true;
    this.#sse = sse;
    this.#deviceAPIqueuePromise = (async () => { return import('p-queue'); })();
    this.#storage = storage;
    this.#storageQueuePromise = (async () => { return import('p-queue'); })();
    this.#connectPoll = new Pollinator(this.connectPollfn.bind(this), { delay: 10208 + Math.round(Math.random() * 5079) });
    this.#statusPoll = new Pollinator(this.statusPollfn.bind(this), { delay: 14200 + Math.round(Math.random() * 8479) });
    this.#settingsPoll = new Pollinator(this.settingsPollfn.bind(this), { delay: 39600 + Math.round(Math.random() * 14822) });
  }

  get initialized() {
    return Promise.all([
      this.#deviceAPIqueuePromise.then((deviceAPIqueue) => {
        this.#deviceAPIqueue = new deviceAPIqueue.default({ concurrency: 1 });
        return this;
      }),
      this.#storageQueuePromise.then((storageQueue) => {
        this.#storageQueue = new storageQueue.default({ concurrency: 1 });
        return this;
      })
    ]).then(result => {
      return result[0]; // this is what makes the one-liner possible
    })
  }

  async connectPollfn() {
    if ((this.deviceKey === 'SHSW-PM-A4CF12F3F2D3') || (this.deviceKey === 'SHSW-PM-F30AA2') || (this.deviceKey === 'SHSW-1-E098068D0745'))
      console.log(`connectPoll ${this.deviceKey}`);
    try {
      const newShellyRec = await this.callShelly('shelly');
      const differences = difference(this.coapshelly, newShellyRec);
      if (!_.isEmpty(differences)) {
        this.coapshelly = newShellyRec;
        //} else {
        //  console.info(`No point to update coapshelly`);
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
    if (this.deviceKey === 'SHSW-PM-A4CF12F3F2D3')
      console.log(`statusPoll ${this.deviceKey}`);
    try {
      const newStatus = await this.callShelly('status');
      // We are not interested in the time data in status so delete so we do not see as a difference
      delete newStatus.time;
      delete newStatus.unixtime;
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
        this.persist();
        this.ssesend('shellyUpdate');
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
    if (this.deviceKey === 'SHSW-PM-A4CF12F3F2D3')
      console.log(`settingsPoll ${this.deviceKey}`);
    try {
      const newSettings = await this.callShelly('settings');
      this.connected = true;
      // We are not interested in the time data in settings so delete so we do not see as a difference
      delete newSettings.time;
      delete newSettings.unixtime;
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
        this.persist();
        this.ssesend('shellyUpdate');
        return;
      }
      if (err.message === 'Aborted') {
        console.warn(`settingsPollfn error: Timeout trying to connect to device ${this.deviceKey}`);
        return;
      }
      console.error(`*********ERROR*********: ${err.message} failed to retreive coapsettings for ${this.id}`);
    }
  }
  async upgradePollfn() {
    try {
      const newOTA = await this.callShelly('ota');
      console.info(`upgradePollfn: OTA status of device ${this.deviceKey} is ${newOTA.status}`)
      if (newOTA.status != this.firmware.status) {
        this._coapstatus.update = newOTA;
        this.firmware.status = newOTA.status;
        this.ssesend('shellyUpdate')
      }
      return newOTA;
    } catch (err) {
      if (err.message === 'Aborted') {
        console.warn(`upgradePollfn error: Timeout trying to gety OTA status from device ${this.deviceKey}`);
        return;
      }
      console.error(`*********ERROR*********: ${err.message} failed to retreive OTA details for ${this.id}`);
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
      this.callShelly('settings/login')
        .then(function () {
          this.connected = true;
          this.locked = false;
          this.#connectPoll._config.delay = 120000;
          this.#statusPoll.start();
          this.#settingsPoll.start();
          this.persist();
          this.ssesend('shellyUpdate');
        }.bind(this))
        .catch(function () {
          this.connected = false;
          this.#connectPoll._config.delay = 30000;
          console.warn(`set coapshelly: Auth error while trying to connect to ${this.deviceKey}`);
        }.bind(this))
    }
    this.persist();
    this.ssesend('shellyUpdate');
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

    this.persist();
    this.ssesend('shellyUpdate');
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
    this.persist();
    this.ssesend('shellyUpdate');
  }

  start() {
    if (!network.isIP(this.ip)) debugger;
    this.online = false;
    this.auth = false;
    this.connected = false;
    this.#connectPoll.start();
    this.persist();
    this.ssesend('shellyUpdate');
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
    const { body } = await this.#deviceAPIqueue.add(() => got(`http://${this.ip}/${urlPath}`, requestOptions));
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
      this.#connectPoll.stop().start();
    }
  }

  getSSEobj() {
    let result = _.omitBy(this, (value, key) => {
      if (_.startsWith(key, '#')) return true;
      if (_.startsWith(key, '_coap')) return true;
      if (_.startsWith(key, 'coap')) return true;
      return false;
    });
    if (result.auth && result.locked) {
      result.givenname = 'Unavailable (locked)';
      result.ssid = 'n/a';
    }
    return Object(result);
  }

  ssesend(eventName) {
    //await sseQueue.add(() => sseSender.send(eventName, this.getSSEobj()));
    const shellySSE = this.getSSEobj();
    const differences = difference(shellySSE, this.#lastSentSSE);
    if ((!_.isEmpty(differences)) || (eventName != this.#lastSSEEventType)) {
      console.info(`ssesend: sending ${eventName} for device ${this.deviceKey} ${this.#lastSSEEventType}:${JSON.stringify(differences)}`)
      this.#sse.send(shellySSE, eventName);
      this.#lastSSEEventType = eventName;
      this.#lastSentSSE = shellySSE;
      //} else {
      //  console.info(`ssesend: ignored ${eventName} for device ${this.deviceKey}`)
    }
  }

  async persist() {
    await this.#storageQueue.add(() => this.#storage.setItem(this.deviceKey, this));
  }

  revive(srcShelly) {
    for (const [key, value] of Object.entries(srcShelly)) {
      try {
        if (!_.isUndefined(value)) this[key] = value;
      } catch (err) { console.error(`Object revival error: ${err.message} in for key ${key} and value ${value}`); }
    }
  }

  async upgrade() {
    this.firmware.status = 'requesting';
    this.ssesend('shellyUpdate');
    await this.callShelly('ota?update=true');
    let upgradePoll = new Pollinator(this.upgradePollfn.bind(this),
      {
        delay: 2000, conditionFn: function (currentResponse, previousResponse) {
          const result = ((currentResponse.status == 'idle') || (currentResponse.status == 'pending'));
          if (result) {
            this.firmware.status = 'finished';
            this.ssesend('shellyUpdate');
          }
          return result;
        }.bind(this)
      });
    upgradePoll.start();
  }
}
['coapshelly', 'coapstatus', 'coapsettings'].forEach(prop => Object.defineProperty(Shelly.prototype, prop, { enumerable: true }));


module.exports = Shelly;
