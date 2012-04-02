/*
    Copyright (C) 2012 Oleg Kertanov <okertanov@gmail.com>
    All rights reserved.
*/

(function(phantom)
{

// Modules
var fs      = require('fs');
var system  = require('system');
var webpage = require('webpage');


// Defines
const   UA  = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_7_3) AppleWebKit/535.20 (KHTML, like Gecko) Chrome/19.0.1036.7 Safari/535.20';

const   logPrefix   = '\tCrawler: ',
        errorPrefix = '>>> Runtime error: ';

const   LOG = function() { console.log.apply(console, Array.prototype.slice.call(arguments));   },
        ERR = function() { console.error.apply(console, Array.prototype.slice.call(arguments)); };

// Functions
function Configure(phantom)
{
    phantom.libraryPath = './modules';
    var rc = phantom.injectJs('phantom-inject.js');
    if ( !rc )
        throw 'phantom.injectJs failed.';
}

function Normalize(url)
{
    if ( 0 > url.indexOf('://') )
    {
        url = 'http://' + url;
    }

    return url;
}

function Terminate(code)
{
    // Terminate PhantomJS
    phantom.exit(code);
}

function Stop(input, output, before, after)
{
}

function Start(input, output, before, after)
{
    // Notify on parameters used
    LOG(logPrefix + 'Processing links from: ' + '"' + input + '"' +
                    ', to: ' + '"' + output + '"');

    if ( !fs.exists(input) && !fs.isFile(input) )
        throw 'Can\'t open for read ' + input;

    var istream = fs.open(input, 'r');
    var ostream = fs.open(output, 'w');

    if ( !fs.exists(output) && !fs.isFile(output) )
        throw 'Can\'t open for write ' + output;

    if (before) before();

    // Number of workers
    Start.workers = 4;

    // Reset state
    Process.counter = 0;
    Next.finished = 0;

    // Fork workers
    for (var i=0; i < Start.workers ;i++)
    {
        Next(i, istream, ostream, after);
    }
}

function Next(id, istream, ostream, after)
{
    var line = null;
    if ( line = istream.readLine() )
    {
        if ( line.length )
        {
            setTimeout(function () {
                Process(line, function(){ Next(id, istream, ostream, after); });
            }, 20); // 20 msec
        }
    }
    else
    {
        LOG(logPrefix + 'Worker: ' + id + ' reached the end of list.');

        // Increment finished pool
        Next.finished += 1;

        // Wait when all workers are done
        if ( Next.finished >= Start.workers && typeof Next.timeout == 'undefined' )
        {
            LOG(logPrefix + 'Worker: ' + id + ' Scheduling finalization...');

            // Delayed Finalization
            Next.timeout = setTimeout(function () {
                // Gracefully close all handles
                istream.close();
                ostream.flush();
                ostream.close();

                // Notify finish
                if (after) after();

                // Exit
                Terminate(0);
            }, 1000); // 1 sec
        }
    }
}

function Process(url, next)
{
    try
    {
        var page = webpage.create();
        page.settings.userAgent = UA;
        page.viewportSize = { width: 800, height: 600 };

        var OnError = function(msg, trace)
        {
        };

        var OnTimeout = function()
        {
            OnFinished.call(page, 'timeout');
        };

        var OnFinished = function(status) {
            // Reset timeout timer
            clearTimeout(page.timeout);

            // Increment overall operation counter
            Process.counter += 1;

            // Is succeeded
            if ( status == 'success' )
            {
                var name = 'images/' + /\w+\.\w+/.exec(url) + '-' + (+new Date()) + '.png';
                //page.render(name);
                LOG('\t' + Process.counter +'\t' + 'OK ' + url);
            }
            else
            {
                LOG('\t' + Process.counter +'\t' + status + ' ' + url);
            }

            /*page.release();
            page = null;*/

            next();
        };

        page.timeout = setTimeout(OnTimeout, 5000);
        page.onError = OnError;
        page.onLoadFinished = OnFinished;
        page.open(Normalize(url));
    }
    catch(e)
    {
        ERR('>>> Processing exception: ' + url + ' with ' + e);
    }
}

function Arguments(phantom, system)
{
    var files = { script: '', input: '', output: ''};

    if ( phantom.args.length <= 1 )
    {
        throw ('No arguments provided. Please read the README.md file.');
    }
    else if ( phantom.args.length > 2 )
    {
        throw ('Wrong arguments provided. Please read the README.md file.');
    }
    else
    {
        files = { script: system.args[0], input: system.args[1], output: system.args[2]};

        if ( !files.script || !files.input || !files.output )
        {
            throw ('Arguments couldn\'t be empty. Please read the README.md file.');
        }
    }

    return files;
}

function Main()
{
    // Now time
    start = new Date();

    // Prologue
    var Before = function()
    {
        LOG(logPrefix + 'starting at: ' + start);
    }

    // Epilogue
    var After = function()
    {
        var end = new Date();
        var diff = Math.ceil((end.getTime() - start.getTime()) / 1000 / 60);
        LOG(logPrefix + 'done at: ' + end + ' tooks ' + diff + ' min.');
    }

    try
    {
        // Parse script arguments
        var files = Arguments(phantom, system);

        // Preconfigure global state
        // Configure(phantom);

        // Start the Crawler asyncroniously
        Start(files.input, files.output, function(){ Before() }, function(){ After() });
    }
    catch(e)
    {
        ERR(errorPrefix + e);
        Terminate(1);
    }
}

// Run
Main();

})(phantom);

