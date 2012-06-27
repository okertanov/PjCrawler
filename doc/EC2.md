Amazon EC2 Cloud
================

Account
-------
mtrusov@rhsmith.umd.edu

Nodes
-----
* pj-node-1
* pj-node-2
* pj-node-3
* pj-node-4

Instance info
-------------
    AMI:     Ubuntu Cloud Guest AMI ID ami-ac9943c5 (i386)  Edit AMI
    Number of Instances:    1
    Availability Zone:  us-east-1a
    Instance Type:  Micro (t1.micro)
    Instance Class: On Demand   Edit Instance Details
    Monitoring: Disabled    Termination Protection: Enabled
    Tenancy:    Default
    Kernel ID:  Use Default Shutdown Behavior:  Stop
    RAM Disk ID:    Use Default
    User Data:
    IAM Role:       Edit Advanced Details
    Key Pair Name:  pj-node-1   Edit Key Pair
    Security Group(s):  sg-a3cb44cb Edit Firewall

Tuning
------
    sudo aptitude update && sudo aptitude dist-upgrade
    sudo aptitude install build-essential chrpath git-core libssl-dev libfontconfig1-dev libqt4-webkit

    sudo aptitude install inotify-tools

    sudo aptitude install mailutils # @see http://braiden.org/?p=15

    git clone git://github.com/ariya/phantomjs.git phantomjs.git
    cd phantomjs.git
    ./build.sh
    mkdir ~/bin
    ln -s /home/ubuntu/projects/social-bugs/phantomjs.git/bin/phantomjs /home/ubuntu/bin/

    git clone git://github.com/okertanov/PjCrawler.git


