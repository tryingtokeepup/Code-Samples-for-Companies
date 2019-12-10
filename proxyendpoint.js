/////============ DEPENDENCIES ============/////

const express = require('express');
const router = express.Router();
const request = require('request');
const {
  readFirebaseTokens,
  readFirebaseFeed,
  startTokenCaching
} = require('../core/firebase/firebase');

const extraTokenInfo = require('../helpers/modifiedTokensEth.json');
/////============ BASE ADDRESSES ==========/////////

const CRYPTOCOMPARE_BASE_ADDRESS = 'https://www.cryptocompare.com/api/data/';
const CRYPTOCOMPARE_ORIGINAL_ADDRESS =
  'https://min-api.cryptocompare.com/data/';

const ETHPLORER_ADDRESS = 'https://api.ethplorer.io';
const COINAPI_ADDRESS = 'https://api.coincap.io/v2/assets/';
const alt_key = 'fakeKey';
const alt_key2 = 'fakeKey';
/////============ ENDPOINTS ==========/////

// We need to better secure this backend and store the API keys inside a .env file.
// Also, we should probably pass the API keys in the header, instead of a query.
// Pagination is also something we should look into.
// We are still passing most information as arrays instead of objects. This is done
// for convinience for the Android team, but we should start moving to objects and
// converting them to arrays on the fly to better speed up caching and retrieval.
// Pagination does not exist, and I'm not sure how to implement this
// There is no security on the Firebase database + we should love to the Firestore ASAP
// Code is everywhere and messy, with many different implementation of similar code
// Need to prune unused functions and systems.
// NO DOCUMENTATION -> look into basic docs for README, and Postman documentation generation.

