
const correctArrayFrom = Array.from;
const SortedSet = require("collections/sorted-set");
Array.from = correctArrayFrom;


module.exports = (mempool) => {

	const pool = new Map(); // txid -> transaction

	for (const entry of Object.entries(mempool)) {
		const txid = entry[0];
		const t = entry[1];
		const transaction = new Transaction(txid, Math.round(t.fee * 1e8), t.size, t.depends, []);
		pool.set(txid, transaction);
	}



	// Find all ones without depends, and set the dependants
	let s = new SortedSet([]);

	for (const entry of pool) {
		const transaction = entry[1];

		for (const dependsTxid of transaction.depends) {
			const dependsTx = pool.get(dependsTxid);
			if (!dependsTx) {
				console.error("Could not find transaction: ", dependsTxid, " that was required by ", transaction);
				continue;
			}

			dependsTx.dependants.push(transaction.txid);
		}

		if (transaction.depends.length == 0) {
			s.push(transaction);
		}
	}


	let res = [];
	while (s.length != 0) {
		const n = s.pop();
		res.push(n);

		for (const txid of n.dependants) {
			const m = pool.get(txid);

			const deleted  = m.depends.delete(n.txid);
			if (deleted && m.depends.size === 0) {
				s.push(m);
			}
		}

	}



	return res;
};


class Transaction {

	// depends is a [string] of txids
	constructor(txid, fee, size, depends, dependants) {
		this.txid = txid;
		this.fee = fee;
		this.size = size;
		this.depends = new Set(depends);
		this.dependants = dependants;
	}

	feeRate() {
		return this.fee / this.size;
	}

	equals(other) {
		return this.txid == other.size;
	}

	compare(other) {
		let f = this.feeRate() - other.feeRate();
		if (f != 0) return f;

		let s = this.size - other.size;
		if (s != 0) return s; // put small ones first

		return this.txid.localeCompare(other.txid);
	}

}