console.log('Starting app');
const { app, BrowserWindow, ipcMain } = require("electron");
const url = require('url');
const path = require('path');
const express = require("./app");
const SSE = require('express-sse');
const morgan = require('morgan');
const shellycoap = require('./shelly-coap.js')

const indexRouter = require('./routes/index');
const apiRouter = require('./routes/api');
//const app = express();

const sse = new SSE();

const fs = require('fs');

const port = normalizePort(process.env.PORT || '30011');

let mainWindow = null;

function createWindow() {
  express();
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 700,
    webPreferences: {
      nodeIntegration: true,
    },
  });
}

mainWindow.loadURL(url.format({
  pathname: path.join(__dirname, './index.html'),
  protocol: 'file:',
  slashes: true
}));
mainWindow.on("closed", function () {
  mainWindow = null;
});


app.on("ready", createWindow);

app.on("resize", function (e, x, y) {
  mainWindow.setSize(x, y);
});

app.on("window-all-closed", function () {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", function () {
  if (mainWindow === null) {
    createWindow();
  }
});

/**
 * Normalize a port into a number, string, or false.
 */

function normalizePort(val) {
  var port = parseInt(val, 10);

  if (isNaN(port)) {
    // named pipe
    return val;
  }

  if (port >= 0) {
    // port number
    return port;
  }

  return false;
}