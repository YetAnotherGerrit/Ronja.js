#!/bin/bash

case $1 in

    postinstall)
        echo "Please set RONJA_CLIENT_ID and RONJA_TOKEN environment variables"
        echo ""
        echo "After that run: $0 postupdate"
        echo ""
        ;;

    postupdate)
        npm install
        node ./deploy-commands.js
        echo "If there was no error message you are ready to run: $0 start"
        echo ""
        ;;

    start)
        node ./index.js
        ;;

    *)
        echo "Please run $0 with one of the following commands:"
        echo "- $0 postinstall          | after installation"
        echo "- $0 postupdate           | after update"
        echo "- $0 start                | to run the bot"
        echo ""
        ;;

esac
