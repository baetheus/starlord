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

// Test States
var tstates = {
  allOn: {out1: 1, out2: 1, out3: 1, out4: 1},
  allOff: {out1: 0, out2: 0, out3: 0, out4: 0}
};