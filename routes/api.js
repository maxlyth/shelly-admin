/* eslint-disable lodash/import-scope */
/* eslint-disable lodash/prefer-lodash-method */
const _ = require('lodash');
const express = require('express');
const fs = require("fs");
const path = require('path');
const prettyBytes = require('pretty-bytes');
const humanizeDuration = require("humanize-duration");
const encode = require("html-entities").encode;
var assert = require('assert');

const api = express.Router();

//READ Request Handlers
api.get('/shellys', function (req, res) {
  try {
    const shellylist = req.app.locals.shellylist;
    let result = [];
    for (const shelly in shellylist) {
      var extractedData = { ...shellylist[shelly] };
      delete extractedData?.settings;
      delete extractedData?.status;
      result.push(extractedData)
    }
    res.send(result);
  } catch (err) {
    const response = `Get shellys failed with error ${err.message}...`;
    console.error(response);
    res.status(404).send(`<h2 style="color: darkred;">${response}</h2>`);
  }
});

api.get('/shelly/:devicekey', async function (req, res) {
  try {
    const shellylist = req.app.locals.shellylist;
    const shellycoaplist = req.app.locals.shellycoaplist;
    const devicekey = req.params.devicekey;
    const device = shellycoaplist[devicekey];
    assert(_.isObject(device));
    await device.forceUpdate();
    const shelly = shellylist[devicekey];
    var extractedData = { ...shelly };
    delete extractedData?.settings;
    delete extractedData?.status;
    res.send(extractedData);
  } catch (err) {
    const response = `Get shelly failed with error ${err.message}... Can not find Shelly matching key:${req.params.devicekey}`;
    console.error(response);
    res.status(404).send(`<h2 style="color: darkred;">${response}</h2>`);
  }
});

api.get('/details/:devicekey', function (req, res) {
  function getShellyDetail(device, key) {
    let result = _.get(device, key, null);
    switch (key) {
      case 'statusCache?.ram_free':
      case 'statusCache?.ram_total':
      case 'statusCache?.fs_size':
      case 'statusCache?.fs_free':
        result = prettyBytes(result);
        break;
      case 'settingsCache?.mqtt.keep_alive':
      case 'settingsCache?.mqtt.update_period':
      case 'settingsCache?.mqtt.reconnect_timeout_min':
      case 'settingsCache?.mqtt.reconnect_timeout_max':
      case 'statusCache.uptime':
        result = humanizeDuration(result * 1000, { largest: 2 });
        break;
      case 'lastSeen':
        result = humanizeDuration((Date.now() - result), { maxDecimalPoints: 1, largest: 2 });
        break;
      case 'settingsCache?.device.mac':
      case 'shelly?.mac':
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
    const shellycoaplist = req.app.locals.shellycoaplist;
    const shellylist = req.app.locals.shellylist;
    const shelly = shellylist[req.params.devicekey];
    const device = shellycoaplist[req.params.devicekey];
    assert(_.isObject(shelly));
    const imagePath = path.join(__dirname, '..', 'public', 'images', 'shelly-devices', shelly.type + '.png');
    const imageName = (fs.existsSync(imagePath)) ? shelly.type + '.png' : 'Unknown.png';
    res.render('details', { 'title': 'Shelly Details', 'device': device, 'imageName': imageName });
  } catch (err) {
    const response = `Get details failed with error ${err.message}... Can not find Shelly matching key:${req.params.devicekey}`;
    console.error(response);
    res.status(404).send(`<h2 style="color: darkred;">${response}</h2>`);
  }
});

api.get('/update/:devicekey', async function (req, res) {
  try {
    const shellycoaplist = req.app.locals.shellycoaplist;
    const device = shellycoaplist[req.params.devicekey];
    assert(_.isObject(device));
    await device.request.get(`${device.host}/ota?update=true`);
    res.send("OK");
  } catch (err) {
    const response = `Update failed with error ${err.message}... Can not find Shelly matching key:${req.params.devicekey}`;
    console.error(response);
    res.status(404).send(`<h2 style="color: darkred;">${response}</h2>`);
  }
});

api.get('/updatestatus/:devicekey', async function (req, res) {
  try {
    const shellycoaplist = req.app.locals.shellycoaplist;
    const device = shellycoaplist[req.params.devicekey];
    assert(_.isObject(device));
    const statusResponse = await device.getStatus();
    console.log(`Got update status of '${statusResponse.update.status}' for device ${req.params.devicekey}`);
    res.send(statusResponse.update.status);
  } catch (err) {
    const response = `Status failed with error ${err.message}... Can not find Shelly matching key:${req.params.devicekey}`;
    console.error(response);
    res.status(404).send(`<h2 style="color: darkred;">${response}</h2>`);
  }
});

module.exports = api;