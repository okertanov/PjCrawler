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
const   DEF_PAGE_TIMEOUT  = 60000;
const   DEF_END_TIMEOUT   = 5000;
const   DEF_NEXT_MINDELAY = 35;

// Functions

function BuildBugDB(filename)
{
    var bugsContents = fs.read(filename);
    var bugsDescr = JSON.parse(bugsContents);
    var bugs = bugsDescr.bugs;

    var num_bugs,
        apps = {},
        bugs_map = {},
        patterns_arr = [],
        regexes = {};

    for (var i = 0, num_bugs = bugs.length; i < num_bugs; i++)
    {
        bugs_map[bugs[i].id] =
        {
            aid: bugs[i].aid,
            name: bugs[i].name
        };

        apps[bugs[i].aid] =
        {
            name: bugs[i].name,
            affiliations: (bugs[i].affiliation ? bugs[i].affiliation.split(',') : [])
        };

        patterns_arr.push(bugs[i].pattern);
        regexes[bugs[i].id] = new RegExp(bugs[i].pattern, 'i');
    }

    return {
        apps: apps,
        bugs: bugs_map,
        regexes: regexes,
        fullRegex: new RegExp(patterns_arr.join('|'), 'i')
    };
}

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
        ostream:  fs.open( files.output, 'a+' ),
        stfile:   files.state,
        before:   before,
        after:    after,
        scounter: 0,
        counter:  0,
        finished: 0,
        bugdb:    {}
    };

    if ( !fs.exists(files.output) && !fs.isFile(files.output) )
        throw 'Can\'t open for write ' + files.output;

    // Initialize Bug database
    if ( !fs.exists(files.bugdb) && !fs.isFile(files.bugdb) )
        throw 'Can\'t open for read ' + files.bugdb;

    context.bugdb = BuildBugDB(files.bugdb);

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
        url:  null,
        bugs: [],
        Start: function()
        {
            LOG(logPrefix + 'Worker: ' + this.id + ' started.');

            var that = this;
            return setTimeout( function(){ that.Next.call(that) }, DEF_NEXT_MINDELAY );
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
            // Clear members
            this.url = null;
            this.bugs = [];

            // Reset timeout timer
            clearTimeout(this.timeout);

            // Delete page object
            if ( typeof this.page != 'undefined' && this.page )
            {
                this.page.onError = null;
                this.page.onLoadFinished = null;
                this.page.onResourceRequested = null;
                this.page.release();
                delete this.page;
                this.page = null;
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

                    var that = this;
                    setTimeout(function(){ that.Stop() }, DEF_END_TIMEOUT);
                }
            }

            return this;
        },
        OnPageError: function(msg, trace)
        {
            return true;
        },
        OnTimeout: function()
        {
            return this.OnFinished.call(this, 'timeout');
        },
        OnFinished: function(status, url)
        {
            try
            {
                // Increment overall operation counter
                this.ctx.counter += 1;

                // Signal to resource workers that it's it
                if ( this.page )
                    this.page.finished = true;

                // Is succeeded
                if ( status == 'success' )
                {
                    var name = 'images/' + /\w+\.\w+/.exec(this.url) + '-' + (+new Date()) + '.png';
                    //this.page.render(name);
                    var dump = this.DumpBugs();
                    this.ctx.ostream.writeLine(dump);
                    this.ctx.ostream.flush();
                    LOG('\t' + this.ctx.counter +'\t' + 'OK(' + this.id + ') ' + this.url + ' ' + dump);
                }
                else
                {
                    LOG('\t' + this.ctx.counter +'\t' + status + '(' + this.id + ') ' + this.url);
                }

                // Update state file
                fs.write(this.ctx.stfile, '' + this.ctx.counter + '\n', 'w');

                // Clean temporary data
                this.Cleanup();
            }
            catch(e)
            {
                ERR('>>> OnFinished internal exception: ' + this.url + ' with ' + e.toString());
            }

            // Continue iterations
            this.Next();

            return true;
        },
        OnResource: function(req, url)
        {
            try
            {
                if ( this.url == url )
                {
                    if ( this.page )
                    {
                        if ( !this.page.finished )
                        {
                            // LOG( JSON.stringify(req) );
                            // console.log('OnResource ' + req.url);

                            if ( req && req.url && req.url.length )
                                this.ProcessBug( req.url );
                        }
                    }
                }
                else
                {
                    ERR('>>> OnResource url mismatch: ' + this.url + ' != ' + url);
                }
            }
            catch(e)
            {
                ERR('>>> OnResource internal exception with ' + e.toString());
            }

            return true;
        },
        OnAlertMessage: function(msg)
        {
            return false;
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
                this.page.onLoadFinished = function(status){ that.OnFinished.call(that, status, url) };
                this.page.onResourceRequested = function(req){ that.OnResource.call(that, req, url) };

                this.page.onAlert   = function(msg){ that.OnAlertMessage.call(that, msg) };
                this.page.onPrompt  = function(msg){ that.OnAlertMessage.call(that, msg) };
                this.page.onConfirm = function(msg){ that.OnAlertMessage.call(that, msg) };

                this.timeout = setTimeout(function(){ that.OnTimeout.call(that) }, DEF_PAGE_TIMEOUT);

                this.page.open( Normalize(this.url) );
            }
            catch(e)
            {
                ERR('>>> Processing exception: ' + url + ' with ' + e.toString());
            }
        },
        ProcessBug: function(url)
        {
            try
            {
                var id = this.IsBug(url);

                if ( id )
                {
                    if ( !this.bugs.some( function(s){ return s.id == id } ) )
                    {
                        this.bugs.push({
                            id: id,
                            src: url,
                            name: this.ctx.bugdb.bugs[id].name
                        });
                    }

                    return true;
                }
            }
            catch(e)
            {
                throw e;
            }

            return false;
        },
        IsBug: function(url)
        {
            if ( this.ctx.bugdb.fullRegex.test(url) )
            {
                for (var id in this.ctx.bugdb.regexes)
                {
                    if ( this.ctx.bugdb.regexes.hasOwnProperty(id) )
                    {
                        if ( this.ctx.bugdb.regexes[id].test(url) )
                        {
                            return id;
                        }
                    }
                }
            }

            return false;
        },
        DumpBugs: function()
        {
            return this.bugs
                .sort(function(a, b){ return (typeof a.name == 'string' ? a.name.localeCompare(b.name) : false) })
                .reduce(
                    function(prev, curr)
                    {
                        if ( prev.indexOf(curr.name) < 0 )
                            return prev + ', ' + curr.name;
                        else
                            return prev;
                    },
                    this.url
                );
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
    else if ( phantom.args.length > 4 )
    {
        throw ('Wrong arguments provided. Please read the README.md file.');
    }
    else
    {
        files =
        {
            script: system.args[0],
            bugdb:  system.args[1],
            input:  system.args[2],
            output: system.args[3],
            state:  system.args[4]
        };

        if (    !files.script.length ||
                !files.bugdb.length  ||
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
        LOG(logPrefix + 'System started (ver.1.1)');
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

