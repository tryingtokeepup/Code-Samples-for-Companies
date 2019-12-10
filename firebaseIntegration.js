// FIREBASE //
const admin = require('firebase-admin');
const request = require('request');

const serviceAccount = require('../../../serviceAccountKey.json');
const { fetchMap, fetchToken } = require('../../helpers/cryptocompare');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'fakeUrl.com'
});

const documentLoc = 'tokens';

const firebaseDB = admin.database();

const startTokenCaching = async () => {
  console.log('Beginning token cache service');
  const tokenLookupInterval = 1000 * 60 * 60 * 12; // 12 hours
  console.log('Beginning initialization of token cache.');

  console.log('Writing fake feed and fake getter infomation!');
  Promise.all(await fetchMap()).then(data => {
    writeFirebaseTokens(data).catch(error => console.error(error));
  });
  console.log('Finished initialization of token cache.');
  console.log(
    'Service should rest for ' + tokenLookupInterval / 1000 / 60 + ' minutes'
  );

  setInterval(async () => {
    console.log('Beginning token update process');
    Promise.all(await fetchMap()).then(data => {
      console.log('Token fetching completed, writing to db now');
      writeFirebaseTokens(data);
      console.log('Token writing to db completed');
    });
  }, tokenLookupInterval);
};

const readFirebaseTokens = () => {
  console.log('does this fire?');
  return firebaseDB.ref(documentLoc).once('value', data => {
    return data;
  });
};

// const readFirebaseFeed = () => {
//   return firebaseDB.ref('fakeFeed').once('value', data => {
//     return data;
//   });
//};

const writeFirebaseTokens = data => {
  return firebaseDB
    .ref(documentLoc)
    .set(JSON.parse(JSON.stringify(data)))
    .catch(error => console.error(error));
};

module.exports = { readFirebaseTokens, startTokenCaching };
