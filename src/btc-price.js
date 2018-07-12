const https = require('https');

/**
 * Coindesk price payload
 * @type {String}
 */
let payload = '';

/**
 * Time last request completed
 * @type {Number}
 */
let lastReqTimestamp = 0;

/**
 * Get Coindesk BTC price from via SSL
 * @param {Function} - callback
 */
const fetchBtcPrice = (cb) => {
  https.get('https://api.coindesk.com/v1/bpi/currentprice.json', (resp) => {
    let data = '';
    resp.on('data', (chunk) => data += chunk);
    resp.on('end', () => {
      payload = data; // overwrite current payload
      lastReqTimestamp = getUTCTime(); // set last completed time
      cb(null, payload);
    });
  })
  .on('error', (err) => cb(err, null));
};

/**
 * Resolves cached BTC price if time
 * @return {Promise} - resovles {Object} currentprice JSON
 */
module.exports = function() {
  return new Promise((resolve, reject) => {
    if (getUTCTime() === lastReqTimestamp) {
      resolve(payload);
    } else {
      fetchBtcPrice((err) => {
        if (err) {
          reject(err);
        } else {
          resolve(payload);
        }
      });
    }
  });
};

/**
 * Gets the UTC time to the minute
 * @return {Number}
 */
function getUTCTime() {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(),now.getUTCMonth(), now.getUTCDate(), now.getUTCHours(), now.getUTCMinutes()) / 10000;
}
