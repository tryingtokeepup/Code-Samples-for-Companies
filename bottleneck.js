const Bottleneck = require('bottleneck');

const querystring = require('querystring');
const request = require('request');
const { supported_isos, test_supported_isos } = require('./supported');
const CRYPTOCOMPARE_MIN_ADDRESS = 'https://min-api.cryptocompare.com/data/';

const CRYPTOCOMPARE_BASE_ADDRESS = 'https://www.cryptocompare.com/api/data/';
const alt_key = 'fakeKey';
const alt_key2 = 'fakeKey';
const ETHPLORER_ADDRESS = 'https://api.ethplorer.io';
const { readFirebaseTokens } = require('../core/firebase/firebase');
/////============ HELPERS ==========/////
const token_descriptions = require('./tokenDescriptions');
const token_names = require('./tokenNames');
const limiter = new Bottleneck({
  maxConcurrent: 20,
  minTime: 20
});

function easyGet(url, callback) {
  return new Promise((resolve, reject) => {
    request(url, function(error, response, body) {
      if (error) {
        return reject(error);
      } else {
        return resolve(JSON.parse(body));
      }
    });
  });
}
// function easyGet2(url, callback) {
//   request(url, function(error, response, body) {
//     callback(error, JSON.parse(body));
//   });
// }

function easyPost(url, data, callback) {
  request(
    {
      url: url,
      method: 'POST',
      headers: {
        'content-type': 'text/plain'
      },
      body: data
    },
    function(error, response, body) {
      callback(error, body);
    }
  );
}
async function fetchPrices(symbol, tsyms, apiKey) {
  return easyGet(
    CRYPTOCOMPARE_MIN_ADDRESS +
      'price?fsym=' +
      symbol +
      '&tsyms=' +
      tsyms +
      '&api_key=' +
      apiKey
  );
}
// AWS cache endpoint uses 'histoday?fsym='
// Normal endpoint uses 'v2/histoday?fsym='
async function fetchHistorical(symbol, apiKey) {
  return easyGet(
    CRYPTOCOMPARE_MIN_ADDRESS +
      'v2/histoday?fsym=' +
      symbol +
      '&tsym=' +
      'USD' +
      '&limit=365' +
      '&api_key=' +
      apiKey
  );
}

async function fetchNames(symbol, tsyms, apiKey) {
  return easyGet(
    CRYPTOCOMPARE_MIN_ADDRESS +
      'price?fsym=' +
      symbol +
      '&tsyms=' +
      tsyms +
      '&api_key=' +
      apiKey
  );
}

async function fetchToken(iso) {
  var apiKey = alt_key2;
  var tsyms = ['USD', 'ETH', 'EUR', 'CNY', 'GBP'];

  try {
    let price = await fetchPrices(iso, tsyms, apiKey);
    let historical = await fetchHistorical(iso, apiKey);
    const isInfinity = numberToCheck => {
      if (numberToCheck === Infinity) {
        return 0;
      }
      return numberToCheck;
    };

    let percent_change = {
      '24hChange': isInfinity(
        ((Object.values(price)[0] - historical.Data[1]['close']) /
          historical.Data[1]['close']) *
          100
      ),
      '1wChange': isInfinity(
        (Object.values(price)[0] - historical.Data[7]['close']) /
          historical.Data[7]['close']
      ),
      '1mChange': isInfinity(
        (Object.values(price)[0] - historical.Data[31]['close']) /
          historical.Data[31]['close']
      )
    };
    // THIS NEEDS TO HAVE EURO DATA, CNY, GBP // foreign currenices
    let monolith_object = {
      [iso]: {
        success: true,
        USD: Object.values(price)[0],
        ETH: Object.values(price)[1],
        EUR: Object.values(price)[2],
        CNY: Object.values(price)[3],
        GBP: Object.values(price)[4],
        '1DayAgo': historical.Data[1],
        '2DaysAgo': historical.Data[2],
        '3DaysAgo': historical.Data[3],
        '4DaysAgo': historical.Data[4],
        '5DaysAgo': historical.Data[5],
        '6DaysAgo': historical.Data[6],
        '7DaysAgo': historical.Data[7],
        '1MonthAgo': historical.Data[31],
        '1MonthAgo': historical.Data[365],
        '24hChange': percent_change['24hChange'],
        '1wChange': percent_change['1wChange'],
        '1mChange': percent_change['1mChange'],
        description: token_descriptions[iso] || 'Unknown'
      }
    };

    return monolith_object;
  } catch (error) {
    console.log(error);
    return {
      token: iso,
      success: false,
      errorMessage: 'Token information not found.'
    };
  }
}

