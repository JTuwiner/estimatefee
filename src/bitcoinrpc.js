var bitcoin = require('bitcoin');
var client = new bitcoin.Client({
	host: '104.154.117.110',
	port: 8332,
	user: 'Ulysseys',
	pass: 'ZWHqhL4Xf9JMokLPzd4eeD',
	timeout: 30000
});


var AsyncCache = require('async-cache');


var estimateFeeCache = new AsyncCache({
	maxAge: 1000 * 30, // 30 seconds
	load: function (key, cb) {
		console.log('Getting the feerate for: ', key);
		client.cmd('estimatesmartfee', key, (err, data) => cb(err, data))
	}
});


exports.estimateFee = (n) => {
	return new Promise((resolve, reject) => {
		estimateFeeCache.get(n, function(err, resp) {
			if (err)
				return reject(err);

			resolve(resp.feerate);
		})
	});

};


var feeProbablyCache = new AsyncCache({
	maxAge: 1000 * 60 * 5, // 5 minute cache
	load: function (key, cb) {
		console.log('Getting the feerate for: ', key);
		client.cmd('estimaterawfee', key, 0.5, (err, data) => {

			if (err) return cb(err);


			let feeRate = data['short']['feerate'];
			if (feeRate > 0) {
				return cb(null, feeRate)
			}

			feeRate = data['medium']['feerate'];
			if (feeRate > 0) {
				return cb(null, feeRate)
			}

			feeRate = data['long']['feerate'];
			if (feeRate > 0) {
				return cb(null, feeRate)
			}

			return cb(null, -1)
		})
	}
});


exports.estimateFeeProbably = (n) => {
	return new Promise((resolve, reject) => {
		feeProbablyCache.get(n, function(err, resp) {
			if (err)
				return reject(err);

			resolve(resp);
		})
	});

};




var rawMemPoolCache = new AsyncCache({
	maxAge: 1000 * 30, // 30 seconds
	stale: true,
	load: function (_, cb) { // ignore the key, cause it's always needs to be true
		console.log('Getting the raw mempool');
		client.getRawMemPool(true, function(err, mempool) {
			cb(null, mempool);
		});
	}
});

function refresher() {
	rawMemPoolCache.get(true, () => {
		setTimeout(refresher, 60 * 1000);
	});
}
refresher();



// returns in processed form...
exports.getRawMemPool = () => {
	return new Promise((resolve, reject) => {
		rawMemPoolCache.get(true, function(err, mempool) {
			if (err)
				return reject(err);

			resolve(mempool)
		})
	});
};




exports.getMemPoolDescendants = (txid) => {

	return new Promise((resolve, reject) => {

		console.log('Getting getMemPoolDescendants of ', txid);

		client.cmd('getmempooldescendants', txid, true, (err, transactions) => {

			if (err)
				return reject(err);


			resolve(transactions);
		})
	});

};

exports.getMemPoolAncestors = (txid) => {

	return new Promise((resolve, reject) => {

		console.log('Getting getMemPoolAncestors of ', txid);
		client.cmd('getmempoolancestors', txid, true, (err, transactions) => {

			if (err)
				return reject(err);

			resolve(transactions);
		})
	});
};


exports.getMemPoolEntry = (txid) => {
	return new Promise((resolve, reject) => {

		console.log('Getting mempoolentry for: ', txid);

		client.cmd('getmempoolentry', txid, (err, transaction) => {
			if (err)
				return reject(err);

			resolve(transaction);
		})
	});
};


function* getTransactionCluster(pool, searchAncestors, searchDescendants, txid) {

	let ancestors = {};
	let descendants = {};


	if (searchAncestors) { // searchAncestors
		ancestors = yield exports.getMemPoolAncestors(txid);
		for (const ancestorTxid of Object.keys(ancestors)) {

			if (pool.hasOwnProperty(ancestorTxid)) {
				//console.log('Skipping: ', ancestorTxid, ' as we already got it');
				continue;
			}

			//console.log('Adding: ', ancestorTxid, ' to pool');
			pool[ancestorTxid] = ancestors[ancestorTxid];


			const preSize = Object.keys(ancestors).length;
			yield getTransactionCluster(pool, false, true, ancestorTxid);
			const postSize = Object.keys(ancestors).length;

			if (!searchAncestors && preSize !== postSize) {
				throw new Error("we shouldnt have been searching ancestors, but we sizes dont match" + preSize + ", " + postSize);
			}
		}
	}


	if (searchDescendants) { // searchDescendants

		descendants = yield exports.getMemPoolDescendants(txid);
		for (const descendantTxid of Object.keys(descendants)) {

			if (pool.hasOwnProperty(descendantTxid)) {
				//console.log('Skipping: ', descendantTxid, ' as we already got it');
				continue;
			}

			console.log('Adding: ', descendantTxid, ' to pool');
			pool[descendantTxid] = descendants[descendantTxid];

			const preSize = Object.keys(descendants).length;
			yield getTransactionCluster(pool, true, false, descendantTxid);
			const postSize = Object.keys(descendants).length;

			if (!searchDescendants && preSize !== postSize) {
				throw new Error("we shouldnt have been searching descendants, but we sizes dont match" + preSize + ", " + postSize);
			}
		}
	}

	return {
		ancestors,
		descendants
	};


}





exports.getTransactionCluster = function*(txid) {
	let transaction;

	try {
		transaction = yield exports.getMemPoolEntry(txid);
	} catch (ex) {
		if (ex.message == 'Transaction not in mempool') {
			ex.status = 404;
		}
		throw ex;
	}


	const cluster = {};
	cluster[txid] = transaction;

	const { ancestors, descendants } = yield getTransactionCluster(cluster, true, true, txid);

	return {
		cluster,
		ancestors,
		descendants
	};


};