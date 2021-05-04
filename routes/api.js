/* eslint-disable lodash/import-scope */
/* eslint-disable lodash/prefer-lodash-method */
const _ = require('lodash');
const express = require('express');
const fs = require("fs");
const path = require('path');
const prettyBytes = require('pretty-bytes');
const humanizeDuration = require("humanize-duration");
const encode = require("html-entities").encode;
const assert = require('assert');

const api = express.Router();

//READ Request Handlers
api.get('/shellys', function (req, res) {
  try {
    const shellylist = req.app.locals.shellylist;
    let resultlist = () => {
      let result = [];
      for (const shelly in shellylist) {
        result.push(shelly.sseobj);
      }
      return result;
    }
    res.send(resultlist);
  } catch (err) {
    const response = `Get shellys failed with error ${err.message}...`;
    console.error('API:' + response);
    res.status(404).send(`<h2 style="color: darkred;">${response}</h2>`);
  }
});

api.get('/shelly/:deviceKey', async function (req, res) {
  try {
    const shellylist = req.app.locals.shellylist;
    const deviceKey = req.params.deviceKey;
    const shelly = shellylist[deviceKey];
    assert(_.isObject(shelly));
    await shelly.statusPollfn();
    await shelly.settingsPollfn();
    res.send(shelly.getSSEobj());
  } catch (err) {
    const response = `Get shelly failed with error ${err.message}... Can not find Shelly matching key:${req.params.deviceKey}`;
    console.error('API:' + response);
    res.status(404).send(`<h2 style="color: darkred;">${response}</h2>`);
  }
});

api.get('/details/:deviceKey', async function (req, res) {
  function getShellyDetail(shelly, key) {
    let result = _.get(shelly, key, null);
    switch (key) {
      case '_coapstatus.ram_free':
      case '_coapstatus.ram_total':
      case '_coapstatus.fs_size':
      case '_coapstatus.fs_free':
        result = prettyBytes(result);
        break;
      case '_coapsettings.mqtt.keep_alive':
      case '_coapsettings.mqtt.update_period':
      case '_coapsettings.mqtt.reconnect_timeout_min':
      case '_coapsettings.mqtt.reconnect_timeout_max':
      case '_coapstatus.uptime':
        result = humanizeDuration(result * 1000, { largest: 2 });
        break;
      case 'lastSeen':
        result = humanizeDuration((Date.now() - result), { maxDecimalPoints: 1, largest: 2 });
        break;
      case '_coapsettings.device.mac':
      case 'shelly.mac':
        result = result
          .match(/.{1,2}/g)    // ["4a", "89", "26", "c4", "45", "78"]
          .join(':')
        break;
      default:
        switch (result) {
          case true:
            result = '<i class="far fa-check-circle text-muted"></i>&nbsp;True';
            break;
          case false:
            result = '<i class="far fa-times-circle text-muted"></i>&nbsp;False';
            break;
          case '':
            result = '&nbsp;';
            break;
          case null:
            result = '<small class="text-muted">n/a</small>';
            break;
          default:
            result = encode(result);
            break;
        }
        break;
    }
    return result;
  }

  try {
    req.app.locals._ = _;
    req.app.locals.getShellyDetail = getShellyDetail;
    const shelly = req.app.locals.shellylist[req.params.deviceKey];
    await shelly.statusPollfn();
    await shelly.settingsPollfn();
    let shellyDetails = { ...shelly };
    const imagePath = path.join(__dirname, '..', 'public', 'images', 'shelly-devices', shellyDetails.type + '.png');
    const imageName = (fs.existsSync(imagePath)) ? shellyDetails.type + '.png' : 'Unknown.png';
    res.render('details', { 'title': 'Shelly Details', 'shelly': shellyDetails, 'imageName': imageName });
  } catch (err) {
    const response = `Get details failed with error ${err.message}... Can not find Shelly matching key:${req.params.deviceKey}`;
    console.error('API:' + response);
    res.status(404).send(`<h2 style="color: darkred;">${response}</h2>`);
  }
});

