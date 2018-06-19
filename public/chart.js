var cumSize = 0;
window.getrawmempool = window.getrawmempool.map(tx => {
	var fee = tx[1];
	var size = tx[2];
	var r = { txid: tx[0], fee: fee, size: size, x: cumSize, y: fee / size };
	cumSize += tx[2];
	return r;
});


function onSubmit(e) {
	e.preventDefault();

	var txid = document.getElementById("txlocator").value;

	if (/^#[0-9A-F]{64}$/i.test(txid)) {
		document.getElementById("search-error").innerText = 'Not a valid transaction id in hex format';
		return;
	}

	window.location = '/mempool-transaction/' + txid;
}
document.getElementById("searchForm").addEventListener("submit", onSubmit, false);



window.chart = Highcharts.chart('chart', {
	chart: {
		type: 'scatter',
		zoomType: 'xy',
		style: {
			fontFamily: 'Proxima-Nova-Regular'
		}
	},
	title: {
		text: 'Bitcoin Memory Pool (current unconfirmed transactions)',
		style: {
			fontFamily: 'Proxima-Nova-Bold',
			fontSize: '2.2rem'
		}
	},
	xAxis: {
		title: {
			text: 'Cumulative Size'
		},
		plotLines: [{
			color: 'black',
			dashStyle: 'dot',
			width: 2,
			value: 1e6 - 200,
			label: {
				y: 15,
				style: {
					fontStyle: 'italic'
				},
				text: '1 block'
			},
			zIndex: 3
		}]
	},
	yAxis: {
		type: 'logarithmic',
		endOnTick: false,
		title: {
			text: 'Fee Rate'
		},
		labels: {
			format: '{value} sat/byte'
		}
	},
	legend: {
		enabled: false,
	},
	credits: {
		enabled: false,
	},
	plotOptions: {
		scatter: {
			allowPointSelect: true,
			marker: {
				radius: 6,
				states: {
					hover: {
						enabled: true,
						lineColor: 'rgb(100,100,100)',
					},
					select: {
						radius: 10,
						lineWidth: 5
					}
				}
			}
		}
	},
	tooltip: {
		formatter: function () {
			return '<b>' + this.point.txid + '</b><br>'+
				+ this.point.size + ' bytes, paying ' + this.point.fee + ' satoshis<br>' +
					 '<b>' + this.point.y.toFixed(2) + ' sat/byte</b>'
				;
		}
	},
	series: [{
		turboThreshold: 500000,
		name: 'Pending Transaction',
		color: 'rgba(223, 83, 83, .2)',
		data: window.getrawmempool,
		point: {
			events: {
				click: function () {
					window.location = '/mempool-transaction/' + this.txid;
				}
			}
		}
	}]
});


function showRecommend(n, amount) {
	window.chart.yAxis[0].removePlotLine('fee-recommendation');
	chart.yAxis[0].addPlotLine(
		{
			id: 'fee-recommendation',
			color: 'blue',
			dashStyle: 'dash',
			width: 2,
			value: amount,
			label: {
				align: 'right',
					style: {
					fontStyle: 'italic'
				},
				text: 'Recommendation for ≤ ' + n + ' confs (' + amount  + ' sat/byte)',
			},
		}
	)
}