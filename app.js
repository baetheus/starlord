/*jslint node: true */
'use strict';

// Module Requires
var sprintf = require('util').format;

var bunyan = require('bunyan');
var vasync = require('vasync');
var onoff = require('onoff').Gpio;

// Setup Log
var log = bunyan.createLogger({name: 'spacemichael'});

// BBB Pinout Map
var pins = {
  out1: new onoff(66, 'out'),
  out2: new onoff(67, 'out'),
  out3: new onoff(69, 'out'),
  out4: new onoff(68, 'out')
};

// writeHelper - Wrapper Function for async gpio write from pins
// INPUT
// data = {
//   pin: 'out1',
//   value: 0
// }
function writeHelper(data, callback) {
  log.debug({data: data}, 'writeHelper:');
  pins[data.pin].write(data.value, callback);
}

// setState - Takes a state object and sets all given pins in parallel
// INPUT
// state = {
//   out1: 0
//   out2: 1
//   out3: 1
// }
function setState(state, callback) {
  var inputs = [];

  for (var key in state) {
    inputs.push({ pin: key, value: state[key] });
  }
  log.debug({state: state, inputs: inputs}, 'setState:');
  vasync.forEachParallel({
    'func': writeHelper,
    'inputs': inputs
  }, callback);
}

// coordinate - Takes an array of states and a period and runs each entry
//   in the array each period.
function coordinate(stateArr, period, repeat, callback) {
  repeat = (typeof repeat === 'undefined') ? 0 : repeat;

  function waitState(state, callback) {
    setState(state, function waitStateCB(err, results) {
      setTimeout(function () {
        callback(err);
      }, period);
    });
  }

  vasync.forEachPipeline({
    'func': waitState,
    'inputs': stateArr
  }, function coordinateCB(err, results) {
    log.debug({err: err, results: results}, 'coordinateCB:');
    if (repeat > 0) {
      coordinate(stateArr, period, repeat - 1, callback);
    } else {
      callback(err);
    }
  });
}

function sanitize(stateArr, period, limit) {
  var cooldown = {};
  var errors = [];
  var clean = true;
  for (var i = 0, len = stateArr.length; i < len; i++) {
    var state = stateArr[i];
    // Decrement Cooldowns
    for (var cdpin in cooldown) {
      cooldown[cdpin] -= period;
      if (cooldown[cdpin] <= 0) {
        delete cooldown[cdpin];
      }
    }

    for (var pin in state) {
      if (cooldown[pin] !== undefined) {
        clean = false;
        errors.push(sprintf('Pin %s at step %d still needs %d millisecond(s) of cooldown.', pin, i, cooldown[pin]));
      } else {
        cooldown[pin] = limit;
      }

    }
  }
  return (errors.length > 0) ? errors : null;
}

// Test States
var ts = {
  allOn: {out1: 1, out2: 1, out3: 1, out4: 1},
  allOff: {out1: 0, out2: 0, out3: 0, out4: 0},
  one: {out1: 1, out2: 0, out3: 0, out4: 0},
  two: {out1: 0, out2: 1, out3: 0, out4: 0},
  three: {out1: 0, out2: 0, out3: 1, out4: 0},
  four: {out1: 0, out2: 0, out3: 0, out4: 1}
};

var ta = {
  nightrider: [ts.one, ts.two, ts.three, ts.four, ts.three, ts.two],
  allonoff: [ts.allOn, ts.allOff],
  one: []
};

