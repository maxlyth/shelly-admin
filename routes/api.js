/* eslint-disable lodash/prefer-lodash-method */

var _ = require('lodash');
const express = require('express');
//const joi = require('joi'); //used for validation
var api = express.Router();
const fs = require("fs");
var path = require('path');

//READ Request Handlers
api.get('/shellys', function (req, res) {
  var shellylist = req.app.locals.shellylist;
  var result = [];
  for (const shelly in shellylist) {
    result.push(shellylist[shelly])
  }
  res.send(result);
});

api.get('/shellys:devicekey', function (req, res) {
  var shellylist = req.app.locals.shellylist;
  const shelly = shellylist.find(c => c.devicekey === req.params.devicekey);

  if (!shelly) res.status(404).send('<h2 style="font-family: Malgun Gothic; color: darkred;">Ooops... Cant find what you are looking for!</h2>');
  res.send(shelly);
});

api.get('/details/:devicekey', function (req, res) {
  var shellylist = req.app.locals.shellylist;
  //const shelly = shellylist.find(c => c.devicekey === req.params.devicekey);
  const shelly = shellylist[req.params.devicekey];
  if (_.isObject(shelly)) {
    var imagePath = path.join(__dirname, '..', 'public', 'images', 'shelly-devices', shelly.type + '.png');
    var imageName = (fs.existsSync(imagePath)) ? shelly.type + '.png' : 'Unknown.png';
    res.render('details', { 'title': 'Shelly Details', 'shelly': shelly, 'imageName': imageName });
  } else {
    res.status(404).send('<h2 style="font-family: Malgun Gothic; color: darkred;">Ooops... Cant find what you are looking for!</h2>');
  }
});

module.exports = api;