/*jslint node: true */
'use strict';

// Module Requires
var sprintf = require('util').format;

var bunyan = require('bunyan');
var vasync = require('vasync');
var onoff = require('onoff').Gpio;

var pinmap = require('./pinmap-bbb');

// Setup Log
var log = bunyan.createLogger({name: 'spacemichael'});
log.level('trace');

// LIMITS
var LIMITS = {
  cooldown: 10
};

// Helper States
var all = {
  on: {out1: 1, out2: 1, out3: 1, out4: 1, out5: 1, out6: 1},
  off: {out1: 0, out2: 0, out3: 0, out4: 0, out5: 0, out6: 0},
};


// mapPins - takes an array of gpio pin ids and returns an object with
//   initialized pin objects set to output
// INPUT
// pinmap = [60, 61, 62, 63]
// OUTPUT
// {
//   out1: new onoff(60, 'off'), 
//   out2: new onoff(61, 'off'),
//   out3: new onoff(62, 'off'),
//   out4: new onoff(63, 'off'),
// }
function mapPins(pinmap) {
  var output = {};
  for (var i = 0, len = pinmap.length; i < len; i++) {
    output['out' + (i + 1)] = new onoff(pinmap[i], 'out');
  }
  return output;
}

// writeHelper - Wrapper Function for async gpio write from pins
// INPUT
// data = {
//   pin: 'out1',
//   value: 0
// }
// OUTPUT
// callback(err), returns undefined
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
// OUTPUT
// callback(err, results), returns undefined
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
// INPUTS
// stateArr = [state1, state2] As defined for setState
// period = time between state changes in milliseconds
// repeat = number of times to repeat, -1 to repeat forever
// last = state to default to after coordinate completes (default: all off);
// OUTPUT
// callback(err), returns undefined
function coordinate(stateArr, period, repeat, last, callback) {
  var clean = sanitize(stateArr, period, LIMITS.cooldown);
  repeat = (typeof repeat === 'undefined') ? 0 : repeat;
  last = (typeof last === 'undefined') ? all.off : last;

  function waitState(state, callback) {
    setState(state, function waitStateCB(err, results) {
      setTimeout(function () {
        callback(err);
      }, period);
    });
  }

  if (clean !== null) {
    log.error({stateArr: stateArr, errors: clean}, 'State array is not clean:');
    callback({errors: clean});
  } else {
    log.debug({stateArr: stateArr, period: period, repeat: repeat, last: last}, 'coordinate:');
    vasync.forEachPipeline({
      'func': waitState,
      'inputs': stateArr
    }, function coordinateCB(err, results) {
      log.debug({err: err, results: results}, 'coordinateCB:');
      if (repeat === -1) {
        log.trace('Coordinate repeat forever..');
        coordinate(stateArr, period, repeat, last, callback);
      } else if (repeat > 0) {
        log.trace(sprintf('Coordinate repeat %d more time(s).', repeat));
        coordinate(stateArr, period, repeat - 1, last, callback);
      } else {
        log.trace('Completed coordination.');
        setState(last, callback);
      }
    });
  }
}

// sanitize - Takes an array of states, a period, and a cooldown limit
//   and checks that no pin changes state faster than the limit.
// INPUTS
// stateArr = [state1, state2] As defined for setState
// period = time between state changes in milliseconds
// limit = minimum time between a single pins changing state.
// OUTPUTS
// null when sanitize finds no errors
// An array of descriptive errors when sanitize finds errors.
function sanitize(stateArr, period, limit) {
  var cooldown = {};
  var errors = [];
  for (var i = 0, len = stateArr.length; i < len; i++) {
    var state = stateArr[i];
    // Decrement Cooldowns
    for (var cdpin in cooldown) {
      cooldown[cdpin].timeLeft -= period;
      if (cooldown[cdpin].timeLeft <= 0) {
        delete cooldown[cdpin];
      }
    }

    for (var pin in state) {
      if (cooldown[pin] !== undefined && cooldown[pin].state !== state[pin]) {
        errors.push(sprintf('Pin %s at step %d still needs %d millisecond(s) of cooldown.', pin, i, cooldown[pin].timeLeft));
        cooldown[pin].state = state[pin];
      } else {
        cooldown[pin] = {
          timeLeft: limit,
          state: state[pin]
        };
      }
    }
  }
  log.trace({stateArr: stateArr, period: period, limit: limit, errors: errors}, 'sanitize:');
  return (errors.length > 0) ? errors : null;
}

// Generate pins
var pins = mapPins(pinmap);

// Test States
var ts = {
  one: {out1: 1, out2: 0, out3: 0, out4: 0, out5: 0, out6: 0},
  two: {out1: 0, out2: 1, out3: 0, out4: 0, out5: 0, out6: 0},
  three: {out1: 0, out2: 0, out3: 1, out4: 0, out5: 0, out6: 0},
  four: {out1: 0, out2: 0, out3: 0, out4: 1, out5: 0, out6: 0},
  five: {out1: 0, out2: 0, out3: 0, out4: 0, out5: 1, out6: 0},
  six: {out1: 0, out2: 0, out3: 0, out4: 0, out5: 0, out6: 1}
};

var ta = {
  nightrider: [ts.one, ts.two, ts.three, ts.four, ts.five, ts.six, ts.five, ts.four, ts.three, ts.two],
  butts: [{out1: 1}, {out2: 1}, {out3: 1}, {out4: 1}, {out5: 1}, {out6: 1}, {out1: 0}, {out2: 0}, {out3: 0}, {out4: 0}, {out5: 0}, {out6: 0}, {},{},{},{},{},all.on,{},{},{},{},{},{},all.off]
};

