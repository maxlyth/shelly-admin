/*eslint no-undef: "error"*/
/*eslint-env node*/
const express = require('express');
const router = express.Router();
//var Split2 = require('split.js');

/* GET home page. */
// eslint-disable-next-line no-unused-vars
router.get('/', function (req, res, _next) {
  //  req.app.locals.Split2 = Split2;
  res.render('index', { title: 'Shellies' });
});

module.exports = router;