//====== SANITY CHECK =======//
router.get('/', (req, res) => {
  res.send(
    'this is our token info endpoint: add "all" to the address to get the token information!'
  );
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
async function fetchBalances(address) {
  return easyGet(
    ETHPLORER_ADDRESS +
      '/getAddressInfo/' +
      address +
      '?apiKey=fakeKey&showETHTotals=true'
  );
}

// async function fetchFullData(symbol, tsyms) {
//   return easyGet(
//     CRYPTOCOMPARE_ORIGINAL_ADDRESS +
//       'pricemultifull?fsyms=' +
//       symbol +
//       '&tsyms=' +
//       tsyms +
//       '&api_key=fakeKey'
//   );
// }

async function fetchArticles() {
  return easyGet(
    'https://newsapi.org/v2/everything?q=ethereum&sortBy=publishedAt&apiKey=fa5bd2049a954b5789821867b3950bcd'
  );
}

async function fetchFullData(id) {
  return easyGet(COINAPI_ADDRESS + id + '/');
}

async function fetchAllTokens() {
  return easyGet(COINAPI_ADDRESS + '?limit=2000');
}

async function fetchDetailedInterval(id, interval, start, end) {
  //example URI for 1 hour = api.coincap.io/v2/assets/ethereum/history?interval=m1&start=1570493630953&end=1570497230953

  return easyGet(
    COINAPI_ADDRESS +
      id +
      '/history?interval=' +
      interval +
      '&start=' +
      start +
      '&end=' +
      end
  );
}

async function fetchDetailedTokenInfo(tokenToSearch) {
  try {
    const tokens = await readFirebaseTokens();
    const isoInformation = tokens.val().filter(token => {
      return tokenToSearch.includes(token.token);
    });

    const allowed = [
      'WeekPriceChart',
      'description',
      'name',
      'success',
      'token',
      'currentPrices'
    ];
    //console.log(isoInformation[0]);
    let filtered = Object.keys(isoInformation[0])
      .filter(key => allowed.includes(key))
      .reduce((obj, key) => {
        return {
          ...obj,
          [key]: isoInformation[0][key]
        };
      }, {});
    const tokenISO = filtered.token;

    const tokenID = filtered.name.replace(/\s+/g, '-').toLowerCase();
    console.log(tokenID);
    const fullData = await fetchFullData(tokenID);
    // Use Date.now() to get current date

    let date = new Date().getTime();
    //console.log('END VALUE:', date);

    Date.prototype.addHours = function(h) {
      this.setTime(this.getTime() - h * 60 * 60 * 1000);
      return this;
    };

    let date1Hr = new Date().addHours(1).getTime();
    let date1Day = new Date().addHours(24).getTime();
    let date1Week = new Date().addHours(168).getTime();
    // ASSUMPTION = 1 month is 31 days!!!
    let date1Month = new Date().addHours(744).getTime();

    let date1Year = new Date().addHours(8760).getTime();
    //console.log('START VALUE:', date1Hr);

    const token1HrData = await fetchDetailedInterval(
      tokenID,
      'm1',
      date1Hr,
      date
    );
    const token1DayData = await fetchDetailedInterval(
      tokenID,
      'h1',
      date1Day,
      date
    );

    const token1WeekData = await fetchDetailedInterval(
      tokenID,
      'd1',
      date1Week,
      date
    );
    const token1MonthData = await fetchDetailedInterval(
      tokenID,
      'd1',
      date1Month,
      date
    );
    const token1YearData = await fetchDetailedInterval(
      tokenID,
      'd1',
      date1Year,
      date
    );
    //console.log(token1YearData);
    //console.log(tokenToSearch);
    // for some reason, extraTokenInfo.tokenToSearch goes undefined, but putting brackets works...
    //console.log(extraTokenInfo[tokenToSearch].address);

    filtered = {
      FinancialInfo: {
        currentPriceUSD: fullData.data.priceUsd,
        marketCap: fullData.data.marketCapUsd,
        supply: fullData.data.supply,
        volumeUSD24hr: fullData.data.volumeUsd24hr,
        changePercent24hr: fullData.data.changePercent24Hr
      },
      PriceHistory: {
        OneHrDataPoints: token1HrData.data,
        OneDayDataPoints: token1DayData.data,
        OneWeekDataPoints: token1WeekData.data,
        OneMonthDataPoints: token1MonthData.data,
        OneYearDataPoints: token1YearData.data
      },
      tokenAddress: extraTokenInfo[tokenToSearch].address,
      tokenDecimals: extraTokenInfo[tokenToSearch].decimals,
      ...filtered
    };
    console.log(filtered);
    return filtered;
  } catch (error) {
    console.log(error);
  }
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
    console.log(tokenNameArray);
    const isoInformation = firebaseTokenData.val().filter(token => {
      return tokenNameArray.includes(token.token);
    });
    //console.log(isoInformation);

    const updatedIsoInfo = isoInformation.map(token => {
      for (i = 0; i < balanceData['tokens'].length + 1; i++) {
        if (token.token === balanceData['tokens'][i].tokenInfo.symbol) {
          //console.log(balanceData['tokens'][i]);
          token = {
            ...token,
            AmountHeld:
              balanceData['tokens'][i].balance /
              10 ** Number(balanceData['tokens'][i].tokenInfo.decimals),
            TokenDecimals: balanceData['tokens'][i].tokenInfo.decimals
          };
          //console.log(token);
          return token;
        }
        if (token.token === 'ETH') {
          //console.log(token);
          token = {
            ...token,
            AmountHeld: balanceData['ETH'].balance,
            TokenDecimals: balanceData['ETH'].decimals
          };
          return token;
        }
      }
    });
    console.log(updatedIsoInfo);
    return updatedIsoInfo;
  } catch (error) {
    console.log(error);
  }
}
async function fetchFeedData() {
  const firebaseTokenData = await readFirebaseTokens();

  const tokenData = await fetchAllTokens();
  const articles = await fetchArticles();
  console.log(articles);
  let tokenNameArray = [];
  firebaseTokenData.val().forEach(function(item) {
    tokenNameArray.push(item.token);
  });

  //const fireBaseSearchInfo = firebaseTokenData.val();
  // this resource holds 622 out of the 700 or so tokens; for now, we will go with this.
  const truncatedTokenInformation = tokenData.data.filter(token => {
    if (tokenNameArray.includes(token.symbol)) {
      return tokenNameArray.includes(token.symbol);
    }
  });
  let tokenInfoPercentChange = [...truncatedTokenInformation];
  let tokenInfoPopularInvestments = [...truncatedTokenInformation];
  tokenInfoPercentChange.sort((a, b) =>
    a.changePercent24Hr < b.changePercent24Hr ? 1 : -1
  );

  tokenInfoPopularInvestments.sort((a, b) =>
    a.volumeUsd24Hr < b.volumeUsd24Hr ? 1 : -1
  );

  let monolith = {
    MarketCapBig: truncatedTokenInformation.slice(0, 4),
    MarketCapSmall: truncatedTokenInformation.slice(-4, -1),
    BiggestWinners: tokenInfoPercentChange.slice(0, 4),
    BiggestLosers: tokenInfoPercentChange.slice(-4, -1),
    PopularInvestments: tokenInfoPopularInvestments.slice(0, 4),
    articles: articles.articles
  };
  return monolith;
}

//===== ISO INFO =====//

router.get('/tokens', async function(req, res) {
  const tokens = await readFirebaseTokens();
  res.status(200).json(tokens.val());
});

router.get('/feedGetter', async function(req, res) {
  const feed = await fetchFeedData();
  res.status(200).json(feed);
});

router.get('/getBalance', async function(req, res) {
  var address = req.query.address;
  await fetchBalanceAndTokenInfo(address)
    .then(data => {
      if (data) {
        res.status(200).json(data);
      } else {
        res.status(204).send();
      }
    })
    .catch(error => res.status(204).send());
});

// for some reason, this is firing regardless of where it is put in the code; need to investigate.
router.get('/detailedToken', async function(req, res) {
  var iso = req.query.iso;

  //console.log(iso); //ETH

  const truncatedData = await fetchDetailedTokenInfo(iso);

  res.status(200).json(truncatedData);
});

// router.get('/feed', async function(req, res)) {

//   https://newsapi.org/v2/everything?q=ethereum&sortBy=publishedAt&apiKey=fa5bd2049a954b5789821867b3950bcd

// };
//fetchDetailedTokenInfo('ETH');
module.exports = router;
