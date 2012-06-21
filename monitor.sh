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
TIMEOUT=2

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
# Wait loop
#
while inotifywait -e $EVENTS -t $TIMEOUT $MONFILE; do
    if [ $? -eq 3 ] ; then
        mail -s "PjCrawler event: inotifywait timeout for $HOSTNAME" $MAILTO <<EOM
            Host: $HOSTNAME:
            Inotifywait timeout events: $EVENTS
            PjCrawler needs your love!
        EOM
    fi
done

