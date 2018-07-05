const fs = require('fs');
const appRoot = require('app-root-path');
const bitcoinrpc = require('./bitcoinrpc');
const assert = require('assert');
const promisify = require("promisify-node")
const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);
const mkdir = promisify(fs.mkdir);

const feeRange = { age: 0 };

/**
 * Lookup `estimatesmartfee` from bitcoin node for a range
 * caching results in both memory and to the file system.
 *
 * New fee ranges are looked up after `maxAgeSec` is expired
 * @param  {Number[]} range
 * @param  {Number}   maxAgeSec
 * @return {Promise} - resolves feeRange estimates
 */
module.exports = async function(range, maxAgeSec = 30) {
  assert(Array.isArray(range) && range.length, 'has an array of confirmations');

  // Read from file system (otherwise read from memory)
  if (feeRange.age === 0) {
    try {
      const src = await readFile(`${appRoot}/tmp/fee-range.json`, 'utf8');
      Object.assign(feeRange, JSON.parse(src));
    } catch(e) {}
  }

  const now = Math.round(Date.now() / 1000);

  // Check if previous fee range is older than max age
  if ((now - maxAgeSec) >= feeRange.age) {
    feeRange.estimates = [];

    // Lookup fee for each value in range
    for (let i = 0; i < range.length; i++) {
      const n = range[i];
      const amount = await bitcoinrpc.estimateFee(n);
      feeRange.estimates.push({
        n,
        amount: Math.round((amount * 1e8) / 1000)
      });
    }

    // Add age after all estimates requested
    feeRange.age = Math.round(Date.now() / 1000);

    try {
      // Write updated fee range to file system
      await mkdir(`${appRoot}/tmp`); // ensure tmp dir exists
      await writeFile(`${appRoot}/tmp/fee-range.json`, JSON.stringify(feeRange), 'utf8');
    } catch (e) {}
  }

  return feeRange;
};
