/* eslint-disable lodash/prefer-lodash-method */
/* eslint no-unused-vars: ["error", { "args": "none" }]*/
/* eslint-env browser, jquery */
/* global _:readonly */

var shellyTableObj = {};
var shellylist = [{}];

const deviceKey = (type, id) => `${type}#${id}`;

$(document).ready(function () {
  $.fn.dataTable.ext.errMode = 'none';
  shellyTableObj = $('#shellies').DataTable({
    retrieve: true,
    colReorder: true,
    responsive: true,
    paging: false,
    select: 'single',
    data: shellylist,
    columns: [
      {
        data: null,
        targets: 0,
        defaultContent: '',
        orderable: false,
        "width": 12,
        className: 'select-checkbox'
      },
      { data: "devicekey", "title": "key", "width": 90, "visible": false },
      { data: "id", "title": "ID", "width": 70 },
      { data: "type", "title": "Type", "width": 50, "visible": false },
      { data: "modelName", "title": "Model", "width": 80 },
      { data: "givenname", "title": "Device Name", "width": 150 },
      { data: "online", "title": "Online", "width": 25, "visible": false },
      { data: "mqtt_enable", "title": "MQTT", "width": 25 },
      {
        data: "ip", "title": "IP", "width": 60, "render": function (data, _type, _row) {
          var result = '<a href="http://"' + data + '">' + data + '</a>';
          return result;
        }, "type": "ip-address"
      },
      { data: "lastSeen", "title": "LastSeenCanonical", "width": 100, "visible": false, render: $.fn.dataTable.render.intlDateTime() },
      { data: "lastSeenHuman", "title": "LastSeen", "width": 70, "type": "natural-time-delta" },
      {
        data: "fw", "title": "Firmware", "width": 35, "render": function (data, _type, _row) {
          var result = data ? data.split('/')[1].split('-')[0] : "";
          return result;
        }, type: 'chapter'
      },
      { data: "ssid", "title": "SSID", "width": 60 },
      { data: "rssi", "title": "RSSI", "width": 25 }
    ],
    order: [[7, "asc"]],
    dom: 'BlrtipR',
    stateSave: true,
    stateSaveCallback: function (settings, data) {
      localStorage.setItem('ShellyAdmin_TableState_v1', JSON.stringify(data))
    },
    stateLoadCallback: function (settings) {
      return JSON.parse(localStorage.getItem('ShellyAdmin_TableState_v1'))
    },
    buttons: [
      {
        extend: 'colvis',
        collectionLayout: 'fixed two-column'
      },
      {
        extend: 'colvisGroup',
        enabled: false,
        text: 'MQTT',
        show: [1, 2],
        hide: [3, 4, 5]
      },
      {
        extend: 'colvisGroup',
        enabled: false,
        text: 'Cloud',
        show: [1, 2],
        hide: [3, 4, 5]
      },
      {
        extend: 'colvisGroup',
        enabled: false,
        text: 'Network',
        show: [3, 4, 5],
        hide: [1, 2]
      },
      {
        extend: 'colvisGroup',
        enabled: false,
        text: 'Security',
        show: [3, 4, 5],
        hide: [1, 2]
      },
      {
        extend: 'colvisGroup',
        enabled: false,
        text: 'Show all',
        show: ':hidden'
      }
    ]
  });

  // Move teh DataTable buttons up into the BooStrap navigation bar
  var columnButtons = $('div.dt-buttons').detach();
  columnButtons.insertBefore('nav.navbar>form');

  // Set the Bootrap navigation bar search field as the DataTables dynamic filter
  $('#mySearch').keyup(function () {
    shellyTableObj.search($(this).val()).draw();
  })

  // Set a DataTables row selection handler to get a fresh data set from server for selected device and show the result in details card
  shellyTableObj.on('select', function (e, dt, type, indexes) {
    if (type === 'row') {
      var devicekey = shellyTableObj.rows(indexes).data().pluck('devicekey')[0];
      $('#details').load("/api/details/" + encodeURIComponent(devicekey));
    }
  });

  // Split the window into two stacked sections using a ratio persisted from previous use if avail
  var splitRatio = localStorage.getItem('ShellyAdmin_WinSplit_v1')
  if (splitRatio) {
    splitRatio = JSON.parse(splitRatio)
  } else {
    splitRatio = [60, 40] // default sizes
  }
  Split(
    ['#shellylist', '#shellydetails'], {
    direction: 'vertical',
    cursor: 'row-resize',
    gutterSize: 10,
    sizes: splitRatio,
    onDragEnd: function (splitRatio) {
      localStorage.setItem('ShellyAdmin_WinSplit_v1', JSON.stringify(splitRatio))
    }
  }
  )

  // Empty the Datable of all rows and load a fresh set of devices from server
  $.ajax({
    url: "/api/shellys"
  }).done(function (data) {
    shellyTableObj.clear();
    data.forEach(element => {
      shellyTableObj.row.add(element)
    });
    shellyTableObj.draw();
  });
});

const ssesource = new EventSource('/events');
ssesource.addEventListener('shellyUpdate', message => {
  console.log('Got Update');
  var shelly = JSON.parse(message.data);
  var devKey = deviceKey(shelly.type, shelly.id);
  var existingRow = shellyTableObj.rows(function (_idx, data, _node) { return data.devicekey === devKey ? true : false; });
  var existingObj = existingRow.data()[0];
  //  _.find(shellylist, function (o) { return o.devicekey === devKey; });
  if (existingObj) {
    _.merge(existingObj, shelly);
    if (shelly.prop) {
      existingObj[shelly.prop] = shelly.newValue;
    }
    //existingObj.givenname = Math.random();
    //shellyTableObj.rows().deselect();
    existingRow.invalidate().draw();
    //existingRow.select();
  } else {
    //    shellylist[devKey] = shelly;
    shellyTableObj.row.add(shelly).draw();
  }
  //document.querySelector('#events').innerHTML = message.data;
}, false);
ssesource.addEventListener('shellyCreate', message => {
  console.log('Got Create');
  var shelly = JSON.parse(message.data);
  //  var devKey = deviceKey(shelly.type, shelly.id);
  //  shellylist[devKey] = shelly;
  shellyTableObj.row.add(shelly).draw();
  //  document.querySelector('#events').innerHTML = message.data;
}, false);
ssesource.addEventListener('shellyRemove', message => {
  console.log('Got Remove');
  var shelly = JSON.parse(message.data);
  var existingRow = shellyTableObj.rows(function (_idx, data, _node) { return data.devicekey === shelly.devicekey ? true : false; });
  var existingObj = existingRow.data();
  if (existingObj) {
    existingRow.remove();
  }
}, false);
ssesource.addEventListener('error', message => {
  console.log('Got SSE error');
}, false);