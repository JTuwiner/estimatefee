// temp file



module.exports = (mempool) => {

	const pool = new Map();

	for (const entry of Object.entries(mempool)) {
		const txid = entry[0];
		const t = entry[1];
		const transaction = new Transaction(txid, Math.round(t.fee * 1e8), t.size, t.ancestorsize, Math.round(t.ancestorfees * 1e8), t.depends);

		pool.set(txid, transaction);
	}

	const transactions = Array.from(pool.values());
	const clusters = expandTransactions(transactions, pool);



	clusters.sort((a,b) => a.count() < b.count() ? 1 : -1);



	return clusters[0];
};


class Transaction {

	// depends is a [string] of txids
	constructor(txid, fee, size, ancestorSize, ancestorFees, depends) {
		this.txid = txid;
		this.fee = fee;
		this.size = size;
		this.ancestorSize = ancestorSize;
		this.ancestorFees = ancestorFees;
		this.depends = depends;
	}

	feeRate() {
		return this.fee / this.size;
	}

}

class TransactionCluster {
	constructor(transactions) {
		this.transactions = transactions;
	}

	size() {
		let sum = 0;
		for (let transaction of this.transactions) {
			sum += transaction.size;
		}
		return sum;
	}

	fee() {
		let sum = 0;
		for (let transaction of this.transactions) {
			sum += transaction.fee;
		}
		return sum;
	}

	feeRate() {
		return this.fee() / this.size();
	}

	// takes a function f, and removes all transactions that don't match it
	retain(f) {
		let newTransactions = [];
		for (const transaction of this.transactions) {
			if (f(transaction)) {
				newTransactions.push(transaction);
			}
		}
		this.transactions = newTransactions;
	}

	count() {
		return this.transactions.length;
	}

	isEmpty() {
		return this.transactions.length === 0;
	}
}

// transactions is an array of transactions, pool is what it looks up on
// returns ann arry of transaction clusters!
function expandTransactions(transactions, pool) {
	transactions.sort(sortByAncestoralFeeRate);

	let expanded = []; // transaction clusters
	let picked = new Set(); // which txids we've already picked

	for (const transaction of transactions) {
		let ancestors = expandTransaction(transaction, pool);

		ancestors.retain(transaction => {
			if (picked.has(transaction.txid)) return false;

			picked.add(transaction.txid);
			return true;
		});

		if (!ancestors.isEmpty()) { // Don't add empty clusters.
			expanded.push(ancestors);
		}

	}

	expanded.sort(sortByFeeRate); // TODO: I'm not convinced this is correct, due to soem dependency stuff

	return expanded;
}

// ancestor includes itself, this flattens!
// returns a transaction cluster
function expandTransaction(transaction, pool) {
	let deps = []; // array of transactions..
	for (const txid of transaction.depends) {
		const dep = pool.get(txid);
		if (!dep) {
			console.error('Could not find dependency: ', txid, ' to transaction ', transaction);
			continue;
		}
		deps.push(dep);
	}


	let expanded = expandTransactions(deps, pool);


	// now flatten
	let result = new TransactionCluster([]);

	for (const cluster of expanded) {
		for (const transaction of cluster.transactions) {
			result.transactions.push(transaction);
		}
	}

	result.transactions.push(transaction);
	return result;
}




// should put highest fee rate first
function sortByAncestoralFeeRate(a, b) { // for transactions
	const feeRateA = a.ancestorFees / a.ancestorSize;
	const feeRateB = b.ancestorFees / b.ancestorSize;

	if (feeRateA < feeRateB) return 1;
	if (feeRateB < feeRateA) return -1;
	return 0;
}

// should put highest fee rate first
function sortByFeeRate(a, b) { // a and b are transaction clusters
	const feeRateA = a.feeRate();
	const feeRateB = b.feeRate();

	if (feeRateA < feeRateB) return 1;
	if (feeRateB < feeRateA) return -1;
	return 0;

}