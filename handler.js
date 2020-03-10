'use strict';
let httpModule = require('http');
let httpsModule = require('https');
let AWS = require('aws-sdk');
const bucketNameGlob = 'playground-cache-bucket-dolb';

module.exports.getMarkets = (event, context, callback) => {
    let http = httpsModule;
    const params = {
        method: 'GET',
        port: 443,
        host: 'pro-api.coinmarketcap.com',
        path: '/v1/cryptocurrency/listings/latest?start=1&limit=5000&convert=USD',
        headers: {
            'X-CMC_PRO_API_KEY': '758dcf34-a0e2-47f6-aa2b-019d49b243a3',
            'Accept': 'application/json'
        }      
    };
    /*const params = {
        method: 'GET',
        port: 80,
        host: 'playlocal.test.pl',
        path: '/test.json',
        headers: {
            'X-CMC_PRO_API_KEY': '758dcf34-a0e2-47f6-aa2b-019d49b243a3',
            'Accept': 'application/json'
        }      
    };*/
    // Lokalny nginx do testów


    const req = http.request(params, (res) => {
        let resBody = '';
        res.on('data', (chunk) => resBody += Buffer.from(chunk).toString());
        res.on('end', () => {
            let bucketName = (event.Records && event.Records.length > 0)
                ? event.Records[0].s3.bucket.name
                : bucketNameGlob;
            let fullBody = JSON.parse(resBody);
            let errorCode = (fullBody.status || {}).error_code;
            let asyncCall = (errorCode === 0) //zapis i odczyt z cache wywołać można podmieniając 0 na innego inta
                ? saveLastApiResponse(fullBody, bucketName)
                : readCachedApiResponse(bucketName);
            asyncCall.then(asyncResponse(callback))
        })
    }).on('error', asyncFail(callback));

    req.end();
};

const asyncResponse = (callback) => (cachedBody) => {
    callback(null, {
        statusCode: (cachedBody.error) ? 502 : 200,
        headers: {
            'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify(cachedBody),                
    })
}

const asyncFail = (callback) => (err) => {
    callback(null, {
        statusCode: 502,
        headers: {
            'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({error: true, message: err.stack.toString()}),                
    })
}

const saveLastApiResponse = (data, bucketName) => {
    let s3 = new AWS.S3();
    let params = {
        Bucket : bucketName ,
        Key : 'markets/cache',
        Body : JSON.stringify(data)
    };
    return new Promise(function(resolve) {
        s3.putObject(params, function(err) {
            if (err) {
                resolve({error: true, message: err.stack.toString()});
            } else {
                let response = data;
                response.fromCache = false;
                resolve(response);
            }
        });
    });
}

const readCachedApiResponse = (bucketName) => {
    let s3 = new AWS.S3();
    let params = {
        Bucket : bucketName ,
        Key : 'markets/cache'
    };
    return new Promise(function(resolve) {
        s3.getObject(params, function(err, data) {
            if (err) {
                resolve({error: true, message: err.stack.toString()});
            } else {
                let objectData = data.Body.toString('utf-8');
                let response = JSON.parse(objectData);
                response.fromCache = true;
                resolve(response);
            }
        });
    });
}