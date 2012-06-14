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

const   DEF_WORKERS = 3;

const   DEF_TIMEOUT = 60000;
const   DEF_MINDELAY = 35;

// Functions
function Configure(phantom)
{
    phantom.libraryPath = './modules';
    var rc = phantom.injectJs('phantom-inject.js');
    if ( !rc )
        throw 'phantom.injectJs failed.';
}

function Start(files, before, after)
{
    // Notify on parameters used
    LOG(logPrefix + 'Processing links from: ' + '"' + files.input + '"' +
                    ', to: ' + '"' + files.output + '"' +
                    ', using state file: ' + '"' + files.state + '".');

    if ( !fs.exists(files.input) && !fs.isFile(files.input) )
        throw 'Can\'t open for read ' + files.input;

    // Context
    var context =
    {
        workers:  DEF_WORKERS,
        istream:  fs.open( files.input,  'r'  ),
        ostream:  fs.open( files.output, 'w'  ),
        stfile:   files.state,
        before:   before,
        after:    after,
        scounter: 0,
        counter:  0,
        finished: 0
    };

    if ( !fs.exists(files.output) && !fs.isFile(files.output) )
        throw 'Can\'t open for write ' + files.output;

    // Run the 1st aspect
    if (before) before();

    // Update last state if exists
    var lastState = 0;
    if ( fs.exists(context.stfile) && fs.isFile(context.stfile) )
    {
        var stateContent = fs.read(context.stfile);

        if ( stateContent && stateContent.length )
        {
            lastState = parseInt(stateContent, 10);
            lastState = (lastState < 0 ? 0 : lastState);
        }
    }

    context.scounter = lastState;

    if ( context.scounter > 0 )
        LOG(logPrefix + 'Recovering session with the state: ' + context.scounter);

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
        if ( url.indexOf('://') < 0 )
            return ('http://' + url);
    }

    return {
        id:   id,
        ctx:  ctx,
        Start: function()
        {
            LOG(logPrefix + 'Worker: ' + this.id + ' started.');

            var that = this;
            return setTimeout( function(){ that.Next.call(that) }, DEF_MINDELAY );
        },
        Stop: function()
        {
            LOG(logPrefix + 'Worker: ' + this.id + ' stopping everything.');

            // Gracefully close all handles
            this.ctx.ostream.flush(),
                this.ctx.ostream.close(),
                    this.ctx.istream.close();

            // Notify finish
            if ( typeof this.ctx.after === 'function' )
                this.ctx.after();

            this.Cleanup();

            // Exit
            phantom.exit(0);
        },
        Cleanup: function()
        {
            // Reset timeout timer
            clearTimeout(this.timeout);

            // Delete page object
            if ( typeof this.page != 'undefined' && this.page )
            {
                /*obj.page.release(), obj.page = null;*/
                delete this.page;
            }
        },
        Next: function()
        {
            var line = null;

            // Skip from the last state (XXX: no skip fn in the phantomjs API)
            if ( this.ctx.scounter != 0 )
            {
                while ( this.ctx.counter < this.ctx.scounter )
                {
                    line = this.ctx.istream.readLine();
                    this.ctx.counter += 1;
                }
            }

            // Read the url line
            line = this.ctx.istream.readLine();

            // Shouldn't be empty (XXX: no isEnd fn in the phantomjs API)
            if ( line )
            {
                // Process non-empty line
                if ( line.length )
                {
                    this.Process.call(this, line);
                }
            }
            else
            {
                LOG(logPrefix + 'Worker: ' + this.id + ' reached the end of list with ' + this.url);

                // Increment finished pool
                this.ctx.finished += 1;

                // Wait when all workers are done
                if ( this.ctx.finished >= this.ctx.workers )
                {
                    LOG(logPrefix + 'Worker: ' + this.id + ' Scheduling finalization... with ' + this.url);

                    this.Stop();
                }
            }

            return this;
        },
        OnPageError: function(msg, trace)
        {
        },
        OnTimeout: function()
        {
            this.OnFinished.call(this, 'timeout');
        },
        OnFinished: function(status)
        {
            try
            {
                this.Cleanup();

                // Increment overall operation counter
                this.ctx.counter += 1;

                // Is succeeded
                if ( status == 'success' )
                {
                    var name = 'images/' + /\w+\.\w+/.exec(this.url) + '-' + (+new Date()) + '.png';
                    //this.page.render(name);
                    LOG('\t' + this.ctx.counter +'\t' + 'OK(' + this.id + ') ' + this.url);
                }
                else
                {
                    LOG('\t' + this.ctx.counter +'\t' + status + '(' + this.id + ') ' + this.url);
                }

                // Update state file
                fs.write(this.ctx.stfile, '' + this.ctx.counter + '\n', 'w');
            }
            catch(e)
            {
                ERR('>>> Processing internal exception: ' + this.url + ' with ' + e.toString());
            }

            // Continue iterations
            this.Next();
        },
        Process: function(url)
        {
            try
            {
                this.Cleanup();

                this.url = url;
                this.page = webpage.create();
                this.page.settings.userAgent = UA;
                this.page.viewportSize = { width: 800, height: 600 };

                var that = this;

                this.page.onError = function(msg, trace){ that.OnPageError.call(that, msg, trace) };
                this.page.onLoadFinished = function(status){ that.OnFinished.call(that, status) };

                this.page.open( Normalize(this.url) );

                this.timeout = setTimeout(function(){ that.OnTimeout.call(that) }, DEF_TIMEOUT);
            }
            catch(e)
            {
                ERR('>>> Processing exception: ' + url + ' with ' + e.toString());
            }
        }
    };
}

function Arguments(phantom, system)
{
    var files = { script: '', input: '', output: '', state: '' };

    if ( phantom.args.length <= 1 )
    {
        throw ('No arguments provided. Please read the README.md file.');
    }
    else if ( phantom.args.length > 3 )
    {
        throw ('Wrong arguments provided. Please read the README.md file.');
    }
    else
    {
        files =
        {
            script: system.args[0],
            input:  system.args[1],
            output: system.args[2],
            state:  system.args[3]
        };

        if (    !files.script.length ||
                !files.input.length  ||
                !files.output.length ||
                !files.state.length     )
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
        Start(files, function(){ Before() }, function(){ After() });
        LOG(logPrefix + 'System started.');
    }
    catch(e)
    {
        ERR(errorPrefix + e.toString());
        phantom.exit(1);
    }
}

// Run
Main();

})(phantom);

