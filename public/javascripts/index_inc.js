/* eslint-disable lodash/prefer-lodash-method */
/* eslint no-unused-vars: ["error", { "args": "none" }]*/
/* eslint-env browser, jquery */
/* global _:readonly */

let shellyTableObj = undefined;
const shellylist = [];
const detailCardsState = JSON.parse(localStorage.getItem('ShellyAdmin_DetailCardsState_v1')) || { 'detail-general': true };
const ssesource = new EventSource('events');

const deviceKey = (type, id) => `${type}-${id}`;

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

// eslint-disable-next-line no-unused-vars
function handleShellyDirect(deviceKey) {
  console.info("Display shelly iFrame for " + deviceKey);
  $('#shellyAccessModal iframe').attr('src', "proxy/" + deviceKey + "/");
  $('#preferencesModal').on('hidden.bs.modal', function (e) {
    $('#shellyAccessModal iframe').attr('src', "");
  })
  $('#shellyAccessModal').modal('show');
}

// eslint-disable-next-line no-unused-vars
function showShellyCredsDialog(deviceKey) {
  $('#shellyGetCredsModal').on('hidden.bs.modal', function (e) {
    // Set password fields to empty on close so as not to later trigger password managers in client browser
    $('#shellyGetCredsModal input').val('');
  })
  $.ajax({ url: "api/getpassword/" + deviceKey })
    .done(function (data) {
      console.info("Requested password info for " + deviceKey);
      $('#shellyGetCredsModalError').addClass('invisible');
      $('#shellyGetCredsUsrGroup input').val(data.user);
      $('#shellyGetCredsPwdGroup input').val(data.password);
      $('#shellyGetCredsPwdGroup input').attr("type", "password");
      $('#shellyGetCredsPwdGroup i').addClass("fa-eye-slash").removeClass("fa-eye");
      $("#shellyGetCredsPwdGroup div.input-group-append").click(function () {
        if ($('#shellyGetCredsPwdGroup input').attr("type") === "text") {
          $('#shellyGetCredsPwdGroup input').attr("type", "password");
          $('#shellyGetCredsPwdGroup i').addClass("fa-eye-slash").removeClass("fa-eye");
        } else if ($('#shellyGetCredsPwdGroup input').attr("type") === "password") {
          $('#shellyGetCredsPwdGroup input').attr("type", "text");
          $('#shellyGetCredsPwdGroup i').removeClass("fa-eye-slash").addClass("fa-eye");
        }
      });
      $("#shellyGetCredsModal button.btn-primary").click(function () {
        const newCreds = {
          'user': $('#shellyGetCredsUsrGroup input').val(),
          'password': $('#shellyGetCredsPwdGroup input').val()
        };
        $.ajax({ url: "api/setpassword/" + deviceKey, method: "POST", data: newCreds })
          .done(function (data) {
            $('#shellyGetCredsModal').modal('hide');
          })
          .fail(function (jqXHR, textStatus) {
            $('#shellyGetCredsModalError').text(`Failed to set password info for ${deviceKey} with status ${textStatus}`);
            $('#shellyGetCredsModalError').removeClass('invisible');
          });
      });
      $('#shellyGetCredsModal').modal('show');

    })
    .fail(function (data) {
      console.error("Failed to get password info for " + deviceKey);
    })
}