async function fetchMap() {
  //var fsyms = ['ETH', 'BAT', 'AURA', 'AUTO', 'AVA', 'AVT', 'AXPR']; /// THIS IS FROM
  //var fsyms = test_supported_isos;
  var fsyms = supported_isos;
  // var apiKey =
  //   'e164eb3c37b78d95c8f8b054fb5225f9b40f1529788e2bd3ba5666a556e56263';
  var apiKey = alt_key2;

  var tsyms = ['USD', 'ETH', 'EUR', 'CNY', 'GBP'];

  let results = fsyms.map(async fsym => {
    try {
      let price = await limiter.schedule(() =>
        fetchPrices(fsym, tsyms, apiKey)
      );
      let historical = await limiter.schedule(() =>
        fetchHistorical(fsym, apiKey)
      );
      //console.log(historical);
      // let price = await fetchPrices(fsym, tsyms, apiKey);
      // let historical = await fetchHistorical(fsym, apiKey);
      //console.log(historical.Data.Data[1]);
      let percent_change = {
        '24hChange':
          ((Object.values(price)[0] - historical.Data.Data[1]['close']) /
            historical.Data.Data[1]['close']) *
          100,
        '1wChange':
          (Object.values(price)[0] - historical.Data.Data[7]['close']) /
          historical.Data.Data[7]['close'],
        '1mChange':
          (Object.values(price)[0] - historical.Data.Data[31]['close']) /
          historical.Data.Data[31]['close']
      };

      let monolith_object = {
        token: fsym,
        name: token_names[fsym].name || 'Unknown',
        success: true,
        currentPrices: {
          USD: Object.values(price)[0],
          ETH: Object.values(price)[1],
          EUR: Object.values(price)[2],
          CNY: Object.values(price)[3],
          GBP: Object.values(price)[4]
        },

        WeekPriceChart: [
          historical.Data.Data[1]['close'],
          historical.Data.Data[2]['close'],
          historical.Data.Data[3]['close'],
          historical.Data.Data[4]['close'],
          historical.Data.Data[5]['close'],
          historical.Data.Data[6]['close'],
          historical.Data.Data[7]['close']
        ],

        '1MonthAgo': historical.Data.Data[31]['close'],
        '1YearAgo': historical.Data.Data[365]['close'],
        '24hChange': percent_change['24hChange'],
        '1wChange': percent_change['1wChange'],
        '1mChange': percent_change['1mChange'],
        description: token_descriptions[fsym] || 'Unknown'
      };
      //console.log(monolith_object);
      return monolith_object;
    } catch (error) {
      //console.log(error);
      return {
        token: fsym,
        success: false,
        errorMessage: 'Token information not found.'
      };
    }
  });
  const arrayToObject = (array, keyField) =>
    array.reduce((obj, item) => {
      obj[item[keyField]] = item;
      return obj;
    }, {});

  const resultsObject = arrayToObject(results, 'token');
  //console.log(resultsObject);
  //return resultsObject;
  return results;
}

async function fetchBalances(address) {
  return easyGet(
    ETHPLORER_ADDRESS + '/getAddressInfo/' + address + '?apiKey=fakeKey=True'
  );
}

async function fetchBalanceAndTokenInfo(address) {
  try {
    let balanceData = await fetchBalances(address);
    const firebaseTokenData = await readFirebaseTokens();
    let tokenNameArray = [];
    balanceData['tokens'].forEach(tokenToAdd => {
      tokenNameArray.push(tokenToAdd.tokenInfo.symbol);
    });
    // ETH is a weird token; need to push it manually
    tokenNameArray.push('ETH');
    const isoInformation = firebaseTokenData.val().filter(token => {
      return tokenNameArray.includes(token.token);
    });
    //console.log(isoInformation);

    const updatedIsoInfo = isoInformation.map(token => {
      for (i = 0; i < balanceData['tokens'].length + 1; i++) {
        if (token.token === balanceData['tokens'][i].tokenInfo.symbol) {
          //console.log(balanceData['tokens'][i]);
          token = { ...token, balance: balanceData['tokens'][i].balance };
          //console.log(token);
          return token;
        }
        if (token.token === 'ETH') {
          //console.log(token);
          token = { ...token, balance: balanceData['ETH'].balance };
          return token;
        }
      }
    });
    console.log(updatedIsoInfo);
    return updatedIsoInfo;
  } catch (error) {
    return {
      address: address,
      success: false,
      errorMessage: 'Address not found'
    };
  }
}

// let address = '0xbA46695289F0835d73658CB7DE23dbf24667E0BE';
// fetchBalanceAndTokenInfo(address);
// //detailedToken();

module.exports = {
  fetchMap,
  fetchToken,
  fetchBalanceAndTokenInfo
};
