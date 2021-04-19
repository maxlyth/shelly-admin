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
        "render": function (data, _type, _row, _meta) {
          let result = '';
          data ??= {};
          data.current ??= "/-";
          let currentName = data.current.split('/')[1].split('-')[0];
          result = currentName;
          if (_type == 'display') {
            result = '<span>' + currentName + '</span>';
            let [currentCell, currentContent] = [null, null];
            if (shellyTableObj) currentCell = shellyTableObj.cell(_meta.row, _meta.col);
            if (currentCell) currentContent = currentCell.node();
            if (currentContent) currentContent = $(currentContent);
            if (currentContent) {
              if ($('span[updating]', currentContent).length > 0) {
                result = currentContent.html();
                return result;
              }
              if ($('span[updated]', currentContent).length > 0) {
                result = currentContent.html();
                return result;
              }
            }
            if (data.hasupdate || false) {
              data.new ??= '';
              const devicekey = _row['devicekey'];
              result = `<span onclick="handleShellyUpdate(this, '${devicekey}');" data-toggle="tooltip" title="Start firmware update" data-content="${data.new}">${currentName}&nbsp;&nbsp;`;
              result += `<i class="fas fa-sync-alt" style="color:red"></i></span>`;
            }
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

// eslint-disable-next-line no-unused-vars
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
        tableCell.html(`<span updated><i class="fas fa-check-circle" style="color:green"></i>&nbsp;Success!</span>`);
        setTimeout(function () {
          $('[updated]', tableCell).removeAttr('updated');
          $.ajax({
            url: "api/shelly/" + devicekey
          }).done(function (data) {
            shellyTableObj.row(tableCell).data(data).draw();
          })
        }, 15000);
        return;
      }
      if ((Date.now() - startTime) > 60000) {
        tableCell.html(originalContent);
        return;
      }
      if (data != curStatus) {
        curStatus = data;
        tableCell.html(`<span updating><i class="fas fa-spinner fa-spin" style="color:green"></i>&nbsp;${data}</span>`);
      }
      setTimeout(pollUpdateTimer.bind({ element, devicekey, tableCell, originalContent, startTime, curStatus }), 1500);
    })
    .fail(function (data) {
      console.warning(`Updatestatus failed with ${data} for ${devicekey}`);
      if ((Date.now() - startTime) > 60000) {
        tableCell.html(originalContent);
      } else {
        setTimeout(pollUpdateTimer.bind({ element, devicekey, tableCell, originalContent, startTime, curStatus }), 1500);
      }
    });
}

// eslint-disable-next-line no-unused-vars
function handleShellyUpdate(element, devicekey) {
  console.info("Start firmware update for " + devicekey);
  let tableCell = $(element).parent();
  let originalContent = tableCell.html();
  let startTime = Date.now();
  let curStatus = 'Requesting…';
  $('[data-toggle="tooltip"]', tableCell).tooltip('hide');
  tableCell.html(`<span updating>${curStatus}</span>`);
  $.ajax({ url: "api/update/" + devicekey })
    .done(function (data) {
      console.info("Requested firmware update for " + devicekey);
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
ssesource.addEventListener('shellyRefresh', message => {
  console.log('Got Refresh');
  const shelly = JSON.parse(message.data);
  const devKey = deviceKey(shelly.type, shelly.id);
  if (_.isNil(shellyTableObj)) return;
  let existingRow = shellyTableObj.rows(function (_idx, data, _node) { return data.devicekey == devKey ? true : false; });
  if (Array.isArray(existingRow)) existingRow = existingRow[0];
  const existingObj = existingRow.data();
  const differences = difference(existingObj, shelly);
  if (differences.length === 0) {
    console.log("no differnces in refresh event");
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
    if (existingRow) {
      existingRow.data(shelly).draw();
    } else {
      let newRow = shellyTableObj.row.add(shelly);
      newRow = newRow.rows(function (_idx, data, _node) { return data.devicekey === devKey ? true : false; });
      if (Array.isArray(newRow)) newRow = newRow[0];
      console.log(`Got Refresh that was new for row ${newRow.id}`);
      $.ajax({
        url: "api/shelly/" + devKey
      }).done(function (data) {
        newRow.data(data).draw();
      })
    }
  }
}, false);
ssesource.addEventListener('shellyUpdate', message => {
  const shelly = JSON.parse(message.data);
  const devKey = deviceKey(shelly.type, shelly.id);
  let existingRow = shellyTableObj.rows(function (_idx, data, _node) { return data.devicekey === devKey ? true : false; });
  if (Array.isArray(existingRow)) existingRow = existingRow[0];
  const existingObj = existingRow.data();

  //  _.find(shellylist, function (o) { return o.devicekey === devKey; });
  if (existingRow.columns(shelly.prop + ':name')) {
    if (existingObj) {
      console.log('Got Update that was a merge');
      _.merge(existingObj, shelly);
      if (shelly.prop) {
        existingObj[shelly.prop] = shelly.newValue;
      }
    } else {
      let newRow = shellyTableObj.row.add(shelly);
      newRow = newRow.rows(function (_idx, data, _node) { return data.devicekey === devKey ? true : false; });
      if (Array.isArray(newRow)) newRow = newRow[0];
      console.log(`Got Update that was new for row ${newRow.id}`);
      $.ajax({
        url: "api/shelly/" + devKey
      }).done(function (data) {
        newRow.data(data).draw();
      })
    }
    //document.querySelector('#events').innerHTML = message.data;
  }
}, false);
ssesource.addEventListener('shellyCreate', message => {
  const shelly = JSON.parse(message.data);
  const devKey = deviceKey(shelly.type, shelly.id);
  let existingRow = shellyTableObj.rows(function (_idx, data, _node) { return data.devicekey === devKey ? true : false; });
  if (Array.isArray(existingRow)) existingRow = existingRow[0];
  if (existingRow) {
    console.log('Got Create that was a merge');
    const existingObj = existingRow.data();
    _.merge(existingObj, shelly);
    existingRow.draw();
  } else {
    let newRow = shellyTableObj.row.add(shelly);
    newRow = newRow.rows(function (_idx, data, _node) { return data.devicekey === devKey ? true : false; });
    if (Array.isArray(newRow)) newRow = newRow[0];
    console.log(`Got Create that was new for row ${newRow.id}`);
    $.ajax({
      url: "api/shelly/" + devKey
    }).done(function (data) {
      newRow.data(data).draw();
    })
  }
}, false);
ssesource.addEventListener('shellyRemove', message => {
  console.log('Got Remove');
  const shelly = JSON.parse(message.data);
  let existingRow = shellyTableObj.rows(function (_idx, data, _node) { return data.devicekey === shelly.devicekey ? true : false; });
  if (Array.isArray(existingRow)) existingRow = existingRow[0];
  if (existingRow) {
    existingRow.remove();
  }
}, false);
ssesource.addEventListener('error', message => {
  console.log('Got SSE error');
}, false);