// eslint-disable-next-line no-unused-vars
function showPreferencesDialog() {
  console.info(`Showing preferences dialog`);
  $.ajax({ url: "api/getpreferences" })
    .done(function (data) {
      console.info("Requested Preferences");
      $('#shellyPrefsUsrGroup input').val(data.user);
      $('#shellyPrefsPwdGroup input').val(data.password);
      $('#shellyPrefsPwdGroup input').attr("type", "password");
      $('#shellyPrefsPwdGroup i').addClass("fa-eye-slash").removeClass("fa-eye");
      $("#shellyPrefsPwdGroup div.input-group-append").click(function () {
        if ($('#shellyPrefsPwdGroup input').attr("type") === "text") {
          $('#shellyPrefsPwdGroup input').attr("type", "password");
          $('#shellyPrefsPwdGroup i').addClass("fa-eye-slash").removeClass("fa-eye");
        } else if ($('#shellyPrefsPwdGroup input').attr("type") === "password") {
          $('#shellyPrefsPwdGroup input').attr("type", "text");
          $('#shellyPrefsPwdGroup i').removeClass("fa-eye-slash").addClass("fa-eye");
        }
      });
      $("#preferencesModal button.btn-primary").click(function () {
        const newCreds = {
          'user': $('#shellyPrefsUsrGroup input').val(),
          'password': $('#shellyPrefsPwdGroup input').val()
        };
        $.ajax({ url: "api/setpreferences", method: "POST", data: newCreds })
          .done(function (data) {
            $('#preferencesModal').modal('hide');
          });
      });
      $('#preferencesModal').modal('show');

    })
    .fail(function (data) {
      console.error("Failed to get peferences");
    })
}

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
        "width": "1.4rem",
        "responsivePriority": 3,
        "className": '',
        "render": function (data, type, row, meta) {
          return `<input type="checkbox" id="rowchk_${row}" value="${row}"><label for="rowchk_${row}"></label>`;
        }
      },
      {
        "data": "deviceKey",
        "name": "deviceKey",
        "title": "key",
        "width": "120px",
        //"visible": false,
        "responsivePriority": 1
      },
      {
        "data": "ip",
        "name": "ip",
        "title": "IP",
        "width": "100px",
        "responsivePriority": 1,
        "className": "text-nowrap text-truncate",
        "render": function (data, _type, _row) {
          let result = data;
          if (_type == 'display') {
            let auth = _row['auth'] || false;
            if (auth) {
              console.info(`Device need authentication`);
            }
            let locked = _row['locked'] || false;
            result = '<span' + (auth ? (' class="' + (locked ? 'text-danger"' : 'text-success"') + ' onclick="showShellyCredsDialog(\'' + _row.deviceKey + '\');"') : '') + '>';
            result += auth ? `<i class="fa fa-lock" aria-hidden="true"></i>` : `<i class="fa fa-unlock-alt" aria-hidden="true"></i>`;
            result += '</span>&nbsp;';
            if (_row.locked === false) {
              result += `<span class="shellydirect" onclick="handleShellyDirect('${_row.deviceKey}')" data-toggle="tooltip" title="Open Shelly Web Admin">${data}&nbsp;<i class="fas fa-rocket"></i></span>`;
            } else {
              result += `<span data-toggle="tooltip" title="Wrong password">${data}&nbsp;</span>`;
            }
          }
          return result;
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
      //{
      //  "data": "lastSeen",
      //  "name": "lastseen",
      //  "title": "LastSeenCanonical",
      //  "responsivePriority": 9001,
      //  "width": 100,
      //  "className": "text-nowrap text-truncate",
      //  "visible": false,
      //  "render": $.fn.dataTable.render.intlDateTime()
      //},
      //{
      //  "data": "lastSeenHuman",
      //  "name": "lastseen-human",
      //  "title": "LastSeen",
      //  "width": 20,
      //  "className": "text-nowrap text-truncate",
      //  "responsivePriority": 8040,
      //  "type": "natural-time-delta",
      //  "render": function (data, _type, _row, meta) {
      //    if (_type == 'display') return `<span data-toggle="tooltip" title="${_row['lastSeen']}">${data}</span>`;
      //    else return data;
      //  }
      //},
      {
        "data": "mqtt_enable",
        "name": "mqtt",
        "title": "MQTT",
        "width": "30px",
        "className": "text-nowrap text-truncate",
        "responsivePriority": 8020
      },
      {
        "data": "firmware",
        "name": "firmware",
        "title": "Firmware",
        "width": "40px",
        "className": "text-nowrap text-truncate",
        "responsivePriority": 5,
        "render": function (data, _type, _row, _meta) {
          data ??= {};
          let result = data.curlong;
          if (_type == 'display') {
            let deviceKey = _row.deviceKey;
            result = `<span class="text-muted">${data.curshort}</span>`;
            if ((data.hasupgrade) || (data.status == 'pending')) {
              data.newlong ??= '';
              result = `<span onclick="handleShellyUpgrade(this, '${deviceKey}');" data-toggle="tooltip" title="Start firmware upgrade" data-content="${data.newlong}">${data.curshort}&nbsp;&nbsp;`;
              result += `<i class="text-info fas fa-level-up-alt"></i></span>`;
            }
            if (data.status == 'idle') {
              result = `<span onclick="handleShellyCheckUpgrade(this, '${deviceKey}');" data-toggle="tooltip" title="Check for firmware upgrade">${data.curshort}&nbsp;`;
              result += `<i class="text-muted fas fa-sync-alt"></i></span>`;
            }
            if (data.status == 'updating') {
              result = `<span>Upgrading…&nbsp;<i class="text-success fas fa-spinner fa-spin"></i></span>`;
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
  });

  $("#PreferencesButton").click(function () {
    showPreferencesDialog();
  });

  shellyTableObj.on('column-sizing', function () {
    $('#shellylist thead tr th:first').css('width', '1.4rem');
  });

  // Set a DataTables row selection handler to get a fresh data set from server for selected device and show the result in details card
  shellyTableObj.on('select', function (e, dt, type, indexes) {
    if (type === 'row') {
      const deviceKey = shellyTableObj.rows(indexes).data().pluck('deviceKey')[0];
      $('#details').load("api/details/" + encodeURIComponent(deviceKey), function (response, status, xhr) {
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

  ssesource.addEventListener('open', message => {
    console.log(`SSE: open`);
  }, false);
  ssesource.addEventListener('shellysLoad', message => {
    const shellys = JSON.parse(message.data);
    console.log(`SSE: shellysLoad with ${shellys.length} devices`);
    shellyTableObj.clear();
    for (const [, shelly] of Object.entries(shellys)) {
      shellyTableObj.row.add(shelly);
    }
    shellyTableObj.one('draw', function () { $('#connectingOverlay').delay(250).fadeOut(400, function () { $('#connectingOverlay').addClass('invisible').fadeTo(0, 1) }); });
    shellyTableObj.columns.adjust().draw();
  }, false);
  ssesource.addEventListener('shellyUpdate', message => {
    const shelly = JSON.parse(message.data);
    const devKey = deviceKey(shelly.type, shelly.id);
    let existingRow = shellyTableObj.row(function (_idx, data, _node) { return data.deviceKey === devKey ? true : false; });
    if (existingRow.length > 0) {
      const existingObj = existingRow.data();
      const differences = difference(existingObj, shelly);
      if (differences.length === 0) {
        console.log(`SSE: shellyUpdate no changes for ${devKey}`);
      } else {
        console.log(`SSE: shellyUpdate data differs for ${devKey}`);
        existingRow.data(shelly);
        let noVisibleCols = false;
        //let noVisibleCols = true;
        //for (let col in differences) {
        //  if (existingRow.columns(col + ':name')[0].length > 0) {
        //    // eslint-disable-next-line no-unused-vars
        //    noVisibleCols = false;
        //    break;
        //  }
        //}
        if (noVisibleCols === false) {
          //console.log(`SSE: shellyUpdate including visible columns for ${devKey}`);
          existingRow.draw();
        }
      }
    } else {
      console.log(`SSE: shellyUpdate that was new for ${devKey}`);
      shellyTableObj.row.add(shelly).draw();
    }
  }, false);
  ssesource.addEventListener('shellyCreate', message => {
    console.log('SSE: shellyCreate');
    const shelly = JSON.parse(message.data);
    const devKey = deviceKey(shelly.type, shelly.id);
    let existingRow = shellyTableObj.row(function (_idx, data, _node) { return data.deviceKey === devKey ? true : false; });
    if (existingRow.length > 0) {
      console.log('Got Create that was a merge');
      existingRow.data(shelly).draw();
    } else {
      console.log(`Got Create that was new for row ${devKey}`);
      shellyTableObj.row.add(shelly).draw();
    }
  }, false);
  ssesource.addEventListener('shellyRemove', message => {
    console.log('SSE: shellyRemove');
    const shelly = JSON.parse(message.data);
    let existingRow = shellyTableObj.row(function (_idx, data, _node) { return data.deviceKey === shelly.deviceKey ? true : false; });
    if (existingRow) {
      existingRow.remove().draw();
    }
  }, false);
  ssesource.addEventListener('error', event => {
    switch (event.target.readyState) {
      case EventSource.CONNECTING:
        $('#connectingOverlay').removeClass('invisible');
        $('#offlineOverlay').addClass('invisible');
        console.log('SSE Reconnecting...');
        break;
      case EventSource.CLOSED:
        $('#offlineOverlay').removeClass('invisible');
        $('#connectingOverlay').addClass('invisible');
        console.log('SSE Connection failed, will not reconnect');
        break;
    }
  }, false);

});

// eslint-disable-next-line no-unused-vars
function handleShellyUpgrade(element, deviceKey) {
  console.info("Start firmware upgrade for " + deviceKey);
  let tableCell = $(element).parent();
  let originalContent = tableCell.html();
  $('[data-toggle="tooltip"]', tableCell).tooltip('hide');
  tableCell.html(`<span class="text-muted">Request…&nbsp;<i class="fas fa-spinner fa-spin"></i></span>`);
  $.ajax({ url: "api/upgrade/" + deviceKey })
    .done(function (data) {
      console.info("Requested firmware upgrade for " + deviceKey);
    })
    .fail(function (data) {
      tableCell.html(originalContent);
      console.error("Failed to request firmware upgrade for " + deviceKey);
    });
}

// eslint-disable-next-line no-unused-vars
function handleShellyCheckUpgrade(element, deviceKey) {
  console.info("Start firmware check for " + deviceKey);
  let tableCell = $(element).parent();
  let originalContent = tableCell.html();
  $('[data-toggle="tooltip"]', tableCell).tooltip('hide');
  $('i', tableCell).removeClass(['fa-sync-alt', 'text-muted']).addClass(['fa-spinner', 'fa-spin'])
  $.ajax({ url: "api/checkforupgrade/" + deviceKey })
    .done(function () {
      console.info("Got successful firmware check for " + deviceKey);
      $.ajax({
        url: "api/shelly/" + deviceKey
      }).done(function (data) {
        console.info("Got updated data after successful firmware check for " + deviceKey);
        shellyTableObj.row(tableCell).data(data).draw();
      })
    })
    .fail(function () {
      tableCell.html(originalContent);
      console.error("Failed to request firmware check for " + deviceKey);
    });
}
