require("dotenv").config();
var koa = require("koa");
var nunjucks = require("koa-nunjucks-render");

var app = koa();

var router = require("koa-router")();

var bitcoinrpc = require("./src/bitcoinrpc");

const cloudflareIp = require("cloudflare-ip");

const coreProcessMempool = require("./src/core-process-mempool");
const unlimitedProcessMempool = require("./src/unlimited-process-mempool");
const biggestCluster = require("./src/biggest-cluster");

app.use(function*(next) {
  if (process.NODE_ENV !== "production") yield next;
  if (!this.get("x-forwarded-for")) return;
  const fwd = this.get("x-forwarded-for").split(",");
  if (fwd.length !== 2) return;
  if (!cloudflareIp(fwd[1])) return;
  yield next;
});

app.use(
  require("koa-static")("public", {
    gzip: false
  })
);

app.use(
  nunjucks("views", {
    ext: ".html",
    noCache: process.env.NODE_ENV !== "production",
    throwOnUndefined: true,
    filters: {
      json: function(str) {
        return JSON.stringify(str, null, 2);
      }
    }
  })
);

router.get("/", function*() {
  const range = [2, 4, 6, 12, 24, 48, 144, 504, 1008];

  let estimates = yield Promise.all(
    range.map(n =>
      bitcoinrpc
        .estimateFee(n)
        .then(amount => ({ n, amount: Math.round((amount * 1e8) / 1000) }))
    )
  );

  yield this.render("index", { btcToUsd: 8080, estimates });
});

// NOTE: Removed
// router.get("/about", function*() {
//   yield this.render("about", { title: "About" });
// });

// NOTE: Relocated to index.html
// router.get('/learn', function*() {
// 	yield this.render('learn', { title: 'Learn about Bitcoin Fees' })
// });

// NOTE: Relocated to index.html
// router.get("/api", function*() {
//   yield this.render("api", { title: "API" });
// });

// NOTE: Removed
// router.get("/core-vs-unlimited", function*() {
//   yield this.render("core-vs-unlimited", {
//     title: "Bitcoin Core vs Unlimited"
//   });
// });

router.get("/n/:n", function*(next) {
  const n = Number.parseInt(this.params.n);

  if (!Number.isFinite(n) || n < 2 || n > 1008) return yield* next;

  this.body = yield bitcoinrpc.estimateFee(n);
});

router.get("/getrawmempool", function*() {
  this.type = "application/javascript";

  const mempool = yield bitcoinrpc.getRawMemPool();

  const processed = coreProcessMempool(mempool);

  let res = [];
  let cumSize = 0;

  for (const tx of processed) {
    res.push([tx.txid, tx.fee, tx.size]);
    cumSize += tx.size;
    if (cumSize > 2e6) break;
  }

  this.body = "window.getrawmempool = " + JSON.stringify(res);
});

function trimMemPool(processed) {
  let res = [];
  let cumSize = 0;
  let cumFee = 0;

  for (const tx of processed) {
    if (cumSize + tx.size > 1e6) continue;
    cumSize += tx.size;
    cumFee += tx.fee / 1e8;
    res.push([cumSize, cumFee]);
  }

  return res;
}

// NOTE: core-vs-unlimited deprecated
// router.get("/getmempools", function*() {
//   this.type = "application/javascript";
//
//   const mempool = yield bitcoinrpc.getRawMemPool();
//
//   const processed = coreProcessMempool(mempool);
//   const coreProcessed = trimMemPool(processed);
//   const unlimitedProcessed = trimMemPool(unlimitedProcessMempool(mempool));
//
//   let rawRes = [];
//   let cumSize = 0;
//   for (const tx of processed) {
//     rawRes.push([tx.txid, tx.fee, tx.size]);
//     cumSize += tx.size;
//     if (cumSize > 2e6) break;
//   }
//
//   this.body = `window.getrawmempool = ${JSON.stringify(rawRes)};
// window.unlimitedmempool = ${JSON.stringify(unlimitedProcessed)};
// window.coremempool = ${JSON.stringify(coreProcessed)};`;
// });

router.get("/biggest-cluster", function*() {
  const mempool = yield bitcoinrpc.getRawMemPool();

  const cluster = biggestCluster(mempool);

  this.body = { cluster, clusterLength: cluster.count() };
});

router.get("/mempool-transaction/:txid", function*() {
  const {
    cluster,
    ancestors,
    descendants
  } = yield bitcoinrpc.getTransactionCluster(this.params.txid);
  const processed = coreProcessMempool(cluster);

  let transaction = null;

  const ancestorList = [];
  const descendantList = [];

  for (let p of processed) {
    p = {
      txid: p.txid,
      feeRate: p.fee / p.size,
      effectiveFeeRate: p.effectiveFeeRate
    };

    if (p.txid == this.params.txid) {
      transaction = p;
    }

    if (ancestors.hasOwnProperty(p.txid)) {
      ancestorList.push(p);
    }

    if (descendants.hasOwnProperty(p.txid)) {
      descendantList.push(p);
    }
  }

  const estimatedBlocks = yield Search(2, 1009, function*(n) {
    const nFeeRate = ((yield bitcoinrpc.estimateFeeProbably(n)) * 1e8) / 1000;
    const r = nFeeRate > 0 && transaction.effectiveFeeRate >= nFeeRate;
    console.log(
      "Need: ",
      nFeeRate,
      " for ",
      n,
      " blocks. Which is enough: ",
      r
    );
    return r;
  });

  transaction.estimatedBlocks = estimatedBlocks != 1009 ? estimatedBlocks : -1;

  yield this.render("mempool-transaction", {
    transaction,
    ancestorList,
    descendantList
  });
});

function* Search(min, max, f) {
  let i = min;
  let j = max;
  while (i < j) {
    let h = Math.floor(i + (j - i) / 2); // avoid overflow when computing h
    if (yield f(h)) {
      j = h;
    } else {
      i = h + 1;
    }
  }
  // i == j, f(i-1) == false, and f(j) (= f(i)) == true  =>  answer is i.
  return i;
}

app.use(router.routes()).use(router.allowedMethods());

const port = process.env.PORT || 3000;

app.listen(port, () => console.log("Listening on port: ", port));
