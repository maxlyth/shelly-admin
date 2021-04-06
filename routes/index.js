/*eslint no-undef: "error"*/
/*eslint-env node*/
var express = require('express');
var router = express.Router();
//var Split2 = require('split.js');

/* GET home page. */
// eslint-disable-next-line no-unused-vars
router.get('/', function (req, res, _next) {
  //  req.app.locals.Split2 = Split2;
  res.render('index', { title: 'Shellies' });
});

module.exports = router;
