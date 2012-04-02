##    Copyright (C) 2012 Oleg Kertanov <okertanov@gmail.com>
##    All rights reserved.

MODULE=crawler

DATA=data

PJ=phantomjs
PJ_OPTS=--cookies-file=$(DATA)/cookies.txt --config=config.json \
        --ignore-ssl-errors=yes --load-images=yes \
        --local-to-remote-url-access=yes --web-security=no \
        --disk-cache=yes --max-disk-cache-size=102400

SCRIPT=crawler.js

DATE_NOW=$(shell date +'%y.%m.%d-%H.%M.%S')
SCRIPT_OUTPUT=$(DATA)/social-bugs-database-$(DATE_NOW).csv
LOGFILE=logfile-$(DATE_NOW).log
ifndef DB
    DB=debug
endif
LINKS_DB_TYPE=$(DB)
SCRIPT_INPUT=$(DATA)/www-links-database-$(LINKS_DB_TYPE).csv
SCRIPT_OPTS=$(SCRIPT_INPUT) $(SCRIPT_OUTPUT)

all: $(MODULE)

$(MODULE): $(SCRIPT)
	$(PJ) $(PJ_OPTS) $^ $(SCRIPT_OPTS) > $(LOGFILE)

clean:
	-@rm -f $(DATA)/social-bugs-database-*.csv images/*.png logfile-*.log

.PHONY: clean all

.SILENT: clean

