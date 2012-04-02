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

const   DEF_WORKERS = 4;

// Functions
function Configure(phantom)
{
    phantom.libraryPath = './modules';
    var rc = phantom.injectJs('phantom-inject.js');
    if ( !rc )
        throw 'phantom.injectJs failed.';
}

function Start(input, output, before, after)
{
    // Notify on parameters used
    LOG(logPrefix + 'Processing links from: ' + '"' + input + '"' +
                    ', to: ' + '"' + output + '"');

    if ( !fs.exists(input) && !fs.isFile(input) )
        throw 'Can\'t open for read ' + input;

    // Context
    var context =
    {
        workers:  DEF_WORKERS,
        istream:  fs.open(input, 'r'),
        ostream:  fs.open(output, 'w'),
        before:   before,
        after:    after,
        counter:  0,
        finished: 0
    };

    if ( !fs.exists(output) && !fs.isFile(output) )
        throw 'Can\'t open for write ' + output;

    // Run the 1st aspect
    if (before) before();

    // Create workers
    for (var i=0; i < context.workers ;i++)
    {
        (new Worker(i+1, context)).Start();
    }
}

var Worker = function(id, ctx)
{
    function Normalize(url)
    {
        if ( 0 > url.indexOf('://') )
            return ('http://' + url);
    }

    return {
        id:   id,
        ctx:  ctx,
        Start: function()
        {
            LOG(logPrefix + 'Worker: ' + this.id + ' started.');

            return this.Next();
        },
        Next: function()
        {
            var line = this.ctx.istream.readLine();
            if ( line )
            {
                if ( line.length )
                {
                    setTimeout((function (obj) {
                        return function(){ obj.Process(line, obj, function(){ obj.Next(); }) };
                    })(this), 10);
                }
            }
            else
            {
                LOG(logPrefix + 'Worker: ' + this.id + ' reached the end of list.');

                // Increment finished pool
                this.ctx.finished += 1;

                // Wait when all workers are done
                if ( this.ctx.finished >= this.ctx.workers )
                {
                    LOG(logPrefix + 'Worker: ' + this.id + ' Scheduling finalization...');

                    // Gracefully close all handles
                    this.ctx.ostream.flush(), this.ctx.ostream.close(), this.ctx.istream.close();

                    // Notify finish
                    if (this.ctx.after) this.ctx.after();

                    // Exit
                    phantom.exit(0);
                }
            }

            return this;
        },
        Process: function(url, obj, next)
        {
            try
            {
                if ( typeof obj.page != 'undefined' && obj.page )
                {
                    obj.page.release(), obj.page = null;
                }

                obj.page = webpage.create();
                obj.page.settings.userAgent = UA;
                obj.page.viewportSize = { width: 800, height: 600 };

                var OnError = function(msg, trace)
                {
                };

                var OnTimeout = function()
                {
                    OnFinished.call(obj.page, 'timeout');
                };

                var OnFinished = function(status)
                {
                    try
                    {
                        // Sanity
                        if ( typeof obj.page == 'undefined' || !obj.page )
                        {
                            throw "page object is undefined";
                        }

                        // Reset timeout timer
                        clearTimeout(timeout);

                        // Increment overall operation counter
                        obj.ctx.counter += 1;

                        // Is succeeded
                        if ( status == 'success' )
                        {
                            var name = 'images/' + /\w+\.\w+/.exec(url) + '-' + (+new Date()) + '.png';
                            obj.page.render(name);
                            LOG('\t' + obj.ctx.counter +'\t' + 'OK ' + url);
                        }
                        else
                        {
                            LOG('\t' + obj.ctx.counter +'\t' + status + ' ' + url);
                        }
                    }
                    catch(e)
                    {
                        ERR('>>> Processing internal exception: ' + url + ' with ' + e);
                    }

                    // Continue iterations
                    next();
                };

                var timeout = setTimeout(OnTimeout, 5000);
                obj.page.onError = OnError;
                obj.page.onLoadFinished = OnFinished;
                obj.page.open(Normalize(url));
            }
            catch(e)
            {
                ERR('>>> Processing exception: ' + url + ' with ' + e);
            }
        }
    };
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
        phantom.exit(1);
    }
}

// Run
Main();

})(phantom);

