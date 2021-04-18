/* eslint-disable lodash/prefer-lodash-method */
/* eslint no-unused-vars: ["error", { "args": "none" }]*/
/* eslint-env browser, jquery */
/* global _:readonly */

let shellyTableObj = undefined;
const shellylist = [{}];
const detailCardsState = JSON.parse(localStorage.getItem('ShellyAdmin_DetailCardsState_v1')) || { 'detail-general': true };

const deviceKey = (type, id) => `${type}-${id}`;

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
        "data": null,
        "name": "selection",
        "targets": 0,
        "defaultContent": false,
        "orderable": false,
        "width": "20px",
        "responsivePriority": 3,
        "className": '',
        "render": function (data, type, row, meta) {
          return `<input type="checkbox" id="rowchk_${row}" value="${row}"><label for="rowchk_${row}"></label>`;
        }
      },
      {
        "data": "devicekey",
        "name": "devicekey",
        "title": "key",
        "width": 0,
        "responsivePriority": 11001,
        "visible": false
      },
      {
        "data": "ip",
        "name": "ip",
        "title": "IP",
        "width": "100px",
        "responsivePriority": 1,
        "className": "text-nowrap text-truncate",
        "render": function (data, _type, _row) {
          return `<div class="shellydirect" onclick="handleShellyDirect('${data}')" data-toggle="tooltip" title="Open Shelly Web Admin"><i class="fas fa-rocket"></i>&nbsp;${data}</div>`;
        },
        "type": "ip-address"
      },
      {
        "data": "givenname",
        "name": "givenname",
        "title": "Device Name",
        "width": 220,
        "className": "text-nowrap text-truncate",
        "responsivePriority": 2,
        "data-priority": 0
      },
      {
        "data": "id",
        "name": "id",
        "title": "ID",
        "className": "text-nowrap text-truncate",
        "width": 130,
        "responsivePriority": 8005
      },
      {
        "data": "type",
        "name": "type",
        "title": "Type",
        "width": 100,
        "className": "text-nowrap text-truncate",
        "responsivePriority": 9001,
        "visible": false
      },
      {
        "data": "modelName",
        "name": "model",
        "title": "Model",
        "className": "text-nowrap text-truncate",
        "width": 100,
        "responsivePriority": 8002
      },
      {
        "data": "online",
        "name": "online",
        "title": "Online",
        "width": "30px",
        "className": "text-nowrap text-truncate",
        "responsivePriority": 8100,
        "visible": false
      },
      {
        "data": "lastSeen",
        "name": " lastseen",
        "title": "LastSeenCanonical",
        "responsivePriority": 9001,
        "width": 100,
        "className": "text-nowrap text-truncate",
        "visible": false,
        "render": $.fn.dataTable.render.intlDateTime()
      },
      {
        "data": "lastSeenHuman",
        "name": "lastseen-human",
        "title": "LastSeen",
        "width": 100,
        "className": "text-nowrap text-truncate",
        "responsivePriority": 8040,
        "type": "natural-time-delta"
      },
      {
        "data": "mqtt_enable",
        "name": "mqtt",
        "title": "MQTT",
        "width": "30px",
        "className": "text-nowrap text-truncate",
        "responsivePriority": 8020
      },
      {
        "data": "fw",
        "name": "fw",
        "title": "Firmware",
        "width": "40px",
        "className": "text-nowrap text-truncate",
        "responsivePriority": 5,
        "render": function (data, _type, _row) {
          let result = '';
          data ??= {};
          data.current ??= "/-";
          let currentName = data.current.split('/')[1].split('-')[0];
          result = currentName;
          if (data.hasupdate || false) {
            data.new ??= '';
            const devicekey = _row['devicekey'];
            result += "<span>&nbsp;&nbsp;</span>";
            result += `<span onclick="handleShellyUpdate(this, '${devicekey}');" data-toggle="tooltip" title="Start firmware update" data-content="${data.new}"><i class="fas fa-sync-alt" style="color:red"></i></span>`;
          }
          return result;
        },
        "type": "chapter"
      },
      {
        "data": "ssid",
        "name": "ssid",
        "title": "SSID",
        "width": 100,
        "responsivePriority": 8070
      },
      {
        "data": "rssi",
        "name": "rssi",
        "title": "<i class=\"fas fa-signal\"></i>",
        "width": "18px",
        "responsivePriority": 8000
      }
    ],
    "order": [[2, "asc"]],
    "dom": 'BlrtipR',
    "stateSave": true,
    "stateSaveCallback": function (settings, data) {
      localStorage.setItem('ShellyAdmin_TableState_v1', JSON.stringify(data));
    },
    "stateLoadCallback": function (settings) {
      return JSON.parse(localStorage.getItem('ShellyAdmin_TableState_v1'));
    },
    "rowCallback": function (row, data) {
      $('[data-toggle="tooltip"]', row).tooltip();
    },
    "buttons": [
      {
        extend: 'colvis',
        collectionLayout: 'fixed two-column',
        "className": "d-none d-lg-block"
      },
      {
        extend: 'colvisGroup',
        enabled: false,
        text: 'MQTT',
        show: [1, 2],
        hide: [3, 4, 5],
        "className": "d-none d-xl-inline-block"
      },
      {
        extend: 'colvisGroup',
        enabled: false,
        text: 'Cloud',
        show: [1, 2],
        hide: [3, 4, 5],
        "className": "d-none d-xl-inline-block"
      },
      {
        extend: 'colvisGroup',
        enabled: false,
        text: 'Network',
        show: [3, 4, 5],
        hide: [1, 2],
        "className": "d-none d-xl-inline-block"
      },
      {
        extend: 'colvisGroup',
        enabled: false,
        text: 'Security',
        show: [3, 4, 5],
        hide: [1, 2],
        "className": "d-none d-xl-inline-block"
      },
      {
        extend: 'colvisGroup',
        enabled: false,
        text: 'Show all',
        show: ':hidden',
        "className": "d-none d-xl-inline-block"
      }
    ]
  });

  // Move the DataTable buttons up into the BooStrap navigation bar
  const columnButtons = $('div.dt-buttons').detach();
  //columnButtons.insertBefore('#tableButtons');
  $('#tableButtons').append(columnButtons);
  $('#tableButtons .flex-wrap').addClass('text-nowrap').removeClass('flex-wrap');

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

