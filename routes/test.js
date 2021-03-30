/*eslint no-undef: "error"*/
/*eslint-env node*/

var express = require('express');
var router = express.Router();

/* GET home page. */
// eslint-disable-next-line no-unused-vars
router.get('/', function (req, res, _next) {
  res.render('test', { title: 'Shellies' });
});

module.exports = router;
