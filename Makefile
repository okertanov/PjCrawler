##    Copyright (C) 2012 Oleg Kertanov <okertanov@gmail.com>
##    All rights reserved.

MODULE=crawler

DATA=data

PJ=phantomjs
PJ_OPTS=--cookies-file=$(DATA)/cookies.txt --config=config.json \
        --ignore-ssl-errors=yes --load-images=yes \
        --local-to-remote-url-access=no --web-security=yes --disk-cache=no

SCRIPT=crawler.js

DATE_NOW=$(shell date +'%y.%m.%d-%H.%M.%S')
SCRIPT_OUTPUT=$(DATA)/social-bugs-database-$(DATE_NOW).csv
LOGFILE=logfile-$(DATE_NOW).log
ifndef DB
    DB=$(DATA)/www-links-database-debug.csv
endif
SCRIPT_INPUT=$(DB)
SCRIPT_STATE=$(DATA)/state.txt
BUGS_DB=$(DATA)/bugsdb-update-14.06.2012.js
SCRIPT_OPTS=$(BUGS_DB) $(SCRIPT_INPUT) $(SCRIPT_OUTPUT) $(SCRIPT_STATE)

all: $(MODULE)

$(MODULE): $(SCRIPT)
	while true ; do \
		$(PJ) $(PJ_OPTS) $^ $(SCRIPT_OPTS) >> $(LOGFILE) ;\
		[ $$? -eq 0 ] && break; \
	done

clean:
	-@rm -f $(DATA)/state.txt images/*.png logfile-*.log
	-@git checkout data/cookies.txt

.PHONY: clean all

.SILENT: clean

