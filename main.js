console.log('Starting app');
/**
 * Get port from environment and store in Express.
 */

require('dotenv').config();
var port = process.env.PORT = process.env.PORT || '43812';
var host = process.env.HOST = process.env.HOST || 'localhost';
process.env.TRUSTPROXY = process.env.TRUSTPROXY || 'loopback';
process.env.UIMODE = process.env.UIMODE || 'light';
process.env.PREFIX = process.env.PREFIX || '';

const expressapp = require("./app");
const { app, BrowserWindow } = require("electron");
/**
* Module dependencies.
*/

var debug = require('debug')('shelly-admin:server');
var http = require('http');
const url = require('url');


/**
 * Create HTTP server.
 */

var server = http.createServer(expressapp);

/**
 * Listen on provided port, on all network interfaces.
 */

server.listen(process.env.PORT, process.env.HOST);
server.on('error', onError);
server.on('listening', onListening);


/**
 * Event listener for HTTP server "error" event.
 */

function onError(error) {
  if (error.syscall !== 'listen') {
    throw error;
  }

  var bind = typeof process.env.PORT === 'string'
    ? 'Pipe ' + process.env.PORT
    : 'Port ' + process.env.PORT;

  // handle specific listen errors with friendly messages
  switch (error.code) {
    case 'EACCES':
      console.error(bind + ' requires elevated privileges');
      process.exit(1);
      break;
    case 'EADDRINUSE':
      console.error(bind + ' is already in use');
      process.exit(1);
      break;
    default:
      throw error;
  }
}

/**
 * Event listener for HTTP server "listening" event.
 */

function onListening() {
  var addr = server.address();
  var bind = typeof addr === 'string'
    ? 'pipe ' + addr
    : 'port ' + addr.port;
  debug('Listening on ' + bind);
}

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 700,
    webPreferences: {
      nodeIntegration: true,
    },
  });
  let homeURL = url.format({
    protocol: 'http:',
    hostname: process.env.HOST,
    port: process.env.PORT,
    pathname: process.env.PREFIX
  });
  mainWindow.loadURL(homeURL);
}

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