function handleShellyDirect(shellyIP) {
  console.info("Display shelly iFrame for " + shellyIP);
  $('#shellyAccessModal iframe').attr('src', "proxy/" + shellyIP + "/");
  $('#shellyAccessModal').modal('show');
}

function pollUpdateTimer() {
  var element = this.element;
  var devicekey = this.devicekey;
  var tableCell = this.tableCell;
  var originalContent = this.originalContent;
  var startTime = this.startTime;
  var curStatus = this.curStatus;
  $.ajax({ url: "api/updatestatus/" + devicekey })
    .done(function (data) {
      console.info(`Got update status of ${data} for ${devicekey}`);
      if (data == 'idle') {
        tableCell.html(`<span><i class="fas fa-check-circle" style="color:green"></i>&nbsp;Success!</span>`);
        return;
      }
      if ((Date.now() - startTime) > 60000) {
        tableCell.html(originalContent);
        return;
      }
      if (data != curStatus) {
        curStatus = data;
        tableCell.html(`<span><i class="fas fa-spinner fa-spin" style="color:green"></i>&nbsp;${data}</span>`);
      }
      setTimeout(pollUpdateTimer.bind({ element, devicekey, tableCell, originalContent, startTime, curStatus }), 1500);
    })
    .fail(function (data) {
      console.error(`Updatestatus failed with ${data} for ${devicekey}`);
      if ((Date.now() - startTime) > 60000) {
        tableCell.html(originalContent);
      } else {
        setTimeout(pollUpdateTimer.bind({ element, devicekey, tableCell, originalContent, startTime, curStatus }), 1500);
      }
    });
}

function handleShellyUpdate(element, devicekey) {
  console.info("Start firmware update for " + devicekey);
  let tableCell = $(element).parent();
  let originalContent = tableCell.html();
  let startTime = Date.now();
  let curStatus = 'Requesting…';
  $('[data-toggle="tooltip"]', tableCell).tooltip('hide');
  tableCell.html(`<span>${curStatus}</span>`);
  $.ajax({ url: "api/update/" + devicekey })
    .done(function (data) {
      console.error("Requested firmware update for " + devicekey);
      setTimeout(pollUpdateTimer.bind({ element, devicekey, tableCell, originalContent, startTime, curStatus }), 1500);
    })
    .fail(function (data) {
      tableCell.html(originalContent);
      console.error("Failed to request firmware update for " + devicekey);
    });
}

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