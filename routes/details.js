/* eslint-disable lodash/prefer-lodash-method */
/*eslint no-undef: "error"*/
/*eslint-env node*/

var express = require('express');
var router = express.Router();

router.get('/details:devicekey', function (req, res) {
  var shellylist = req.app.locals.shellylist;
  const shelly = shellylist.find(c => c.devicekey === req.params.devicekey);

  if (!shelly) res.status(404).send('<h2 style="font-family: Malgun Gothic; color: darkred;">Ooops... Cant find what you are looking for!</h2>');
  res.send(shelly);
});

module.exports = router;
