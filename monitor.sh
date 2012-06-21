#!/bin/sh

#
#    Copyright (C) 2012 Oleg Kertanov <okertanov@gmail.com>
#    All rights reserved.
#

#
# Hostname
#
HOSTNAME=`hostname`

#
# Mail recipients
#
MAILTO=okertanov+pjcrawler@gmail.com

#
# Events to monitor
#
EVENTS=modify

#
# Timeout in seconds
#
TIMEOUT=120

#
# Cmd-line sanity
#
if [ $# -lt 1 ] ; then
   echo "Syntax: $0: file_to_monitor"
   echo "Example:$0  logfile-123.txt"
   exit 1
fi

#
# File to monitor
#
MONFILE=$1

#
# Process to monitor
#
MONPROCESS=phantomjs

#
# Mail body 1
#
BODY_INOTIFY_TIMEOUT=<<EOM
Host: $HOSTNAME:
Inotify wait timeout events: $EVENTS
PjCrawler needs your love!
EOM

#
# Mail body 2
#
BODY_FILE_NOTEXISTS=<<EOM
Host: $HOSTNAME:
Monitor file not exists: $MONFILE
PjCrawler needs your love!
EOM

#
# Mail body 3
#
BODY_PROCESS_NOTEXISTS=<<EOM
Host: $HOSTNAME:
Monitor process not exists: $MONFILE
PjCrawler needs your love!
EOM

#
# Send notification mail
#
function send_notify()
{
    mail -s $1 $2 $3
}

#
# Check process avilaibility
#
function check_process_exists()
{
    local EXISTS=(ps ax | grep -q "$1" | grep -v "grep" )
    return EXISTS
}

#
# Check file avilaibility
#
function check_file_exists()
{
    if [[ -f "$1" ]] ; then
        return true
    else
        return false
    fi
}

#
# Wait loop
#
echo "$0: Starting..."

while true ; do

    # File exists?
    echo -n "Checking if file $MONFILE exists: "
    if [ ! check_file_exists $MONFILE ] ; then
        echo "No."
        send_notify "PjCrawler event: monitor file error for $HOSTNAME" "$MAILTO" "$BODY_FILE_NOTEXISTS"
        break
    else
        echo "Yes."
    fi

    # Process Exists?
    echo -n "Checking if file $MONPROCESS exists: "
    if [ ! check_process_exists $MONPROCESS ] ; then
        echo "No."
        send_notify "PjCrawler event: monitor process error for $HOSTNAME" "$MAILTO" "$BODY_PROCESS_NOTEXISTS"
        break
    else
        echo "Yes."
    fi

    # Inotify
    echo -n "Checking if file $MONFILE generates inotify events: "
    inotifywait -e $EVENTS -t $TIMEOUT $MONFILE
    if [ $? -gt 0 ] ; then
        echo "No."
        send_notify "PjCrawler event: inotifywait timeout for $HOSTNAME" "$MAILTO" "$BODY_INOTIFY_TIMEOUT"
    else
        echo "Yes."
    fi

done

echo "$0: Stopped."
return 0

