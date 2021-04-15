/* eslint-disable lodash/prefer-lodash-method */
/* eslint no-unused-vars: ["error", { "args": "none" }]*/
/* eslint-env browser, jquery */
/* global _:readonly */

let shellyTableObj = undefined;
const shellylist = [{}];
const detailCardsState = JSON.parse(localStorage.getItem('ShellyAdmin_DetailCardsState_v1')) || { 'detail-general': true };

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
        name: "selection",
        targets: 0,
        defaultContent: false,
        orderable: false,
        width: 16,
        "responsivePriority": 12001,
        className: '',
        render: function (data, type, row, meta) {
          return '<input type="checkbox" id="rowchk_' + row + '" value="' + row + '"><label for="rowchk_' + row + '"></label>';
        }
      },
      { data: "devicekey", name: "devicekey", "title": "key", "width": 90, "responsivePriority": 11001, "visible": false },
      {
        data: "ip", name: "ip", "title": "IP", "width": 40, "responsivePriority": -1, "render": function (data, _type, _row) {
          return '<a href="http://' + data + '">' + data + '</a>';
        }, "type": "ip-address"
      },
      { data: "givenname", name: "givenname", "title": "Device Name", "width": 130, "responsivePriority": 0, "data-priority": 0 },
      { data: "id", name: "id", "title": "ID", "width": 70, "responsivePriority": 10005 },
      { data: "type", name: "type", "title": "Type", "width": 50, "responsivePriority": 11001, "visible": false },
      { data: "modelName", name: "model", "title": "Model", "width": 80, "responsivePriority": 10002 },
      { data: "online", name: "online", "title": "Online", "width": 25, "responsivePriority": 10100, "visible": false },
      { data: "lastSeen", name: " lastseen", "title": "LastSeenCanonical", "width": 100, "responsivePriority": 11001, "visible": false, render: $.fn.dataTable.render.intlDateTime() },
      { data: "lastSeenHuman", name: "lastseen-human", "title": "LastSeen", "width": 70, "responsivePriority": 10040, "type": "natural-time-delta" },
      { data: "mqtt_enable", name: "mqtt", "title": "MQTT", "width": 25, "responsivePriority": 10020 },
      {
        data: "fw", name: "fw", "title": "Firmware", "width": 35, "responsivePriority": 11001, "render": function (data, _type, _row) {
          return data ? data.split('/')[1].split('-')[0] : "";
        }, type: 'chapter'
      },
      { data: "ssid", name: "ssid", "title": "SSID", "width": 60, "responsivePriority": 10070 },
      { data: "rssi", name: "rssi", "title": "RSSI", "width": 18, "responsivePriority": 10080 }
    ],
    order: [[2, "asc"]],
    dom: 'BlrtipR',
    stateSave: true,
    stateSaveCallback: function (settings, data) {
      localStorage.setItem('ShellyAdmin_TableState_v1', JSON.stringify(data));
    },
    stateLoadCallback: function (settings) {
      return JSON.parse(localStorage.getItem('ShellyAdmin_TableState_v1'));
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

  // Move the DataTable buttons up into the BooStrap navigation bar
  const columnButtons = $('div.dt-buttons').detach();
  //columnButtons.insertBefore('#tableButtons');
  $('#tableButtons').append(columnButtons);

  // Set the Bootrap navigation bar search field as the DataTables dynamic filter
  $('#mySearch').keyup(function () {
    shellyTableObj.search($(this).val()).draw();
  })

  // Set a DataTables row selection handler to get a fresh data set from server for selected device and show the result in details card
  shellyTableObj.on('select', function (e, dt, type, indexes) {
    if (type === 'row') {
      const devicekey = shellyTableObj.rows(indexes).data().pluck('devicekey')[0];
      $('#details').load("api/details/" + encodeURIComponent(devicekey), function (response, status, xhr) {
        if (status == "error") {
          console.log(status);
          return;
        }
        $('#details .collapse').on('shown.bs.collapse', function (e) {
          detailCardsState[e.currentTarget.id] = true;
          localStorage.setItem('ShellyAdmin_DetailCardsState_v1', JSON.stringify(detailCardsState));
        });
        $('#details .collapse').on('hidden.bs.collapse', function (e) {
          detailCardsState[e.currentTarget.id] = false;
          localStorage.setItem('ShellyAdmin_DetailCardsState_v1', JSON.stringify(detailCardsState));
        });
        for (let cardID in detailCardsState) {
          if (detailCardsState[cardID] === false) {
            $('#' + cardID).removeClass('show');
            $('#heading-' + cardID).addClass('collapsed');
          }
        }
      });
    }
  });

  // Split the window into two stacked sections using a ratio persisted from previous use if avail
  let splitRatio = localStorage.getItem('ShellyAdmin_WinSplit_v1')
  if (splitRatio) {
    splitRatio = JSON.parse(splitRatio)
  } else {
    splitRatio = [60, 40] // default sizes
  }
  // eslint-disable-next-line no-undef
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
    url: "api/shellys"
  }).done(function (data) {
    shellyTableObj.clear();
    data.forEach(element => {
      shellyTableObj.row.add(element)
    });
    shellyTableObj.draw();
  });
});


