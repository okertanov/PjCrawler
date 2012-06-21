#!/bin/bash

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
BODY_INOTIFY_TIMEOUT=$(cat <<EOM
Host: $HOSTNAME:
Inotify wait timeout events: $EVENTS
PjCrawler needs your love!
EOM
)

#
# Mail body 2
#
BODY_FILE_NOTEXISTS=$(cat <<EOM
Host: $HOSTNAME:
Monitor file not exists: $MONFILE
PjCrawler needs your love!
EOM
)

#
# Mail body 3
#
BODY_PROCESS_NOTEXISTS=$(cat <<EOM
Host: $HOSTNAME:
Monitor process not exists: $MONFILE
PjCrawler needs your love!
EOM
)

#
# Send notification mail
#
function send_notify()
{
    echo "$3" | mail -s "$1" -t "$2"
}

#
# Check process avilaibility
#
function check_process_exists()
{
    ps axocomm | grep -vq "grep" | grep -q "$1"
    if [ $? -eq 0 ] ; then
        return 1
    else
        return 0
    fi
}

#
# Check file avilaibility
#
function check_file_exists()
{
    if [[ -f "$1" ]] ; then
        return 0
    else
        return 1
    fi
}

#
# Wait loop
#
echo "$0: Starting..."

while true ; do

    # File exists?
    echo -n "Checking if file $MONFILE exists: "
    if ( ! check_file_exists $MONFILE ) ; then
        echo "No."
        send_notify "PjCrawler event: monitor file error for $HOSTNAME" "$MAILTO" "$BODY_FILE_NOTEXISTS"
        break
    else
        echo "Yes."
    fi

    # Process Exists?
    echo -n "Checking if file $MONPROCESS exists: "
    if ( ! check_process_exists $MONPROCESS ) ; then
        echo "No."
        send_notify "PjCrawler event: monitor process error for $HOSTNAME" "$MAILTO" "$BODY_PROCESS_NOTEXISTS"
        break
    else
        echo "Yes."
    fi

    # Inotify
    echo -n "Checking if file $MONFILE generates inotify events: "
    inotifywait -e $EVENTS -t $TIMEOUT $MONFILE > /dev/null 2>&1
    if [ $? -gt 0 ] ; then
        echo "No."
        send_notify "PjCrawler event: inotifywait timeout for $HOSTNAME" "$MAILTO" "$BODY_INOTIFY_TIMEOUT"
        echo -n "Restarting $MONPROCESS... "
        killall $MONPROCESS
        echo "Done."
    else
        echo "Yes."
    fi

done

echo "$0: Stopped."

