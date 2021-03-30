/* eslint-disable lodash/prefer-lodash-method */
const express = require('express');
//const joi = require('joi'); //used for validation
var api = express.Router();
var _ = require('lodash');
const fs = require("fs");
var path = require('path');
//const app = express();
//app.use(express.json());

//script.
//seeddata = JSON.parse(_.unescape('#{seeddata}'));

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

//CREATE Request Handler
//app.post('/api/shellys', (req, res) => {
//
//  const { error } = validateBook(req.body);
//  if (error) {
//    res.status(400).send(error.details[0].message)
//    return;
//  }
//  const book = {
//    id: books.length + 1,
//    title: req.body.title
//  };
//  books.push(book);
//  res.send(book);
//});
//
////UPDATE Request Handler
//app.put('/api/books/:id', (req, res) => {
//  const book = books.find(c => c.id === parseInt(req.params.id));
//  if (!book) res.status(404).send('<h2 style="font-family: Malgun Gothic; color: darkred;">Not Found!! </h2>');
//
//  const { error } = validateBook(req.body);
//  if (error) {
//    res.status(400).send(error.details[0].message);
//    return;
//  }
//
//  book.title = req.body.title;
//  res.send(book);
//});
//
////DELETE Request Handler
//app.delete('/api/shellys/:id', (req, res) => {
//
//  const book = books.find(c => c.id === parseInt(req.params.id));
//  if (!book) res.status(404).send('<h2 style="font-family: Malgun Gothic; color: darkred;"> Not Found!! </h2>');
//
//  const index = books.indexOf(book);
//  books.splice(index, 1);
//
//  res.send(book);
//});

//function validateBook(book) {
//  const schema = {
//    title: Joi.string().min(3).required()
//  };
//  return Joi.validate(book, schema);
//
//}
//
////PORT ENVIRONMENT VARIABLE
//const port = process.env.PORT || 8080;
//app.listen(port, () => console.log(`Listening on port ${port}..`));

module.exports = api;