/**
 * Deep diff between two object, using lodash
 * @param  {Object} object Object compared
 * @param  {Object} base   Object to compare with
 * @return {Object}        Return a new object who represent the diff
 */
function difference(object, base) {
  return _.transform(object, (result, value, key) => {
    if (!_.isEqual(value, base[key])) {
      result[key] = _.isObject(value) && _.isObject(base[key]) ? difference(value, base[key]) : value;
    }
  });
}

const ssesource = new EventSource('events');
ssesource.addEventListener('shellyUpdate', message => {
  console.log('Got Update');
  const shelly = JSON.parse(message.data);
  const devKey = deviceKey(shelly.type, shelly.id);
  if (_.isNil(shellyTableObj)) return;
  const existingRow = shellyTableObj.rows(function (_idx, data, _node) { return data.devicekey == devKey ? true : false; });
  const existingObj = existingRow.data()[0];
  const differences = difference(existingObj, shelly);
  if (differences.length === 0) {
    console.log("no differnces in update event");
  } else {
    //  _.find(shellylist, function (o) { return o.devicekey === devKey; });
    let noVisibleCols = true;
    for (let col in differences) {
      if (existingRow.columns(col + ':name')[0].length > 0) {
        // eslint-disable-next-line no-unused-vars
        noVisibleCols = false;
        break;
      }
    }
    if (existingObj) {
      _.merge(existingObj, shelly);
      //existingObj.givenname = Math.random();
      //shellyTableObj.rows().deselect();
      existingRow.invalidate().draw();
      //existingRow.select();
    } else {
      //    shellylist[devKey] = shelly;
      shellyTableObj.row.add(shelly).draw();
    }
    //document.querySelector('#events').innerHTML = message.data;
  }
}, false);
ssesource.addEventListener('shellyNotify', message => {
  console.log('Got Notify');
  const shelly = JSON.parse(message.data);
  const devKey = deviceKey(shelly.type, shelly.id);
  const existingRow = shellyTableObj.rows(function (_idx, data, _node) { return data.devicekey === devKey ? true : false; });
  const existingObj = existingRow.data()[0];

  //  _.find(shellylist, function (o) { return o.devicekey === devKey; });
  if (existingRow.columns(shelly.prop + ':name')) {
    if (existingObj) {
      _.merge(existingObj, shelly);
      if (shelly.prop) {
        existingObj[shelly.prop] = shelly.newValue;
      }
    } else {
      //    shellylist[devKey] = shelly;
      shellyTableObj.row.add(shelly).draw();
    }
    //document.querySelector('#events').innerHTML = message.data;
  }
}, false);
ssesource.addEventListener('shellyCreate', message => {
  console.log('Got Create');
  const shelly = JSON.parse(message.data);
  //  const devKey = deviceKey(shelly.type, shelly.id);
  //  shellylist[devKey] = shelly;
  shellyTableObj.row.add(shelly).draw();
  //  document.querySelector('#events').innerHTML = message.data;
}, false);
ssesource.addEventListener('shellyRemove', message => {
  console.log('Got Remove');
  const shelly = JSON.parse(message.data);
  const existingRow = shellyTableObj.rows(function (_idx, data, _node) { return data.devicekey === shelly.devicekey ? true : false; });
  const existingObj = existingRow.data();
  if (existingObj) {
    existingRow.remove();
  }
}, false);
ssesource.addEventListener('error', message => {
  console.log('Got SSE error');
}, false);