api.get('/getpreferences', function (req, res) {
  try {
    res.send({ 'user': 'shelly', 'password': '' });
  } catch (err) {
    const response = `Getting preferences failed with error ${err.message}...}`;
    console.error('API:' + response);
    res.status(404).send(`<h2 style="color: darkred;">${response}</h2>`);
  }
});

api.post('/setpreferences', function (req, res) {
  try {
    res.json({ message: "Preferences updated" });
  } catch (err) {
    const response = `Getting preferences failed with error ${err.message}...`;
    console.error('API:' + response);
    res.status(404).send(`<h2 style="color: darkred;">${response}</h2>`);
  }
});

api.get('/getpassword/:deviceKey', function (req, res) {
  try {
    const shellylist = req.app.locals.shellylist;
    const shelly = shellylist[req.params.deviceKey];
    assert(_.isObject(shelly));
    res.send({ 'user': shelly.shellyuser, 'password': shelly.shellypassword });
  } catch (err) {
    const response = `Getting credentials failed with error ${err.message}... for Shelly matching key:${req.params.deviceKey}`;
    console.error('API:' + response);
    res.status(404).send(`<h2 style="color: darkred;">${response}</h2>`);
  }
});

api.post('/setpassword/:deviceKey', function (req, res) {
  try {
    const shellylist = req.app.locals.shellylist;
    const shelly = shellylist[req.params.deviceKey];
    assert(_.isObject(shelly));
    const newCreds = req.body;
    shelly.setAuthCredentials(newCreds.user, newCreds.password);
    res.json({ message: "Credentials updated" });
  } catch (err) {
    const response = `Getting credentials failed with error ${err.message}... for Shelly matching key:${req.params.deviceKey}`;
    console.error('API:' + response);
    res.status(404).send(`<h2 style="color: darkred;">${response}</h2>`);
  }
});

// http://172.31.8.6/ota?url=http://archive.shelly-tools.de/version/v1.10.2/SHSW-PM.zip

api.get('/upgrade/:deviceKey', async function (req, res) {
  try {
    const shellylist = req.app.locals.shellylist;
    const shelly = shellylist[req.params.deviceKey];
    assert(_.isObject(shelly));
    await shelly.callShelly('ota?update=true');
    res.send("OK");
  } catch (err) {
    const response = `Upgrade failed with error ${err.message}... for Shelly matching key:${req.params.deviceKey}`;
    console.error('API:' + response);
    res.status(404).send(`<h2 style="color: darkred;">${response}</h2>`);
  }
});

api.get('/upgradestatus/:deviceKey', async function (req, res) {
  try {
    const shellylist = req.app.locals.shellylist;
    const shelly = shellylist[req.params.deviceKey];
    assert(_.isObject(shelly));
    const statusResponse = await shelly.statusPollfn();
    console.log(`Got upgrade status of '${statusResponse.update.status}' for device ${req.params.deviceKey}`);
    res.send(statusResponse.update);
  } catch (err) {
    const response = `Status failed with error ${err.message}... for Shelly matching key:${req.params.deviceKey}`;
    console.error('API:' + response);
    res.status(404).send(`<h2 style="color: darkred;">${response}</h2>`);
  }
});

api.get('/checkforupgrade/:deviceKey', async function (req, res) {
  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  try {
    const shellylist = req.app.locals.shellylist;
    const shelly = shellylist[req.params.deviceKey];
    assert(_.isObject(shelly));
    let checkResponse = shelly.callShelly('ota/check');
    let index = 0;
    for (; index < 30; index++) {
      if (checkResponse.status === 'ok') break;
      await sleep(1000);
      checkResponse = shelly.callShelly('ota/check');
    }
    assert(index < 30);
    console.log(`Got upgrade check of OK after ${index} seconds for device ${req.params.deviceKey}`);
    const statusResponse = await shelly.statusPollfn();
    console.log(`Got upgrade status of '${statusResponse.update.status}' for device ${req.params.deviceKey}`);
    res.send(statusResponse.update);
  } catch (err) {
    const response = `Check for upgrade failed with error ${err.message}... for Shelly matching key:${req.params.deviceKey}`;
    console.error('API:' + response);
    res.status(404).send(`<h2 style="color: darkred;">${response}</h2>`);
  }
});

module.exports = api;